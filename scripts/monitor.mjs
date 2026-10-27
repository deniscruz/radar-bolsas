// Varredura diária: visita a página oficial de cada bolsa, vê se o link funciona,
// detecta mudanças e procura o prazo atual escrito na página.
import { loadJSON, saveJSON, fetchPage, sha256, todayISO, findDeadlineCandidate, pool } from "./lib.mjs";
import { aiEnabled, extractDeadline, MODEL } from "./ai.mjs";

const today = todayISO();
const now = new Date().toISOString();
const scholarships = [...loadJSON("data/scholarships.json", []), ...loadJSON("data/discovered.json", [])];
const status = loadJSON("data/status.json", { generatedAt: null, items: {} });
const useAI = aiEnabled();
let aiBudget = Number(process.env.MAX_AI_CHECKS || 25);
const DAY = 864e5;

const counts = { ok: 0, blocked: 0, broken: 0, changed: 0, confirmed: 0, ai: 0 };

await pool(scholarships, 6, async (s) => {
  const prev = status.items[s.id] || {};
  const page = await fetchPage(s.url);
  const cur = { checkedAt: now, http: page.status };

  if (!page.ok) {
    // 401/403/429: o site existe mas bloqueia robôs. Não é link quebrado.
    const blocked = [401, 403, 429, 503].includes(page.status);
    cur.link = blocked ? "blocked" : "error";
    cur.error = page.error || `HTTP ${page.status}`;
    cur.failures = blocked ? 0 : (prev.failures || 0) + 1;
    counts[blocked ? "blocked" : "broken"]++;
    status.items[s.id] = { ...prev, ...cur };
    return;
  }

  counts.ok++;
  cur.link = "ok";
  cur.failures = 0;
  cur.error = null;
  cur.hash = sha256(page.text);
  const changed = prev.hash && prev.hash !== cur.hash;
  cur.changedAt = changed ? now : prev.changedAt || null;
  if (changed) counts.changed++;

  const found = findDeadlineCandidate(page.text, today);
  cur.pageDeadline = found;

  let ai = prev.ai || null;
  const aiStale = !ai || Date.now() - new Date(ai.checkedAt) > 7 * DAY;
  if (useAI && aiBudget > 0 && (changed || aiStale)) {
    aiBudget--;
    try {
      const r = await extractDeadline({ name: s.name, org: s.org, url: s.url, text: page.text, today });
      if (r) { ai = { ...r, checkedAt: now, model: MODEL }; counts.ai++; }
    } catch (e) {
      console.warn(`IA falhou em ${s.id}: ${e.message}`);
    }
  }
  cur.ai = ai;

  // Prazo confirmado: o da IA (com citação encontrada na página) ou o detectado por padrão de data.
  let confirmed = null;
  if (ai?.deadline && ai.evidenceFound && ai.deadline >= today) confirmed = { date: ai.deadline, source: "ai", quote: ai.evidence };
  else if (found) confirmed = { date: found.date, source: "page", quote: found.snippet };
  cur.confirmed = confirmed;
  cur.state = ai?.evidenceFound ? ai.status : null;
  if (confirmed) counts.confirmed++;

  status.items[s.id] = { ...prev, ...cur };
});

// Remove do status bolsas que saíram da lista.
const ids = new Set(scholarships.map((s) => s.id));
for (const id of Object.keys(status.items)) if (!ids.has(id)) delete status.items[id];

status.generatedAt = now;
status.summary = { total: scholarships.length, ...counts, aiEnabled: useAI };
saveJSON("data/status.json", status);
console.log(`Varredura ${now}:`, status.summary);

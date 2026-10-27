import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const loadJSON = (path, fallback) => {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
};
export const saveJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const UA = "Mozilla/5.0 (compatible; RadarDeBolsasBot/1.0; +https://github.com)";

// Busca uma página e devolve o texto limpo. Nunca lança erro.
export async function fetchPage(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "user-agent": UA, "accept": "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9,pt-BR;q=0.8" },
    });
    const html = res.ok ? await res.text() : "";
    return { status: res.status, ok: res.ok, finalUrl: res.url, text: res.ok ? htmlToText(html) : "" };
  } catch (e) {
    return { status: 0, ok: false, error: e.name === "AbortError" ? "timeout" : (e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

export function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Normaliza texto para comparar trechos citados com o conteúdo real da página.
export const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const KEYWORDS = /(deadline|due|apply by|applications? (?:close|are due|must be|open)|submit(?:ted)? by|closes?|prazo|inscri[çc][õo]es)/i;
const DATE_PATTERNS = [
  // January 15, 2027 / Jan. 15 2027
  { re: new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b`, "gi"), get: (m) => [m[3], MONTHS[m[1].toLowerCase()], m[2]] },
  // 15 January 2027 / 15 de janeiro de 2027
  { re: new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_RE})\\.?,?\\s+(?:de\\s+)?(20\\d\\d)\\b`, "gi"), get: (m) => [m[3], MONTHS[m[2].toLowerCase()], m[1]] },
  // 2027-01-15
  { re: /\b(20\d\d)-(\d{2})-(\d{2})\b/g, get: (m) => [m[1], m[2], m[3]] },
];

// Procura datas futuras perto de palavras como "deadline" e "prazo". Devolve a mais próxima.
export function findDeadlineCandidate(text, today = todayISO()) {
  const limit = new Date(today); limit.setMonth(limit.getMonth() + 18);
  const found = [];
  for (const { re, get } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const [y, mo, d] = get(m).map(Number);
      if (!mo || d < 1 || d > 31) continue;
      const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (iso < today || new Date(iso) > limit) continue;
      const before = text.slice(Math.max(0, m.index - 160), m.index);
      if (!KEYWORDS.test(before)) continue;
      const snippet = text.slice(Math.max(0, m.index - 100), m.index + m[0].length + 20).replace(/\s+/g, " ").trim();
      found.push({ date: iso, snippet });
    }
  }
  found.sort((a, b) => a.date.localeCompare(b.date));
  return found[0] || null;
}

// Executa tarefas com no máximo `n` ao mesmo tempo.
export async function pool(items, n, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

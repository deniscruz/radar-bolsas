// Descoberta semanal: o Claude pesquisa na web bolsas que ainda não estão no radar.
// Cada semana cobre um tema diferente. Toda bolsa nova passa por checagem de link antes de entrar.
import { loadJSON, saveJSON, fetchPage, todayISO, slug, norm } from "./lib.mjs";
import { aiEnabled, discoverScholarships } from "./ai.mjs";

if (!aiEnabled()) {
  console.log("ANTHROPIC_API_KEY não configurada: descoberta automática desligada.");
  process.exit(0);
}

const FOCUS = [
  "undergraduate scholarships at US universities open to international students, including merit scholarships",
  "master's and PhD funding in the US open to Brazilian or Latin American students",
  "corporate and company-sponsored scholarships for STEM students at US universities",
  "scholarships and fellowships for women studying in the United States, including international women",
  "foundation and nonprofit scholarships for US college students with deadlines in the next 3 months",
  "government-funded scholarships and fellowships for study in the United States (any country)",
  "scholarships for first-generation, low-income or underrepresented students in US colleges",
  "MBA, law (LLM) and public policy fellowships in the US open to international applicants",
];

const today = todayISO();
const week = Math.floor(Date.now() / (7 * 864e5));
const focus = process.env.DISCOVERY_FOCUS || FOCUS[week % FOCUS.length];

const curated = loadJSON("data/scholarships.json", []);
const discovered = loadJSON("data/discovered.json", []);
const all = [...curated, ...discovered];
const known = new Set(all.flatMap((s) => [norm(s.name), s.url.replace(/\/$/, "").toLowerCase()]));

console.log(`Tema desta semana: ${focus}`);
const found = await discoverScholarships({ focus, knownNames: all.map((s) => `${s.name} (${s.org})`), today });
console.log(`O Claude reportou ${found.length} bolsas.`);

let added = 0;
for (const f of found) {
  if (known.has(norm(f.name)) || known.has(f.url.replace(/\/$/, "").toLowerCase())) continue;
  if (!/^https?:\/\//.test(f.url)) continue;
  const page = await fetchPage(f.url);
  // Aceita página que abre ou que só bloqueia robôs; recusa link inexistente.
  if (!page.ok && ![401, 403, 429, 503].includes(page.status)) { console.log(`Descartada (link ${page.status || page.error}): ${f.name}`); continue; }
  const deadline = f.rolling ? "rolling" : f.deadline ? { month: +f.deadline.slice(5, 7), day: +f.deadline.slice(8, 10) } : "varies";
  let id = slug(`${f.name}-${f.org}`);
  while (all.some((s) => s.id === id)) id += "-2";
  const item = {
    id, name: f.name, org: f.org, type: f.type, who: f.who.length ? f.who : ["specific"], levels: f.levels.length ? f.levels : ["ug"],
    full: f.full, stem: f.stem, women: f.women, deadline, deadlineDate: f.deadline && f.deadline >= today ? f.deadline : null,
    amount: f.amount, description: f.description, url: f.url, addedAt: today, source: "auto", reviewed: false,
  };
  discovered.push(item); all.push(item);
  known.add(norm(f.name)); known.add(f.url.replace(/\/$/, "").toLowerCase());
  added++;
  console.log(`Nova: ${f.name}`);
}

saveJSON("data/discovered.json", discovered);
console.log(`${added} bolsas novas adicionadas.`);

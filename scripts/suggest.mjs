// Transforma uma sugestão aprovada (issue com o rótulo "aprovada") em uma bolsa do radar.
import { readFileSync, appendFileSync } from "node:fs";
import { loadJSON, saveJSON, todayISO, slug } from "./lib.mjs";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const body = event.issue.body || "";

// O formulário do GitHub gera "### Rótulo\n\nresposta" para cada campo.
const fields = {};
for (const part of body.split(/^### /m).slice(1)) {
  const [label, ...rest] = part.split("\n");
  fields[label.trim()] = rest.join("\n").trim();
}
const get = (label) => (fields[label] && fields[label] !== "_No response_" ? fields[label] : "");
const checked = (label) => [...get(label).matchAll(/- \[x\] (.+)/gi)].map((m) => m[1].trim());

const name = get("Nome da bolsa");
const url = get("Link oficial");
if (!name || !/^https?:\/\//.test(url)) {
  console.error("Sugestão sem nome ou link válido.");
  process.exit(1);
}

const WHO = { "Estudantes internacionais (qualquer país)": "any", "Só brasileiros": "br", "Cidadãos ou residentes dos EUA": "us", "Países em desenvolvimento": "dev", "Cidadãos africanos": "africa", "Imigrantes nos EUA": "immigrant", "Lista específica de países": "specific" };
const LV = { "Graduação": "ug", "Mestrado / Doutorado": "grad", "Profissional / meio de carreira": "pro" };

const prazo = get("Prazo").toLowerCase();
let deadline = "varies", deadlineDate = null;
const iso = prazo.match(/(20\d\d)-(\d\d)-(\d\d)/);
if (iso) { deadline = { month: +iso[2], day: +iso[3] }; deadlineDate = iso[0] >= todayISO() ? iso[0] : null; }
else if (/cont[ií]nua|rolling/.test(prazo)) deadline = "rolling";

const extras = checked("Características");
const list = loadJSON("data/scholarships.json", []);
let id = slug(`${name}-${get("Organização")}`);
while (list.some((s) => s.id === id)) id += "-2";

list.push({
  id, name, org: get("Organização") || name, type: get("Tipo de organização") || "Fundação",
  who: checked("Quem pode aplicar").map((w) => WHO[w]).filter(Boolean),
  levels: checked("Nível").map((l) => LV[l]).filter(Boolean),
  full: extras.includes("Cobertura integral"), stem: extras.includes("Só para STEM"), women: extras.includes("Só para mulheres"),
  deadline, deadlineDate, amount: get("Valor") || "Ver site", description: get("Descrição"), url,
  addedAt: todayISO(), source: "community", issue: event.issue.number,
});
const item = list[list.length - 1];
if (!item.who.length) item.who = ["specific"];
if (!item.levels.length) item.levels = ["ug"];

saveJSON("data/scholarships.json", list);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `name=${name.replace(/\n/g, " ")}\n`);
console.log(`Adicionada: ${name}`);

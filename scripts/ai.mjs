// Chamadas opcionais à API do Claude. Sem ANTHROPIC_API_KEY, tudo aqui é ignorado.
import Anthropic from "@anthropic-ai/sdk";
import { norm } from "./lib.mjs";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// Se o Claude recusar um pedido, a API refaz no modelo de reserva recomendado.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

let client = null;
export function aiEnabled() {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  client ??= new Anthropic();
  return true;
}

const textOf = (msg) => msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");

const DEADLINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "deadline", "cycle", "evidence"],
  properties: {
    status: { type: "string", enum: ["open", "upcoming", "closed", "rolling", "unknown"] },
    deadline: { type: ["string", "null"], description: "Next application deadline as YYYY-MM-DD, or null if the page does not state one." },
    cycle: { type: ["string", "null"], description: "Academic year or cycle the deadline belongs to, e.g. 2027-2028." },
    evidence: { type: ["string", "null"], description: "Short exact quote from the page (max 200 chars) that states the deadline or status." },
  },
};

const MAX_CHARS = 60000;
// Páginas muito longas: mantemos o começo e todos os trechos que falam de prazo.
function excerpt(text) {
  if (text.length <= MAX_CHARS) return { body: text, partial: false };
  const lines = text.split("\n");
  const keep = lines.filter((l) => /deadline|due|apply|application|eligib|prazo|inscri/i.test(l));
  return { body: text.slice(0, 20000) + "\n...\n" + keep.join("\n").slice(0, MAX_CHARS - 20000), partial: true };
}

// Lê o texto da página oficial e devolve o prazo que ela informa.
export async function extractDeadline({ name, org, url, text, today }) {
  const { body, partial } = excerpt(text);
  const msg = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    output_config: { effort: "low", format: { type: "json_schema", schema: DEADLINE_SCHEMA } },
    system:
      "You read official scholarship web pages and report the application deadline exactly as the page states it. " +
      "Only use information written on the page. If the page gives no date, return deadline null. " +
      "If the only dates shown are for a cycle that already ended, set status to closed and deadline to null. " +
      "The evidence field must be copied word for word from the page.",
    messages: [{
      role: "user",
      content:
        `Today is ${today}.\nScholarship: ${name}\nOrganization: ${org}\nURL: ${url}\n` +
        (partial ? "The page was long; below is its start plus every line that mentions deadlines or applications.\n" : "") +
        `\n<page>\n${body}\n</page>`,
    }],
  });
  if (msg.stop_reason !== "end_turn") return null;
  const out = JSON.parse(textOf(msg));
  // Só aceitamos o prazo se a citação existir de verdade na página.
  out.evidenceFound = !!out.evidence && norm(text).includes(norm(out.evidence).slice(0, 120));
  if (out.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(out.deadline) || out.deadline < today)) out.deadline = null;
  return out;
}

const REPORT_TOOL = {
  name: "report_scholarships",
  description: "Report the scholarships you found. Call this once, at the end, with every verified scholarship.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "org", "type", "url", "who", "levels", "full", "stem", "women", "deadline", "rolling", "amount", "description"],
          properties: {
            name: { type: "string" },
            org: { type: "string" },
            type: { type: "string", enum: ["Universidade", "Fundação", "ONG", "Empresa", "Governo"] },
            url: { type: "string", description: "Official page of the scholarship (not an aggregator site)." },
            who: { type: "array", items: { type: "string", enum: ["any", "br", "us", "dev", "africa", "immigrant", "specific"] } },
            levels: { type: "array", items: { type: "string", enum: ["ug", "grad", "pro"] } },
            full: { type: "boolean" },
            stem: { type: "boolean" },
            women: { type: "boolean" },
            deadline: { type: ["string", "null"], description: "Next deadline YYYY-MM-DD as stated on the official page, or null." },
            rolling: { type: "boolean" },
            amount: { type: "string", description: "Award amount, written in Brazilian Portuguese." },
            description: { type: "string", description: "One or two sentences in Brazilian Portuguese: who can apply and what it covers." },
          },
        },
      },
    },
  },
};

// Pesquisa na web por bolsas novas sobre um tema. Devolve a lista que o Claude reportar.
export async function discoverScholarships({ focus, knownNames, today }) {
  const system =
    "You research scholarships for studying at universities in the United States. Use web search, " +
    "open the official page of each scholarship, and only report ones whose official page you actually found. " +
    "Skip aggregator sites as the url; link the organization's own page. Skip scholarships that were discontinued. " +
    "Codes for 'who': any = open to international students; br = only Brazilians; us = US citizens or permanent residents; " +
    "dev = citizens of developing countries; africa = African citizens; immigrant = immigrants living in the US; specific = a specific list of countries. " +
    "Codes for 'levels': ug = undergraduate (including high-school seniors), grad = master's or PhD, pro = professional or mid-career programs.";
  const messages = [{
    role: "user",
    content:
      `Today is ${today}. Find up to 15 scholarships for this focus: ${focus}.\n` +
      "Prefer ones with an upcoming deadline in the next 6 months or rolling admission. " +
      `Do not report any of these, which we already track:\n${knownNames.join("; ")}\n\n` +
      "When you are done, call report_scholarships with the results.",
  }];
  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 25 }, REPORT_TOOL];

  for (let turn = 0; turn < 6; turn++) {
    const msg = await client.beta.messages.stream({
      model: MODEL, max_tokens: 64000, ...FALLBACK,
      output_config: { effort: "medium" },
      system, tools, messages,
    }).finalMessage();

    const call = msg.content.find((b) => b.type === "tool_use" && b.name === "report_scholarships");
    if (call) return call.input.items;
    if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
    if (msg.stop_reason === "end_turn") {
      messages.push({ role: "assistant", content: msg.content }, { role: "user", content: "Please call report_scholarships with what you found." });
      continue;
    }
    return []; // refusal ou max_tokens
  }
  return [];
}

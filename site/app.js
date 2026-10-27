// Radar de Bolsas EUA: lê os dados gerados pela varredura automática e mostra a lista filtrável.
const $ = (id) => document.getElementById(id);
const TYPES = ["Universidade", "Fundação", "ONG", "Empresa", "Governo"];
const LV = { ug: "Graduação", grad: "Pós-graduação", pro: "Profissional" };
const WHO = { any: "Internacionais ok", br: "Brasileiros", us: "EUA (cidadão/residente)", dev: "Países em desenvolvimento", africa: "Africanos", immigrant: "Imigrantes nos EUA", specific: "Países específicos" };
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DAY = 864e5;
const REFRESH_MS = 10 * 60 * 1000;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let S = [];
let status = { generatedAt: null, items: {} };
let saved = new Set(store.get("rb_saved", []));
const types = new Set();
let prof = store.get("rb_profile", { cit: "", level: "", field: "", woman: "", only: false });

async function loadData() {
  const bust = `?t=${Date.now()}`;
  const get = (f, d) => fetch(`data/${f}${bust}`).then((r) => (r.ok ? r.json() : d)).catch(() => d);
  const [cur, disc, st] = await Promise.all([get("scholarships.json", []), get("discovered.json", []), get("status.json", { items: {} })]);
  S = [...cur, ...disc];
  status = st;
  render();
}

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

// Decide qual prazo mostrar: confirmado na página > informado na sugestão > estimado pelo ciclo anual.
function timing(s, now) {
  const t = dayStart(now);
  const st = status.items?.[s.id] || {};
  const conf = st.confirmed?.date || s.deadlineDate;
  if (conf && parseISO(conf) >= t) {
    return { kind: "date", next: parseISO(conf), days: Math.round((parseISO(conf) - t) / DAY), since: 999, confirmed: true, quote: st.confirmed?.quote };
  }
  if (st.state === "rolling" || s.deadline === "rolling") return { kind: "rolling", days: 9000 };
  if (!s.deadline || typeof s.deadline === "string") return { kind: "varies", days: 9999 };
  const { month: m, day: d } = s.deadline;
  let next = new Date(t.getFullYear(), m - 1, d);
  if (next < t) next = new Date(t.getFullYear() + 1, m - 1, d);
  const prev = new Date(next.getFullYear() - 1, m - 1, d);
  return { kind: "date", next, days: Math.round((next - t) / DAY), since: Math.round((t - prev) / DAY), confirmed: false };
}

function match(s) {
  const p = prof;
  if (!p.cit && !p.level && !p.field && p.woman !== "no") return null;
  if (p.level && !s.levels.includes(p.level)) return "no";
  if (p.woman === "no" && s.women) return "no";
  if (p.field === "other" && s.stem) return "no";
  if (p.cit) {
    const w = s.who, c = p.cit;
    if (w.includes("specific") || w.includes("immigrant")) return "verify";
    const ok = w.includes("any") || w.includes(c) || (["dev", "br", "africa"].includes(c) && w.includes("dev"));
    if (!ok) return "no";
  }
  return "yes";
}

const fmtDate = (d) => `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
const ago = (iso) => {
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return `há ${Math.round(min / 1440)} dias`;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function suggestLink() {
  // No GitHub Pages o endereço é usuario.github.io/repositorio: daí sai o link do formulário.
  const host = location.hostname.match(/^([^.]+)\.github\.io$/);
  const repo = window.RADAR_REPO || (host && `${host[1]}/${location.pathname.split("/")[1] || host[1] + ".github.io"}`);
  if (!repo) return;
  const a = $("suggest");
  a.href = `https://github.com/${repo}/issues/new?template=sugerir-bolsa.yml`;
  a.hidden = false;
}

function render() {
  const now = new Date();
  $("now").textContent = status.generatedAt
    ? `Última varredura das páginas oficiais ${ago(status.generatedAt)} · ${new Date(status.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
    : "Aguardando a primeira varredura automática. Prazos abaixo são estimados.";

  const q = $("q").value.trim().toLowerCase(), lv = $("level").value, who = $("who").value, sort = $("sort").value;
  const pressed = (id) => $(id).getAttribute("aria-pressed") === "true";
  const all = S.map((s) => ({ s, tm: timing(s, now), m: match(s), st: status.items?.[s.id] || {} }));

  const rows = all.filter(({ s, tm, m }) => {
    if (q && !`${s.name} ${s.org} ${s.description} ${s.amount}`.toLowerCase().includes(q)) return false;
    if (lv && !s.levels.includes(lv)) return false;
    if (who && !s.who.includes(who)) return false;
    if (types.size && !types.has(s.type)) return false;
    if (pressed("fFull") && !s.full) return false;
    if (pressed("fStem") && !s.stem) return false;
    if (pressed("fWomen") && !s.women) return false;
    if (pressed("fConf") && !tm.confirmed) return false;
    if (pressed("fSaved") && !saved.has(s.id)) return false;
    if (pressed("fOpen") && tm.kind === "date" && tm.since <= 60) return false;
    if (prof.only && m === "no") return false;
    return true;
  });

  const rank = { yes: 0, verify: 1, null: 1, no: 2 };
  rows.sort((a, b) => {
    if (sort === "name") return a.s.name.localeCompare(b.s.name, "pt");
    if (sort === "new") return (b.s.addedAt || "").localeCompare(a.s.addedAt || "") || a.tm.days - b.tm.days;
    if (sort === "match") { const r = rank[a.m] - rank[b.m]; if (r) return r; }
    return a.tm.days - b.tm.days;
  });

  const dated = all.filter((r) => r.tm.kind === "date");
  $("s30").textContent = dated.filter((r) => r.tm.days <= 30).length;
  $("sConf").textContent = all.filter((r) => r.tm.confirmed).length;
  $("sall").textContent = S.length;
  $("count").textContent = `${rows.length} ${rows.length === 1 ? "bolsa encontrada" : "bolsas encontradas"}`;

  const list = $("list");
  list.textContent = "";
  if (!rows.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "Nenhuma bolsa com esses filtros. Tire um filtro ou limpe a busca para ver mais.";
    list.append(e);
    return;
  }

  for (const { s, tm, m, st } of rows) {
    const el = document.createElement("article");
    el.className = "row";
    let when;
    if (tm.kind === "rolling") when = `<span class="pill p-ok">Contínua</span><div class="left">Aplique quando quiser</div>`;
    else if (tm.kind === "varies") when = `<span class="pill p-off">Varia</span><div class="left">Veja o edital atual</div>`;
    else {
      const cls = tm.days <= 14 ? "p-urgent" : tm.days <= 45 ? "p-soon" : "p-acc";
      const lab = tm.days === 0 ? "Fecha hoje" : tm.days <= 14 ? "Urgente" : tm.days <= 45 ? "Em breve" : "Próximo ciclo";
      const recent = tm.since <= 60 ? `<div class="left">Ciclo anterior fechou há ${tm.since} d</div>` : "";
      when = `<span class="pill ${cls}">${lab}</span><div class="d">${fmtDate(tm.next)}</div><div class="left">faltam ${tm.days} d · ${tm.confirmed ? "confirmado" : "estimado"}</div>${recent}`;
    }

    const pills = [];
    if (m === "yes") pills.push(`<span class="pill p-ok">Compatível com seu perfil</span>`);
    else if (m === "verify") pills.push(`<span class="pill p-soon">Verificar elegibilidade</span>`);
    else if (m === "no") pills.push(`<span class="pill p-off">Fora do seu perfil</span>`);
    if (st.state === "open") pills.push(`<span class="pill p-ok">Inscrições abertas</span>`);
    if (s.addedAt && now - parseISO(s.addedAt) < 14 * DAY && s.source) pills.push(`<span class="pill p-acc">Nova${s.source === "auto" ? " · descoberta pelo robô" : " · sugerida"}</span>`);
    if (st.changedAt && now - new Date(st.changedAt) < 7 * DAY) pills.push(`<span class="pill p-soon">Página atualizada ${ago(st.changedAt)}</span>`);
    if (st.link === "error" && st.failures >= 3) pills.push(`<span class="pill p-urgent">Link com problema</span>`);

    const tags = [s.type, ...s.levels.map((l) => LV[l]), ...s.who.map((w) => WHO[w]), s.full && "Integral", s.stem && "STEM", s.women && "Mulheres"]
      .filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
    const on = saved.has(s.id);

    el.innerHTML = `<div class="when">${when}</div>
      <div style="min-width:0">
        <h3 class="title">${esc(s.name)}</h3><div class="org">${esc(s.org)}</div>
        <div class="tags">${pills.join("")}${tags}</div>
        <p class="desc"><span class="amt">${esc(s.amount)}.</span> ${esc(s.description)}</p>
        ${tm.confirmed && tm.quote ? `<p class="quote">Na página oficial: “${esc(tm.quote.slice(0, 200))}”</p>` : ""}
      </div>
      <div class="actions"><a class="apply" href="${esc(s.url)}" target="_blank" rel="noopener">Aplicar ↗</a><button class="star" aria-pressed="${on}">${on ? "★ Salva" : "☆ Salvar"}</button></div>`;
    el.querySelector(".star").onclick = () => {
      saved.has(s.id) ? saved.delete(s.id) : saved.add(s.id);
      store.set("rb_saved", [...saved]);
      render();
    };
    list.append(el);
  }
}

// Controles
for (const t of TYPES) {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = t; b.setAttribute("aria-pressed", "false");
  b.onclick = () => { types.has(t) ? types.delete(t) : types.add(t); b.setAttribute("aria-pressed", types.has(t)); render(); };
  $("types").append(b);
}
for (const id of ["fFull", "fStem", "fWomen", "fConf", "fOpen", "fSaved"]) {
  $(id).onclick = () => { const b = $(id); b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") !== "true"); render(); };
}
for (const id of ["q", "level", "who", "sort"]) $(id).addEventListener("input", render);
$("toggleProfile").onclick = () => { const p = $("profile"); p.hidden = !p.hidden; $("toggleProfile").setAttribute("aria-expanded", !p.hidden); };
const pmap = { pCit: "cit", pLevel: "level", pField: "field", pWoman: "woman" };
for (const [id, k] of Object.entries(pmap)) {
  $(id).value = prof[k] || "";
  $(id).addEventListener("change", () => { prof[k] = $(id).value; store.set("rb_profile", prof); render(); });
}
$("pOnly").checked = !!prof.only;
$("pOnly").addEventListener("change", () => { prof.only = $("pOnly").checked; store.set("rb_profile", prof); render(); });
$("clearProfile").onclick = () => {
  prof = { cit: "", level: "", field: "", woman: "", only: false };
  store.set("rb_profile", prof);
  for (const id in pmap) $(id).value = "";
  $("pOnly").checked = false;
  render();
};

suggestLink();
loadData();
setInterval(loadData, REFRESH_MS);   // busca dados novos a cada 10 minutos
setInterval(render, 60 * 1000);      // atualiza a contagem regressiva a cada minuto

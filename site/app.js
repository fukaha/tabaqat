"use strict";
/* طبقات الحنفية — واجهة ثابتة (بلا مكتبات). البيانات: data/*.json يولّدها pipeline (tabaqat.cli site). */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const AR = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const norm = s => String(s || "").replace(/[ً-ٰٟۖ-ۭ]/g, "").replace(/ـ/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/[ىئ]/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه")
  .replace(/[^؀-ۿ\s]/g, " ").replace(/\s+/g, " ").trim();

const REL = { fiqh: "تفقّه", took: "أخذ", hadith: "سماع/رواية", read: "قراءة", companion: "صحبة", manual: "يدوي" };
const KIND = { birth: "مولد", death: "وفاة", burial: "مدفن", travel: "رحلة", residence: "إقامة",
  office: "ولاية/تدريس", activity: "تحديث/طلب", origin: "أصل", nisba: "نسبة" };
const KIND_ORDER = ["nisba", "origin", "birth", "residence", "travel", "activity", "office", "death", "burial"];
const CENT = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر"];
const century = d => d ? Math.floor((d - 1) / 100) + 1 : 0;

// ---------- data ----------
const cache = {};
const load = p => cache[p] || (cache[p] = fetch("data/" + p).then(r => { if (!r.ok) throw new Error(p); return r.json(); }));
let IDX, BOOKS, SALAF = new Map(), P = new Map();

async function init() {
  const d = await load("index.json");
  BOOKS = d.books;
  IDX = d.persons.map(r => ({ id: r[0], name: r[1], d: r[2], est: !!r[3], n: r[4], nt: r[5], ns: r[6], place: r[7], books: r[8] || [], key: norm(r[1]) }));
  IDX.forEach(p => P.set(p.id, p));
  // Ebû Hanîfe öncesi (peygamberler, sahâbe, tâbiûn): sayfası yok, yalnız silsilede
  SALAF = new Map(Object.entries(d.salaf || {}).map(([id, [name, dd]]) => [id, { id, name, d: dd, salaf: true }]));
  window.addEventListener("hashchange", route);
  setupTheme();
  setupSearch($("#q"));
  route();
}
const shardOf = id => { const d = id.replace(/\D/g, ""); return d ? (+d % 64) : 0; };
async function person(id) {
  const s = await load(`p/${String(shardOf(id)).padStart(2, "0")}.json`);
  return s[id];
}
const deathTxt = p => p.d ? (p.est ? `نحو ${AR(p.d)}هـ` : `ت ${AR(p.d)}هـ`) : "";
const who = id => P.get(id) || SALAF.get(id);
const plink = (id, cls = "") => {
  const p = P.get(id);
  if (p) return `<a class="${cls}" href="#/p/${id}">${esc(p.name)}</a>`;
  const s = SALAF.get(id);
  return s ? `<span class="salaf" title="من السلف قبل أبي حنيفة">${esc(s.name)}</span>` : esc(id);
};

// ---------- router ----------
async function route() {
  const [, v = "", arg = ""] = location.hash.split("/");
  const view = $("#view");
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === (v || "home")));
  document.body.classList.toggle("home", !v);
  view.innerHTML = `<p class="empty">جارٍ التحميل…</p>`;
  try {
    if (v === "p") await viewPerson(view, decodeURIComponent(arg));
    else if (v === "net") await viewNet(view, decodeURIComponent(arg));
    else if (v === "map") await viewMap(view, decodeURIComponent(arg));
    else if (v === "about") viewAbout(view);
    else if (v === "c") await viewList(view, "c", +arg);
    else if (v === "b") await viewList(view, "b", decodeURIComponent(arg));
    else if (v === "search") await viewSearch(view);
    else await viewHome(view);
  } catch (e) {
    view.innerHTML = `<p class="empty">تعذّر التحميل (${esc(e.message)}).</p>`;
  }
  window.scrollTo(0, 0);
}

// ---------- theme ----------
function setupTheme() {
  const root = document.documentElement, btns = document.querySelectorAll(".theme button");
  const mark = () => { const t = root.dataset.theme || "system"; btns.forEach(b => b.classList.toggle("on", b.dataset.t === t)); };
  btns.forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.t;
    if (t === "system") delete root.dataset.theme; else root.dataset.theme = t;
    try { t === "system" ? localStorage.removeItem("theme") : localStorage.setItem("theme", t); } catch (e) {}
    mark();
    if (location.hash === "#/net") route();   // tuval renkleri yeniden çizilsin
  }));
  mark();
}

// ---------- search ----------
const findPersons = (q, n = 30) => {
  const toks = norm(q).split(" ").filter(Boolean);
  if (!toks.length) return [];
  return IDX.filter(p => toks.every(t => p.key.includes(t)))
    .sort((a, b) => (b.n + b.nt + b.ns) - (a.n + a.nt + a.ns)).slice(0, n);
};
function setupSearch(q) {
  if (!q) return;
  const box = q.parentElement.querySelector(".results");
  let sel = -1, hits = [];
  const render = () => {
    box.innerHTML = hits.map((p, i) => `<a href="#/p/${p.id}" class="${i === sel ? "sel" : ""}"><span>${esc(p.name)}</span><span class="d">${deathTxt(p)}</span></a>`).join("")
      + (hits.length ? `<a href="#/search" data-q="1"><span>كل النتائج في البحث المفصّل…</span></a>` : "");
    box.hidden = !hits.length;
  };
  q.addEventListener("input", () => { sel = -1; hits = findPersons(q.value); render(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sel >= 0 && hits[sel]) location.hash = `#/p/${hits[sel].id}`;
      else { SEARCH.q = q.value; if (location.hash === "#/search") route(); else location.hash = "#/search"; }
      box.hidden = true; q.blur();
    }
    else if (e.key === "Escape") box.hidden = true;
  });
  box.addEventListener("click", e => { if (e.target.closest("[data-q]")) SEARCH.q = q.value; box.hidden = true; q.value = ""; });
  document.addEventListener("click", e => { if (!q.parentElement.contains(e.target)) box.hidden = true; });
}

// ---------- tezyinat (SVG) ----------
const ORN = {
  // lale ayraç
  lale: `<svg class="lale" viewBox="0 0 180 26" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
    <path d="M4 14H66M114 14H176"/><circle cx="72" cy="14" r="2" fill="currentColor"/><circle cx="108" cy="14" r="2" fill="currentColor"/>
    <path d="M90 2C85 7 83 12 86 18c1 1.5 7 1.5 8 0 3-6 1-11-4-16Z" fill="currentColor" fill-opacity=".18"/>
    <path d="M81 6c-3 6-1 11 5 12M99 6c3 6 1 11-5 12M90 20v5M84 24c3-2 9-2 12 0"/></g></svg>`,
  // köşebent (tezhip köşesi)
  kose: cls => `<svg class="kose ${cls}" viewBox="0 0 46 46" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3">
    <path d="M3 43V16Q3 3 16 3H43"/><path d="M9 43V20Q9 9 20 9H43" opacity=".6"/>
    <path d="M9 9C15 13 16 18 13 22 9 18 7 13 9 9Z" fill="currentColor" fill-opacity=".25"/><circle cx="3" cy="3" r="2.2" fill="currentColor"/></g></svg>`,
  // şemse madalyon
  medal: `<svg class="medal" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4">
    <circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="38" stroke-dasharray="2 3"/>
    ${Array.from({ length: 12 }, (_, i) => `<path transform="rotate(${i * 30} 50 50)" d="M50 16C55 26 55 34 50 40 45 34 45 26 50 16Z" fill="currentColor" fill-opacity=".12"/>`).join("")}
    <circle cx="50" cy="50" r="8" fill="currentColor" fill-opacity=".3"/></g></svg>`,
  arrow: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
// ebru zemin: taraklı ebru şeritleri, türbülansla dalgalandırılmış
function ebru() {
  const cols = ["peach", "bg", "butter", "mint", "bg", "sage", "peach", "bg", "mint", "butter", "bg", "sage"];
  const stripes = Array.from({ length: 34 }, (_, i) => `<rect x="${i * 40 - 60}" y="-80" width="${22 + (i * 7) % 18}" height="700" fill="var(--${cols[i % cols.length]})"/>`
    + (i % 3 ? "" : `<rect x="${i * 40 - 64}" y="-80" width="2" height="700" fill="var(--gold)" opacity=".5"/>`)).join("");
  const drops = [[180, 120, 70, "sage"], [520, 60, 50, "peach"], [860, 150, 80, "butter"], [1080, 90, 45, "mint"], [340, 330, 60, "butter"], [760, 380, 55, "sage"]]
    .map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--${c})"/><circle cx="${x}" cy="${y}" r="${r * .55}" fill="var(--bg)"/><circle cx="${x}" cy="${y}" r="${r * .22}" fill="var(--${c})"/>`).join("");
  return `<svg class="ebru" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><filter id="ebf" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".0035 .011" numOctaves="3" seed="11" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="190" xChannelSelector="R" yChannelSelector="G"/>
      <feGaussianBlur stdDeviation="1.1"/></filter></defs>
    <g filter="url(#ebf)">${stripes}${drops}</g></svg>`;
}

// altın silsile: Ebû Hanîfe'den geç dönem bir âlime, asırlar cetveli üzerinde
const STAR8 = (x, y, r) => { const p = []; for (let i = 0; i < 16; i++) { const a = Math.PI / 8 * i, rr = i % 2 ? r * .72 : r; p.push(`${(x + rr * Math.sin(a)).toFixed(1)},${(y - rr * Math.cos(a)).toFixed(1)}`); } return p.join(" "); };
function silsile(host, data, pick) {
  const chain = data.chains[pick].map(id => ({ id, name: data.names[id] || who(id).name, d: who(id)?.d }))
    .filter(n => n.d);
  const W = Math.max(host.clientWidth, 720), H = 200, mid = 88, pad = 60;
  const y0 = 100 * Math.floor((chain[0].d - 20) / 100), y1 = Math.max(y0 + 300, 100 * Math.ceil((chain[chain.length - 1].d + 30) / 100));
  const X = d => W - pad - (d - y0) / (y1 - y0) * (W - 2 * pad);   // sağdan sola: eskiden yeniye
  const pts = chain.map((n, i) => ({ ...n, x: X(n.d), y: mid + Math.sin(i * 1.3) * 10 }));
  // iplik: noktalardan geçen yumuşak eğri
  let path = `M${pts[0].x + 40},${mid} L${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], cx = (a.x + b.x) / 2;
    path += ` C${cx},${a.y + (i % 2 ? 26 : -26)} ${cx},${b.y + (i % 2 ? -26 : 26)} ${b.x},${b.y}`; }
  const ticks = []; for (let t = y0; t <= y1; t += 50) { const x = X(t);
    ticks.push(`<line x1="${x}" x2="${x}" y1="${H - 26}" y2="${H - (t % 100 ? 30 : 36)}" />${t % 100 ? "" : `<text x="${x}" y="${H - 8}">${AR(t)}هـ</text>`}`); }
  host.innerHTML = `<svg class="thread" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <g class="ruler"><line x1="${pad - 20}" x2="${W - pad + 20}" y1="${H - 26}" y2="${H - 26}"/>${ticks.join("")}</g>
      <path class="gold" d="${path}" pathLength="1"/><path class="gold thin" d="${path}" transform="translate(0 3)" pathLength="1"/>
      ${pts.map((p, i) => `<g class="bead${i === 0 || i === pts.length - 1 ? " end" : ""}" style="--i:${i}">
        <polygon points="${STAR8(p.x, p.y, i === 0 || i === pts.length - 1 ? 12 : 8)}"/><circle cx="${p.x}" cy="${p.y}" r="${i === 0 || i === pts.length - 1 ? 3.2 : 2.2}"/></g>`).join("")}
      <g class="leads"></g></svg>
    ${pts.map((p, i) => `<a class="nm${i === 0 || i === pts.length - 1 ? " end" : ""}" href="#/p/${p.id}" style="--i:${i}"><b>${esc(p.name)}</b><span class="num">${AR(p.d)}</span></a>`).join("")}`;
  // adları çakışmayacak şekilde üst/alt kulvarlara yerleştir
  const lanes = [-30, 26, -62, 58], edge = lanes.map(() => Infinity), leads = [];
  host.querySelectorAll("a.nm").forEach((a, i) => { const p = pts[i], w = a.offsetWidth, h = a.offsetHeight;
    let L = lanes.findIndex((_, k) => p.x + w / 2 + 6 < edge[k]); if (L < 0) L = edge.indexOf(Math.max(...edge));
    if (i === 0 || i === pts.length - 1) L = L % 2 ? 1 : 0;
    edge[L] = p.x - w / 2;
    const top = lanes[L] < 0 ? p.y + lanes[L] - h / 2 : p.y + lanes[L] - h / 2 + 4;
    a.style.left = `${p.x - w / 2}px`; a.style.top = `${Math.max(0, top)}px`;
    if (L > 1) leads.push(`<line x1="${p.x}" x2="${p.x}" y1="${p.y + (lanes[L] < 0 ? -10 : 10)}" y2="${lanes[L] < 0 ? top + h : top}"/>`); });
  host.querySelector(".leads").innerHTML = leads.join("");
  host.style.height = `${H}px`;
  return chain;
}
// kategori çizimleri: sarık, pusula-gül, silsile, kitaplar
const ILL = {
  sarik: `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">
    <path d="M22 62c-4-16 6-34 26-38 20-4 34 8 33 26-1 10-6 16-12 18"/><path d="M26 66c10 6 30 8 44 2"/>
    <path d="M30 46c10-6 28-8 40 0M28 54c12-6 30-6 44 2M34 38c8-4 20-5 30 0"/><path d="M48 24c-2-6 2-10 6-10s6 5 3 10"/>
    <path d="M24 64c-6 4-6 12 0 16 10 6 42 6 52 0 6-4 6-12 0-16"/></g></svg>`,
  gul: `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8">
    <circle cx="50" cy="52" r="34"/><circle cx="50" cy="52" r="15"/>
    ${Array.from({ length: 16 }, (_, i) => `<path transform="rotate(${i * 22.5} 50 52)" d="M50 18 54 37 50 52 46 37Z"/>`).join("")}
    <path d="M50 4v10M46 8l4-4 4 4"/></g></svg>`,
  silsile: `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="50" cy="16" r="8"/><circle cx="26" cy="50" r="8"/><circle cx="74" cy="50" r="8"/><circle cx="14" cy="84" r="7"/><circle cx="38" cy="84" r="7"/><circle cx="62" cy="84" r="7"/><circle cx="86" cy="84" r="7"/>
    <path d="M45 23 30 43M55 23 70 43M22 57 16 77M30 57 36 77M70 57 64 77M78 57 84 77"/></g></svg>`,
  kitap: `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
    <path d="M12 58 50 46 88 58 50 70Z"/><path d="M12 58v8l38 12 38-12v-8"/><path d="M18 50 50 40 82 50"/><path d="M18 50v6M82 50v6"/>
    <path d="M24 42 50 34 76 42"/><ellipse cx="50" cy="58" rx="9" ry="3.5"/><path d="M50 78v10"/></g></svg>`,
};

// ---------- kartlar ----------
let EXC;
const excerpts = async () => EXC || (EXC = await load("excerpts.json"));
function pcard(p, ex, PL) {
  const pl = p.place && PL ? PL.get(p.place)?.name : "";
  const lq = [deathTxt(p), pl].filter(Boolean).join(" · ");
  return `<a class="pcard" href="#/p/${p.id}"><h3>${esc(p.name)}</h3>${lq ? `<span class="lq num">${esc(lq)}</span>` : ""}
    ${ex ? `<p class="ex">${esc(ex)}</p>` : ""}
    <span class="ft"><span class="badges num"><span>${AR(p.n)} ${p.n > 1 ? "مصادر" : "مصدر"}</span>${p.nt ? `<span>${AR(p.nt)} شيوخ</span>` : ""}${p.ns ? `<span>${AR(p.ns)} تلاميذ</span>` : ""}</span>
    <span class="go">قراءة الترجمة ←</span></span></a>`;
}
async function cardGrid(host, list, step = 36) {
  const [EX, PL] = await Promise.all([excerpts(), placesById()]);
  let shown = 0;
  const grid = document.createElement("div"); grid.className = "cards";
  const more = document.createElement("div"); more.className = "more";
  host.append(grid, more);
  const next = () => {
    grid.insertAdjacentHTML("beforeend", list.slice(shown, shown + step).map(p => pcard(p, EX[p.id], PL)).join(""));
    shown += step;
    more.innerHTML = shown < list.length ? `<button type="button" class="btn gold">المزيد (${AR(list.length - shown)})</button>` : "";
  };
  more.addEventListener("click", e => { if (e.target.closest("button")) next(); });
  next();
}
const secHead = (t, sub) => `<div class="sechead"><h2>${t}</h2>${sub ? `<p>${sub}</p>` : ""}${ORN.lale}</div>`;

// ---------- home ----------
async function viewHome(view) {
  const [featured, PL, g, places, CH] = await Promise.all([load("featured.json"), placesById(), graph(), load("places.json"), load("chains.json")]);
  const byC = {};
  IDX.forEach(p => { const k = century(p.d); if (k) byC[k] = (byC[k] || 0) + 1; });
  const studentsOf = id => { const i = g.byId.get(id); return i === undefined ? [] : g.down[i].map(([j, n]) => [g.nodes[j].id, n]).sort((a, b) => b[1] - a[1]).map(x => x[0]); };
  const atPlace = (pid, kinds) => { const pl = PL.get(pid); if (!pl) return [];
    const ids = [...new Set(pl.people.filter(([, k]) => !kinds || kinds.includes(k)).map(x => x[0]))];
    return ids.filter(id => P.has(id)).sort((a, b) => (P.get(b).n + P.get(b).ns) - (P.get(a).n + P.get(a).ns)); };
  const COLL = [
    ["أصحاب أبي حنيفة", studentsOf("jws1"), "#/net/jws1"],
    ["تلاميذ أبي يوسف", studentsOf("jw1825"), "#/net/jw1825"],
    ["تلاميذ الإمام محمد", studentsOf("jw1270"), "#/net/jw1270"],
    ["تلاميذ أبي الحسن الكرخي", studentsOf("jw894"), "#/net/jw894"],
    ["تلاميذ شمس الأئمة الحلواني", studentsOf("jw821"), "#/net/jw821"],
    ["علماء سمرقند", atPlace("SAMARQAND_670E396N_S"), "#/map/SAMARQAND_670E396N_S"],
    ["قضاة القاهرة ومدرّسوها", atPlace("QAHIRA_312E300N_S", ["office"]), "#/map/QAHIRA_312E300N_S"],
  ].filter(c => c[1].length);
  const bk = Object.keys(BOOKS).length;
  view.innerHTML = `
    <section class="hero" style="margin:0">${ebru()}<div class="inner">
      <div class="txt">
        <p class="kicker">تراجم الحنفية من كتب الطبقات، في فهرسٍ واحد</p>
        <h1>طبقات الحنفية</h1>
        <div class="search"><input id="hq" type="search" placeholder="ابحث عن عَلَم… (مثل: السرخسي، أبو حفص الكبير)" autocomplete="off" aria-label="بحث"><div class="results" hidden></div></div>
      </div>
      <figure class="silsile">
        <figcaption><span class="lbl">سلسلة التفقّه</span> <span id="scap"></span></figcaption>
        <div class="scroll"><div id="thread"></div></div>
        <div class="sbar"><button type="button" class="btn ghost" id="snext">↻ سلسلة أخرى</button><a class="btn ghost" id="sopen" href="#/net/jws1">افتحها في السلسلة ←</a></div>
      </figure>
      <div class="tiles4 num">
        <a class="t4 c1" href="#/search"><span class="n">${AR(IDX.length)}</span>${ILL.sarik}<span class="l">الأعلام</span></a>
        <a class="t4 c2" href="#/map"><span class="n">${AR(places.length)}</span>${ILL.gul}<span class="l">البلدان</span></a>
        <a class="t4 c3" href="#/net/jws1"><span class="n">${AR(g.edges.length)}</span>${ILL.silsile}<span class="l">صلات الشيوخ والتلاميذ</span></a>
        <a class="t4 c4" href="#books"><span class="n">${AR(bk)}</span>${ILL.kitap}<span class="l">كتب الطبقات</span></a>
      </div></div></section>
    <hr class="divider">
    ${secHead("مجموعات مختارة", "حلقات العلم كما رسمتها التراجم")}
    <div class="coll">${COLL.map(([t, ids, href]) => `<div class="ccard"><h3>${t}</h3>${ORN.medal}
      <ul>${ids.slice(0, 8).map(id => `<li>${plink(id)}</li>`).join("")}</ul>
      <a class="go" href="${href}" aria-label="${t}">${ORN.arrow}</a></div>`).join("")}</div>
    <div class="wrap">
      ${secHead("أعلام مختارون", "من أكثر الأعلام ذكرًا في كتب الطبقات")}
      <div id="feat"></div>
      ${secHead("الأعلام بحسب قرن الوفاة")}
      <div class="tiles num">${Object.keys(byC).map(Number).sort((a, b) => a - b).map(k =>
        `<a class="tile" href="#/c/${k}"><b>القرن ${CENT[k] || AR(k)}</b><span>${AR(byC[k])} عَلَمًا</span></a>`).join("")}</div>
      <div id="books">${secHead("كتب الطبقات", "المصادر التي جُمعت منها التراجم")}</div>
      <div class="books">${Object.entries(BOOKS).map(([id, b]) => { const n = IDX.filter(p => p.books.includes(id)).length;
        return `<a class="book" href="#/b/${id}"><b>${esc(b.title)}</b><span>${esc(b.author)}${b.death ? ` (ت ${AR(b.death)}هـ)` : ""}</span> <em class="num">· ${AR(n)} ترجمة</em></a>`; }).join("")}</div>
      <div class="cta">
        <a href="#/search"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span><b>البحث المفصّل</b><span>ابحث بين ${AR(IDX.length)} عَلَمًا بالاسم والقرن والكتاب والبلد</span></span><span class="btn gold">ابدأ البحث</span></a>
        <a href="#/map"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 21s-6-6.5-6-11a6 6 0 0 1 12 0c0 4.5-6 11-6 11Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2" fill="currentColor"/></svg></span>
          <span><b>خريطة البلدان</b><span>مواطن الأعلام ورحلاتهم وولاياتهم عبر القرون</span></span><span class="btn gold">افتح الخريطة</span></a>
      </div>
    </div>`;
  setupSearch($("#hq"));
  // silsile: her ziyarette başka bir halka dizisi
  let sp = Math.floor(Math.random() * CH.chains.length);
  const drawChain = () => { const c = silsile($("#thread"), CH, sp), a = c[0], z = c[c.length - 1];
    $("#scap").innerHTML = `من ${esc(a.name)} (ت ${AR(a.d)}هـ) إلى ${esc(z.name)} (ت ${AR(z.d)}هـ): ${AR(c.length)} ${c.length <= 10 ? "حلقات" : "حلقةً"}، كلّ صلةٍ منها موثّقة في التراجم`;
    $("#sopen").href = `#/net/${z.id}`; };
  drawChain();
  $("#snext").addEventListener("click", () => { sp = (sp + 1 + Math.floor(Math.random() * (CH.chains.length - 1))) % CH.chains.length; drawChain(); });
  let rw; addEventListener("resize", () => { clearTimeout(rw); rw = setTimeout(() => $("#thread") && drawChain(), 200); });
  view.querySelector('a[href="#books"]').addEventListener("click", e => { e.preventDefault(); $("#books").scrollIntoView({ behavior: "smooth" }); });
  // seçkiler: ortadaki kart büyür
  const coll = $(".coll", view), cards = [...coll.querySelectorAll(".ccard")];
  const focus = () => { const c = coll.getBoundingClientRect(), mid = c.left + c.width / 2;
    let best = null, bd = 1e9; cards.forEach(el => { const r = el.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = el; } });
    cards.forEach(el => el.classList.toggle("on", el === best)); };
  coll.addEventListener("scroll", () => requestAnimationFrame(focus), { passive: true });
  cards.forEach(el => el.addEventListener("click", e => { if (!el.classList.contains("on") && !e.target.closest("a")) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }));
  const start = cards[Math.min(2, cards.length - 1)];
  if (start) coll.scrollLeft += (start.getBoundingClientRect().left + start.offsetWidth / 2) - (coll.getBoundingClientRect().left + coll.clientWidth / 2);
  focus();
  await cardGrid($("#feat"), featured.map(id => P.get(id)).filter(Boolean), 18);
}

// ---------- listeler: asır, kitap ----------
async function viewList(view, kind, arg) {
  let title, sub, list;
  if (kind === "c") {
    title = `أعلام القرن ${CENT[arg] || AR(arg)}`; sub = "مرتّبون على سنة الوفاة";
    list = IDX.filter(p => century(p.d) === arg).sort((a, b) => a.d - b.d);
  } else {
    const b = BOOKS[arg]; if (!b) { view.innerHTML = `<p class="empty">لا يوجد هذا الكتاب.</p>`; return; }
    title = b.title; sub = `${b.author}${b.death ? ` (ت ${AR(b.death)}هـ)` : ""}`;
    list = IDX.filter(p => p.books.includes(arg)).sort((a, b) => (a.d || 9999) - (b.d || 9999));
  }
  view.innerHTML = `<div class="pagehead"><h1>${esc(title)}</h1><span class="c num">${AR(list.length)} عَلَمًا</span></div><p class="lede">${esc(sub)}</p><div id="lst"></div>`;
  await cardGrid($("#lst"), list);
}

// ---------- البحث المفصل ----------
const SEARCH = { q: "", c0: "", c1: "", book: "", place: "", net: false };
async function viewSearch(view) {
  const places = await load("places.json");
  const top = places.filter(p => p.n >= 5).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const opts = [...Array(14)].map((_, i) => `<option value="${i + 1}">${CENT[i + 1]}</option>`).join("");
  view.innerHTML = `<div class="pagehead"><h1>البحث المفصّل</h1></div>
    <form class="sform" id="sf" autocomplete="off">
      <label class="wide">الاسم أو جزء منه<input name="q" type="search" placeholder="مثل: أبو بكر البلخي، النسفي، شمس الأئمة"></label>
      <label>من القرن<select name="c0"><option value="">—</option>${opts}</select></label>
      <label>إلى القرن<select name="c1"><option value="">—</option>${opts}</select></label>
      <label>الكتاب<select name="book"><option value="">كل الكتب</option>${Object.entries(BOOKS).map(([id, b]) => `<option value="${id}">${esc(b.title)}</option>`).join("")}</select></label>
      <label>البلد<select name="place"><option value="">كل البلدان</option>${top.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" name="net"> له شيوخ أو تلاميذ في السلسلة</label>
    </form><div id="sres"></div>`;
  const f = $("#sf");
  Object.entries(SEARCH).forEach(([k, v]) => { const el = f.elements[k]; if (!el) return; if (el.type === "checkbox") el.checked = !!v; else el.value = v; });
  const PL = await placesById();
  let timer, gen = 0;
  const run = async () => {
    const my = ++gen;
    Object.keys(SEARCH).forEach(k => { const el = f.elements[k]; SEARCH[k] = el.type === "checkbox" ? el.checked : el.value; });
    const toks = norm(SEARCH.q).split(" ").filter(Boolean);
    const c0 = +SEARCH.c0 || 0, c1 = +SEARCH.c1 || 99;
    const atPl = SEARCH.place ? new Set((PL.get(SEARCH.place)?.people || []).map(x => x[0])) : null;
    const res = IDX.filter(p => (!toks.length || toks.every(t => p.key.includes(t)))
      && (!(SEARCH.c0 || SEARCH.c1) || (century(p.d) >= c0 && century(p.d) <= c1))
      && (!SEARCH.book || p.books.includes(SEARCH.book))
      && (!atPl || atPl.has(p.id)) && (!SEARCH.net || p.nt || p.ns))
      .sort((a, b) => toks.length ? (b.n + b.nt + b.ns) - (a.n + a.nt + a.ns) : (a.d || 9999) - (b.d || 9999));
    const host = $("#sres");
    if (my !== gen) return;
    host.innerHTML = `<p class="legend num">${AR(res.length)} نتيجة</p>`;
    await cardGrid(host, res);
  };
  f.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  f.addEventListener("submit", e => { e.preventDefault(); run(); });
  run();
}

// ---------- person ----------
function relItem(r, subjName) {
  const p = who(r.id) || { name: r.id };
  const ev = r.ev.map(([cite, snip, t]) => {
    let s = esc(snip); const tt = esc(t);
    if (tt && s.includes(tt)) s = s.replace(tt, `<mark>${tt}</mark>`);
    return `<p><b>${esc(cite)}</b>: …${s}…</p>`;
  }).join("");
  return `<li><div class="row">${plink(r.id)}<span class="d num">${deathTxt(p)}</span>
      ${p.salaf ? `<span class="tag weak">من السلف</span>` : ""}${r.rels.map(x => `<span class="tag">${REL[x] || esc(x)}</span>`).join("")}
      ${r.weak ? `<span class="tag weak" title="ربط بالنسبة أو الشهرة وحدها">ترجيح</span>` : ""}
      ${r.n > 1 ? `<span class="d num">${AR(r.n)} مواضع</span>` : ""}</div>
    <details class="ev"><summary>الشاهد</summary>${ev}</details></li>`;
}

async function viewPerson(view, id) {
  if (SALAF.has(id)) { location.replace(`#/net/${id}`); return; }
  const p = P.get(id), d = await person(id);
  if (!p || !d) { view.innerHTML = `<p class="empty">لا يوجد هذا العلم.</p>`; return; }
  const extT = d.ext.filter(x => x[2] !== "student"), extS = d.ext.filter(x => x[2] === "student");
  const extList = xs => {
    const seen = new Map();
    xs.forEach(x => { if (!seen.has(x[0])) seen.set(x[0], x); });
    return [...seen.values()].map(x => `<li class="ext">${esc(x[0])} <span class="d num">(ت ${AR(x[1])}هـ)</span> <span class="tag weak">${REL[x[3]] || ""}</span></li>`).join("");
  };
  const byKind = {};
  d.places.forEach(([pl, k, cite, t]) => (byKind[k] = byKind[k] || []).push([pl, cite, t]));
  view.innerHTML = `
    <div class="phead">${ORN.kose("tr")}${ORN.kose("tl")}${ORN.kose("br")}${ORN.kose("bl")}
      <h1>${esc(d.name)}</h1>
      <div class="death num">${d.death ? esc(d.death) : p.d ? `نحو ${AR(p.d)}هـ <span class="est">(تقدير من طبقة شيوخه وتلاميذه)</span>` : `<span class="est">لم تُذكر وفاته</span>`}</div>
      <div class="facts num"><span><b>${AR(d.sources.length)}</b> ${d.sources.length > 1 ? "مصادر" : "مصدر"}</span>
        <span><b>${AR(d.teachers.length)}</b> شيوخ</span><span><b>${AR(d.students.length)}</b> تلاميذ</span>
        <span><b>${AR(new Set(d.places.map(x => x[0])).size)}</b> بلدان</span></div>
      <div class="filters">${p.nt || p.ns ? `<a class="btn" href="#/net/${id}">سلسلة شيوخه وتلاميذه</a>` : ""}
        <button type="button" class="btn" data-go="texts">نصوص الترجمة</button></div>
    </div>
    <section><h2>مواضع الترجمة<span class="c num">${AR(d.sources.length)}</span></h2>
      <ul class="srcs num">${d.sources.map(([b, cite, h]) => `<li>${esc(cite)}<span class="h">${esc(h)}</span></li>`).join("")}</ul></section>
    <div class="grid2">
      <section><h2>شيوخه<span class="c num">${AR(d.teachers.length)}</span></h2>
        ${d.teachers.length ? `<ul class="rel">${d.teachers.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">لم يُذكر له شيخ من المترجمين.</p>`}
        ${extT.length ? `<h3 style="margin-top:1rem;font-size:1.05rem">شيوخ من غير المترجمين في هذه الكتب</h3><ul class="rel">${extList(extT)}</ul>` : ""}
      </section>
      <section><h2>تلاميذه<span class="c num">${AR(d.students.length)}</span></h2>
        ${d.students.length ? `<ul class="rel">${d.students.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">لم يُذكر له تلميذ من المترجمين.</p>`}
        ${extS.length ? `<h3 style="margin-top:1rem;font-size:1.05rem">رواة عنه من غير المترجمين</h3><ul class="rel">${extList(extS)}</ul>` : ""}
      </section>
    </div>
    <section id="psec"><h2>البلدان<span class="c num">${AR(new Set(d.places.map(x => x[0])).size)}</span></h2>
      ${d.places.length ? `<div class="grid2"><ul class="places" id="plist"></ul><div class="mapwrap mini" id="pmap"></div></div>
        <p class="legend">الخط المتقطع يصل البلدان على ترتيب ورودها في الترجمة (المولد والنسبة أولًا، والوفاة والمدفن آخرًا)، وهو تقريب لا تأريخ.</p>`
        : `<p class="empty">لم يُستخرج له بلد.</p>`}
    </section>
    <section id="texts"><h2>نصوص الترجمة<span class="c num">${AR(d.sources.length)}</span>
        ${d.sources.length > 1 ? `<button type="button" class="btn small" id="openall">فتح الكل</button>` : ""}</h2>
      <p class="legend">نص الترجمة في كل كتاب كما هو في الطبعة المعتمدة، مع حواشي المحقق.</p>
      ${d.sources.map(([b, cite, h], k) => `<details class="src" data-k="${k}"><summary><span class="bk num">${esc(cite)}</span>
        <span class="ct">${esc(h)}</span></summary><div class="body"><p class="empty">جارٍ التحميل…</p></div></details>`).join("")}
    </section>`;
  setupTexts(id, d);
  if (!d.places.length) return;
  const PL = await placesById();
  $("#plist").innerHTML = KIND_ORDER.filter(k => byKind[k]).map(k => `<li><span class="k">${KIND[k]}</span>
    ${[...new Map(byKind[k].map(x => [x[0], x])).values()].map(([pl, cite]) =>
      `<a href="#/map/${encodeURIComponent(pl)}" title="${esc(cite)}">${esc(PL.get(pl)?.name || pl)}</a>`).join("، ")}</li>`).join("");
  // مسار تقريبي: نسبة/أصل/مولد ← … ← وفاة/مدفن
  const seq = [];
  KIND_ORDER.forEach(k => (byKind[k] || []).forEach(([pl]) => { if (seq[seq.length - 1] !== pl) seq.push(pl); }));
  const uniq = [...new Set(d.places.map(x => x[0]))].map(id => PL.get(id)).filter(Boolean);
  const m = await makeMap($("#pmap"), { mini: true });
  m.draw(uniq.map(pl => ({ pl, r: 5, label: true })), { route: seq.map(id => PL.get(id)).filter(Boolean) });
  m.fit(uniq);
}

// ---------- texts ----------
async function texts(id) {
  const s = await load(`t/${String(shardOf(id)).padStart(2, "0")}.json`);
  return s[id] || [];
}
function setupTexts(id, d) {
  const sec = $("#texts");
  if (!sec) return;
  const fill = async el => {
    if (el.dataset.done) return;
    el.dataset.done = 1;
    const all = await texts(id), k = +el.dataset.k, cite = d.sources[k][1];
    const t = all.find(x => x.cite === cite) || all[k];
    $(".body", el).innerHTML = t ? renderEntry(t, `${k}`) : `<p class="empty">لا يوجد نص.</p>`;
  };
  sec.querySelectorAll("details.src").forEach(el => el.addEventListener("toggle", () => { if (el.open) fill(el); }));
  const btn = $("#openall");
  if (btn) btn.addEventListener("click", () => {
    const els = [...sec.querySelectorAll("details.src")], open = !els.every(e => e.open);
    els.forEach(e => { e.open = open; });
    btn.textContent = open ? "طي الكل" : "فتح الكل";
  });
}
const toArDigits = s => String(s).replace(/\d/g, c => "٠١٢٣٤٥٦٧٨٩"[c]);
function inline(s, fid, used) {
  return esc(s)
    .replace(/\[\^(\w+)\]/g, (_, n) => { used.add(n); return `<sup class="fn"><a href="#" data-fn="fn-${fid}-${n}" id="fr-${fid}-${n}">${toArDigits(n)}</a></sup>`; })
    .replace(/«([^«»]{1,120})»/g, "«<span class=\"q\">$1</span>»");
}
function renderBlocks(text, fid, used) {
  return text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
    const h = b.match(/^#{1,6}\s+(.*)$/);
    if (h) return `<h4>${inline(h[1], fid, used)}</h4>`;
    // بيت شعر: شطران بينهما «…»
    const v = b.split(/\s+…\s+/);
    if (v.length === 2 && b.length < 160 && !/[.؟!]\s*$/.test(v[0])) return `<div class="bayt"><span>${inline(v[0], fid, used)}</span><span>${inline(v[1], fid, used)}</span></div>`;
    return `<p>${inline(b, fid, used).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}
function renderEntry(t, fid) {
  const used = new Set();
  const [main, ...rest] = t.text.split(/\n*<hr>\n*/);
  let html = `<div class="etitle">${esc(t.heading)}</div><div class="etext">${renderBlocks(main, fid, used)}</div>`;
  const notes = Object.entries(t.notes || {});
  if (notes.length || rest.length || (t.refs || []).length) {
    html += `<div class="notes"><div class="label">حواشي المحقق</div>`;
    if ((t.refs || []).length) html += t.refs.map(r => `<p class="refs">${esc(r)}</p>`).join("");
    if (notes.length) html += `<ol>${notes.map(([n, v]) => `<li id="fn-${fid}-${esc(n)}" value="${parseInt(n) || ""}"><a href="#" class="back" data-fn="fr-${fid}-${esc(n)}" aria-label="ارجع إلى الموضع">${toArDigits(n)}</a> ${esc(v)}</li>`).join("")}</ol>`;
    if (rest.length) html += `<div class="extra">${renderBlocks(rest.join("\n\n"), fid, used)}</div>`;
    html += `</div>`;
  }
  return html;
}
document.addEventListener("click", e => {   // sayfa içi kaydırma (adres değişmeden)
  const b = e.target.closest("[data-go]");
  if (b) { e.preventDefault(); document.getElementById(b.dataset.go)?.scrollIntoView({ behavior: "smooth" }); }
});
document.addEventListener("click", e => {   // الحواشي: انتقال داخل الصفحة دون المساس بعنوان الصفحة
  const a = e.target.closest("[data-fn]");
  if (!a) return;
  e.preventDefault();
  const el = document.getElementById(a.dataset.fn);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1400); }
});

// ---------- map ----------
let PLACES_BY_ID;
async function placesById() {
  if (!PLACES_BY_ID) PLACES_BY_ID = new Map((await load("places.json")).map(p => [p.id, p]));
  return PLACES_BY_ID;
}
const BB = { lon0: 22, lat1: 50, k: 20, c: Math.cos(35 * Math.PI / 180) };
const proj = (lon, lat) => [(lon - BB.lon0) * BB.c * BB.k, (BB.lat1 - lat) * BB.k];

async function makeMap(host, opt = {}) {
  const base = await load("basemap.json");
  const W = base.width, H = base.height;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="خريطة">
      <rect x="-5000" y="-5000" width="12000" height="12000" fill="var(--water)"/>
      <path class="land" d="${base.land}"/><path class="lake" d="${base.lakes}"/><path class="river" d="${base.rivers}"/>
      <g class="routes"></g><g class="pts"></g><g class="labs"></g></svg>
    <div class="zoom"><button type="button" data-z="1.5" aria-label="تكبير">+</button><button type="button" data-z="0.667" aria-label="تصغير">−</button></div>`;
  const svg = $("svg", host);
  let vb = { x: 0, y: 0, w: W, h: H }, items = [], onPick = opt.onPick;
  const scale = () => vb.w / (svg.clientWidth || 800);
  const apply = () => {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const s = scale();
    svg.querySelectorAll(".pt").forEach(c => c.setAttribute("r", c.dataset.r * s));
    svg.querySelectorAll(".plab").forEach(t => { t.setAttribute("font-size", 13 * s); t.style.strokeWidth = 3 * s; });
    svg.querySelectorAll(".route").forEach(r => { r.style.strokeWidth = 2 * s; r.style.strokeDasharray = `${5 * s} ${4 * s}`; });
    svg.querySelector(".land").style.strokeWidth = .6 * s;
    svg.querySelector(".river").style.strokeWidth = 1 * s;
  };
  const zoomAt = (f, cx, cy) => {
    const nw = Math.min(W * 1.5, Math.max(30, vb.w / f)), r = nw / vb.w;
    vb = { x: cx - (cx - vb.x) * r, y: cy - (cy - vb.y) * r, w: nw, h: vb.h * r };
    apply();
  };
  const toSvg = (ev) => { const b = svg.getBoundingClientRect(); const s = Math.max(vb.w / b.width, vb.h / b.height);
    const ox = (b.width * s - vb.w) / 2, oy = (b.height * s - vb.h) / 2;
    return [vb.x - ox + (ev.clientX - b.left) * s, vb.y - oy + (ev.clientY - b.top) * s]; };
  svg.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = toSvg(e); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, x, y); }, { passive: false });
  const ptrs = new Map(); let last = null, pinch = 0, moved = 0;
  svg.addEventListener("pointerdown", e => { svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e); last = e; moved = 0; });
  svg.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], dd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) { const [x, y] = toSvg({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }); zoomAt(dd / pinch, x, y); }
      pinch = dd; return;
    }
    const s = Math.max(vb.w / svg.clientWidth, vb.h / svg.clientHeight);
    vb.x -= (e.clientX - last.clientX) * s; vb.y -= (e.clientY - last.clientY) * s;
    moved += Math.abs(e.clientX - last.clientX) + Math.abs(e.clientY - last.clientY);
    last = e; apply();
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("click", e => { const c = e.target.closest(".pt"); if (c && moved < 6 && onPick) onPick(c.dataset.id); });
  host.querySelectorAll(".zoom button").forEach(b => b.addEventListener("click", () => zoomAt(+b.dataset.z, vb.x + vb.w / 2, vb.y + vb.h / 2)));
  new ResizeObserver(apply).observe(svg);

  return {
    draw(list, o = {}) {
      items = list;
      const pts = svg.querySelector(".pts"), labs = svg.querySelector(".labs"), routes = svg.querySelector(".routes");
      pts.innerHTML = list.map(({ pl, r, on }) => { const [x, y] = proj(pl.lon, pl.lat);
        return `<circle class="pt${on ? " on" : ""}" data-id="${esc(pl.id)}" data-r="${r}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"><title>${esc(pl.name)}</title></circle>`; }).join("");
      labs.innerHTML = list.filter(x => x.label).map(({ pl, r }) => { const [x, y] = proj(pl.lon, pl.lat);
        return `<text class="plab" x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="-0.6em" text-anchor="middle">${esc(pl.name)}</text>`; }).join("");
      routes.innerHTML = o.route && o.route.length > 1 ? `<path class="route" d="M${o.route.map(pl => proj(pl.lon, pl.lat).map(v => v.toFixed(1)).join(" ")).join("L")}"/>` : "";
      apply();
    },
    fit(pls) {
      if (!pls.length) return;
      const xy = pls.map(pl => proj(pl.lon, pl.lat));
      let [x0, y0, x1, y1] = [Math.min(...xy.map(v => v[0])), Math.min(...xy.map(v => v[1])), Math.max(...xy.map(v => v[0])), Math.max(...xy.map(v => v[1]))];
      const pad = 60, w = Math.max(160, x1 - x0 + 2 * pad), h = Math.max(120, y1 - y0 + 2 * pad);
      const ar = (svg.clientWidth || 400) / (svg.clientHeight || 300), ww = Math.max(w, h * ar), hh = ww / ar;
      vb = { x: (x0 + x1) / 2 - ww / 2, y: (y0 + y1) / 2 - hh / 2, w: ww, h: hh }; apply();
    },
    pick(f) { onPick = f; },
  };
}

async function viewMap(view, sel) {
  const places = await load("places.json");
  const PL = await placesById();
  const cents = new Set(), kinds = new Set(KIND_ORDER);
  view.innerHTML = `<h1>خريطة البلدان</h1>
    <p class="lede">كل دائرة بلد ورد في التراجم؛ حجمها على عدد الأعلام المرتبطين به بحسب القرن ونوع الصلة المختارين. اضغط على بلد لترى أعلامه.</p>
    <div class="filters" id="fk"><span class="label">نوع الصلة</span>${KIND_ORDER.map(k => `<button type="button" class="btn on" data-k="${k}">${KIND[k]}</button>`).join("")}</div>
    <div class="filters num" id="fc"><span class="label">قرن الوفاة</span>${[...Array(14)].map((_, i) => `<button type="button" class="btn" data-c="${i + 1}">${AR(i + 1)}</button>`).join("")}
      <button type="button" class="btn" data-c="all">الكل</button></div>
    <div class="mapgrid"><div class="mapwrap big" id="bigmap"></div><aside class="side" id="side"><p class="legend">اختر بلدًا من الخريطة.</p></aside></div>`;
  const m = await makeMap($("#bigmap"));
  const match = (pid, k) => kinds.has(k) && (!cents.size || cents.has(century(P.get(pid)?.d)));
  let current = sel && PL.get(sel) ? sel : "";
  const side = () => {
    const pl = PL.get(current);
    if (!pl) return;
    const rows = new Map();
    pl.people.forEach(([pid, k]) => { if (match(pid, k)) { const r = rows.get(pid) || []; r.push(k); rows.set(pid, r); } });
    const list = [...rows.entries()].sort((a, b) => (P.get(a[0])?.d || 9999) - (P.get(b[0])?.d || 9999));
    const byK = {}; pl.people.forEach(([pid, k]) => { if (match(pid, k)) byK[k] = (byK[k] || 0) + 1; });
    $("#side").innerHTML = `<h3>${esc(pl.name)}</h3><p class="legend num">${AR(list.length)} عَلَمًا · ${KIND_ORDER.filter(k => byK[k]).map(k => `${KIND[k]} ${AR(byK[k])}`).join(" · ")}</p>
      <ul class="num">${list.map(([pid, ks]) => `<li>${plink(pid)}<span class="k">${deathTxt(P.get(pid) || {})} · ${[...new Set(ks)].map(k => KIND[k]).join("، ")}</span></li>`).join("")}</ul>`;
  };
  const redraw = () => {
    const counts = places.map(pl => { const s = new Set(); pl.people.forEach(([pid, k]) => { if (match(pid, k)) s.add(pid); }); return [pl, s.size]; })
      .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    m.draw(counts.map(([pl, n], i) => ({ pl, r: 2.5 + Math.sqrt(n) * 1.5, label: i < 28, on: pl.id === current })));
    side();
  };
  m.pick(id => { current = id; history.replaceState(null, "", `#/map/${encodeURIComponent(id)}`); redraw(); });
  $("#fk").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return;
    kinds.has(b.dataset.k) ? kinds.delete(b.dataset.k) : kinds.add(b.dataset.k); b.classList.toggle("on"); redraw(); });
  $("#fc").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return;
    if (b.dataset.c === "all") { cents.clear(); $("#fc").querySelectorAll(".btn").forEach(x => x.classList.remove("on")); }
    else { const c = +b.dataset.c; cents.has(c) ? cents.delete(c) : cents.add(c); b.classList.toggle("on"); }
    redraw(); });
  redraw();
  if (current) m.fit([PL.get(current)]);
}

// ---------- network ----------
let G;
async function graph() {
  if (G) return G;
  const g = await load("graph.json");
  const nodes = g.nodes.map(n => ({ id: n[0], name: n[1], d: n[2], deg: n[3], x: n[4], y: n[5], guess: !!n[6], salaf: !!n[7] }));
  const up = nodes.map(() => []), down = nodes.map(() => []);
  g.edges.forEach(([t, s, n, weak]) => { up[s].push([t, n, weak]); down[t].push([s, n, weak]); });
  G = { nodes, up, down, edges: g.edges, byId: new Map(nodes.map((n, i) => [n.id, i])) };
  return G;
}

async function viewNet(view, id) {
  const g = await graph();
  const full = !id;
  view.innerHTML = `<h1>سلسلة الشيوخ والتلاميذ</h1>
    <div class="filters"><a class="btn ${full ? "" : "on"}" href="#/net/${esc(id || "jws1")}">سلسلة عَلَم</a>
      <a class="btn ${full ? "on" : ""}" href="#/net">المشهد العام</a>
      ${full ? "" : `<span class="label" style="margin-inline-start:1rem">الطبقات</span><button type="button" class="btn on" data-depth="1">طبقة واحدة</button><button type="button" class="btn" data-depth="2">طبقتان</button>`}</div>
    <div id="netbody"></div>`;
  if (full) return fullNet($("#netbody"), g);
  const i = g.byId.get(id);
  if (i === undefined) { $("#netbody").innerHTML = `<p class="empty">${plink(id)} ليس له شيوخ ولا تلاميذ من المترجمين.</p>`; return; }
  let depth = 1;
  const draw = () => egoNet($("#netbody"), g, i, depth);
  view.querySelectorAll("[data-depth]").forEach(b => b.addEventListener("click", () => {
    depth = +b.dataset.depth; view.querySelectorAll("[data-depth]").forEach(x => x.classList.toggle("on", x === b)); draw(); }));
  draw();
}

/* سلسلة عَلَم: أعمدة من اليمين (الأقدم) إلى اليسار؛ البطاقات HTML تلتف أسماؤها كاملة،
   والخطوط تُرسم بعد التخطيط من مواضع البطاقات الفعلية. */
function egoNet(host, g, me, depth) {
  const MAXC = 60;
  const cols = new Map([[0, [me]]]);
  const seen = new Set([me]);
  for (let k = 1; k <= depth; k++) {
    for (const [dir, adj] of [[-1, g.up], [1, g.down]]) {
      const prev = cols.get(dir * (k - 1)) || [], next = [];
      prev.forEach(i => adj[i].forEach(([j]) => { if (!seen.has(j)) { seen.add(j); next.push(j); } }));
      cols.set(dir * k, next);
    }
  }
  const more = {};
  const keys = [...cols.keys()].sort((a, b) => a - b);
  const byYear = (a, b) => (g.nodes[a].d || 9999) - (g.nodes[b].d || 9999);
  // الطبقة الأولى بالوفاة؛ الثانية بمركز ثقل صلاتها في الطبقة الأولى (تقليل تقاطع الخطوط)
  [-1, 1].forEach(c => cols.has(c) && cols.get(c).sort(byYear));
  [-2, 2].forEach(c => {
    if (!cols.has(c)) return;
    const ref = cols.get(c / 2), at = new Map(ref.map((i, r) => [i, r]));
    const adj = c < 0 ? g.down : g.up;
    const bc = i => { const r = adj[i].map(([j]) => at.get(j)).filter(v => v !== undefined); return r.length ? r.reduce((a, b) => a + b) / r.length : 1e9; };
    cols.get(c).sort((a, b) => bc(a) - bc(b) || byYear(a, b));
  });
  for (const [c, l] of cols) if (l.length > MAXC) { more[c] = l.length - MAXC; cols.set(c, l.slice(0, MAXC)); }
  const head = { "-2": "شيوخ شيوخه", "-1": "شيوخه", "0": "صاحب السلسلة", "1": "تلاميذه", "2": "تلاميذ تلاميذه" };
  const card = i => { const n = g.nodes[i], p = P.get(n.id) || {};
    const yr = n.d ? `${n.guess || p.est ? "نحو " : "ت "}${AR(n.d)}هـ` : "";
    const tr = n.salaf ? `<span class="tag weak" title="قبل أبي حنيفة؛ ليس له ترجمة في هذا الفهرس">من السلف</span>`
      : `<a class="tr" href="#/p/${esc(n.id)}" title="ترجمته">ترجمة</a>`;
    return i === me
      ? `<div class="card me${n.salaf ? " salaf" : ""}" data-i="${i}">${n.salaf ? `<span class="nm">${esc(n.name)}</span>` : `<a class="nm" href="#/p/${esc(n.id)}">${esc(n.name)}</a>`}
          <span class="meta num"><span>${yr}</span>${n.salaf ? tr : ""}</span>
          ${n.salaf ? "" : `<a class="tr" href="#/p/${esc(n.id)}">قراءة الترجمة ←</a>`}</div>`
      : `<div class="card${n.salaf ? " salaf" : ""}" data-i="${i}"><a class="nm" href="#/net/${esc(n.id)}" title="سلسلته">${esc(n.name)}</a>
          <span class="meta num"><span>${yr}</span>${tr}</span></div>`; };
  host.innerHTML = `<div class="chainwrap"><div class="chain">
      <svg class="links" aria-hidden="true"></svg>
      ${keys.map(c => `<div class="col${c === 0 ? " mid" : ""}"><div class="colh">${head[c]}<span class="num"> ${c ? AR(cols.get(c).length + (more[c] || 0)) : ""}</span></div>
        ${cols.get(c).length ? cols.get(c).map(card).join("") : `<p class="none">—</p>`}
        ${more[c] ? `<p class="none">و${AR(more[c])} غيرهم</p>` : ""}</div>`).join("")}
    </div></div>
    <p class="legend">الأقدم يمينًا. اضغط على اسم لتنتقل إلى سلسلته، أو على «ترجمة» لتقرأ ترجمته. الخط المتقطع: ربط بترجيح النسبة أو الشهرة.</p>`;
  const chain = $(".chain", host), svg = $(".links", host);
  const colOf = new Map(); keys.forEach(c => cols.get(c).forEach(i => colOf.set(i, c)));
  const drawLinks = () => {
    const box = chain.getBoundingClientRect();
    svg.setAttribute("width", chain.scrollWidth); svg.setAttribute("height", chain.scrollHeight);
    const at = new Map([...chain.querySelectorAll(".card")].map(el => [+el.dataset.i, el.getBoundingClientRect()]));
    const paths = [];
    for (const [i, r] of at) g.down[i].forEach(([j, n, weak]) => {
      if (!at.has(j) || colOf.get(j) !== colOf.get(i) + 1) return;
      const r2 = at.get(j);   // الشيخ يمينًا، التلميذ يسارًا
      const x1 = r.left - box.left, y1 = r.top + r.height / 2 - box.top, x2 = r2.right - box.left, y2 = r2.top + r2.height / 2 - box.top;
      const mx = (x1 + x2) / 2;
      paths.push(`<path class="lk${weak ? " weak" : ""}${i === me || j === me ? " hot" : ""}" stroke-width="${Math.min(3.5, 1 + Math.log2(n) / 2)}" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`);
    });
    svg.innerHTML = paths.join("");
  };
  const wrap = $(".chainwrap", host);
  const ro = new ResizeObserver(drawLinks); ro.observe(chain);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    drawLinks();
    const m = chain.querySelector(".card.me");   // صاحب السلسلة في منتصف العرض
    if (m && wrap.scrollWidth > wrap.clientWidth)
      wrap.scrollLeft += (m.getBoundingClientRect().left + m.offsetWidth / 2) - (wrap.getBoundingClientRect().left + wrap.clientWidth / 2);
  });
}

function fullNet(host, g) {
  host.innerHTML = `<p class="lede">كل نقطة عَلَم، مرتّبة أفقيًا بسنة الوفاة (الأقدم يمينًا)، والخيوط من الشيخ إلى التلميذ. اسحب للتنقل، ودوّر العجلة للتكبير، واضغط على نقطة لإبراز صلاتها.</p>
    <div class="netwrap"><canvas id="cv"></canvas><div class="tip" hidden></div></div><p class="legend" id="nsel"></p>`;
  const cv = $("#cv"), tip = $(".tip", host), ctx = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim();
  const N = g.nodes, ymax = Math.max(...N.map(n => n.x || 0)), SX = 2.2;
  const ok = n => n.x > 0;   // vefatı ne bilinen ne tahmin edilebilen düğümler çizilmez
  const yr = Math.max(...N.map(n => Math.abs(n.y))) || 1;
  let SY = 9;
  const X = n => (ymax - n.x) * SX, Y = n => n.y * SY;
  let tx = 0, ty = 0, sc = 1, sel = -1, hov = -1;
  const fit = () => { const w = cv.clientWidth, h = cv.clientHeight;
    SY = (ymax * SX) / (2 * yr) * (h / w) * 0.9;
    const xs = N.filter(ok).map(X), ys = N.filter(ok).map(Y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    sc = Math.min(w / (x1 - x0 + 40), h / (y1 - y0 + 40)); tx = w / 2 - sc * (x0 + x1) / 2; ty = h / 2 - sc * (y0 + y1) / 2; };
  const hl = new Set();
  const draw = () => {
    const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col("--muted"); ctx.font = "12px 'Noto Naskh Arabic', serif"; ctx.textAlign = "center";
    for (let yr = 100; yr <= ymax; yr += 100) { const x = tx + sc * (ymax - yr) * SX;
      ctx.globalAlpha = .25; ctx.fillRect(x, 0, 1, h); ctx.globalAlpha = .9; ctx.fillText(AR(yr) + "هـ", x, 16); }
    ctx.globalAlpha = 1;
    const ink = col("--ink"), rub = col("--rubric"), teal = col("--teal");
    ctx.lineWidth = 1;
    g.edges.forEach(([t, s, n, weak]) => {
      if (!ok(N[t]) || !ok(N[s])) return;
      const on = sel >= 0 && (t === sel || s === sel);
      if (sel >= 0 && !on) { ctx.strokeStyle = ink; ctx.globalAlpha = .04; }
      else { ctx.strokeStyle = on ? teal : ink; ctx.globalAlpha = on ? .85 : .12; }
      ctx.beginPath(); ctx.moveTo(tx + sc * X(N[t]), ty + sc * Y(N[t])); ctx.lineTo(tx + sc * X(N[s]), ty + sc * Y(N[s])); ctx.stroke();
    });
    N.forEach((n, i) => {
      if (!ok(n)) return;
      const r = Math.max(1.5, Math.min(9, 1.2 + Math.sqrt(n.deg))) * Math.max(.6, Math.min(2, Math.sqrt(sc)));
      ctx.globalAlpha = sel >= 0 && !hl.has(i) ? .25 : .9;
      ctx.fillStyle = i === sel ? teal : n.salaf ? col("--muted") : rub;
      ctx.beginPath(); ctx.arc(tx + sc * X(n), ty + sc * Y(n), r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = "center";
    if (sc > 2.5 || sel >= 0) N.forEach((n, i) => { if (ok(n) && ((sc > 2.5 && n.deg >= 12 / sc) || hl.has(i))) ctx.fillText(n.name.split("،")[0].slice(0, 30), tx + sc * X(n), ty + sc * Y(n) - 7); });
  };
  const near = (mx, my) => { let b = -1, bd = 100; N.forEach((n, i) => { if (!ok(n)) return; const d = (tx + sc * X(n) - mx) ** 2 + (ty + sc * Y(n) - my) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const select = i => { sel = i; hl.clear(); if (i >= 0) { hl.add(i); g.up[i].forEach(([j]) => hl.add(j)); g.down[i].forEach(([j]) => hl.add(j));
      const n = N[i]; $("#nsel").innerHTML = `${plink(n.id)} · ${AR(g.up[i].length)} شيوخ · ${AR(g.down[i].length)} تلاميذ · <a href="#/net/${n.id}">سلسلته</a>`; }
    else $("#nsel").innerHTML = ""; draw(); };
  let drag = null, moved = 0;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); drag = [e.clientX, e.clientY]; moved = 0; });
  cv.addEventListener("pointermove", e => {
    const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    if (drag) { tx += e.clientX - drag[0]; ty += e.clientY - drag[1]; moved += Math.abs(e.clientX - drag[0]) + Math.abs(e.clientY - drag[1]); drag = [e.clientX, e.clientY]; draw(); return; }
    const i = near(mx, my);
    if (i !== hov) { hov = i; tip.hidden = i < 0; if (i >= 0) { tip.textContent = N[i].name + (N[i].d ? ` (${N[i].guess ? "~" : ""}${AR(N[i].d)}هـ)` : ""); } }
    if (i >= 0) { tip.style.left = Math.min(mx + 12, b.width - tip.offsetWidth - 4) + "px"; tip.style.top = (my + 14) + "px"; }
  });
  cv.addEventListener("pointerup", e => { const b = cv.getBoundingClientRect(); if (moved < 5) select(near(e.clientX - b.left, e.clientY - b.top)); drag = null; });
  cv.addEventListener("pointerleave", () => { tip.hidden = true; hov = -1; });
  cv.addEventListener("wheel", e => { e.preventDefault(); const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; sc *= f; draw(); }, { passive: false });
  new ResizeObserver(() => { draw(); }).observe(cv);
  fit(); draw();
}

// ---------- about ----------
function viewAbout(view) {
  view.innerHTML = `<h1>عن المشروع</h1>
    <section><h2>الكتب</h2><div class="books">${Object.values(BOOKS).map(b => `<div class="book"><b>${esc(b.title)}</b><span>${esc(b.author)}${b.death ? ` (ت ${AR(b.death)}هـ)` : ""}</span></div>`).join("")}</div></section>
    <section><h2>المنهج</h2>
      <p class="lede" style="color:var(--ink)">جُمعت تراجم العَلَم الواحد من الكتب المختلفة تحت عنوان واحد بمقارنة الاسم والنسب والكنية والنسبة وسنة الوفاة وإحالات الكتب بعضها على بعض، وراجع الإنسان ما التبس منها.
      واستُخرج الشيوخ والتلاميذ من عبارات التراجم («تفقّه على»، «أخذ عن»، «روى عنه»، «من أصحاب»…) ورُبط الاسم بصاحبه بموافقة النسب والكنية والنسبة، مع مراعاة تقارب الوفيات وتقاطع التراجم؛ وما لم يترجّح بقي خارج السلسلة للمراجعة.
      واستُخرجت البلدان من عبارات المولد والوفاة والدفن والرحلة والإقامة والولاية، ومن النسبة.
      ونصوص التراجم منشورة كاملة في آخر صفحة كل عَلَم، كلُّ كتاب على حدة مع حواشي محققه.</p>
      <p class="legend">ما وُسم «ترجيح» ربطٌ بالنسبة أو الشهرة وحدها. الوفيات المسبوقة بـ«نحو» تقدير من طبقة الشيوخ والتلاميذ.</p></section>
    <section><h2>المصادر المفتوحة</h2><p class="lede">الإحداثيات من مشروع الثريا (al-Thurayya Gazetteer، رخصة CC BY 4.0) مع إضافات يدوية لبلدان العهد العثماني والهند؛ وحدود اليابسة والأنهار من Natural Earth (ملك عام).</p></section>`;
}

init().catch(e => { $("#view").innerHTML = `<p class="empty">تعذّر تحميل البيانات: ${esc(e.message)}</p>`; });

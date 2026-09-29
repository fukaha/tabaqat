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
let IDX, BOOKS, P = new Map();

async function init() {
  const d = await load("index.json");
  BOOKS = d.books;
  IDX = d.persons.map(r => ({ id: r[0], name: r[1], d: r[2], est: !!r[3], n: r[4], nt: r[5], ns: r[6], place: r[7], key: norm(r[1]) }));
  IDX.forEach(p => P.set(p.id, p));
  window.addEventListener("hashchange", route);
  setupSearch();
  route();
}
const shardOf = id => { const d = id.replace(/\D/g, ""); return d ? (+d % 64) : 0; };
async function person(id) {
  const s = await load(`p/${String(shardOf(id)).padStart(2, "0")}.json`);
  return s[id];
}
const deathTxt = p => p.d ? (p.est ? `نحو ${AR(p.d)}هـ` : `ت ${AR(p.d)}هـ`) : "";
const plink = (id, cls = "") => { const p = P.get(id); return p ? `<a class="${cls}" href="#/p/${id}">${esc(p.name)}</a>` : esc(id); };

// ---------- router ----------
async function route() {
  const [, v = "", arg = ""] = location.hash.split("/");
  const view = $("#view");
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === (v || "home") || (v === "p" && false)));
  view.innerHTML = `<p class="empty">جارٍ التحميل…</p>`;
  try {
    if (v === "p") await viewPerson(view, decodeURIComponent(arg));
    else if (v === "net") await viewNet(view, decodeURIComponent(arg));
    else if (v === "map") await viewMap(view, decodeURIComponent(arg));
    else if (v === "about") viewAbout(view);
    else if (v === "c") viewHome(view, +arg);
    else viewHome(view, 0);
  } catch (e) {
    view.innerHTML = `<p class="empty">تعذّر التحميل (${esc(e.message)}).</p>`;
  }
  window.scrollTo(0, 0);
}

// ---------- search ----------
function setupSearch() {
  const q = $("#q"), box = $("#res");
  let sel = -1, hits = [];
  const render = () => {
    box.innerHTML = hits.map((p, i) => `<a href="#/p/${p.id}" class="${i === sel ? "sel" : ""}"><span>${esc(p.name)}</span><span class="d">${deathTxt(p)}</span></a>`).join("");
    box.hidden = !hits.length;
  };
  q.addEventListener("input", () => {
    const toks = norm(q.value).split(" ").filter(Boolean);
    sel = -1;
    if (!toks.length) { hits = []; return render(); }
    hits = IDX.filter(p => toks.every(t => p.key.includes(t)))
      .sort((a, b) => (b.n + b.nt + b.ns) - (a.n + a.nt + a.ns)).slice(0, 30);
    render();
  });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter" && hits.length) { location.hash = `#/p/${hits[Math.max(0, sel)].id}`; box.hidden = true; q.blur(); }
    else if (e.key === "Escape") box.hidden = true;
  });
  box.addEventListener("click", () => { box.hidden = true; q.value = ""; });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) box.hidden = true; });
}

// ---------- home ----------
function viewHome(view, c) {
  const byC = {};
  IDX.forEach(p => { const k = century(p.d); byC[k] = (byC[k] || 0) + 1; });
  const multi = IDX.filter(p => p.n > 1).length;
  const linked = IDX.filter(p => p.nt || p.ns).length;
  const list = c ? IDX.filter(p => century(p.d) === c).sort((a, b) => a.d - b.d) : [];
  view.innerHTML = `
    <h1 style="font-size:2.2rem">تراجم الحنفية في كتب الطبقات</h1>
    <p class="lede">فهرس موحّد لأعلام الحنفية كما وردوا في تسعة من كتب الطبقات والتراجم؛ لكل عَلَم مواضعه في الكتب بالجزء والصفحة،
      وشيوخه وتلاميذه كما نصّت عليهم التراجم، والبلدان التي وُلد فيها ورحل إليها وتولّى فيها ومات.</p>
    <div class="stats num">
      <div><b>${AR(IDX.length)}</b><span>عَلَمًا</span></div>
      <div><b>${AR(multi)}</b><span>مترجمًا في أكثر من كتاب</span></div>
      <div><b>${AR(linked)}</b><span>في شبكة الشيوخ والتلاميذ</span></div>
      <div><b>${AR(Object.keys(BOOKS).length)}</b><span>كتب</span></div>
    </div>
    <section><h2>الأعلام بحسب قرن الوفاة</h2>
      <div class="cent num">${Object.keys(byC).map(Number).filter(Boolean).sort((a, b) => a - b).map(k =>
        `<a href="#/c/${k}" class="${k === c ? "on" : ""}">القرن ${CENT[k] || AR(k)}<b>${AR(byC[k])}</b></a>`).join("")}
        ${byC[0] ? `<span class="label" style="align-self:center">ومن لم تُعرف وفاته: ${AR(byC[0])}</span>` : ""}</div>
      ${c ? `<h3 style="margin-top:1rem">وفيات القرن ${CENT[c] || AR(c)} <span class="label" style="display:inline">(${AR(list.length)})</span></h3>
        <ul class="plist num" style="margin-top:.5rem">${list.map(p => `<li>${plink(p.id)}<span class="d">${deathTxt(p)}</span></li>`).join("")}</ul>` : ""}
    </section>
    <section><h2>الكتب</h2><div class="books">${Object.entries(BOOKS).map(([id, b]) =>
      `<div class="book"><b>${esc(b.title)}</b><span>${esc(b.author)}${b.death ? ` (ت ${AR(b.death)}هـ)` : ""}</span></div>`).join("")}</div></section>`;
}

// ---------- person ----------
function relItem(r, subjName) {
  const p = P.get(r.id) || { name: r.id };
  const ev = r.ev.map(([cite, snip, t]) => {
    let s = esc(snip); const tt = esc(t);
    if (tt && s.includes(tt)) s = s.replace(tt, `<mark>${tt}</mark>`);
    return `<p><b>${esc(cite)}</b>: …${s}…</p>`;
  }).join("");
  return `<li><div class="row">${plink(r.id)}<span class="d num">${deathTxt(p)}</span>
      ${r.rels.map(x => `<span class="tag">${REL[x] || esc(x)}</span>`).join("")}
      ${r.weak ? `<span class="tag weak" title="ربط بالنسبة أو الشهرة وحدها">ترجيح</span>` : ""}
      ${r.n > 1 ? `<span class="d num">${AR(r.n)} مواضع</span>` : ""}</div>
    <details class="ev"><summary>الشاهد</summary>${ev}</details></li>`;
}

async function viewPerson(view, id) {
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
    <div class="phead">
      <h1>${esc(d.name)}</h1>
      <div class="death num">${d.death ? esc(d.death) : p.d ? `نحو ${AR(p.d)}هـ <span class="est">(تقدير من طبقة شيوخه وتلاميذه)</span>` : `<span class="est">لم تُذكر وفاته</span>`}</div>
      <div class="filters">${p.nt || p.ns ? `<a class="btn" href="#/net/${id}">في شبكة الشيوخ والتلاميذ</a>` : ""}</div>
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
    </section>`;
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
  const nodes = g.nodes.map(n => ({ id: n[0], name: n[1], d: n[2], deg: n[3], x: n[4], y: n[5], guess: !!n[6] }));
  const up = nodes.map(() => []), down = nodes.map(() => []);
  g.edges.forEach(([t, s, n, weak]) => { up[s].push([t, n, weak]); down[t].push([s, n, weak]); });
  G = { nodes, up, down, edges: g.edges, byId: new Map(nodes.map((n, i) => [n.id, i])) };
  return G;
}

async function viewNet(view, id) {
  const g = await graph();
  const full = !id;
  view.innerHTML = `<h1>شبكة الشيوخ والتلاميذ</h1>
    <div class="filters"><a class="btn ${full ? "on" : ""}" href="#/net">الشبكة كاملة</a>
      <a class="btn ${full ? "" : "on"}" href="#/net/${esc(id || "jws1")}">شيوخ عَلَم وتلاميذه</a>
      ${full ? "" : `<span class="label">العمق</span><button type="button" class="btn on" data-depth="1">طبقة</button><button type="button" class="btn" data-depth="2">طبقتان</button>`}</div>
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

function egoNet(host, g, me, depth) {
  const MAXC = 40, BW = 230, BH = 30, GAP = 70, RH = 38;
  const cols = new Map([[0, [me]]]);
  const seen = new Set([me]);
  for (let k = 1; k <= depth; k++) {
    for (const [dir, adj] of [[-1, g.up], [1, g.down]]) {
      const prev = cols.get(dir * (k - 1)) || [], next = [];
      prev.forEach(i => adj[i].forEach(([j]) => { if (!seen.has(j)) { seen.add(j); next.push(j); } }));
      next.sort((a, b) => g.nodes[b].deg - g.nodes[a].deg);
      cols.set(dir * k, next);
    }
  }
  const more = {};
  for (const [c, l] of cols) { if (l.length > MAXC) { more[c] = l.length - MAXC; cols.set(c, l.slice(0, MAXC)); } }
  // ترتيب داخل العمود: بالوفاة ثم بمركز الثقل
  const pos = new Map();
  const keys = [...cols.keys()].sort((a, b) => a - b);
  keys.forEach(c => cols.get(c).sort((a, b) => (g.nodes[a].d || 9999) - (g.nodes[b].d || 9999)));
  const maxRows = Math.max(...keys.map(c => cols.get(c).length));
  const H = maxRows * RH + 70, W = keys.length * (BW + GAP) + 20;
  // RTL: الأقدم (الشيوخ) يمينًا
  keys.forEach((c, ci) => {
    const l = cols.get(c), x = W - 10 - (ci + 1) * (BW + GAP) + GAP, y0 = 50 + (maxRows - l.length) * RH / 2;
    l.forEach((i, r) => pos.set(i, [x, y0 + r * RH]));
  });
  const links = [];
  const colOf = new Map(); for (const [c, l] of cols) l.forEach(i => colOf.set(i, c));
  for (const [i, [x, y]] of pos) g.down[i].forEach(([j, n, weak]) => { if (pos.has(j) && colOf.get(j) === colOf.get(i) + 1) {
    const [x2, y2] = pos.get(j); links.push(`<path class="lk${weak ? " weak" : ""}" stroke-width="${Math.min(4, 1 + Math.log2(n))}" d="M${x} ${y + BH / 2}C${x - GAP / 2} ${y + BH / 2} ${x2 + BW + GAP / 2} ${y2 + BH / 2} ${x2 + BW} ${y2 + BH / 2}"/>`); } });
  const head = { "-2": "شيوخ شيوخه", "-1": "شيوخه", "0": "", "1": "تلاميذه", "2": "تلاميذ تلاميذه" };
  const clip = (s, d) => { const m = d ? 28 : 34; return s.length > m ? s.slice(0, m - 1) + "…" : s; };
  const boxes = [...pos.entries()].map(([i, [x, y]]) => { const n = g.nodes[i];
    return `<g class="${i === me ? "me" : "nd"}" data-id="${esc(n.id)}"><title>${esc(n.name)}</title><rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="6"/>
      <text x="${x + BW - 8}" y="${y + 20}" font-size="13">${esc(clip(n.name, n.d))}</text>
      <text class="yr" x="${x + 8}" y="${y + 20}" direction="ltr" text-anchor="start">${n.d ? (n.guess ? "~" : "") + AR(n.d) : ""}</text></g>`; }).join("");
  const heads = keys.map((c, ci) => { const x = W - 10 - (ci + 1) * (BW + GAP) + GAP + BW / 2;
    return `<text class="colh" x="${x}" y="28" text-anchor="middle">${head[c] || ""}${more[c] ? ` (و${AR(more[c])} غيرهم)` : ""}</text>`; }).join("");
  host.innerHTML = `<div class="netwrap ego"><svg class="egosvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${heads}${links.join("")}${boxes}</svg></div>
    <p class="legend">الخط المتقطع: ربط بترجيح النسبة أو الشهرة. اضغط على اسم لتنتقل إلى شبكته، أو ${plink(g.nodes[me].id)} لترجمته.</p>`;
  const wrap = $(".netwrap", host); wrap.scrollLeft = wrap.scrollWidth;
  host.querySelectorAll(".nd").forEach(el => el.addEventListener("click", () => location.hash = `#/net/${el.dataset.id}`));
  host.querySelector(".me").addEventListener("click", () => location.hash = `#/p/${g.nodes[me].id}`);
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
      ctx.fillStyle = i === sel ? teal : rub;
      ctx.beginPath(); ctx.arc(tx + sc * X(n), ty + sc * Y(n), r, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.textAlign = "center";
    if (sc > 2.5 || sel >= 0) N.forEach((n, i) => { if (ok(n) && ((sc > 2.5 && n.deg >= 12 / sc) || hl.has(i))) ctx.fillText(n.name.split("،")[0].slice(0, 30), tx + sc * X(n), ty + sc * Y(n) - 7); });
  };
  const near = (mx, my) => { let b = -1, bd = 100; N.forEach((n, i) => { if (!ok(n)) return; const d = (tx + sc * X(n) - mx) ** 2 + (ty + sc * Y(n) - my) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const select = i => { sel = i; hl.clear(); if (i >= 0) { hl.add(i); g.up[i].forEach(([j]) => hl.add(j)); g.down[i].forEach(([j]) => hl.add(j));
      const n = N[i]; $("#nsel").innerHTML = `${plink(n.id)} · ${AR(g.up[i].length)} شيوخ · ${AR(g.down[i].length)} تلاميذ · <a href="#/net/${n.id}">شبكته</a>`; }
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
      واستُخرج الشيوخ والتلاميذ من عبارات التراجم («تفقّه على»، «أخذ عن»، «روى عنه»، «من أصحاب»…) ورُبط الاسم بصاحبه بموافقة النسب والكنية والنسبة، مع مراعاة تقارب الوفيات وتقاطع التراجم؛ وما لم يترجّح بقي خارج الشبكة للمراجعة.
      واستُخرجت البلدان من عبارات المولد والوفاة والدفن والرحلة والإقامة والولاية، ومن النسبة.</p>
      <p class="legend">ما وُسم «ترجيح» ربطٌ بالنسبة أو الشهرة وحدها. الوفيات المسبوقة بـ«نحو» تقدير من طبقة الشيوخ والتلاميذ.</p></section>
    <section><h2>المصادر المفتوحة</h2><p class="lede">الإحداثيات من مشروع الثريا (al-Thurayya Gazetteer، رخصة CC BY 4.0) مع إضافات يدوية لبلدان العهد العثماني والهند؛ وحدود اليابسة والأنهار من Natural Earth (ملك عام).</p></section>`;
}

init().catch(e => { $("#view").innerHTML = `<p class="empty">تعذّر تحميل البيانات: ${esc(e.message)}</p>`; });

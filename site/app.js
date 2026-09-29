"use strict";
/* طبقات الحنفية — واجهة ثابتة (بلا مكتبات). البيانات: data/*.json يولّدها pipeline (tabaqat.cli site). */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// dil: ar (sağdan sola) ya da tr (DİA yazımı); tercih tarayıcıda saklanır
let LANG = (() => { try { const l = localStorage.getItem("lang"); if (l === "ar" || l === "tr") return l; } catch (e) {}
  return /^tr/i.test(navigator.language || "") ? "tr" : "ar"; })();
const T = (ar, tr) => LANG === "tr" ? tr : ar;
const AR = n => LANG === "ar" ? String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]) : String(n);
// hicrî → milâdî (yılın ortasına göre; DİA'daki 150/767 gibi)
const CE = h => Math.floor(622.54 + (h - 1) * 0.970224 + 0.485);
const ROM = n => [["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90], ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]]
  .reduce((o, [r, v]) => { while (n >= v) { o += r; n -= v; } return o; }, "");
// Türkçe arama anahtarı: işaretsiz, küçük harf
const fold = s => String(s || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i").replace(/[’‘'ʿʾ`]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const norm = s => String(s || "").replace(/[ً-ٰٟۖ-ۭ]/g, "").replace(/ـ/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/[ىئ]/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه")
  .replace(/[^؀-ۿ\s]/g, " ").replace(/\s+/g, " ").trim();

const REL_L = { ar: { fiqh: "تفقّه", took: "أخذ", hadith: "سماع/رواية", read: "قراءة", companion: "صحبة", manual: "يدوي" },
  tr: { fiqh: "fıkıh", took: "ilim aldı", hadith: "hadis/rivayet", read: "kıraat", companion: "sohbet", manual: "elle" } };
const KIND_L = { ar: { birth: "مولد", death: "وفاة", burial: "مدفن", travel: "رحلة", residence: "إقامة",
  office: "ولاية/تدريس", activity: "تحديث/طلب", origin: "أصل", nisba: "نسبة" },
  tr: { birth: "doğum", death: "vefat", burial: "defin", travel: "seyahat", residence: "ikamet",
  office: "görev/tedris", activity: "rivayet/tahsil", origin: "asıl", nisba: "nisbe" } };
const REL = new Proxy({}, { get: (_, k) => REL_L[LANG][k] });
const KIND = new Proxy({}, { get: (_, k) => KIND_L[LANG][k] });
const KIND_ORDER = ["nisba", "origin", "birth", "residence", "travel", "activity", "office", "death", "burial"];
const CENT = ["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر"];
const centName = k => LANG === "tr" ? `${ROM(k)}. (${ROM(Math.floor((CE((k - 1) * 100 + 50) - 1) / 100) + 1)}.) yüzyıl` : `القرن ${CENT[k] || AR(k)}`;
const century = d => d ? Math.floor((d - 1) / 100) + 1 : 0;

// ---------- data ----------
const cache = {};
const load = p => cache[p] || (cache[p] = fetch("data/" + p).then(r => { if (!r.ok) throw new Error(p); return r.json(); }));
let IDX, BOOKS, SALAF = new Map(), P = new Map();

async function init() {
  const d = await load("index.json");
  BOOKS = d.books;
  IDX = d.persons.map(r => ({ id: r[0], ar: r[1], d: r[2], est: !!r[3], n: r[4], nt: r[5], ns: r[6], place: r[7], books: r[8] || [],
    tr: r[9] || r[1], trs: r[10] || r[9] || r[1], key: norm(r[1]), tkey: fold(r[9]) }));
  IDX.forEach(p => Object.defineProperty(p, "name", { get() { return LANG === "tr" ? this.tr : this.ar; } }));
  IDX.forEach(p => P.set(p.id, p));
  // Ebû Hanîfe öncesi (peygamberler, sahâbe, tâbiûn): sayfası yok, yalnız silsilede
  SALAF = new Map(Object.entries(d.salaf || {}).map(([id, [ar, dd, tr, trs]]) => [id, { id, ar, tr: tr || ar, trs: trs || tr || ar, d: dd, salaf: true,
    get name() { return LANG === "tr" ? this.tr : this.ar; } }]));
  window.addEventListener("hashchange", route);
  setupTheme();
  setupLang();
  setupSearch($("#q"));
  route();
}
const shardOf = id => { const d = id.replace(/\D/g, ""); return d ? (+d % 64) : 0; };
async function person(id) {
  const s = await load(`p/${String(shardOf(id)).padStart(2, "0")}.json`);
  return s[id];
}
// vefat: ت ١٥٠هـ / (ö. 150/767); tahminî: نحو … / [?]
const yearTxt = (d, est) => LANG === "tr" ? `ö. ${d}/${CE(d)}${est ? " [?]" : ""}` : `${est ? "نحو" : "ت"} ${AR(d)}هـ`;
const deathTxt = p => p.d ? (LANG === "tr" ? `(${yearTxt(p.d, p.est)})` : yearTxt(p.d, p.est)) : "";
const plName = pl => pl ? (LANG === "tr" && pl.name_tr || pl.name) : "";
const bookTitle = b => LANG === "tr" && b.title_tr || b.title;
const bookAuthor = b => LANG === "tr" ? `${b.author_tr || b.author}${b.death ? ` (ö. ${b.death}/${CE(b.death)})` : ""}`
  : `${b.author}${b.death ? ` (ت ${AR(b.death)}هـ)` : ""}`;
// künye/sayfa atfı: "الجواهر المضية 3/122-126 (رقم 1270)" → "3/122-126 (nr. 1270)"
const citeTr = c => { const t = String(c).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)); const i = t.search(/\d/);
  return (i < 0 ? t : t.slice(i)).replace(/رقم/g, "nr.").replace(/ج\s*/g, "c. ").replace(/ص\s*/g, "s. ").trim(); };
// İSNAD 2. edisyon dipnot atfı: "Temîmî, et-Tabakâtü’s-seniyye (Riyad: …, 1403), 2/374-382 (nr. 749)."
// kısa atıf: "Temîmî, et-Tabakâtü’s-seniyye, 2/374." — Arapçada aynı düzen
const citeTail = cite => LANG === "tr" ? citeTr(cite) : AR(String(cite).replace(/^[^\d٠-٩]*/, "").replace(/\//g, "/ "));
const isnad = (bid, cite, short = false) => {
  const b = BOOKS[bid];
  if (!b || !b.cite_tr) return LANG === "tr" ? citeTr(cite) : cite;
  const head = LANG === "tr" ? (short ? b.cite_tr_s : b.cite_tr) : (short ? b.cite_ar_s : b.cite_ar);
  return `${head}${T("، ", ", ")}${citeTail(cite)}.`;
};
// İSNAD'da eser adı italik: "Yazar, <i>Eser</i> (Şehir: Yayınevi, Yıl), …"
const isnadHtml = (bid, cite, short = false) => {
  const t = esc(isnad(bid, cite, short));
  if (LANG !== "tr" || !BOOKS[bid]?.cite_tr) return t;
  return t.replace(/^([^,]+(?:, [^,(]*?b\. [^,]+)?), ([^(,]+?)( \(|, )/, (m, a, ti, rest) => `${a}, <i>${ti}</i>${rest}`);
};
const who = id => P.get(id) || SALAF.get(id);
const plink = (id, cls = "") => {
  const p = P.get(id);
  if (p) return `<a class="${cls}" href="#/p/${id}">${esc(p.name)}</a>`;
  const s = SALAF.get(id);
  return s ? `<span class="salaf" title="${T("من السلف قبل أبي حنيفة", "Ebû Hanîfe öncesi selef")}">${esc(s.name)}</span>` : esc(id);
};

// ---------- router ----------
async function route() {
  const [, v = "", arg = ""] = location.hash.split("/");
  const view = $("#view");
  document.querySelectorAll("nav.tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === (v || "home")));
  document.body.classList.toggle("home", !v);
  view.innerHTML = `<p class="empty">${T("جارٍ التحميل…", "Yükleniyor…")}</p>`;
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
    view.innerHTML = `<p class="empty">${T("تعذّر التحميل", "Yüklenemedi")} (${esc(e.message)}).</p>`;
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

// ---------- dil ----------
const UI = {   // index.html'deki sabit metinler (data-i18n)
  brand: ["طبقات الحنفية", "Hanefî Tabakātı"], home: ["الرئيسة", "Ana sayfa"], net: ["السلسلة", "Silsile"], map: ["الخريطة", "Harita"],
  search: ["البحث المفصّل", "Detaylı arama"], about: ["عن المشروع", "Proje hakkında"], q: ["ابحث عن عَلَم…", "Âlim ara…"],
  fabout: ["فهرس موحّد لتراجم الحنفية من تسعة من كتب الطبقات، بمواضعها في الكتب، وشيوخ كل عَلَم وتلاميذه، والبلدان التي ارتبط بها.",
    "Dokuz tabakāt kitabındaki Hanefî biyografilerinin birleşik dizini: her âlimin kitaplardaki yerleri, hocaları, talebeleri ve bağlı olduğu şehirler."],
  links: ["روابط", "Bağlantılar"], fnet: ["سلسلة الشيوخ والتلاميذ", "Hoca–talebe silsilesi"], fmap: ["خريطة البلدان", "Şehirler haritası"],
  fabout2: ["عن المشروع والمصادر", "Proje ve kaynaklar"], open: ["المصادر المفتوحة", "Açık kaynaklar"],
  coords: ["الإحداثيات: مشروع الثريا (CC BY 4.0)", "Koordinatlar: al-Thurayya (CC BY 4.0)"], maps: ["الخرائط: Natural Earth", "Haritalar: Natural Earth"],
};
function applyLang() {
  const root = document.documentElement;
  root.lang = LANG; root.dir = LANG === "ar" ? "rtl" : "ltr";
  document.title = UI.brand[LANG === "ar" ? 0 : 1];
  document.querySelectorAll("[data-i18n]").forEach(el => { const v = UI[el.dataset.i18n]; if (v) el.textContent = v[LANG === "ar" ? 0 : 1]; });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { const v = UI[el.dataset.i18nPh]; if (v) el.placeholder = v[LANG === "ar" ? 0 : 1]; });
  document.querySelectorAll(".lang button").forEach(b => b.classList.toggle("on", b.dataset.l === LANG));
}
function setupLang() {
  document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.l === LANG) return;
    LANG = b.dataset.l;
    try { localStorage.setItem("lang", LANG); } catch (e) {}
    applyLang(); route();
  }));
  applyLang();
}

// ---------- search ----------
// Arapça harfle yazılırsa Arapça adda, Latin harfle yazılırsa Türkçe adda arar
const matcher = q => {
  if (/[\u0600-\u06ff]/.test(q)) { const toks = norm(q).split(" ").filter(Boolean); return toks.length ? p => toks.every(t => p.key.includes(t)) : null; }
  const toks = fold(q).split(" ").filter(Boolean); return toks.length ? p => toks.every(t => p.tkey.includes(t)) : null;
};
const findPersons = (q, n = 30) => {
  const m = matcher(q);
  if (!m) return [];
  return IDX.filter(m)
    .sort((a, b) => (b.n + b.nt + b.ns) - (a.n + a.nt + a.ns)).slice(0, n);
};
function setupSearch(q, onEnter) {
  if (!q) return;
  const box = q.parentElement.querySelector(".results");
  let sel = -1, hits = [];
  const render = () => {
    box.innerHTML = hits.map((p, i) => `<a href="#/p/${p.id}" class="${i === sel ? "sel" : ""}"><span>${esc(p.name)}</span><span class="d">${deathTxt(p)}</span></a>`).join("")
      + (hits.length ? `<a href="#/search" data-q="1"><span>${T("كل النتائج في البحث المفصّل…", "Tüm sonuçlar detaylı aramada…")}</span></a>` : "");
    box.hidden = !hits.length;
  };
  q.addEventListener("input", () => { sel = -1; hits = findPersons(q.value); render(); });
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { sel = Math.min(hits.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sel >= 0 && hits[sel]) location.hash = `#/p/${hits[sel].id}`;
      else if (onEnter) onEnter();
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
  const names = LANG === "tr" ? data.names_tr || {} : data.names;
  const chain = data.chains[pick].map(id => ({ id, name: names[id] || (LANG === "tr" ? who(id)?.trs : who(id)?.name), d: who(id)?.d }))
    .filter(n => n.d);
  const W = Math.max(host.clientWidth, 720), H = 200, mid = 88, pad = 60;
  const y0 = 100 * Math.floor((chain[0].d - 20) / 100), y1 = Math.max(y0 + 300, 100 * Math.ceil((chain[chain.length - 1].d + 30) / 100));
  const rtl = LANG === "ar", X = d => { const f = (d - y0) / (y1 - y0) * (W - 2 * pad); return rtl ? W - pad - f : pad + f; };   // eskiden yeniye: ar sağdan sola, tr soldan sağa
  const pts = chain.map((n, i) => ({ ...n, x: X(n.d), y: mid + Math.sin(i * 1.3) * 10 }));
  // iplik: noktalardan geçen yumuşak eğri
  let path = `M${pts[0].x + (rtl ? 40 : -40)},${mid} L${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], cx = (a.x + b.x) / 2;
    path += ` C${cx},${a.y + (i % 2 ? 26 : -26)} ${cx},${b.y + (i % 2 ? -26 : 26)} ${b.x},${b.y}`; }
  const ticks = []; for (let t = y0; t <= y1; t += 50) { const x = X(t);
    ticks.push(`<line x1="${x}" x2="${x}" y1="${H - 26}" y2="${H - (t % 100 ? 30 : 36)}" />${t % 100 ? "" : `<text x="${x}" y="${H - 8}">${LANG === "tr" ? `${t}/${CE(t)}` : `${AR(t)}هـ`}</text>`}`); }
  host.innerHTML = `<svg class="thread" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
      <g class="ruler"><line x1="${pad - 20}" x2="${W - pad + 20}" y1="${H - 26}" y2="${H - 26}"/>${ticks.join("")}</g>
      <path class="gold" d="${path}" pathLength="1"/><path class="gold thin" d="${path}" transform="translate(0 3)" pathLength="1"/>
      ${pts.map((p, i) => `<g class="bead${i === 0 || i === pts.length - 1 ? " end" : ""}" style="--i:${i}">
        <polygon points="${STAR8(p.x, p.y, i === 0 || i === pts.length - 1 ? 12 : 8)}"/><circle cx="${p.x}" cy="${p.y}" r="${i === 0 || i === pts.length - 1 ? 3.2 : 2.2}"/></g>`).join("")}
      <g class="leads"></g></svg>
    ${pts.map((p, i) => `<a class="nm${i === 0 || i === pts.length - 1 ? " end" : ""}" href="#/p/${p.id}" style="--i:${i}"><b>${esc(p.name)}</b><span class="num">${LANG === "tr" ? `ö. ${p.d}/${CE(p.d)}` : AR(p.d)}</span></a>`).join("")}`;
  // adları çakışmayacak şekilde üst/alt kulvarlara yerleştir
  const lanes = [-30, 26, -62, 58], edge = lanes.map(() => Infinity), leads = [];
  host.querySelectorAll("a.nm").forEach((a, i) => { const p = pts[i], w = a.offsetWidth, h = a.offsetHeight;
    const lead = rtl ? p.x + w / 2 : -(p.x - w / 2);   // soldan sağa dizilişte eksen ters çevrilir
    let L = lanes.findIndex((_, k) => lead + 6 < edge[k]); if (L < 0) L = edge.indexOf(Math.max(...edge));
    if (i === 0 || i === pts.length - 1) L = L % 2 ? 1 : 0;
    edge[L] = rtl ? p.x - w / 2 : -(p.x + w / 2);
    const top = lanes[L] < 0 ? p.y + lanes[L] - h / 2 : p.y + lanes[L] - h / 2 + 4;
    a.style.left = `${p.x - w / 2}px`; a.style.top = `${Math.max(0, top)}px`;
    if (L > 1) leads.push(`<line x1="${p.x}" x2="${p.x}" y1="${p.y + (lanes[L] < 0 ? -10 : 10)}" y2="${lanes[L] < 0 ? top + h : top}"/>`); });
  host.querySelector(".leads").innerHTML = leads.join("");
  host.style.height = `${H}px`;
  return chain;
}
// kategori simgeleri: divit, şehir silueti, zincir, kitap yığını
const ILL = {
  divit: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M14 42h28l-3 14H17Z"/><path d="M20 42v-5h16v5"/><path d="M29 36 46 9l4 2-15 27"/><path d="M46 9l3-5 1 7"/></g></svg>`,
  sehir: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M4 56h56"/><path d="M20 56V42h24v14"/><path d="M20 42a12 12 0 0 1 24 0"/><path d="M32 30v-5"/><path d="M28 56v-7a4 4 0 0 1 8 0v7"/>
    <path d="M9 56V24l3-5 3 5v32M8 30h8"/><path d="M49 56V20l3-5 3 5v36M48 26h8"/></g></svg>`,
  zincir: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2">
    <rect x="3" y="24" width="24" height="16" rx="8"/><rect x="20" y="28.5" width="24" height="7" rx="3.5"/><rect x="37" y="24" width="24" height="16" rx="8"/></g></svg>`,
  kitaplar: `<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <path d="M10 46h44v10H10Z"/><path d="M14 36h38v10H14Z"/><path d="M8 26h40v10H8Z"/><path d="M17 46v10M21 36v10M15 26v10"/>
    <path d="M36 26V10l6 4 6-4v16"/></g></svg>`,
};

// ---------- kartlar ----------
let EXC;
const excerpts = async () => EXC || (EXC = await load("excerpts.json"));
function pcard(p, ex, PL) {
  const pl = p.place && PL ? plName(PL.get(p.place)) : "";
  const lq = [deathTxt(p), pl].filter(Boolean).join(" · ");
  return `<a class="pcard" href="#/p/${p.id}"><h3>${esc(p.name)}</h3>${LANG === "tr" ? `<span class="arn" lang="ar" dir="rtl">${esc(p.ar)}</span>` : ""}
    ${lq ? `<span class="lq num">${esc(lq)}</span>` : ""}
    ${ex ? `<p class="ex" lang="ar" dir="rtl">${esc(ex)}</p>` : ""}
    <span class="ft"><span class="badges num"><span>${AR(p.n)} ${T(p.n > 1 ? "مصادر" : "مصدر", "kaynak")}</span>${p.nt ? `<span>${AR(p.nt)} ${T("شيوخ", "hoca")}</span>` : ""}${p.ns ? `<span>${AR(p.ns)} ${T("تلاميذ", "talebe")}</span>` : ""}</span>
    <span class="go">${T("قراءة الترجمة ←", "Biyografi →")}</span></span></a>`;
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
    more.innerHTML = shown < list.length ? `<button type="button" class="btn gold">${T("المزيد", "Daha fazla")} (${AR(list.length - shown)})</button>` : "";
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
    [T("أصحاب أبي حنيفة", "Ebû Hanîfe’nin ashâbı"), studentsOf("jws1"), "#/net/jws1"],
    [T("تلاميذ أبي يوسف", "Ebû Yûsuf’un talebeleri"), studentsOf("jw1825"), "#/net/jw1825"],
    [T("تلاميذ الإمام محمد", "İmam Muhammed’in talebeleri"), studentsOf("jw1270"), "#/net/jw1270"],
    [T("تلاميذ أبي الحسن الكرخي", "Kerhî’nin talebeleri"), studentsOf("jw894"), "#/net/jw894"],
    [T("تلاميذ شمس الأئمة الحلواني", "Şemsüleimme el-Halvânî’nin talebeleri"), studentsOf("jw821"), "#/net/jw821"],
    [T("علماء سمرقند", "Semerkant âlimleri"), atPlace("SAMARQAND_670E396N_S"), "#/map/SAMARQAND_670E396N_S"],
    [T("قضاة القاهرة ومدرّسوها", "Kahire kadıları ve müderrisleri"), atPlace("QAHIRA_312E300N_S", ["office"]), "#/map/QAHIRA_312E300N_S"],
  ].filter(c => c[1].length);
  const bk = Object.keys(BOOKS).length;
  view.innerHTML = `
    <section class="hero" style="margin:0">${ebru()}<div class="inner">
      <div class="txt">
        <p class="kicker">${T("تراجم الحنفية من كتب الطبقات، في فهرسٍ واحد", "Tabakāt kitaplarındaki Hanefî biyografileri, tek bir dizinde")}</p>
        <h1>${T("طبقات الحنفية", "Hanefî Tabakātı")}</h1>
        <form class="hsearch" id="hf" autocomplete="off" role="search">
          <div class="hrow">
            <div class="search"><input id="hq" name="q" type="search" placeholder="${T("ابحث عن عَلَم… (مثل: السرخسي، أبو حفص الكبير)", "Âlim ara… (ör. Serahsî, Ebû Hafs el-Kebîr, السرخسي)")}" aria-label="${T("بحث", "Ara")}"><div class="results" hidden></div></div>
            <button type="button" class="advbtn" aria-expanded="false" aria-controls="hadv"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${T("البحث المفصّل", "Detaylı arama")}</button>
          </div>
          <div class="sform advpanel" id="hadv" hidden>${await searchFields()}
            <div class="advact"><button type="reset" class="btn ghost">${T("مسح", "Temizle")}</button><button type="submit" class="btn gold">${T("اعرض النتائج", "Sonuçları göster")}</button></div></div>
        </form>
      </div>
      <figure class="silsile">
        <figcaption><span class="lbl">${T("سلسلة التفقّه", "Fıkıh silsilesi")}</span> <span id="scap"></span></figcaption>
        <div class="scroll"><div id="thread"></div></div>
        <div class="sbar"><button type="button" class="btn ghost" id="snext">↻ ${T("سلسلة أخرى", "Başka bir silsile")}</button><a class="btn ghost" id="sopen" href="#/net/jws1">${T("افتحها في السلسلة ←", "Silsilede aç →")}</a></div>
      </figure>
      <div class="tiles4 num">
        <a class="t4" href="#/search">${ILL.divit}<span class="n">${AR(IDX.length)}</span><span class="l">${T("الأعلام", "Âlimler")}</span></a>
        <a class="t4" href="#/map">${ILL.sehir}<span class="n">${AR(places.length)}</span><span class="l">${T("البلدان", "Şehirler")}</span></a>
        <a class="t4" href="#/net/jws1">${ILL.zincir}<span class="n">${AR(g.edges.length)}</span><span class="l">${T("صلات الشيوخ والتلاميذ", "Hoca–talebe bağları")}</span></a>
        <a class="t4" href="#books">${ILL.kitaplar}<span class="n">${AR(bk)}</span><span class="l">${T("كتب الطبقات", "Tabakāt kitapları")}</span></a>
      </div></div></section>
    <div class="wrap" id="hres"></div>
    <hr class="divider">
    ${secHead(T("مجموعات مختارة", "Seçkiler"), T("حلقات العلم كما رسمتها التراجم", "Biyografilerin çizdiği ilim halkaları"))}
    <div class="coll">${COLL.map(([t, ids, href]) => `<div class="ccard"><h3>${t}</h3>${ORN.medal}
      <ul>${ids.slice(0, 8).map(id => `<li>${plink(id)}</li>`).join("")}</ul>
      <a class="go" href="${href}" aria-label="${t}">${ORN.arrow}</a></div>`).join("")}</div>
    <div class="wrap">
      ${secHead(T("أعلام مختارون", "Öne çıkan âlimler"), T("من أكثر الأعلام ذكرًا في كتب الطبقات", "Tabakāt kitaplarında en çok anılanlardan"))}
      <div id="feat"></div>
      ${secHead(T("الأعلام بحسب قرن الوفاة", "Vefat yüzyılına göre âlimler"))}
      <div class="tiles num">${Object.keys(byC).map(Number).sort((a, b) => a - b).map(k =>
        `<a class="tile" href="#/c/${k}"><b>${centName(k)}</b><span>${AR(byC[k])} ${T("عَلَمًا", "âlim")}</span></a>`).join("")}</div>
      <div id="books">${secHead(T("كتب الطبقات", "Tabakāt kitapları"), T("المصادر التي جُمعت منها التراجم", "Biyografilerin derlendiği kaynaklar"))}</div>
      <div class="books">${Object.entries(BOOKS).map(([id, b]) => { const n = IDX.filter(p => p.books.includes(id)).length;
        return `<a class="book" href="#/b/${id}"><b>${esc(bookTitle(b))}</b><span>${esc(bookAuthor(b))}</span> <em class="num">· ${AR(n)} ${T("ترجمة", "biyografi")}</em></a>`; }).join("")}</div>
      <div class="cta">
        <a href="#/search"><span class="ic"><svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
          <span><b>${T("البحث المفصّل", "Detaylı arama")}</b><span>${T(`ابحث بين ${AR(IDX.length)} عَلَمًا بالاسم والقرن والكتاب والبلد`, `${IDX.length} âlim arasında ada, yüzyıla, kitaba ve şehre göre arayın`)}</span></span><span class="btn gold">${T("ابدأ البحث", "Aramaya başla")}</span></a>
        <a href="#/map"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 21s-6-6.5-6-11a6 6 0 0 1 12 0c0 4.5-6 11-6 11Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2" fill="currentColor"/></svg></span>
          <span><b>${T("خريطة البلدان", "Şehirler haritası")}</b><span>${T("مواطن الأعلام ورحلاتهم وولاياتهم عبر القرون", "Âlimlerin memleketleri, seyahatleri ve görev yerleri, yüzyıllar boyunca")}</span></span><span class="btn gold">${T("افتح الخريطة", "Haritayı aç")}</span></a>
      </div>
    </div>`;
  // arama: aynı kutu; "البحث المفصّل" süzgeçleri hemen altında açar, sonuçlar hero'nun altında
  const hf = $("#hf"), adv = $("#hadv"), advBtn = $(".advbtn", hf), hres = $("#hres");
  const runHome = bindSearch(hf, hres, () => !adv.hidden);
  const show = () => { runHome(); hres.scrollIntoView({ behavior: "smooth", block: "start" }); };
  setupSearch($("#hq"), () => show());
  hf.addEventListener("submit", () => setTimeout(() => hres.scrollIntoView({ behavior: "smooth", block: "start" }), 50));
  hf.addEventListener("reset", () => setTimeout(() => { hres.innerHTML = ""; Object.assign(SEARCH, { q: "", c0: "", c1: "", book: "", place: "", net: false }); }, 0));
  advBtn.addEventListener("click", () => { adv.hidden = !adv.hidden; advBtn.setAttribute("aria-expanded", String(!adv.hidden));
    advBtn.classList.toggle("on", !adv.hidden); if (!adv.hidden) adv.querySelector("select").focus(); });
  // silsile: her ziyarette başka bir halka dizisi
  let sp = Math.floor(Math.random() * CH.chains.length);
  const drawChain = () => { const c = silsile($("#thread"), CH, sp), a = c[0], z = c[c.length - 1];
    $("#scap").innerHTML = LANG === "tr"
      ? `${esc(a.name)} (ö. ${a.d}/${CE(a.d)}) ile ${esc(z.name)} (ö. ${z.d}/${CE(z.d)}) arasında ${c.length} halka; her bağ biyografilerde belgeli`
      : `من ${esc(a.name)} (ت ${AR(a.d)}هـ) إلى ${esc(z.name)} (ت ${AR(z.d)}هـ): ${AR(c.length)} ${c.length <= 10 ? "حلقات" : "حلقةً"}، كلّ صلةٍ منها موثّقة في التراجم`;
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
    title = T(`أعلام القرن ${CENT[arg] || AR(arg)}`, `${centName(arg)} âlimleri`); sub = T("مرتّبون على سنة الوفاة", "Vefat yılına göre sıralı");
    list = IDX.filter(p => century(p.d) === arg).sort((a, b) => a.d - b.d);
  } else {
    const b = BOOKS[arg]; if (!b) { view.innerHTML = `<p class="empty">${T("لا يوجد هذا الكتاب.", "Böyle bir kitap yok.")}</p>`; return; }
    title = bookTitle(b); sub = bookAuthor(b);
    list = IDX.filter(p => p.books.includes(arg)).sort((a, b) => (a.d || 9999) - (b.d || 9999));
  }
  view.innerHTML = `<div class="pagehead"><h1>${esc(title)}</h1><span class="c num">${AR(list.length)} ${T("عَلَمًا", "âlim")}</span></div><p class="lede">${esc(sub)}</p><div id="lst"></div>`;
  await cardGrid($("#lst"), list);
}

// ---------- البحث المفصل ----------
const SEARCH = { q: "", c0: "", c1: "", book: "", place: "", net: false };
async function searchFields() {
  const places = await load("places.json");
  const top = places.filter(p => p.n >= 5).sort((a, b) => plName(a).localeCompare(plName(b), LANG));
  const opts = [...Array(14)].map((_, i) => `<option value="${i + 1}">${LANG === "tr" ? centName(i + 1).replace(" yüzyıl", "") : CENT[i + 1]}</option>`).join("");
  return `<label>${T("من القرن", "Yüzyıldan (hicrî)")}<select name="c0"><option value="">—</option>${opts}</select></label>
      <label>${T("إلى القرن", "Yüzyıla")}<select name="c1"><option value="">—</option>${opts}</select></label>
      <label>${T("الكتاب", "Kitap")}<select name="book"><option value="">${T("كل الكتب", "Tüm kitaplar")}</option>${Object.entries(BOOKS).map(([id, b]) => `<option value="${id}">${esc(bookTitle(b))}</option>`).join("")}</select></label>
      <label>${T("البلد", "Şehir")}<select name="place"><option value="">${T("كل البلدان", "Tüm şehirler")}</option>${top.map(p => `<option value="${esc(p.id)}">${esc(plName(p))}</option>`).join("")}</select></label>
      <label class="chk"><input type="checkbox" name="net"> ${T("له شيوخ أو تلاميذ في السلسلة", "Silsilede hocası ya da talebesi olanlar")}</label>`;
}
// formu SEARCH'e yükle, süzgeçleri uygula, sonuçları host'a kartlarla yaz
function bindSearch(f, host, live = () => true) {
  Object.entries(SEARCH).forEach(([k, v]) => { const el = f.elements[k]; if (!el) return; if (el.type === "checkbox") el.checked = !!v; else el.value = v; });
  let timer, gen = 0;
  const run = async () => {
    const my = ++gen, PL = await placesById();
    Object.keys(SEARCH).forEach(k => { const el = f.elements[k]; if (el) SEARCH[k] = el.type === "checkbox" ? el.checked : el.value; });
    const m = matcher(SEARCH.q);
    const c0 = +SEARCH.c0 || 0, c1 = +SEARCH.c1 || 99;
    const atPl = SEARCH.place ? new Set((PL.get(SEARCH.place)?.people || []).map(x => x[0])) : null;
    const res = IDX.filter(p => (!m || m(p))
      && (!(SEARCH.c0 || SEARCH.c1) || (century(p.d) >= c0 && century(p.d) <= c1))
      && (!SEARCH.book || p.books.includes(SEARCH.book))
      && (!atPl || atPl.has(p.id)) && (!SEARCH.net || p.nt || p.ns))
      .sort((a, b) => m ? (b.n + b.nt + b.ns) - (a.n + a.nt + a.ns) : (a.d || 9999) - (b.d || 9999));
    if (my !== gen) return;
    host.innerHTML = `<p class="legend num">${AR(res.length)} ${T("نتيجة", "sonuç")}</p>`;
    await cardGrid(host, res);
  };
  f.addEventListener("input", () => { clearTimeout(timer); if (live()) timer = setTimeout(run, 200); });
  f.addEventListener("submit", e => { e.preventDefault(); run(); });
  return run;
}
async function viewSearch(view) {
  view.innerHTML = `<div class="pagehead"><h1>${T("البحث المفصّل", "Detaylı arama")}</h1></div>
    <form class="sform" id="sf" autocomplete="off">
      <label class="wide">${T("الاسم أو جزء منه", "Ad ya da adın bir kısmı (Türkçe ya da Arapça)")}<input name="q" type="search" placeholder="${T("مثل: أبو بكر البلخي، النسفي، شمس الأئمة", "ör. Ebû Bekr el-Belhî, Nesefî, Şemsüleimme")}"></label>
      ${await searchFields()}
    </form><div id="sres"></div>`;
  bindSearch($("#sf"), $("#sres"))();
}

// ---------- person ----------
// hoca/talebe kartı: ad, vefat, bağ türleri, atıf sayısı; kanıtlar kartın içinde açılır
function relItem(r) {
  const p = who(r.id) || { name: r.id };
  const ev = r.ev.map(([cite, snip, t], k) => {
    let s = esc(snip); const tt = esc(t);
    if (tt && s.includes(tt)) s = s.replace(tt, `<mark>${tt}</mark>`);
    return `<p><span lang="ar" dir="rtl">…${s}…</span><cite>${evCite(cite)}</cite></p>`;
  }).join("");
  return `<li class="rcard${r.weak ? " weak" : ""}${p.salaf ? " salaf" : ""}">
      <div class="rtop">${plink(r.id, "nm")}<span class="d num">${deathTxt(p)}</span></div>
      <div class="rtags">${p.salaf ? `<span class="tag weak">${T("من السلف", "selef")}</span>` : ""}${r.rels.map(x => `<span class="tag">${REL[x] || esc(x)}</span>`).join("")}
        ${r.weak ? `<span class="tag weak" title="${T("ربط بالنسبة أو الشهرة وحدها", "Yalnız nisbe ya da şöhretle eşleştirildi")}">${T("ترجيح", "tercih")}</span>` : ""}
        ${r.n > 1 ? `<span class="d num">${AR(r.n)} ${T("مواضع", "atıf")}</span>` : ""}</div>
      <details class="ev"><summary>${T("الشاهد", "Kanıt")}</summary>${ev}</details>
      ${!p.salaf && P.has(r.id) && (P.get(r.id).nt || P.get(r.id).ns) ? `<a class="silsile-lnk" href="#/net/${esc(r.id)}">${T("سلسلته", "silsilesi")}</a>` : ""}</li>`;
}
// kanıtlardaki kaynak metni ("الجواهر المضية 3/122 (رقم 1270)") → İSNAD kısa atıf
const evCite = cite => { const pre = String(cite).replace(/\s*[\d٠-٩].*$/, ""); const b = pre && Object.entries(BOOKS).find(([, v]) => v.title.startsWith(pre));
  return b ? isnadHtml(b[0], cite, true) : esc(LANG === "tr" ? citeTr(cite) : cite); };

async function viewPerson(view, id) {
  if (SALAF.has(id)) { location.replace(`#/net/${id}`); return; }
  const p = P.get(id), d = await person(id);
  if (!p || !d) { view.innerHTML = `<p class="empty">${T("لا يوجد هذا العلم.", "Böyle bir âlim yok.")}</p>`; return; }
  const extT = d.ext.filter(x => x[2] !== "student"), extS = d.ext.filter(x => x[2] === "student");
  const extList = xs => {
    const seen = new Map();
    xs.forEach(x => { if (!seen.has(x[0])) seen.set(x[0], x); });
    return [...seen.values()].map(x => `<li class="ext">${esc(LANG === "tr" && x[5] || x[0])} ${x[1] ? `<span class="d num">(${yearTxt(x[1])})</span>` : ""} <span class="tag weak">${REL[x[3]] || ""}</span></li>`).join("");
  };
  const byKind = {};
  d.places.forEach(([pl, k, cite, t]) => (byKind[k] = byKind[k] || []).push([pl, cite, t]));
  view.innerHTML = `
    <div class="phead">${ORN.kose("tr")}${ORN.kose("tl")}${ORN.kose("br")}${ORN.kose("bl")}
      ${LANG === "tr" && d.trs && !(d.tr || "").includes(d.trs) ? `<div class="known">${esc(d.trs)}</div>` : ""}
      <h1>${esc(LANG === "tr" ? d.tr || d.name : d.name)}</h1>
      ${LANG === "tr" ? `<div class="arn big" lang="ar" dir="rtl">${esc(d.name)}</div>` : ""}
      <div class="death num">${LANG === "tr"
        ? (p.d ? `(${yearTxt(p.d, p.est)})${p.est ? ` <span class="est">vefatı hoca ve talebelerinin tabakasından tahmin edildi</span>` : ""}` : `<span class="est">vefatı zikredilmemiş</span>`)
        : (d.death ? esc(d.death) : p.d ? `نحو ${AR(p.d)}هـ <span class="est">(تقدير من طبقة شيوخه وتلاميذه)</span>` : `<span class="est">لم تُذكر وفاته</span>`)}</div>
      <div class="facts num"><span><b>${AR(d.sources.length)}</b> ${T(d.sources.length > 1 ? "مصادر" : "مصدر", "kaynak")}</span>
        <span><b>${AR(d.teachers.length)}</b> ${T("شيوخ", "hoca")}</span><span><b>${AR(d.students.length)}</b> ${T("تلاميذ", "talebe")}</span>
        <span><b>${AR(new Set(d.places.map(x => x[0])).size)}</b> ${T("بلدان", "şehir")}</span></div>
      <div class="filters">${p.nt || p.ns ? `<a class="btn" href="#/net/${id}">${T("سلسلة شيوخه وتلاميذه", "Hoca–talebe silsilesi")}</a>` : ""}
        <button type="button" class="btn" data-go="texts">${T("نصوص الترجمة", "Biyografi metinleri")}</button></div>
    </div>
    <div class="rels">
      <section><h2>${T("شيوخه", "Hocaları")}<span class="c num">${AR(d.teachers.length)}</span></h2>
        ${d.teachers.length ? `<ul class="rgrid">${d.teachers.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">${T("لم يُذكر له شيخ من المترجمين.", "Biyografisi bulunanlardan bir hocası zikredilmemiş.")}</p>`}
        ${extT.length ? `<h3 style="margin-top:1rem;font-size:1.05rem">${T("شيوخ من غير المترجمين في هذه الكتب", "Bu kitaplarda biyografisi olmayan hocaları")}</h3><ul class="rel">${extList(extT)}</ul>` : ""}
      </section>
      <section><h2>${T("تلاميذه", "Talebeleri")}<span class="c num">${AR(d.students.length)}</span></h2>
        ${d.students.length ? `<ul class="rgrid">${d.students.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">${T("لم يُذكر له تلميذ من المترجمين.", "Biyografisi bulunanlardan bir talebesi zikredilmemiş.")}</p>`}
        ${extS.length ? `<h3 style="margin-top:1rem;font-size:1.05rem">${T("رواة عنه من غير المترجمين", "Ondan rivayet eden diğerleri")}</h3><ul class="rel">${extList(extS)}</ul>` : ""}
      </section>
    </div>
    <section id="psec"><h2>${T("البلدان", "Şehirler")}<span class="c num">${AR(new Set(d.places.map(x => x[0])).size)}</span></h2>
      ${d.places.length ? `<div class="grid2"><ul class="places" id="plist"></ul><div class="mapwrap mini" id="pmap"></div></div>
        <p class="legend">${T("الخط المتقطع يصل البلدان على ترتيب ورودها في الترجمة (المولد والنسبة أولًا، والوفاة والمدفن آخرًا)، وهو تقريب لا تأريخ.",
          "Kesikli çizgi şehirleri biyografideki sırasıyla birleştirir (önce doğum ve nisbe, sonra vefat ve defin); bir yaklaşımdır, kronoloji değildir.")}</p>`
        : `<p class="empty">${T("لم يُستخرج له بلد.", "Şehir tespit edilemedi.")}</p>`}
    </section>
    <section id="texts"><h2>${T("نصوص الترجمة", "Biyografi metinleri")}<span class="c num">${AR(d.sources.length)}</span>
        ${d.sources.length > 1 ? `<button type="button" class="btn small" id="openall">${T("فتح الكل", "Tümünü aç")}</button>` : ""}</h2>
      <p class="legend">${T("نص الترجمة في كل كتاب كما هو في الطبعة المعتمدة، دون الحواشي. اختر الكتب لتُفتح نصوصها متجاورة.", "Her kitaptaki biyografi metni, esas alınan neşirdeki hâliyle (Arapça; dipnotsuz, tarama kaynaklı boşluk ve satır kaymaları giderilmiş). Kitapları seçin; metinler yan yana açılır.")}</p>
      <div class="tchips">${d.sources.map(([b, cite], k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="false">${esc(BOOKS[b]?.cite_tr ? (LANG === "tr" ? BOOKS[b].cite_tr_s : BOOKS[b].cite_ar_s).split(/[,،] /).slice(1).join(", ") : cite.replace(/\s*[\d٠-٩].*$/, ""))}<span class="num"> ${esc(citeTail(cite))}</span></button>`).join("")}</div>
      <div class="tframes">${d.sources.map(([b, cite, h], k) => `<article class="tframe" data-k="${k}" hidden>
        <header><div><b class="isnad">${isnadHtml(b, cite)}</b>
          <span class="ct" lang="ar" dir="rtl">${esc(h)}</span></div><button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button></header>
        <div class="body" lang="ar" dir="rtl"><p class="empty">${T("جارٍ التحميل…", "Yükleniyor…")}</p></div></article>`).join("")}</div>
    </section>`;
  setupTexts(id, d);
  if (!d.places.length) return;
  const PL = await placesById();
  $("#plist").innerHTML = KIND_ORDER.filter(k => byKind[k]).map(k => `<li><span class="k">${KIND[k]}</span>
    ${[...new Map(byKind[k].map(x => [x[0], x])).values()].map(([pl, cite]) =>
      `<a href="#/map/${encodeURIComponent(pl)}" title="${esc(cite)}">${esc(plName(PL.get(pl)) || pl)}</a>`).join(T("، ", ", "))}</li>`).join("");
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
  const frames = [...sec.querySelectorAll(".tframe")], chips = [...sec.querySelectorAll(".chip")];
  const fill = async el => {
    if (el.dataset.done) return;
    el.dataset.done = 1;
    const all = await texts(id), k = +el.dataset.k, cite = d.sources[k][1];
    const t = all.find(x => x.cite === cite) || all[k];
    $(".body", el).innerHTML = t ? renderEntry(t) : `<p class="empty">${T("لا يوجد نص.", "Metin yok.")}</p>`;
  };
  const btn = $("#openall");
  const sync = () => {
    const open = frames.filter(f => !f.hidden).length;
    sec.querySelector(".tframes").style.setProperty("--n", Math.max(1, open));
    if (btn) btn.textContent = open === frames.length ? T("طي الكل", "Tümünü kapat") : T("فتح الكل", "Tümünü aç");
  };
  const show = (k, on) => { const f = frames[k]; f.hidden = !on; chips[k].classList.toggle("on", on); chips[k].setAttribute("aria-pressed", on); if (on) fill(f); sync(); };
  chips.forEach((c, k) => c.addEventListener("click", () => { show(k, frames[k].hidden); if (!frames[k].hidden) frames[k].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); }));
  frames.forEach((f, k) => $(".x", f).addEventListener("click", () => show(k, false)));
  if (btn) btn.addEventListener("click", () => { const all = frames.every(f => !f.hidden); frames.forEach((_, k) => show(k, !all)); });
  if (frames.length) show(0, true);   // ilk kaynak açık gelir
}
const toArDigits = s => String(s).replace(/\d/g, c => "٠١٢٣٤٥٦٧٨٩"[c]);
function inline(s) {
  return esc(s).replace(/«([^«»]{1,120})»/g, "«<span class=\"q\">$1</span>»");
}
// harekeli kısa satır: şiir (ortalanır, iki yana yaslanmaz)
const isVerse = b => { const L = (b.match(/[\u0621-\u064a]/g) || []).length, H = (b.match(/[\u064b-\u0652]/g) || []).length;
  return b.split("\n").every(x => x.length <= 110) && L > 0 && H / L > .3; };
function renderBlocks(text) {
  return text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
    const h = b.match(/^#{1,6}\s+(.*)$/);
    if (h) return `<h4>${inline(h[1])}</h4>`;
    const v = b.split(/\s+…\s+/);   // beyit: iki mısra arasında «…»
    if (v.length === 2 && b.length < 160 && !/[.؟!]\s*$/.test(v[0])) return `<div class="bayt"><span>${inline(v[0])}</span><span>${inline(v[1])}</span></div>`;
    if (isVerse(b)) return `<p class="verse">${inline(b).replace(/\n/g, "<br>")}</p>`;
    return `<p>${inline(b).replace(/\n/g, " ")}</p>`;
  }).join("");
}
function renderEntry(t) {
  return `<div class="etitle">${esc(t.heading)}</div><div class="etext">${renderBlocks(t.text)}</div>`;
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
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${T("خريطة", "Harita")}">
      <rect x="-5000" y="-5000" width="12000" height="12000" fill="var(--water)"/>
      <path class="land" d="${base.land}"/><path class="lake" d="${base.lakes}"/><path class="river" d="${base.rivers}"/>
      <g class="regs"></g><g class="routes"></g><g class="pts"></g><g class="labs"></g></svg>
    <div class="zoom"><button type="button" data-z="1.5" aria-label="${T("تكبير", "Yakınlaştır")}">+</button><button type="button" data-z="0.667" aria-label="${T("تصغير", "Uzaklaştır")}">−</button></div>`;
  const svg = $("svg", host);
  let vb = { x: 0, y: 0, w: W, h: H }, items = [], onPick = opt.onPick;
  const scale = () => vb.w / (svg.clientWidth || 800);
  const apply = () => {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const s = scale();
    svg.querySelectorAll(".pt").forEach(c => c.setAttribute("r", c.dataset.r * s));
    svg.querySelectorAll(".plab").forEach(t => { t.setAttribute("font-size", (+t.dataset.f || 13) * s); t.style.strokeWidth = 3 * s; });
    svg.querySelectorAll(".rlab").forEach(t => { t.setAttribute("font-size", 19 * s); t.setAttribute("letter-spacing", LANG === "tr" ? 3 * s : 0); });
    // çakışan adları gizle: önce iri şehirler, sonra diğerleri, en son bölgeler
    const kept = [];
    [...svg.querySelectorAll(".plab.major"), ...svg.querySelectorAll(".plab:not(.major)"), ...svg.querySelectorAll(".rlab")].forEach(t => {
      t.style.display = ""; let b; try { b = t.getBBox(); } catch (e) { return; }
      const pad = 2 * s, hit = kept.some(k => b.x < k.x + k.width + pad && k.x < b.x + b.width + pad && b.y < k.y + k.height && k.y < b.y + b.height);
      if (hit) t.style.display = "none"; else kept.push(b);
    });
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
  let downPt = null;   // işaretçi yakalandığında click hedefi svg olur; tıklanan daire basışta alınır
  svg.addEventListener("pointerdown", e => { downPt = e.target.closest(".pt"); svg.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e); last = e; moved = 0; });
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
  svg.addEventListener("click", e => { const c = downPt || e.target.closest(".pt"); if (moved < 6 && onPick) onPick(c ? c.dataset.id : "", e); });
  host.querySelectorAll(".zoom button").forEach(b => b.addEventListener("click", () => zoomAt(+b.dataset.z, vb.x + vb.w / 2, vb.y + vb.h / 2)));
  new ResizeObserver(apply).observe(svg);

  return {
    draw(list, o = {}) {
      items = list;
      const pts = svg.querySelector(".pts"), labs = svg.querySelector(".labs"), routes = svg.querySelector(".routes");
      pts.innerHTML = list.map(({ pl, r, on }) => { const [x, y] = proj(pl.lon, pl.lat);
        return `<circle class="pt${on ? " on" : ""}${pl.type === "regions" ? " reg" : ""}" data-id="${esc(pl.id)}" data-r="${r}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"><title>${esc(plName(pl))}</title></circle>`; }).join("");
      labs.innerHTML = list.filter(x => x.label).map(({ pl, r, label }) => { const [x, y] = proj(pl.lon, pl.lat);
        const f = label === true ? 13 : label;   // büyük merkezler daha iri
        return `<text class="plab${f >= 15 ? " major" : ""}" data-f="${f}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="-0.7em" text-anchor="middle">${esc(plName(pl).replace(/ \(.*\)$/, ""))}</text>`; }).join("");
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
    regions(list) {   // bölge adları (Horasan, Mâverâünnehir…): soluk, aralıklı büyük yazı
      svg.querySelector(".regs").innerHTML = list.map(([lon, lat, ar, tr]) => { const [x, y] = proj(lon, lat);
        return `<text class="rlab" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(LANG === "tr" ? tr : ar)}</text>`; }).join("");
      apply();
    },
    toScreen(pl) { const [x, y] = proj(pl.lon, pl.lat), b = svg.getBoundingClientRect(), s = Math.max(vb.w / b.width, vb.h / b.height);
      const ox = (b.width * s - vb.w) / 2, oy = (b.height * s - vb.h) / 2; return [(x - vb.x + ox) / s, (y - vb.y + oy) / s]; },
  };
}

// harita bölgeleri: [boylam, enlem, ar, tr]
const REGIONS = [[66.3, 40.9, "ما وراء النهر", "MÂVERÂÜNNEHİR"], [59.6, 35.2, "خراسان", "HORASAN"], [59.3, 42.9, "خوارزم", "HÂRİZM"],
  [45.6, 31.2, "العراق", "IRAK"], [37.6, 34.2, "الشام", "ŞAM"], [30.8, 26.6, "مصر", "MISIR"], [39.8, 23.4, "الحجاز", "HİCAZ"],
  [45.5, 15.2, "اليمن", "YEMEN"], [32.8, 39.2, "بلاد الروم", "RÛM (ANADOLU)"], [53.2, 29.2, "فارس", "FARS"], [52, 33.6, "الجبال", "CİBÂL"],
  [75.5, 24.5, "الهند", "HİND"], [41, 36.9, "الجزيرة", "CEZÎRE"], [47.5, 38.8, "أذربيجان", "AZERBAYCAN"], [71.8, 41.4, "فرغانة", "FERGANA"],
  [67.8, 36.8, "طخارستان", "TOHÂRİSTAN"], [64.5, 33.5, "الغور", "GUR"]];
async function viewMap(view, sel) {
  const places = await load("places.json");
  const PL = await placesById();
  const cents = new Set(), kinds = new Set(KIND_ORDER);
  view.innerHTML = `<h1>${T("خريطة البلدان", "Şehirler haritası")}</h1>
    <p class="lede">${T("كل دائرة بلد ورد في التراجم؛ حجمها على عدد الأعلام المرتبطين به بحسب القرن ونوع الصلة المختارين. اضغط على بلد لترى فقهاءه.",
      "Her daire biyografilerde geçen bir şehirdir; büyüklüğü, seçilen yüzyıl ve bağ türüne göre o şehirle ilişkili âlim sayısını gösterir. Fakihlerini görmek için bir şehre tıklayın.")}</p>
    <div class="stage" id="mstage">
    <div class="filters stagebar" id="fk"><span class="label">${T("نوع الصلة", "Bağ türü")}</span>${KIND_ORDER.map(k => `<button type="button" class="btn on" data-k="${k}">${KIND[k]}</button>`).join("")}
      <span class="grow"></span>${full ? "" : expButtons()}${fsButton()}</div>
    <div class="filters num" id="fc"><span class="label">${T("قرن الوفاة", "Vefat yüzyılı (hicrî)")}</span>${[...Array(14)].map((_, i) => `<button type="button" class="btn" data-c="${i + 1}">${LANG === "tr" ? ROM(i + 1) : AR(i + 1)}</button>`).join("")}
      <button type="button" class="btn" data-c="all">${T("الكل", "Tümü")}</button></div>
    <div class="mapwrap big" id="bigmap"></div></div>`;
  const wrap = $("#bigmap");
  const m = await makeMap(wrap);
  m.regions(REGIONS);
  const pop = document.createElement("div"); pop.className = "mpop"; pop.hidden = true; wrap.append(pop);
  const match = (pid, k) => kinds.has(k) && (!cents.size || cents.has(century(P.get(pid)?.d)));
  let current = sel && PL.get(sel) ? sel : "", at = null;
  // yüzen pencere: şehre tıklanan noktanın yanında, harita içinde kalacak şekilde
  const place = () => {
    const pl = PL.get(current); if (!pl) return;
    const [x, y] = at || m.toScreen(pl), W = wrap.clientWidth, H = wrap.clientHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = x + 16, top = y - 30;
    if (left + pw > W - 8) left = x - pw - 16;
    left = Math.max(8, Math.min(left, W - pw - 8)); top = Math.max(8, Math.min(top, H - ph - 8));
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  };
  const side = () => {
    const pl = PL.get(current);
    if (!pl) { pop.hidden = true; return; }
    const rows = new Map();
    pl.people.forEach(([pid, k]) => { if (match(pid, k)) { const r = rows.get(pid) || []; r.push(k); rows.set(pid, r); } });
    const list = [...rows.entries()].sort((a, b) => (P.get(a[0])?.d || 9999) - (P.get(b[0])?.d || 9999));
    const byK = {}; pl.people.forEach(([pid, k]) => { if (match(pid, k)) byK[k] = (byK[k] || 0) + 1; });
    pop.innerHTML = `<div class="mph"><h3>${esc(plName(pl))}</h3><button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button></div>
      <p class="legend num">${AR(list.length)} ${T("فقيهًا", "fakih")} · ${KIND_ORDER.filter(k => byK[k]).map(k => `${KIND[k]} ${AR(byK[k])}`).join(" · ")}</p>
      <ul class="num">${list.map(([pid, ks]) => `<li>${plink(pid)}<span class="k">${deathTxt(P.get(pid) || {})} · ${[...new Set(ks)].map(k => KIND[k]).join(T("، ", ", "))}</span></li>`).join("")
        || `<li class="none">${T("لا أحد بحسب الاختيار", "Seçime uyan kimse yok")}</li>`}</ul>`;
    pop.hidden = false; place();
    $(".x", pop).addEventListener("click", () => { current = ""; at = null; history.replaceState(null, "", "#/map"); redraw(); });
  };
  const redraw = () => {
    const counts = places.map(pl => { const s = new Set(); pl.people.forEach(([pid, k]) => { if (match(pid, k)) s.add(pid); }); return [pl, s.size]; })
      .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    // büyük merkezlerin adları her zaman; en kalabalık 8 şehir iri yazı
    // bölge kayıtları (Horasan, Irak…) daire olarak kalır, adları bölge yazısıyla verilir
    let rank = 0;
    m.draw(counts.map(([pl, n]) => { const city = pl.type !== "regions", k = city ? rank++ : 99;
      return { pl, r: 2.5 + Math.sqrt(n) * 1.5, label: k < 8 ? 17 : k < 40 ? 13 : false, on: pl.id === current }; }));
    side();
  };
  m.pick((id, ev) => {
    if (!id) { if (current) { current = ""; at = null; history.replaceState(null, "", "#/map"); redraw(); } return; }
    const b = wrap.getBoundingClientRect(); at = ev ? [ev.clientX - b.left, ev.clientY - b.top] : null;
    current = id; history.replaceState(null, "", `#/map/${encodeURIComponent(id)}`); redraw(); });
  pop.addEventListener("pointerdown", e => e.stopPropagation());
  pop.addEventListener("wheel", e => e.stopPropagation());
  $("#fk").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return;
    kinds.has(b.dataset.k) ? kinds.delete(b.dataset.k) : kinds.add(b.dataset.k); b.classList.toggle("on"); redraw(); });
  $("#fc").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return;
    if (b.dataset.c === "all") { cents.clear(); $("#fc").querySelectorAll(".btn").forEach(x => x.classList.remove("on")); }
    else { const c = +b.dataset.c; cents.has(c) ? cents.delete(c) : cents.add(c); b.classList.toggle("on"); }
    redraw(); });
  stageToggle($("#mstage"), $("#mstage .fsbtn"), () => { at = null; if (current) m.fit([PL.get(current)]); place(); });
  redraw();
  if (current) { m.fit([PL.get(current)]); at = null; place(); }
}

// ---------- network ----------
let G;
async function graph() {
  if (G) return G;
  const g = await load("graph.json");
  const nodes = g.nodes.map(n => ({ id: n[0], ar: n[1], tr: n[8] || n[1], d: n[2], deg: n[3], x: n[4], y: n[5], guess: !!n[6], salaf: !!n[7],
    get name() { return LANG === "tr" ? this.tr : this.ar; } }));
  const up = nodes.map(() => []), down = nodes.map(() => []);
  g.edges.forEach(([t, s, n, weak]) => { up[s].push([t, n, weak]); down[t].push([s, n, weak]); });
  G = { nodes, up, down, edges: g.edges, byId: new Map(nodes.map((n, i) => [n.id, i])) };
  return G;
}

// Büyük ekran: sahne öğesini tam ekrana alır (tarayıcı izin vermezse sayfayı kaplayan pencere olur)
const FS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
function stageToggle(stage, btn, onChange) {
  const set = on => {
    stage.classList.toggle("full", on); document.body.classList.toggle("noscroll", on);
    btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on));
    btn.lastChild.textContent = on ? T("تصغير", "Küçült") : T("ملء الشاشة", "Büyük ekran");
    onChange && requestAnimationFrame(() => onChange(on));
  };
  btn.addEventListener("click", () => {
    const on = !stage.classList.contains("full");
    set(on);
    try {
      if (on && stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) {}
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && stage.classList.contains("full")) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && stage.classList.contains("full")) set(false); });
}
const fsButton = () => `<button type="button" class="btn fsbtn" aria-pressed="false">${FS_ICON}<span>${T("ملء الشاشة", "Büyük ekran")}</span></button>`;

/* Silsileyi dışa aktarma (PNG / SVG). Ekrandaki ağaç ölçülüp bir sahneye çevrilir: kutular (kartlar,
   etiketler), çizgiler ve satır satır yazılar. PNG tuvalde çizilir (sayfa yazı tipleriyle); SVG aynı
   sahneden yazılır ve yazı tiplerini Google Fonts'tan çağırır. */
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=EB+Garamond:ital,wght@0,500;0,700;1,500&family=Noto+Serif:wght@400;600;700&display=swap";
const DL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const expButtons = () => `<span class="expgrp" role="group" aria-label="${T("تصدير", "Dışa aktar")}">${DL_ICON}<button type="button" class="btn" data-exp="png">PNG</button><button type="button" class="btn" data-exp="svg">SVG</button></span>`;
// her CSS rengini (color-mix dahil) rgba'ya çevirir; saydamsa null
const colorOf = (() => { const c = document.createElement("canvas"); c.width = c.height = 1; const x = c.getContext("2d", { willReadFrequently: true }); const memo = new Map();
  return s => { if (!s || s === "none") return null; if (memo.has(s)) return memo.get(s);
    x.clearRect(0, 0, 1, 1); x.fillStyle = "#000"; x.fillStyle = s; x.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = x.getImageData(0, 0, 1, 1).data, v = a ? `rgba(${r},${g},${b},${+(a / 255).toFixed(3)})` : null;
    memo.set(s, v); return v; }; })();
function treeScene(host, caption) {
  const tree = $(".tree", host), box = tree.getBoundingClientRect();
  const W = Math.ceil(Math.max(tree.scrollWidth, box.width)), H0 = Math.ceil(Math.max(tree.scrollHeight, box.height));
  const rel = r => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
  const paths = [], boxes = [], texts = [];
  tree.querySelectorAll("svg.links path").forEach(p => { const cs = getComputedStyle(p);
    paths.push({ d: p.getAttribute("d"), stroke: colorOf(cs.stroke), sw: parseFloat(cs.strokeWidth) || 1, op: +cs.strokeOpacity || 1,
      dash: cs.strokeDasharray && cs.strokeDasharray !== "none" ? cs.strokeDasharray.replace(/px/g, "").split(/[ ,]+/).map(Number) : null }); });
  tree.querySelectorAll("*").forEach(el => {
    if (el.closest("svg")) return;
    const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const b = rel(r), fill = colorOf(cs.backgroundColor);
    const S = ["Top", "Right", "Bottom", "Left"].map(s => ({ w: cs[`border${s}Style`] === "none" ? 0 : parseFloat(cs[`border${s}Width`]) || 0, c: colorOf(cs[`border${s}Color`]), s: cs[`border${s}Style`] }));
    const dashOf = s => s === "dashed" ? [4, 3] : s === "dotted" ? [1, 2] : null;
    const same = S.every(x => x.w === S[0].w && x.c === S[0].c && x.s === S[0].s);
    const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, b.w / 2, b.h / 2);
    if (fill || (same && S[0].w && S[0].c)) boxes.push({ ...b, r: rad, fill, stroke: same && S[0].w ? S[0].c : null, sw: S[0].w, dash: dashOf(S[0].s) });
    if (!same) S.forEach((x, k) => { if (!x.w || !x.c) return;
      const h = x.w / 2, [x1, y1, x2, y2] = [[b.x, b.y + h, b.x + b.w, b.y + h], [b.x + b.w - h, b.y, b.x + b.w - h, b.y + b.h], [b.x, b.y + b.h - h, b.x + b.w, b.y + b.h - h], [b.x + h, b.y, b.x + h, b.y + b.h]][k];
      boxes.push({ line: [x1, y1, x2, y2], stroke: x.c, sw: x.w, dash: dashOf(x.s) }); });
  });
  // yazılar: her metin düğümü kelimelere bölünür, kelimeler ekrandaki satırlarına göre toplanır
  const tw = document.createTreeWalker(tree, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest("svg") || !n.data.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let n; (n = tw.nextNode());) {
    const el = n.parentElement, cs = getComputedStyle(el); if (cs.visibility === "hidden") continue;
    const clipEl = el.closest(".chip2"), clip = clipEl && clipEl.scrollWidth > clipEl.clientWidth + 1 ? clipEl.getBoundingClientRect() : null;
    const lines = []; let cut = false;
    for (const m of n.data.matchAll(/[^\s-]*-|[^\s-]+/g)) {   // tire sonrası da satır kırılabilir
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const r = rg.getClientRects()[0]; if (!r) continue;
      if (clip && (r.right > clip.right - 4 || r.left < clip.left + 4)) { cut = true; continue; }
      let L = lines.find(l => Math.abs(l.top - r.top) < 3);
      if (!L) lines.push(L = { top: r.top, bottom: r.bottom, l: r.left, r: r.right, s: n.data.slice(m.index, m.index + m[0].length), a: m.index, e: m.index + m[0].length });
      else { L.l = Math.min(L.l, r.left); L.r = Math.max(L.r, r.right); L.e = m.index + m[0].length; L.s = n.data.slice(L.a, L.e).replace(/\s+/g, " "); }
    }
    if (cut && lines.length) lines[lines.length - 1].s += "…";
    const font = { family: cs.fontFamily, size: parseFloat(cs.fontSize), weight: cs.fontWeight, style: cs.fontStyle };
    const rtl = cs.direction === "rtl" || /[؀-ۿ]/.test(n.data);
    lines.forEach(L => texts.push({ x: (L.l + L.r) / 2 - box.left, y: (L.top + L.bottom) / 2 - box.top, s: L.s, font, fill: colorOf(cs.color), rtl }));
  }
  const root = getComputedStyle(document.documentElement);
  const bg = colorOf(getComputedStyle($(".treewrap", host)).backgroundColor) || colorOf(root.getPropertyValue("--paper"));
  const FOOT = 44;
  texts.push({ x: W / 2, y: H0 + FOOT / 2 - 6, s: caption, font: { family: getComputedStyle(document.body).fontFamily, size: 13, weight: "400", style: "normal" },
    fill: colorOf(root.getPropertyValue("--muted")), rtl: LANG === "ar" });
  return { W, H: H0 + FOOT, bg, paths, boxes, texts };
}
function sceneSVG(sc) {
  const a = v => esc(String(v)), n = v => +v.toFixed(2);
  const col = c => c ? `rgb(${c.match(/\d+/g).slice(0, 3).join(",")})` : "none";
  const alpha = c => c ? +c.split(",")[3].replace(")", "") : 1;
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${sc.W}" height="${sc.H}" viewBox="0 0 ${sc.W} ${sc.H}">`,
    `<style>@import url('${a(FONT_CSS)}');</style>`, `<rect width="100%" height="100%" fill="${col(sc.bg)}"/>`];
  sc.paths.forEach(p => out.push(`<path d="${a(p.d)}" fill="none" stroke="${col(p.stroke)}" stroke-opacity="${n(alpha(p.stroke) * p.op)}" stroke-width="${p.sw}" stroke-linejoin="round"${p.dash ? ` stroke-dasharray="${p.dash.join(" ")}"` : ""}/>`));
  sc.boxes.forEach(b => {
    const st = b.stroke ? ` stroke="${col(b.stroke)}" stroke-opacity="${alpha(b.stroke)}" stroke-width="${b.sw}"${b.dash ? ` stroke-dasharray="${b.dash.join(" ")}"` : ""}` : "";
    if (b.line) out.push(`<line x1="${n(b.line[0])}" y1="${n(b.line[1])}" x2="${n(b.line[2])}" y2="${n(b.line[3])}"${st}/>`);
    else { const h = (b.sw || 0) / 2; out.push(`<rect x="${n(b.x + h)}" y="${n(b.y + h)}" width="${n(b.w - 2 * h)}" height="${n(b.h - 2 * h)}" rx="${n(b.r)}" fill="${col(b.fill)}" fill-opacity="${alpha(b.fill)}"${st}/>`); }
  });
  sc.texts.forEach(t => out.push(`<text x="${n(t.x)}" y="${n(t.y)}" text-anchor="middle" dominant-baseline="central"${t.rtl ? ` direction="rtl" unicode-bidi="embed"` : ""} font-family="${a(t.font.family)}" font-size="${t.font.size}" font-weight="${t.font.weight}"${t.font.style !== "normal" ? ` font-style="${t.font.style}"` : ""} fill="${col(t.fill)}" fill-opacity="${alpha(t.fill)}">${esc(t.s)}</text>`));
  out.push("</svg>");
  return new Blob([out.join("\n")], { type: "image/svg+xml" });
}
function scenePNG(sc, k = 2) {
  const c = document.createElement("canvas"); c.width = Math.ceil(sc.W * k); c.height = Math.ceil(sc.H * k);
  const x = c.getContext("2d"); x.scale(k, k);
  x.fillStyle = sc.bg || "#fff"; x.fillRect(0, 0, sc.W, sc.H);
  x.lineJoin = "round";
  sc.paths.forEach(p => { x.save(); x.globalAlpha = p.op; x.strokeStyle = p.stroke; x.lineWidth = p.sw; x.setLineDash(p.dash || []); x.stroke(new Path2D(p.d)); x.restore(); });
  sc.boxes.forEach(b => { x.save(); x.setLineDash(b.dash || []);
    if (b.line) { x.beginPath(); x.moveTo(b.line[0], b.line[1]); x.lineTo(b.line[2], b.line[3]); x.strokeStyle = b.stroke; x.lineWidth = b.sw; x.stroke(); }
    else { const h = (b.sw || 0) / 2; x.beginPath(); x.roundRect(b.x + h, b.y + h, b.w - 2 * h, b.h - 2 * h, Math.max(0, b.r));
      if (b.fill) { x.fillStyle = b.fill; x.fill(); }
      if (b.stroke) { x.strokeStyle = b.stroke; x.lineWidth = b.sw; x.stroke(); } }
    x.restore(); });
  x.textAlign = "center"; x.textBaseline = "middle";
  sc.texts.forEach(t => { x.font = `${t.font.style} ${t.font.weight} ${t.font.size}px ${t.font.family}`; x.fillStyle = t.fill; x.direction = t.rtl ? "rtl" : "ltr"; x.fillText(t.s, t.x, t.y); });
  return new Promise(res => c.toBlob(res, "image/png"));
}
// sonuç: indirme bağlantısı ve önizleme (indirme engellenirse resim sağ tıkla kaydedilebilir)
function showExport(blob, name) {
  const url = URL.createObjectURL(blob);
  const d = document.createElement("div"); d.className = "expbox"; d.setAttribute("role", "dialog");
  d.innerHTML = `<div class="in"><div class="hd"><b>${esc(name)}</b><span class="grow"></span>
      <a class="btn gold" href="${url}" download="${esc(name)}">${DL_ICON}${T("تنزيل", "İndir")}</a><button type="button" class="btn">${T("إغلاق", "Kapat")}</button></div>
    <p class="hint">${T("إن لم يبدأ التنزيل فانقر على الصورة بالزر الأيمن واحفظها.", "İndirme başlamazsa resme sağ tıklayıp kaydedin.")}</p>
    <div class="pv"><img src="${url}" alt="${esc(name)}"></div></div>`;
  const close = () => { d.remove(); URL.revokeObjectURL(url); document.removeEventListener("keydown", key); };
  const key = e => e.key === "Escape" && close();
  d.addEventListener("click", e => { if (e.target === d || e.target.matches("button")) close(); });
  document.addEventListener("keydown", key);
  (document.fullscreenElement || document.body).appendChild(d);
  try { $("a", d).click(); } catch (e) {}
}
async function exportTree(host, fmt, id, name) {
  if (document.fonts) await document.fonts.ready;
  const sc = treeScene(host, `${T("طبقات الحنفية", "Hanefî Tabakātı")} · ${T("سلسلة", "Silsile")}: ${name}`);
  const file = `silsile-${id}.${fmt}`;
  showExport(fmt === "svg" ? sceneSVG(sc) : await scenePNG(sc), file);
}

let LINEAGE = true;
async function viewNet(view, id) {
  const g = await graph();
  const full = !id;
  view.innerHTML = `<h1>${T("سلسلة الشيوخ والتلاميذ", "Hoca–talebe silsilesi")}</h1>
    <div class="stage" id="nstage">
    <div class="filters stagebar"><a class="btn ${full ? "" : "on"}" href="#/net/${esc(id || "jws1")}">${T("سلسلة عَلَم", "Bir âlimin silsilesi")}</a>
      <a class="btn ${full ? "on" : ""}" href="#/net">${T("المشهد العام", "Genel görünüm")}</a>
      ${full ? "" : `<span class="label" style="margin-inline-start:1rem">${T("الطبقات", "Kuşak")}</span><button type="button" class="btn on" data-depth="1">${T("طبقة واحدة", "Bir kuşak")}</button><button type="button" class="btn" data-depth="2">${T("طبقتان", "İki kuşak")}</button>
        <button type="button" class="btn${LINEAGE ? " on" : ""}" id="lin" aria-pressed="${LINEAGE}">${T("الوصل بأبي حنيفة", "Ebû Hanîfe’ye bağla")}</button>`}
      <span class="grow"></span>${full ? "" : expButtons()}${fsButton()}</div>
    <div id="netbody"></div></div>`;
  const stage = $("#nstage");
  if (full) { const redraw = fullNet($("#netbody"), g); stageToggle(stage, $(".fsbtn", stage), () => redraw && redraw()); return; }
  const i = g.byId.get(id);
  if (i === undefined) { $("#netbody").innerHTML = `<p class="empty">${plink(id)} ${T("ليس له شيوخ ولا تلاميذ من المترجمين.", ": biyografisi bulunanlar arasında hocası ya da talebesi yok.")}</p>`; return; }
  let depth = 1;
  const draw = () => egoNet($("#netbody"), g, i, depth, LINEAGE);
  view.querySelectorAll("[data-depth]").forEach(b => b.addEventListener("click", () => {
    depth = +b.dataset.depth; view.querySelectorAll("[data-depth]").forEach(x => x.classList.toggle("on", x === b)); draw(); }));
  $("#lin").addEventListener("click", e => { LINEAGE = !LINEAGE; e.currentTarget.classList.toggle("on", LINEAGE); e.currentTarget.setAttribute("aria-pressed", LINEAGE); draw(); });
  stageToggle(stage, $(".fsbtn", stage));
  view.querySelectorAll("[data-exp]").forEach(b => b.addEventListener("click", async () => {
    b.disabled = true; try { await exportTree($("#netbody"), b.dataset.exp, id, g.nodes[i].name); } finally { b.disabled = false; } }));
  draw();
}

// Ebû Hanîfe'ye en kısa hoca yolu: vefatlarla tutarlı (hoca önce ölmüş, fark ≤ 100 yıl), önce kuvvetli bağlar
function pathToImam(g, me, root = "jws1") {
  const R = g.byId.get(root);
  if (R === undefined || me === R) return null;
  // vefatı bilinmeyen halkaya talebesinden ~35 yıl önce bir tahmin verilir; böylece bilinmeyen
  // bir aracı üzerinden yüzyıllar atlanamaz (her adımda fark 0 < … ≤ 100)
  const ok = (dt, eff) => !dt || !eff || (eff - dt > 0 && eff - dt <= 100);
  for (const allowWeak of [false, true]) {
    const prev = new Map([[me, -1]]), eff = new Map([[me, g.nodes[me].d || null]]); let q = [me];
    while (q.length && !prev.has(R)) {
      const nq = [];
      for (const x of q) for (const [t, , weak] of [...g.up[x]].sort((u, v) => g.nodes[v[0]].deg - g.nodes[u[0]].deg)) {
        const dt = g.nodes[t].d, ex = eff.get(x);
        if ((weak && !allowWeak) || prev.has(t) || !ok(dt, ex)) continue;
        prev.set(t, x); eff.set(t, dt || (ex ? ex - 35 : null)); nq.push(t);
      }
      q = nq;
    }
    if (prev.has(R)) { const out = [R]; while (out[out.length - 1] !== me) out.push(prev.get(out[out.length - 1])); return out; }   // Ebû Hanîfe → … → me
  }
  return null;
}
/* Âlimin silsilesi, hadis isnad şemaları gibi: en üstte Ebû Hanîfe'ye uzanan tek sütunluk isnad,
   altında hocalar, ortada silsile sahibi, altta talebeler. Hoca ve talebeler eşit sütunlu bir ızgaraya
   dizilir; çizgiler kartların üzerinden geçmez: her kart iki sütun arasındaki boşluktan (oluk) inen
   dikey hatta kısa bir kolla bağlanır, oluklar ortak bir yatay hatta, o da silsile sahibine birleşir. */
function egoNet(host, g, me, depth, lineage = true) {
  const MAXR = 60, N = g.nodes;
  const byYear = (a, b) => (N[a].d || 9999) - (N[b].d || 9999);
  const path = lineage ? pathToImam(g, me) : null;          // Ebû Hanîfe → … → me
  const onPath = new Set(path || []);
  const pt = path ? path[path.length - 2] : -1;             // yoldaki hoca
  const chain = path ? path.slice(0, -2) : [];              // ondan yukarısı: isnad sütunu
  const pg = chain.length ? chain[chain.length - 1] : -1;
  const weakOf = (adj, i) => new Map(adj[i].map(([j, n, w]) => [j, !!w]));
  const upW = weakOf(g.up, me), downW = weakOf(g.down, me);
  const pick = adj => { const l = adj[me].map(([j]) => j).sort(byYear);
    const i = l.indexOf(pt); if (i > 0) { l.splice(i, 1); l.unshift(pt); }
    return { all: l.length, list: l.slice(0, MAXR) }; };
  const T_ = pick(g.up), S_ = pick(g.down);
  const nameOf = i => { const n = N[i]; return LANG === "tr" ? (P.get(n.id) || {}).trs || n.tr : n.ar; };
  const yr = i => { const n = N[i], p = P.get(n.id) || {}; return n.d ? (LANG === "tr" ? `(${yearTxt(n.d, n.guess || p.est)})` : yearTxt(n.d, n.guess || p.est)) : ""; };
  const trLink = n => n.salaf ? `<span class="tag weak" title="${T("قبل أبي حنيفة؛ ليس له ترجمة في هذا الفهرس", "Ebû Hanîfe öncesi; bu dizinde biyografisi yok")}">${T("من السلف", "selef")}</span>`
    : `<a class="tr" href="#/p/${esc(n.id)}" title="${T("ترجمته", "Biyografisi")}">${T("ترجمة", "biyografi")}</a>`;
  // iki kuşak: her kartta onun hocaları (üstte) ya da talebeleri (altta) küçük bir çekmece olarak
  const tray = (i, dir) => {
    if (depth < 2) return "";
    const l = (dir < 0 ? g.up[i] : g.down[i]).map(([j]) => j).filter(j => j !== me).sort(byYear);
    if (!l.length) return "";
    if (l.includes(pg) && i === pt) { l.splice(l.indexOf(pg), 1); l.unshift(pg); }
    const K = 6;
    return `<div class="tray"><span class="th">${dir < 0 ? T("شيوخه", "hocaları") : T("تلاميذه", "talebeleri")}</span>${l.slice(0, K).map(j =>
      `<a class="chip2${i === pt && j === pg ? " onpath" : ""}" href="#/net/${esc(N[j].id)}" title="${esc(N[j].name)}">${esc(nameOf(j))}</a>`).join("")}${l.length > K ? `<span class="th">+${AR(l.length - K)}</span>` : ""}</div>`;
  };
  const card = (i, dir, weak) => { const n = N[i];
    const cls = `card${n.salaf ? " salaf" : ""}${onPath.has(i) ? " onpath" : ""}${weak ? " weak" : ""}`;
    return `<div class="${cls}" data-i="${i}">${dir < 0 ? tray(i, -1) : ""}<a class="nm" href="#/net/${esc(n.id)}" title="${T("سلسلته", "Silsilesi")}">${esc(n.name)}</a>
      <span class="meta num"><span>${yr(i)}</span>${trLink(n)}</span>${dir > 0 ? tray(i, 1) : ""}</div>`; };
  const m = N[me];
  const meCard = `<div class="card me${m.salaf ? " salaf" : ""}" data-i="${me}">${m.salaf ? `<span class="nm">${esc(m.name)}</span>` : `<a class="nm" href="#/p/${esc(m.id)}">${esc(m.name)}</a>`}
    <span class="meta num"><span>${yr(me)}</span>${m.salaf ? trLink(m) : `<a class="tr" href="#/p/${esc(m.id)}">${T("قراءة الترجمة ←", "Biyografiyi oku →")}</a>`}</span></div>`;
  const more = (all, l) => all > l.length ? `<p class="none">${T(`و${AR(all - l.length)} غيرهم`, `ve ${all - l.length} kişi daha`)}</p>` : "";
  const lbl = (ar, tr, n) => `<div class="tlbl">${T(ar, tr)} <span class="num">${AR(n)}</span></div>`;
  host.innerHTML = `<div class="treewrap"><div class="tree isnad">
      <svg class="links" aria-hidden="true"></svg><div class="elbls"></div>
      ${chain.length ? `<div class="chainv"><div class="tlbl top">${T("الإسناد إلى أبي حنيفة", "Ebû Hanîfe’ye uzanan isnad")}</div>
        ${chain.map(i => `<div class="card lnk${N[i].salaf ? " salaf" : ""}" data-i="${i}"><a class="nm" href="#/net/${esc(N[i].id)}">${esc(N[i].name)}</a><span class="meta num"><span>${yr(i)}</span>${trLink(N[i])}</span></div>`).join("")}</div>` : ""}
      ${T_.list.length ? `<div class="blk up">${more(T_.all, T_.list)}<div class="grid">${T_.list.map(i => card(i, -1, upW.get(i))).join("")}</div>
        ${lbl("شيوخه", "Hocaları", T_.all)}</div>` : ""}
      <div class="mid">${meCard}</div>
      ${S_.list.length ? `<div class="blk down">${lbl("تلاميذه", "Talebeleri", S_.all)}
        <div class="grid">${S_.list.map(i => card(i, 1, downW.get(i))).join("")}</div>${more(S_.all, S_.list)}</div>` : ""}
      ${!T_.list.length && !S_.list.length ? `<p class="none">—</p>` : ""}
    </div></div>
    <p class="legend">${path ? T("الخط الذهبي: أقصر سلسلة تفقّه موثّقة إلى أبي حنيفة، متّسقة مع سني الوفاة، وعلى كل حلقة نوع الأخذ. ", "Altın çizgi: vefat yıllarıyla tutarlı, belgeli en kısa silsile (Ebû Hanîfe’ye kadar); her halkanın üzerinde alış türü yazılıdır. ")
      : (lineage && me !== g.byId.get("jws1") ? T("لم توجد سلسلة موثّقة إلى أبي حنيفة. ", "Ebû Hanîfe’ye uzanan belgeli bir silsile bulunamadı. ") : "")}${T("اضغط على اسم لتنتقل إلى سلسلته، أو على «ترجمة» لتقرأ ترجمته. الإطار المتقطع: ربط بترجيح النسبة أو الشهرة.",
      "Bir ada tıklayınca onun silsilesine, “biyografi”ye tıklayınca biyografisine gidilir. Kesikli çerçeve: nisbe ya da şöhretle tercih edilen bağ.")}</p>`;
  const wrap = $(".treewrap", host), tree = $(".tree", host), svg = $(".links", host), lay = $(".elbls", host);
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const labels = new Map();   // "t>s" → alış türü
  // sütun sayısı kutu genişliğinden; yoldaki hoca ortaya yakın bir sütuna
  const columns = () => {
    const cw = 14.5 * rem, gap = 2.6 * rem, W = wrap.clientWidth - 2.4 * rem;
    tree.querySelectorAll(".blk").forEach(b => {
      const grid = $(".grid", b), n = grid.children.length;
      const C = Math.max(1, Math.min(5, n, Math.floor((W + gap) / (cw + gap))));
      grid.style.setProperty("--c", C); grid.classList.toggle("one", C === 1 && n > 1);
      const ptEl = b.classList.contains("up") && grid.querySelector(`.card[data-i="${pt}"]`);
      if (ptEl) { const at = Math.min(Math.floor((C - 1) / 2), n - 1); ptEl.remove(); grid.insertBefore(ptEl, grid.children[at] || null); }
    });
  };
  const draw = () => {
    const box = tree.getBoundingClientRect();
    svg.setAttribute("width", tree.scrollWidth); svg.setAttribute("height", tree.scrollHeight);
    const R = el => { const r = el.getBoundingClientRect(); return { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: (r.left + r.right) / 2 - box.left }; };
    const meR = R($(".card.me", tree));
    const base = [], gold = [], lab = [];
    const P2 = (d, cls = "lk") => `<path class="${cls}" d="${d}"/>`;
    tree.querySelectorAll(".blk").forEach(b => {
      const up = b.classList.contains("up"), grid = $(".grid", b), cards = [...grid.children];
      if (!cards.length) return;
      const gap = parseFloat(getComputedStyle(grid).columnGap) || 2.6 * rem, gR = R(grid);
      const busY = up ? gR.b + 1.1 * rem : gR.t - 1.1 * rem, tY = up ? meR.t : meR.b, tx = meR.cx;
      if (cards.length === 1) {   // tek kişi: doğrudan dirsekli hat
        const c = R(cards[0]), y = up ? c.b : c.t, d = `M${c.cx} ${y}V${busY}H${tx}V${tY}`;
        (+cards[0].dataset.i === pt ? gold : base).push(P2(d, `lk${cards[0].classList.contains("weak") ? " weak" : ""}${+cards[0].dataset.i === pt ? " path" : ""}`));
        return;
      }
      const lefts = [...new Set(cards.map(c => Math.round(R(c).l)))].sort((a, b) => a - b), C = lefts.length;
      const gut = new Map();
      let ptSeg = null;
      cards.forEach(el => {
        const c = R(el), v = lefts.indexOf(Math.round(c.l));
        const right = C > 1 && v % 2 === 0 && v !== C - 1;
        const x = Math.round(right ? c.r + gap / 2 : c.l - gap / 2);
        const nm = R($(".nm", el)), y = nm.t + .8 * rem;
        if (!gut.has(x)) gut.set(x, []); gut.get(x).push(y);
        const d = `M${x} ${y}H${right ? c.r : c.l}`;
        base.push(P2(d, `lk stub${el.classList.contains("weak") ? " weak" : ""}`));
        if (+el.dataset.i === pt) ptSeg = { x, y, d };
      });
      for (const [x, ys] of gut) base.push(P2(`M${x} ${busY}V${up ? Math.min(...ys) : Math.max(...ys)}`));
      const xs = [...gut.keys(), tx];
      base.push(P2(`M${Math.min(...xs)} ${busY}H${Math.max(...xs)}`), P2(`M${tx} ${busY}V${tY}`, "lk trunk"));
      if (up && ptSeg) gold.push(P2(`${ptSeg.d}M${ptSeg.x} ${ptSeg.y}V${busY}H${tx}V${tY}`, "lk path"));
    });
    // isnad sütunu: halkalar arası dikey altın hat ve üzerinde alış türü; son halka yoldaki hocaya dirsekle
    const lnks = [...tree.querySelectorAll(".chainv .card")];
    lnks.forEach((el, k) => {
      const a = R(el), i = +el.dataset.i;
      if (k + 1 < lnks.length) {
        const b = R(lnks[k + 1]); gold.push(P2(`M${a.cx} ${a.b}V${b.t}`, "lk path"));
        lab.push([a.cx, (a.b + b.t) / 2, labels.get(`${i}>${+lnks[k + 1].dataset.i}`)]);
      } else {
        const tEl = tree.querySelector(`.blk.up .card[data-i="${pt}"]`);
        if (!tEl) return;
        const b = R(tEl), my = b.t - 1.1 * rem;
        gold.push(P2(`M${a.cx} ${a.b}V${my}H${b.cx}V${b.t}`, "lk path"));
        lab.push([a.cx, (a.b + my) / 2, labels.get(`${i}>${pt}`)]);
      }
    });
    svg.innerHTML = base.join("") + gold.join("");
    lay.innerHTML = lab.filter(x => x[2]).map(([x, y, t]) => `<span class="elbl" style="left:${x}px;top:${y}px">${esc(t)}</span>`).join("");
  };
  const layout = () => { columns(); draw(); };
  const ro = new ResizeObserver(layout); ro.observe(wrap);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(layout);
  // alış türleri talebenin biyografi dosyasından
  if (path) Promise.all(path.slice(1).map((s, k) => N[s].salaf ? null : person(N[s].id).then(p => {
    const t = path[k], r = p && (p.teachers || []).find(x => x.id === N[t].id);
    if (r && r.rels && r.rels.length) labels.set(`${t}>${s}`, r.rels.map(x => REL[x] || x).join(T("، ", ", ")));
  }).catch(() => {}))).then(() => host.contains(tree) && draw());
}

function fullNet(host, g) {
  host.innerHTML = `<p class="lede">${T("كل نقطة عَلَم، مرتّبة أفقيًا بسنة الوفاة (الأقدم يمينًا)، والخيوط من الشيخ إلى التلميذ. اسحب للتنقل، ودوّر العجلة للتكبير، واضغط على نقطة لإبراز صلاتها.",
    "Her nokta bir âlimdir; yatayda vefat yılına göre dizilidir (en eskiler solda), çizgiler hocadan talebeye uzanır. Sürükleyerek gezinin, tekerlekle yakınlaştırın, bağlarını görmek için bir noktaya tıklayın.")}</p>
    <div class="netwrap"><canvas id="cv"></canvas><div class="tip" hidden></div></div><p class="legend" id="nsel"></p>`;
  const cv = $("#cv"), tip = $(".tip", host), ctx = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const col = n => css.getPropertyValue(n).trim();
  const N = g.nodes, ymax = Math.max(...N.map(n => n.x || 0)), SX = 2.2;
  const ok = n => n.x > 0;   // vefatı ne bilinen ne tahmin edilebilen düğümler çizilmez
  const yr = Math.max(...N.map(n => Math.abs(n.y))) || 1;
  let SY = 9;
  const rtl = LANG === "ar", X = n => (rtl ? ymax - n.x : n.x) * SX, Y = n => n.y * SY;
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
    ctx.fillStyle = col("--muted"); ctx.font = rtl ? "12px 'Noto Naskh Arabic', serif" : "12px 'Noto Serif', serif"; ctx.textAlign = "center";
    for (let yr = 100; yr <= ymax; yr += 100) { const x = tx + sc * (rtl ? ymax - yr : yr) * SX;
      ctx.globalAlpha = .25; ctx.fillRect(x, 0, 1, h); ctx.globalAlpha = .9; ctx.fillText(rtl ? AR(yr) + "هـ" : `${yr}/${CE(yr)}`, x, 16); }
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
    if (sc > 2.5 || sel >= 0) N.forEach((n, i) => { if (ok(n) && ((sc > 2.5 && n.deg >= 12 / sc) || hl.has(i))) ctx.fillText((rtl ? n.name.split("،")[0] : (who(n.id)?.trs || n.name)).slice(0, 30), tx + sc * X(n), ty + sc * Y(n) - 7); });
  };
  const near = (mx, my) => { let b = -1, bd = 100; N.forEach((n, i) => { if (!ok(n)) return; const d = (tx + sc * X(n) - mx) ** 2 + (ty + sc * Y(n) - my) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
  const select = i => { sel = i; hl.clear(); if (i >= 0) { hl.add(i); g.up[i].forEach(([j]) => hl.add(j)); g.down[i].forEach(([j]) => hl.add(j));
      const n = N[i]; $("#nsel").innerHTML = `${plink(n.id)} · ${AR(g.up[i].length)} ${T("شيوخ", "hoca")} · ${AR(g.down[i].length)} ${T("تلاميذ", "talebe")} · <a href="#/net/${n.id}">${T("سلسلته", "silsilesi")}</a>`; }
    else $("#nsel").innerHTML = ""; draw(); };
  let drag = null, moved = 0;
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); drag = [e.clientX, e.clientY]; moved = 0; });
  cv.addEventListener("pointermove", e => {
    const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    if (drag) { tx += e.clientX - drag[0]; ty += e.clientY - drag[1]; moved += Math.abs(e.clientX - drag[0]) + Math.abs(e.clientY - drag[1]); drag = [e.clientX, e.clientY]; draw(); return; }
    const i = near(mx, my);
    if (i !== hov) { hov = i; tip.hidden = i < 0; if (i >= 0) { tip.textContent = N[i].name + (N[i].d ? (rtl ? ` (${N[i].guess ? "~" : ""}${AR(N[i].d)}هـ)` : ` (${yearTxt(N[i].d, N[i].guess)})`) : ""); } }
    if (i >= 0) { tip.style.left = Math.min(mx + 12, b.width - tip.offsetWidth - 4) + "px"; tip.style.top = (my + 14) + "px"; }
  });
  cv.addEventListener("pointerup", e => { const b = cv.getBoundingClientRect(); if (moved < 5) select(near(e.clientX - b.left, e.clientY - b.top)); drag = null; });
  cv.addEventListener("pointerleave", () => { tip.hidden = true; hov = -1; });
  cv.addEventListener("wheel", e => { e.preventDefault(); const b = cv.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top, f = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; sc *= f; draw(); }, { passive: false });
  new ResizeObserver(() => { draw(); }).observe(cv);
  fit(); draw();
  return () => { fit(); draw(); };
}

// ---------- about ----------
function viewAbout(view) {
  const books = `<div class="books">${Object.values(BOOKS).map(b => `<div class="book"><b>${esc(bookTitle(b))}</b><span>${esc(bookAuthor(b))}</span></div>`).join("")}</div>`;
  if (LANG === "tr") {
    view.innerHTML = `<h1>Proje hakkında</h1>
    <section><h2>Kitaplar</h2>${books}</section>
    <section><h2>Yöntem</h2>
      <p class="lede" style="color:var(--ink)">Bir âlimin farklı kitaplardaki biyografileri; ad, nesep, künye, nisbe, vefat yılı ve kitapların birbirine yaptığı atıflar karşılaştırılarak tek başlık altında toplandı; şüpheli eşleştirmeler elle gözden geçirildi.
      Hocalar ve talebeler biyografilerdeki ifadelerden («تفقّه على», «أخذ عن», «روى عنه», «من أصحاب»…) çıkarıldı; geçen ad nesep, künye ve nisbe uyumuna, vefat yıllarının yakınlığına ve biyografilerin birbirini doğrulamasına bakılarak sahibine bağlandı. Kesinleşmeyenler incelenmek üzere silsilenin dışında bırakıldı.
      Şehirler doğum, vefat, defin, seyahat, ikamet ve görev ifadelerinden ve nisbelerden çıkarıldı.
      Biyografi metinleri, her kitaptan ayrı ayrı ve muhakkik dipnotlarıyla, her âlimin sayfasının sonunda Arapça aslıyla yayımlanmaktadır.</p>
      <p class="lede" style="color:var(--ink)">Şahıs, eser ve yer adları TDV İslâm Ansiklopedisi (DİA) yazım usulüyle verilmiştir: Ebû Hanîfe, Muhammed b. Hasan eş-Şeybânî, Şemsüleimme el-Halvânî, el-Cevâhirü’l-muziyye… Adlar künye, isim, nesep, nisbe ve lakap sözlüklerinden otomatik kurulur; unvan ve tavsifler atılır. Tarihler hicrî/milâdî olarak verilir: (ö. 150/767). Milâdî yıl, hicrî yılın ortasına göre hesaplanmıştır; ay ve gün bilinmediğinden bir yıl sapabilir.</p>
      <p class="legend">“tercih” etiketli bağlar yalnız nisbe ya da şöhretle kurulmuştur. “[?]” işaretli vefat tarihleri kaynakta yoktur; hoca ve talebelerin vefatlarından tahmin edilmiştir. Hicrî yüzyıllar DİA’daki gibi yazılır: V. (XI.) yüzyıl.</p></section>
    <section><h2>Açık kaynaklar</h2><p class="lede">Koordinatlar al-Thurayya Gazetteer’dan (CC BY 4.0), Osmanlı ve Hint şehirleri için elle yapılan eklemelerle; kara ve nehir sınırları Natural Earth’ten (kamu malı).</p></section>`;
    return;
  }
  view.innerHTML = `<h1>عن المشروع</h1>
    <section><h2>الكتب</h2>${books}</section>
    <section><h2>المنهج</h2>
      <p class="lede" style="color:var(--ink)">جُمعت تراجم العَلَم الواحد من الكتب المختلفة تحت عنوان واحد بمقارنة الاسم والنسب والكنية والنسبة وسنة الوفاة وإحالات الكتب بعضها على بعض، وراجع الإنسان ما التبس منها.
      واستُخرج الشيوخ والتلاميذ من عبارات التراجم («تفقّه على»، «أخذ عن»، «روى عنه»، «من أصحاب»…) ورُبط الاسم بصاحبه بموافقة النسب والكنية والنسبة، مع مراعاة تقارب الوفيات وتقاطع التراجم؛ وما لم يترجّح بقي خارج السلسلة للمراجعة.
      واستُخرجت البلدان من عبارات المولد والوفاة والدفن والرحلة والإقامة والولاية، ومن النسبة.
      ونصوص التراجم منشورة كاملة في آخر صفحة كل عَلَم، كلُّ كتاب على حدة مع حواشي محققه.</p>
      <p class="legend">ما وُسم «ترجيح» ربطٌ بالنسبة أو الشهرة وحدها. الوفيات المسبوقة بـ«نحو» تقدير من طبقة الشيوخ والتلاميذ.</p></section>
    <section><h2>المصادر المفتوحة</h2><p class="lede">الإحداثيات من مشروع الثريا (al-Thurayya Gazetteer، رخصة CC BY 4.0) مع إضافات يدوية لبلدان العهد العثماني والهند؛ وحدود اليابسة والأنهار من Natural Earth (ملك عام).</p></section>`;
}

init().catch(e => { $("#view").innerHTML = `<p class="empty">${T("تعذّر تحميل البيانات", "Veriler yüklenemedi")}: ${esc(e.message)}</p>`; });

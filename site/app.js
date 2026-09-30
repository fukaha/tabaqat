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
// yayında dosyalar sürüm damgasıyla istenir (app.js?v=…), böylece tarayıcı eski kopyayı kullanmaz
const VER = (/[?&]v=([\w-]+)/.exec(document.currentScript?.src || "") || [])[1] || "";
// başarısız istek önbellekte kalmaz (sonraki denemede yeniden yüklenir); geçici ağ hatasında bir kez yeniden dener
const load = p => cache[p] || (cache[p] = (async () => {
  for (let i = 0; ; i++) {
    try { const r = await fetch("data/" + p + (VER ? "?v=" + VER : "")); if (!r.ok) throw new Error(`${p} (${r.status})`); return await r.json(); }
    catch (e) { if (i >= 1 || /\(4\d\d\)/.test(e.message)) { delete cache[p]; throw e; } await new Promise(res => setTimeout(res, 800)); }
  }
})());
let IDX, BOOKS, SALAF = new Map(), P = new Map();

async function init() {
  const [d, kt] = await Promise.all([load("index.json"), load("katki.json").catch(() => ({ items: [] }))]);
  BOOKS = d.books;
  IDX = d.persons.map(r => ({ id: r[0], ar: r[1], d: r[2], est: !!r[3], n: r[4], nt: r[5], ns: r[6], place: r[7], books: r[8] || [],
    tr: r[9] || r[1], trs: r[10] || r[9] || r[1], b: r[11] || 0, key: norm(r[1]), tkey: fold(r[9]) }));
  IDX.forEach(p => Object.defineProperty(p, "name", { get() { return LANG === "tr" ? this.tr : this.ar; } }));
  IDX.forEach(p => P.set(p.id, p));
  // Ebû Hanîfe öncesi (peygamberler, sahâbe, tâbiûn): sayfası yok, yalnız silsilede
  SALAF = new Map(Object.entries(d.salaf || {}).map(([id, [ar, dd, tr, trs]]) => [id, { id, ar, tr: tr || ar, trs: trs || tr || ar, d: dd, salaf: true,
    get name() { return LANG === "tr" ? this.tr : this.ar; } }]));
  KATKI = kt.items || []; ktCounts(KATKI);
  window.addEventListener("hashchange", route);
  kenarlar();
  setupA11y();
  setupTheme();
  setupLang();
  setupSearch($("#q"));
  route();
}
const shardOf = id => { const d = id.replace(/\D/g, ""); return d ? (+d % 64) : 0; };
async function person(id) {
  const s = await load(`p/${String(shardOf(id)).padStart(2, "0")}.json`);
  return s[id] && ktPerson(id, s[id]);
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
  const tab = v === "asir" ? "net" : v || "home";
  document.querySelectorAll("nav.tabs a").forEach(a => { const on = a.dataset.v === tab; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
  document.body.classList.toggle("home", !v);
  document.title = UI.brand[LANG === "ar" ? 0 : 1];
  view.setAttribute("aria-busy", "true");
  view.innerHTML = `<p class="empty">${T("جارٍ التحميل…", "Yükleniyor…")}</p>`;
  try {
    if (v === "p") await viewPerson(view, decodeURIComponent(arg));
    else if (v === "net") await viewNet(view, decodeURIComponent(arg));
    else if (v === "asir") await viewNet(view, decodeURIComponent(arg), "cols");
    else if (v === "zaman") await viewTime(view, decodeURIComponent(arg));
    else if (v === "kitap") await viewBooks(view, decodeURIComponent(arg));
    else if (v === "map") await viewMap(view, decodeURIComponent(arg));
    else if (v === "about") viewAbout(view);
    else if (v === "yonetim") await viewAdmin(view);
    else if (v === "c") await viewList(view, "c", +arg);
    else if (v === "b") await viewList(view, "b", decodeURIComponent(arg));
    else if (v === "search") await viewSearch(view);
    else await viewHome(view);
  } catch (e) {
    view.innerHTML = `<p class="empty">${T("تعذّر التحميل", "Yüklenemedi")} (${esc(e.message)}).</p>`;
  }
  view.removeAttribute("aria-busy");
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
    if (/^#\/(net|asir|zaman|kitap)(\/|$)/.test(location.hash) && !/^#\/net\/./.test(location.hash)) route();   // tuval renkleri yeniden çizilsin
  }));
  mark();
}

// ---------- dil ----------
const UI = {   // index.html'deki sabit metinler (data-i18n)
  brand: ["طبقات الحنفية", "Hanefî Tabakātı"], home: ["الرئيسة", "Ana sayfa"], net: ["السلسلة", "Silsile"], map: ["الخريطة", "Harita"],
  time: ["الزمن", "Zaman"], books: ["الكتب", "Kitaplar"], search: ["البحث المفصّل", "Detaylı arama"], about: ["عن المشروع", "Proje hakkında"], q: ["ابحث عن عَلَم…", "Âlim ara…"],
  fabout: ["فهرس موحّد لتراجم الحنفية من ثمانية من كتب الطبقات، بمواضعها في الكتب، وشيوخ كل عَلَم وتلاميذه، والبلدان التي ارتبط بها.",
    "Sekiz tabakāt kitabındaki Hanefî biyografilerinin birleşik dizini: her âlimin kitaplardaki yerleri, hocaları, talebeleri ve bağlı olduğu şehirler."],
  links: ["روابط", "Bağlantılar"], fnet: ["سلسلة الشيوخ والتلاميذ", "Hoca–talebe silsilesi"], fmap: ["خريطة البلدان", "Şehirler haritası"],
  fabout2: ["عن المشروع والمصادر", "Proje ve kaynaklar"], open: ["المصادر المفتوحة", "Açık kaynaklar"],
  coords: ["الإحداثيات والطرق: مشروع الثريا (CC BY 4.0)", "Koordinatlar ve yollar: al-Thurayya (CC BY 4.0)"], maps: ["الخرائط: Natural Earth", "Haritalar: Natural Earth"],
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
// kapak zemini: sekiz köşeli yıldız ve haçtan örülü geometrik desen (sitenin amblemiyle aynı yıldız),
// ince altın çizgi; ortada bir şemse. Aşağı doğru solar.
function zemin() {
  const sq = (x, y, r, rot) => { const p = [0, 1, 2, 3].map(k => { const a = Math.PI / 2 * k + rot; return `${(x + r * Math.cos(a)).toFixed(2)},${(y + r * Math.sin(a)).toFixed(2)}`; }); return `<polygon points="${p.join(" ")}"/>`; };
  const star = (x, y, r) => sq(x, y, r, Math.PI / 4) + sq(x, y, r, 0);
  // 60×60'lık karo: köşelerde ve ortada yıldız; aralarda haç biçimli boşluklar kalır
  const tile = [[0, 0], [60, 0], [0, 60], [60, 60], [30, 30]].map(([x, y]) => star(x, y, 17) + `<circle cx="${x}" cy="${y}" r="4.2"/>`).join("")
    + `<path d="M30 30 0 0M30 30 60 0M30 30 0 60M30 30 60 60" opacity=".45"/>`;
  const rays = Array.from({ length: 32 }, (_, i) => { const a = Math.PI / 16 * i, r1 = 92, r2 = i % 2 ? 128 : 150;
    return `<path d="M${(600 + r1 * Math.cos(a)).toFixed(1)} ${(250 + r1 * Math.sin(a)).toFixed(1)}L${(600 + r2 * Math.cos(a)).toFixed(1)} ${(250 + r2 * Math.sin(a)).toFixed(1)}"/>`; }).join("");
  return `<svg class="zemin" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id="girih" width="60" height="60" patternUnits="userSpaceOnUse"><g fill="none" stroke="var(--gold)" stroke-width=".9">${tile}</g></pattern>
      <radialGradient id="zfade" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="var(--bg)" stop-opacity=".92"/><stop offset=".55" stop-color="var(--bg)" stop-opacity=".35"/><stop offset="1" stop-color="var(--bg)" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="520" fill="url(#girih)"/>
    <rect width="1200" height="520" fill="url(#zfade)"/>
    <g fill="none" stroke="var(--gold)" stroke-width="1.1" opacity=".55"><circle cx="600" cy="250" r="160"/><circle cx="600" cy="250" r="86"/>${rays}${star(600, 250, 70)}</g></svg>`;
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

// ---------- kenar tezyinatı: örgü (iki iç içe şerit) ve lale-rûmî, sayfanın iki yan boşluğunda ----------
function kenarlar() {
  const W = 60, H = 300, cx = 30;
  // örgü: iki sinüs şerit; kesişmelerde bir alttan bir üstten geçer (zemin renginde hâle)
  const strand = (y0, y1, sgn, from = y0, to = y1) => { const p = []; for (let y = from; y <= to + .01; y += 1.5) p.push(`${(cx + sgn * 13 * Math.sin((y - y0) / (y1 - y0) * Math.PI * 4)).toFixed(1)},${y.toFixed(1)}`); return p.join(" "); };
  const braid = (y0, y1, col) => {
    const halo = pts => `<polyline points="${pts}" fill="none" stroke="var(--bg)" stroke-width="7" stroke-linecap="round"/>`;
    const line = pts => `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`;
    const a = strand(y0, y1, 1), b = strand(y0, y1, -1), q = (y1 - y0) / 4;
    const over = [1, 3].map(k => strand(y0, y1, -1, y0 + k * q - 6, y0 + k * q + 6));   // B üstten geçer
    return halo(b) + line(b) + halo(a) + line(a) + over.map(o => halo(o) + line(o)).join("")
      + `<ellipse cx="${cx}" cy="${y0}" rx="3" ry="3" fill="${col}"/><ellipse cx="${cx}" cy="${y1}" rx="3" ry="3" fill="${col}"/>`;
  };
  const half = `<path d="M29 205C20 212 9 208 6 197C12 201 19 200 23 192C25 199 27 202 29 205Z" fill="var(--teal)"/>
    <path d="M28.5 199C22 197 18.5 189 21.5 182C23.5 188 26.5 189.5 29 187.5Z" fill="var(--rubric)"/>`;
  const lale = `<path d="M30 152C37 166 39 180 30 198C21 180 23 166 30 152Z" fill="var(--teal)"/>${half}
    <g transform="translate(60 0) scale(-1 1)">${half}</g><path d="M30 206C34 213 34 221 30 230C26 221 26 213 30 206Z" fill="var(--teal)" opacity=".8"/>`;
  const tile = `<line x1="${cx}" x2="${cx}" y1="0" y2="${H}" stroke="var(--teal)" stroke-width=".8" opacity=".6"/>
    ${braid(28, 118, "var(--teal)")}${lale}<rect x="${cx - 4}" y="238" width="8" height="8" transform="rotate(45 ${cx} 242)" fill="var(--gold)"/>`;
  ["s", "e"].forEach(side => {
    const d = document.createElement("div"); d.className = `kenar ${side}`; d.setAttribute("aria-hidden", "true");
    d.innerHTML = `<svg width="${W}" height="100%"><defs><pattern id="kn-${side}" width="${W}" height="${H}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="${W}" height="100%" fill="url(#kn-${side})"/></svg>`;
    document.body.prepend(d);
  });
}

// ---------- erişilebilirlik, kısayollar, paylaşım ----------
function toast(msg) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.append(t); }
  t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2200);
}
const LINK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const shareBtn = () => `<button type="button" class="btn icon" data-share title="${T("نسخ رابط هذه الصفحة", "Bu görünümün bağlantısını kopyala")}" aria-label="${T("نسخ الرابط", "Bağlantıyı kopyala")}">${LINK_ICON}</button>`;
document.addEventListener("click", e => {
  if (!e.target.closest("[data-share]")) return;
  const url = location.href, ok = () => toast(T("نُسخ الرابط", "Bağlantı kopyalandı"));
  const fallback = () => { const i = document.createElement("input"); i.value = url; document.body.append(i); i.select();
    try { document.execCommand("copy") ? ok() : toast(url); } catch (x) { toast(url); } i.remove(); };
  try { navigator.clipboard.writeText(url).then(ok, fallback); } catch (x) { fallback(); }
});
const SHORTCUTS = () => [["/", T("البحث", "Arama kutusuna git")], ["?", T("هذه القائمة", "Bu yardım")], ["Esc", T("إغلاق / خروج من ملء الشاشة", "Kapat / büyük ekrandan çık")],
  ["← →", T("في الزمن: العَلَم السابق واللاحق", "Zaman haritasında: önceki / sonraki âlim")], ["+ −", T("في الزمن والخريطة: تكبير وتصغير", "Zaman ve haritada: yakınlaştır / uzaklaştır")],
  ["g h · g s · g z · g m", T("الرئيسة · السلسلة · الزمن · الخريطة", "Ana sayfa · Silsile · Zaman · Harita")]];
function helpBox() {
  if ($(".keyhelp")) return;
  const d = document.createElement("div"); d.className = "expbox keyhelp"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", T("اختصارات لوحة المفاتيح", "Klavye kısayolları"));
  d.innerHTML = `<div class="in"><div class="hd"><b>${T("اختصارات لوحة المفاتيح", "Klavye kısayolları")}</b><span class="grow"></span><button type="button" class="btn">${T("إغلاق", "Kapat")}</button></div>
    <dl>${SHORTCUTS().map(([k, v]) => `<div><dt>${k.split(" ").map(x => x === "·" ? " · " : `<kbd>${esc(x)}</kbd>`).join("")}</dt><dd>${v}</dd></div>`).join("")}</dl></div>`;
  const close = () => { d.remove(); document.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  d.addEventListener("click", e => { if (e.target === d || e.target.matches("button")) close(); });
  document.addEventListener("keydown", key, true);
  (document.fullscreenElement || document.body).append(d); $("button", d).focus();
}
function setupA11y() {
  // içeriğe atla (klavye kullanıcıları için ilk odak)
  const sk = document.createElement("button"); sk.type = "button"; sk.className = "skip"; sk.textContent = T("انتقل إلى المحتوى", "İçeriğe geç");
  sk.addEventListener("click", () => { const v = $("#view"); v.tabIndex = -1; v.focus(); });
  document.body.prepend(sk);
  let g = 0;
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.key === "/") { const q = [...document.querySelectorAll(".lsearch input, #hq, #q")].find(x => x.offsetParent); if (q) { e.preventDefault(); q.focus(); } }
    else if (e.key === "?" || e.key === "؟") { e.preventDefault(); helpBox(); }
    else if (e.key === "g") g = Date.now();
    else if (Date.now() - g < 900 && { h: 1, s: 1, z: 1, m: 1 }[e.key]) { location.hash = { h: "#/", s: "#/net/jws1", z: "#/zaman", m: "#/map" }[e.key]; g = 0; }
  });
}

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
  const bk = new Set(Object.entries(BOOKS).map(([id, b]) => b.cite_tr_s || id)).size;   // el-Gurefü’l-aliyye’nin iki cildi tek kitap
  view.innerHTML = `
    <section class="hero" style="margin:0">${zemin()}<div class="inner">
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
    return /[\u0600-\u06ff]/.test(snip) ? `<p><span lang="ar" dir="rtl">…${s}…</span><cite>${evCite(cite)}</cite></p>`
      : `<p><span lang="tr" dir="ltr">${s}</span><cite>${esc(cite)}</cite></p>`;   // Türkçe kaynaktan elle eklenen bağ
  }).join("");
  return `<li class="rrow${r.weak ? " weak" : ""}${p.salaf ? " salaf" : ""}">
      <div class="rtop">${plink(r.id, "nm")} <span class="d num">${deathTxt(p)}</span></div>
      <span class="rtags">${p.salaf ? `<span class="tag weak">${T("من السلف", "selef")}</span>` : ""}${r.rels.map(x => `<span class="tag">${REL[x] || esc(x)}</span>`).join("")}
        ${r.user ? `<span class="tag user" title="${T("أضيفت باقتراح قارئ بعد المراجعة", "Okur önerisiyle, incelenerek eklendi")}">${T("إضافة", "katkı")}</span>` : ""}
        ${r.weak ? `<span class="tag weak" title="${T("ربط بالنسبة أو الشهرة وحدها", "Yalnız nisbe ya da şöhretle eşleştirildi")}">${T("ترجيح", "tercih")}</span>` : ""}
        ${r.n > 1 ? `<span class="d num">${AR(r.n)} ${T("مواضع", "atıf")}</span>` : ""}</span>
      ${!p.salaf && P.has(r.id) && (P.get(r.id).nt || P.get(r.id).ns) ? `<a class="silsile-lnk" href="#/net/${esc(r.id)}">${T("سلسلته", "silsilesi")}</a>` : `<span class="silsile-lnk"></span>`}
      <details class="ev"><summary>${T("الشاهد", "Kanıt")}</summary>${ev}</details></li>`;
}
// kanıtlardaki kaynak metni ("الجواهر المضية 3/122 (رقم 1270)") → İSNAD kısa atıf
const evCite = cite => { const pre = String(cite).replace(/\s*[\d٠-٩].*$/, ""); const b = pre && Object.entries(BOOKS).find(([, v]) => v.title.startsWith(pre));
  return b ? isnadHtml(b[0], cite, true) : esc(LANG === "tr" ? citeTr(cite) : cite); };

async function viewPerson(view, id) {
  if (SALAF.has(id)) { location.replace(`#/net/${id}`); return; }
  const p = P.get(id), d = await person(id);
  if (!p || !d) { view.innerHTML = `<p class="empty">${T("لا يوجد هذا العلم.", "Böyle bir âlim yok.")}</p>`; return; }
  document.title = `${p.name} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
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
        ${p.d ? `<a class="btn" href="#/zaman/${id}">${T("في خريطة الزمن", "Zaman haritasında")}</a>` : ""}
        ${d.places.length ? `<a class="btn" href="#/map/@${id}">${T("بلدانه على الخريطة", "Haritada yerleri")}</a>` : ""}
        <button type="button" class="btn" data-go="texts">${T("نصوص الترجمة", "Biyografi metinleri")}</button>
        <button type="button" class="btn" id="ktbtn">${T("اقتراح أو تصحيح", "Katkı / düzeltme")}</button>${shareBtn()}</div>
    </div>
    <div class="pgrid">
      <div class="relcard">
        <section><h2>${T("شيوخه", "Hocaları")}<span class="c num">${AR(d.teachers.length)}</span></h2>
          ${d.teachers.length ? `<ul class="rlist">${d.teachers.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">${T("لم يُذكر له شيخ من المترجمين.", "Biyografisi bulunanlardan bir hocası zikredilmemiş.")}</p>`}
          ${extT.length ? `<h3>${T("شيوخ من غير المترجمين في هذه الكتب", "Bu kitaplarda biyografisi olmayan hocaları")}</h3><ul class="rel">${extList(extT)}</ul>` : ""}
        </section>
        <section><h2>${T("تلاميذه", "Talebeleri")}<span class="c num">${AR(d.students.length)}</span></h2>
          ${d.students.length ? `<ul class="rlist">${d.students.map(r => relItem(r)).join("")}</ul>` : `<p class="empty">${T("لم يُذكر له تلميذ من المترجمين.", "Biyografisi bulunanlardan bir talebesi zikredilmemiş.")}</p>`}
          ${extS.length ? `<h3>${T("رواة عنه من غير المترجمين", "Ondan rivayet eden diğerleri")}</h3><ul class="rel">${extList(extS)}</ul>` : ""}
        </section>
      </div>
      <section id="psec" class="pmapcol"><h2>${T("البلدان", "Şehirler")}<span class="c num">${AR(new Set(d.places.map(x => x[0])).size)}</span>
          ${d.places.length ? `<a class="btn small" href="#/map/@${id}">${T("الخريطة الكبيرة", "Büyük harita")}</a>` : ""}</h2>
        ${d.places.length ? `<div class="mapwrap" id="pmap"></div><ul class="places" id="plist"></ul>`
          : `<p class="empty">${T("لم يُستخرج له بلد.", "Şehir tespit edilemedi.")}</p>`}
      </section>
    </div>
    <section id="works" hidden></section>
    ${p.nt || p.ns ? `<section id="pnetsec"><h2>${T("شبكة صلاته", "İlişki ağı")}<a class="btn small" href="#/net/${id}">${T("في السلسلة", "Silsilede aç")}</a></h2><div id="pnet"></div></section>` : ""}
    <section id="texts"><h2>${T("نصوص الترجمة", "Biyografi metinleri")}<span class="c num">${AR(d.sources.length)}</span>
        ${d.sources.length > 1 ? `<button type="button" class="btn small" id="openall">${T("فتح الكل", "Tümünü aç")}</button>` : ""}</h2>
      <div class="tchips">${d.sources.map(([b, cite], k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="false">${esc(BOOKS[b]?.cite_tr ? (LANG === "tr" ? BOOKS[b].cite_tr_s : BOOKS[b].cite_ar_s).split(/[,،] /).slice(1).join(", ") : cite.replace(/\s*[\d٠-٩].*$/, ""))}<span class="num"> ${esc(citeTail(cite))}</span></button>`).join("")}</div>
      <div class="tframes">${d.sources.map(([b, cite, h], k) => `<article class="tframe" data-k="${k}" hidden>
        <header><div><b class="isnad">${isnadHtml(b, cite)}</b>
          <span class="ct" lang="ar" dir="rtl">${esc(h)}</span></div><button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button></header>
        <div class="body" lang="ar" dir="rtl"><p class="empty">${T("جارٍ التحميل…", "Yükleniyor…")}</p></div></article>`).join("")}</div>
    </section>`;
  setupTexts(id, d);
  $("#ktbtn").onclick = () => katkiBox(id, d);
  bookNet().then(N => { const sec = $("#works"); if (!sec || !location.hash.startsWith(`#/p/${id}`)) return;
    const ws = N.works.filter(w => w.a === id).sort((a, b) => WK_ORDER.indexOf(wkind(a.k)) - WK_ORDER.indexOf(wkind(b.k)));
    if (!ws.length) return;
    const srcs = [...new Set(ws.flatMap(w => w.s || []))].map(i => N.cites[i]);
    sec.innerHTML = `<h2>${T("مؤلفاته", "Eserleri")}<span class="c num">${AR(ws.length)}</span><a class="btn small" href="#/kitap">${T("شبكة الكتب", "Kitap ağı")}</a></h2>
      <ul class="works">${ws.map(w => { const base = w.b && N.byId.get(w.b), kids = (N.kids.get(w.id) || []).length;
        return `<li><span class="wk k-${wkind(w.k)}">${wkName(w.k)}</span> <a href="#/kitap/${esc(w.id)}">${esc(wTitle(w))}</a>${base && base.a !== id ? ` <span class="d">← ${esc(wTitle(base))}</span>` : ""}${kids ? ` <span class="d num">(${AR(kids)} ${T("عمل عليه", "şerh/hâşiye")})</span>` : ""}</li>`; }).join("")}</ul>
      <p class="legend">${T("المصادر", "Kaynak")}: ${srcs.slice(0, 6).map(esc).join(" · ")}${srcs.length > 6 ? " …" : ""}</p>`;
    sec.hidden = false; }).catch(() => {});
  if (p.nt || p.ns) graph().then(g => { const i = g.byId.get(id), host = $("#pnet");
    if (i !== undefined && host && location.hash.startsWith(`#/p/${id}`)) egoNet(host, g, i, 1, false); }).catch(() => {});
  if (!d.places.length) return;
  const PL = await placesById();
  $("#plist").innerHTML = KIND_ORDER.filter(k => byKind[k]).map(k => `<li><span class="k">${KIND[k]}</span>
    ${[...new Map(byKind[k].map(x => [x[0], x])).values()].map(([pl, cite]) =>
      `<a href="#/map/${encodeURIComponent(pl)}" title="${esc(cite)}">${esc(plName(PL.get(pl)) || pl)}</a>`).join(T("، ", ", "))}</li>`).join("");
  const uniq = [...new Set(d.places.map(x => x[0]))].map(id => PL.get(id)).filter(Boolean);
  const m = await makeMap($("#pmap"), { mini: true });
  m.draw(uniq.map(pl => ({ pl, r: 5, label: true })), { route: placeSeq(d.places, PL) });
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
    try {
      const all = await texts(id), k = +el.dataset.k, cite = d.sources[k][1];
      const t = all.find(x => x.cite === cite) || all[k];
      $(".body", el).innerHTML = t ? renderEntry(t) : `<p class="empty">${T("لا يوجد نص.", "Metin yok.")}</p>`;
    } catch (e) {   // yükleme hatası: bir sonraki açılışta yeniden denenir
      delete el.dataset.done;
      $(".body", el).innerHTML = `<p class="empty">${T("تعذّر تحميل النص، أعد المحاولة.", "Metin yüklenemedi; yeniden deneyin.")}</p>`;
    }
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
// kısa alıntı (t.short): tam metin telifli neşirdedir; okur cilt ve sayfasına yönlendirilir
function renderEntry(t) {
  return `<div class="etitle">${esc(t.heading)}</div><div class="etext">${renderBlocks(t.text)}</div>${t.short ? `<p class="tnote"${LANG === "tr" ? ` lang="tr" dir="ltr"` : ""}>${T("مقتطف من أول الترجمة. النص الكامل في", "Maddenin başından kısa alıntıdır. Tam metin için:")} ${evCite(t.cite)}</p>` : ""}`;
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

// Harita ve ağ için yerel arama kutusu: find(q) → [{id, html}], pick(id)
function localSearch(ph, find, pick) {
  const box = document.createElement("div"); box.className = "search lsearch";
  box.innerHTML = `<input type="search" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"><div class="results" hidden></div>`;
  const q = $("input", box), res = $(".results", box); let cur = -1, list = [];
  const show = () => { list = q.value.trim() ? find(q.value.trim()) : []; cur = list.length ? 0 : -1;
    res.innerHTML = list.map((r, k) => `<a href="#" data-k="${k}"${k === cur ? ` class="sel"` : ""}>${r.html}</a>`).join("")
      || (q.value.trim() ? `<p class="none">${T("لا نتائج", "Sonuç yok")}</p>` : "");
    res.hidden = !q.value.trim(); };
  const choose = k => { const r = list[k]; if (!r) return; res.hidden = true;
    q.value = res.querySelector(`[data-k="${k}"] span`)?.textContent || q.value; q.blur(); pick(r.id); };
  q.addEventListener("input", show);
  q.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!list.length) return;
      cur = (cur + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length;
      res.querySelectorAll("a").forEach((a, k) => a.classList.toggle("sel", k === cur)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(Math.max(0, cur)); }
    else if (e.key === "Escape") res.hidden = true; });
  res.addEventListener("pointerdown", e => e.preventDefault());
  res.addEventListener("click", e => { const a = e.target.closest("[data-k]"); if (a) { e.preventDefault(); choose(+a.dataset.k); } });
  q.addEventListener("blur", () => setTimeout(() => { res.hidden = true; }, 150));
  q.addEventListener("focus", () => q.value.trim() && show());
  return box;
}
// şehir penceresinde el-Süreyyâ künyesi ve Yâkût / Himyerî / Sem‘ânî'den kısa alıntı
const INFO_SRC = { yaqut: ["ياقوت، معجم البلدان", "Yâkūt, Mu‘cemü’l-büldân"], himyari: ["الحميري، الروض المعطار", "Himyerî, er-Ravzü’l-mi‘târ"],
  samani: ["السمعاني، الأنساب", "Sem‘ânî, el-Ensâb"] };
function placeInfo(pl) {
  // el-Esmârü’l-ceniyye'nin nisbe sözlüğünden bu yere bağlanan nisbeler
  const ns = (pl.nisba || []).map(x => `<div class="pnisba"><blockquote lang="ar" dir="rtl" title="${T("اضغط للمزيد", "Tamamı için tıklayın")}"><b>${esc(x.n)}</b> ${esc(x.text)}</blockquote>
    <p class="pcite">${T(`القاري، الأثمار الجنية ${AR(x.page)}`, `Aliyyülkārî, <i>el-Esmârü’l-ceniyye</i>, ${x.page}.`)}</p></div>`).join("");
  const f = pl.info; if (!f) return ns ? `<div class="pinfo">${ns}</div>` : "";
  const meta = [T(f.type_ar, f.type_tr), T(f.region_ar, f.region_tr)].filter(Boolean).map(esc);
  if (f.translit) meta.push(`<i>${esc(f.translit)}</i>`);
  const src = f.src ? INFO_SRC[f.src] : null, pg = f.page ? (LANG === "tr" ? f.page : AR(f.page)) : "";
  const cite = src ? (LANG === "tr" ? `${src[1].replace(/, (.*)$/, ", <i>$1</i>")}${pg ? `, ${pg}` : ""}.` : `${src[0]}${pg ? ` ${pg}` : ""}`) : "";
  const thur = /^[A-Z]/.test(pl.id) ? `<a href="https://github.com/althurayya/althurayya.github.io/blob/master/places/${encodeURIComponent(pl.id)}.geojson" target="_blank" rel="noopener">${T("الثريا", "el-Süreyyâ")}</a>` : "";
  return `<div class="pinfo">${meta.length ? `<p class="pmeta">${meta.join(" · ")}</p>` : ""}
    ${f.text ? `<blockquote lang="ar" dir="rtl" title="${T("اضغط للمزيد", "Tamamı için tıklayın")}">${esc(f.text)}</blockquote>` : ""}
    ${cite || thur ? `<p class="pcite">${cite}${cite && thur ? " · " : ""}${thur}</p>` : ""}${ns}</div>`;
}

// ---------- map ----------
let PLACES_BY_ID;
async function placesById() {
  if (!PLACES_BY_ID) PLACES_BY_ID = new Map((await load("places.json")).map(p => [p.id, p]));
  return PLACES_BY_ID;
}
// güzergâh: nisbe/asıl/doğum → … → vefat/defin (bölge kayıtları hariç); pipeline'daki place_seq ile aynı
function placeSeq(items, PL) {
  const seq = [];
  KIND_ORDER.forEach(k => items.forEach(([pl, kk]) => { const x = PL.get(pl); if (kk === k && x && x.type !== "regions" && seq[seq.length - 1] !== x) seq.push(x); }));
  return seq;
}
// el-Süreyyâ yol ağı (pipeline: geo/roads.py): e = güzergâh noktaları (×100), r = "A|B" → işaretli kenarlar
let ROADS;
const roads = async () => ROADS || (ROADS = await load("roads.json").catch(() => ({ e: [], r: {} })));
const edgePts = (R, sid) => { const f = R.e[Math.abs(sid) - 1] || [], pts = []; for (let i = 0; i + 1 < f.length; i += 2) pts.push([f[i] / 100, f[i + 1] / 100]); return sid < 0 ? pts.reverse() : pts; };
function roadLine(R, a, b) {
  let sids = R.r[`${a.id}|${b.id}`];
  if (!sids && R.r[`${b.id}|${a.id}`]) sids = R.r[`${b.id}|${a.id}`].slice().reverse().map(x => -x);
  if (!sids) return null;
  const out = [[a.lon, a.lat]]; sids.forEach(sid => out.push(...edgePts(R, sid))); out.push([b.lon, b.lat]);
  return out;
}
const BB = { lon0: 22, lat1: 50, k: 20, c: Math.cos(35 * Math.PI / 180) };
const proj = (lon, lat) => [(lon - BB.lon0) * BB.c * BB.k, (BB.lat1 - lat) * BB.k];

async function makeMap(host, opt = {}) {
  const [base, R] = await Promise.all([load("basemap.json"), roads()]);
  const W = base.width, H = base.height;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${T("خريطة", "Harita")}">
      <rect x="-5000" y="-5000" width="12000" height="12000" fill="var(--water)"/>
      <path class="land" d="${base.land}"/><path class="lake" d="${base.lakes}"/><path class="river" d="${base.rivers}"/>
      <g class="regs"></g><g class="roadnet" hidden></g><g class="routes"></g><g class="pts"></g><g class="labs"></g></svg>
    <div class="zoom"><button type="button" data-z="1.5" aria-label="${T("تكبير", "Yakınlaştır")}">+</button><button type="button" data-z="0.667" aria-label="${T("تصغير", "Uzaklaştır")}">−</button></div>`;
  const svg = $("svg", host);
  let vb = { x: 0, y: 0, w: W, h: H }, items = [], onPick = opt.onPick, lastS = 0, dirty = true;
  /* Şehir adları: hepsi yazılır, büyüklüğü kayıt sayısına göre. Çok kayıtlı olandan başlayarak her ad
     noktanın üstüne, sağına, soluna ya da altına, önceki adlara değmeyen ilk yere konur; hiçbirine
     sığmayan ad bu yakınlıkta gizlenir ve yakınlaştırınca açılır. Bölge adları en son, boş kalan yerlere. */
  const layLabels = s => {
    const kept = [], pad = 2 * s;
    const free = b => !kept.some(k => b[0] < k[2] + pad && k[0] < b[2] + pad && b[1] < k[3] && k[1] < b[3]);
    svg.querySelectorAll(".plab").forEach(t => {
      const f = +t.dataset.f; t.setAttribute("font-size", f * s); t.style.strokeWidth = 3 * s;
      if (!t.dataset.w) { t.style.display = ""; try { const b = t.getBBox(); t.dataset.w = b.width / f / s; t.dataset.h = b.height / f / s; } catch (e) { return; } }
      const x = +t.dataset.x, y = +t.dataset.y, r = +t.dataset.r * s, w = t.dataset.w * f * s, h = t.dataset.h * f * s * .8, g = 2.5 * s;
      if (![x, y, r, w, h].every(Number.isFinite)) return;   // gizli/ölçülemeyen etiket
      const at = [[x, y - r - g - h / 2], [x + r + g + w / 2, y], [x - r - g - w / 2, y], [x, y + r + g + h / 2]]
        .map(([cx, cy]) => [cx, cy, [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]]).find(c => free(c[2]));
      if (!at) { t.style.display = "none"; return; }
      t.style.display = ""; t.setAttribute("x", at[0].toFixed(2)); t.setAttribute("y", at[1].toFixed(2)); kept.push(at[2]);
    });
    svg.querySelectorAll(".rlab").forEach(t => {
      t.setAttribute("font-size", 19 * s); t.setAttribute("letter-spacing", LANG === "tr" ? 3 * s : 0);
      t.style.display = ""; let b; try { b = t.getBBox(); } catch (e) { return; }
      const bb = [b.x, b.y, b.x + b.width, b.y + b.height];
      if (free(bb)) kept.push(bb); else t.style.display = "none";
    });
  };
  const scale = () => vb.w / (svg.clientWidth || 800);
  const apply = () => {
    svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const s = scale();
    svg.querySelectorAll(".pt").forEach(c => { c.setAttribute("r", c.dataset.r * s); c.style.strokeWidth = .8 * s;
      if (c.classList.contains("reg")) c.style.strokeDasharray = `${3 * s} ${2 * s}`; });
    if (s !== lastS || dirty) { lastS = s; dirty = false; layLabels(s); }
    svg.querySelectorAll(".route").forEach(r => { r.style.strokeWidth = (r.classList.contains("road") ? 2.4 : 2) * s; r.style.strokeDasharray = r.classList.contains("road") ? "none" : `${5 * s} ${4 * s}`; });
    const rn = svg.querySelector(".roadnet path"); if (rn) rn.style.strokeWidth = .9 * s;
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
      labs.innerHTML = list.filter(x => x.label).sort((a, b) => b.label - a.label).map(({ pl, r, label }) => { const [x, y] = proj(pl.lon, pl.lat), f = label === true ? 13 : +label || 13;   // true: sabit boy (kişi sayfası)
        return `<text class="plab${f >= 15 ? " major" : f < 11 ? " minor" : ""}${pl.id === o.hot ? " hot" : ""}" data-f="${f}" data-x="${x.toFixed(1)}" data-y="${y.toFixed(1)}" data-r="${r}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="central">${esc(plName(pl).replace(/ \(.*\)$/, ""))}</text>`; }).join("");
      dirty = true;
      // güzergâh: yol ağı üzerinden (bulunamazsa düz, kesikli); her ayak ayrı çizgi, uçta küçük ok
      const P2 = pts => "M" + pts.map(([lo, la]) => proj(lo, la).map(v => v.toFixed(1)).join(" ")).join("L");
      routes.innerHTML = (o.route || []).slice(1).map((b, k) => { const a = o.route[k], line = roadLine(R, a, b);
        return `<path class="route${line ? " road" : ""}" d="${P2(line || [[a.lon, a.lat], [b.lon, b.lat]])}"><title>${esc(plName(a))} → ${esc(plName(b))}</title></path>`; }).join("");
      apply();
    },
    focus(pl, w = 160) {   // bir şehre yakınlaş
      const [x, y] = proj(pl.lon, pl.lat), ar = (svg.clientWidth || 400) / (svg.clientHeight || 300);
      vb = { x: x - w / 2, y: y - w / ar / 2, w, h: w / ar }; apply();
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
    roadnet(on) {   // Mukaddesî yol ağı (soluk)
      const g = svg.querySelector(".roadnet");
      if (on && !g.innerHTML) g.innerHTML = `<path d="${R.e.map((_, i) => "M" + edgePts(R, i + 1).map(([lo, la]) => proj(lo, la).map(v => v.toFixed(1)).join(" ")).join("L")).join("")}"/>`;
      g.hidden = !on; apply();
    },
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
const ROAD_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20c3-4 3-7 1-10s0-6 3-6M20 20c-3-4-3-7-1-10s0-6-3-6M12 5v2M12 11v2M12 17v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
let SHOW_ROADS = false;
async function viewMap(view, sel) {
  const places = await load("places.json");
  const PL = await placesById();
  const cents = new Set(), kinds = new Set(KIND_ORDER);
  view.innerHTML = `<h1>${T("خريطة البلدان", "Şehirler haritası")}</h1>
    <p class="lede">${T("كل دائرة بلد ورد في التراجم؛ حجمها على عدد الأعلام المرتبطين به بحسب القرن ونوع الصلة المختارين. اضغط على بلد لترى فقهاءه، أو ابحث عن عَلَم لترى بلدانه وطريقه.",
      "Her daire biyografilerde geçen bir şehirdir; büyüklüğü, seçilen yüzyıl ve bağ türüne göre o şehirle ilişkili âlim sayısını gösterir. Fakihlerini görmek için bir şehre tıklayın ya da bir âlim arayıp şehirlerini ve güzergâhını görün.")}</p>
    <div class="stage" id="mstage">
    <div class="stagebar"><span id="msearch"></span><span class="grow"></span>
      <button type="button" class="btn icon${SHOW_ROADS ? " on" : ""}" id="rdbtn" aria-pressed="${SHOW_ROADS}" title="${T("طرق المقدسي (مشروع الثريا)", "Mukaddesî yol ağı (el-Süreyyâ)")}" aria-label="${T("إظهار الطرق", "Yolları göster")}">${ROAD_ICON}</button>
      ${shareBtn()}${fsButton()}</div>
    <div class="filters mini" id="fk" role="group" aria-label="${T("نوع الصلة", "Bağ türü")}"><span class="label">${T("الصلة", "Bağ")}</span>${KIND_ORDER.map(k => `<button type="button" class="btn on" data-k="${k}" aria-pressed="true">${KIND[k]}</button>`).join("")}</div>
    <div class="filters mini num" id="fc" role="group" aria-label="${T("قرن الوفاة", "Vefat yüzyılı")}"><span class="label">${T("القرن", "Yüzyıl")}</span>${[...Array(14)].map((_, i) => `<button type="button" class="btn" data-c="${i + 1}" aria-pressed="false" title="${esc(centName(i + 1))}">${LANG === "tr" ? ROM(i + 1) : AR(i + 1)}</button>`).join("")}
      <button type="button" class="btn" data-c="all">${T("الكل", "Tümü")}</button></div>
    <div class="mapwrap big" id="bigmap"></div></div>
    <p class="legend">${T("الطرق: شبكة المقدسي من مشروع الثريا (CC BY 4.0).", "Yollar: Mukaddesî’nin yol ağı, el-Süreyyâ projesinden (CC BY 4.0).")}</p>`;
  const wrap = $("#bigmap");
  const m = await makeMap(wrap);
  m.regions(REGIONS);
  m.roadnet(SHOW_ROADS);
  const pop = document.createElement("div"); pop.className = "mpop"; pop.hidden = true; wrap.append(pop);
  const match = (pid, k) => kinds.has(k) && (!cents.size || cents.has(century(P.get(pid)?.d)));
  let current = "", who_ = null, at = null;   // current: şehir; who_: seçili âlim {id, d}
  if (sel && sel[0] === "@" && P.has(sel.slice(1))) who_ = { id: sel.slice(1) }; else if (sel && PL.get(sel)) current = sel;
  const setHash = h => history.replaceState(null, "", h);
  // yüzen pencere: şehre tıklanan noktanın yanında, harita içinde kalacak şekilde
  const place = () => {
    if (pop.hidden) return;
    const pl = PL.get(current);
    const [x, y] = at || (pl ? m.toScreen(pl) : [16, 16]), W = wrap.clientWidth, H = wrap.clientHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = x + 16, top = y - 30;
    if (left + pw > W - 8) left = x - pw - 16;
    left = Math.max(8, Math.min(left, W - pw - 8)); top = Math.max(8, Math.min(top, H - ph - 8));
    pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  };
  const closeBtn = () => $(".x", pop).addEventListener("click", () => { current = ""; who_ = null; at = null; setHash("#/map"); redraw(); });
  const side = () => {
    if (who_) return personPop();
    const pl = PL.get(current);
    if (!pl) { pop.hidden = true; return; }
    const rows = new Map();
    pl.people.forEach(([pid, k]) => { if (match(pid, k)) { const r = rows.get(pid) || []; r.push(k); rows.set(pid, r); } });
    const list = [...rows.entries()].sort((a, b) => (P.get(a[0])?.d || 9999) - (P.get(b[0])?.d || 9999));
    const byK = {}; pl.people.forEach(([pid, k]) => { if (match(pid, k)) byK[k] = (byK[k] || 0) + 1; });
    pop.innerHTML = `<div class="mph"><h3>${esc(plName(pl))}</h3><button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button></div>
      ${placeInfo(pl)}
      <p class="legend num">${AR(list.length)} ${T("فقيهًا", "fakih")} · ${KIND_ORDER.filter(k => byK[k]).map(k => `${KIND[k]} ${AR(byK[k])}`).join(" · ")}</p>
      <ul class="num">${list.map(([pid, ks]) => `<li><a href="#/map/@${esc(pid)}" data-who="${esc(pid)}">${esc(P.get(pid)?.name || pid)}</a><span class="k">${deathTxt(P.get(pid) || {})} · ${[...new Set(ks)].map(k => KIND[k]).join(T("، ", ", "))}</span></li>`).join("")
        || `<li class="none">${T("لا أحد بحسب الاختيار", "Seçime uyan kimse yok")}</li>`}</ul>`;
    pop.hidden = false; place();
    pop.querySelectorAll(".pinfo blockquote").forEach(q => q.addEventListener("click", () => { q.classList.toggle("open"); place(); }));
    closeBtn();
  };
  // seçili âlim: yalnız onun şehirleri, yol ağı üzerinden güzergâhı ve şehirleri bağ türüne göre
  const personPop = () => {
    const p = P.get(who_.id), d = who_.d;
    if (!d) { pop.hidden = true; return; }
    const byKind = {};
    d.places.forEach(([pl, k]) => { if (PL.get(pl)) (byKind[k] = byKind[k] || new Set()).add(pl); });
    const seq = placeSeq(d.places, PL);
    pop.innerHTML = `<div class="mph"><h3>${esc(p.name)}</h3><button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button></div>
      ${LANG === "tr" ? `<p class="arn" lang="ar" dir="rtl">${esc(p.ar)}</p>` : ""}<p class="legend num">${deathTxt(p)}</p>
      ${seq.length > 1 ? `<p class="proute">${seq.map(pl => `<a href="#/map/${esc(pl.id)}" data-pl="${esc(pl.id)}">${esc(plName(pl))}</a>`).join(" <span aria-hidden=\"true\">" + (LANG === "ar" ? "←" : "→") + "</span> ")}</p>` : ""}
      <ul>${KIND_ORDER.filter(k => byKind[k]).map(k => `<li><span class="k">${KIND[k]}</span><span>${[...byKind[k]].map(id => `<a href="#/map/${esc(id)}" data-pl="${esc(id)}">${esc(plName(PL.get(id)))}</a>`).join(T("، ", ", "))}</span></li>`).join("")}</ul>
      <p class="plinks"><a href="#/p/${esc(p.id)}">${T("الترجمة", "Biyografi")}</a>${p.nt || p.ns ? ` · <a href="#/net/${esc(p.id)}">${T("السلسلة", "Silsile")}</a>` : ""}${p.d ? ` · <a href="#/zaman/${esc(p.id)}">${T("الزمن", "Zaman")}</a>` : ""}</p>
`;
    pop.hidden = false; at = [12, 12]; place();
    closeBtn();
  };
  pop.addEventListener("click", e => {
    const a = e.target.closest("[data-who],[data-pl]"); if (!a) return;
    e.preventDefault();
    if (a.dataset.who) showWho(a.dataset.who);
    else { who_ = null; current = a.dataset.pl; at = null; setHash(`#/map/${encodeURIComponent(current)}`); redraw(); m.focus(PL.get(current)); place(); }
  });
  const redraw = () => {
    if (who_ && who_.d) {
      const ids = [...new Set(who_.d.places.map(x => x[0]))].map(id => PL.get(id)).filter(Boolean);
      m.draw(ids.map(pl => ({ pl, r: 5.5, label: pl.type === "regions" ? false : 13, on: true })), { route: placeSeq(who_.d.places, PL) });
      side(); return;
    }
    const counts = places.map(pl => { const s = new Set(); pl.people.forEach(([pid, k]) => { if (match(pid, k)) s.add(pid); }); return [pl, s.size]; })
      .filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    // her şehrin adı, kayıt sayısıyla orantılı büyüklükte (yerleşim: makeMap/layLabels);
    // bölge kayıtları (Horasan, Irak…) daire olarak kalır, adları bölge yazısıyla verilir
    const nmax = counts.length ? counts[0][1] : 1;
    m.draw(counts.map(([pl, n]) => { const city = pl.type !== "regions";
      return { pl, r: 2.5 + Math.sqrt(n) * 1.5, label: city ? +(9.5 + 7.5 * Math.sqrt(n / nmax)).toFixed(1) : false, on: pl.id === current }; }), { hot: current });
    side();
  };
  const showWho = async id => {
    const d = await person(id); if (!d) return;
    who_ = { id, d }; current = ""; setHash(`#/map/@${encodeURIComponent(id)}`);
    $("#fk").hidden = $("#fc").hidden = true;
    redraw();
    const ids = [...new Set(d.places.map(x => x[0]))].map(x => PL.get(x)).filter(Boolean);
    if (ids.length) m.fit(ids);
  };
  const origDraw = redraw;
  m.pick((id, ev) => {
    if (who_) { if (!id) return; who_ = null; $("#fk").hidden = $("#fc").hidden = false; }
    if (!id) { if (current) { current = ""; at = null; setHash("#/map"); origDraw(); } return; }
    const b = wrap.getBoundingClientRect(); at = ev ? [ev.clientX - b.left, ev.clientY - b.top] : null;
    current = id; setHash(`#/map/${encodeURIComponent(id)}`); origDraw(); });
  pop.addEventListener("pointerdown", e => e.stopPropagation());
  pop.addEventListener("wheel", e => e.stopPropagation());
  $("#fk").addEventListener("click", e => { const b = e.target.closest("[data-k]"); if (!b) return;
    kinds.has(b.dataset.k) ? kinds.delete(b.dataset.k) : kinds.add(b.dataset.k); b.classList.toggle("on"); b.setAttribute("aria-pressed", kinds.has(b.dataset.k)); redraw(); });
  $("#fc").addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return;
    if (b.dataset.c === "all") { cents.clear(); $("#fc").querySelectorAll(".btn").forEach(x => { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); }
    else { const c = +b.dataset.c; cents.has(c) ? cents.delete(c) : cents.add(c); b.classList.toggle("on"); b.setAttribute("aria-pressed", cents.has(c)); }
    redraw(); });
  $("#rdbtn").addEventListener("click", e => { SHOW_ROADS = !SHOW_ROADS; e.currentTarget.classList.toggle("on", SHOW_ROADS); e.currentTarget.setAttribute("aria-pressed", SHOW_ROADS); m.roadnet(SHOW_ROADS); });
  stageToggle($("#mstage"), $("#mstage .fsbtn"), () => { if (!who_) { at = null; if (current) m.fit([PL.get(current)]); } place(); });
  // haritada arama: şehir ya da âlim. Şehir seçilince ona yakınlaşılır; âlim seçilince şehirleri ve güzergâhı gösterilir
  const pkey = pl => [fold(pl.name_tr), norm(pl.name), fold(pl.info && pl.info.translit)].join(" ");
  const withPlaces = new Set(places.flatMap(pl => pl.people.map(x => x[0])));
  $("#msearch").replaceWith(localSearch(T("ابحث عن بلد أو عَلَم…", "Şehir ya da âlim ara…"), q => {
    const a = /[؀-ۿ]/.test(q) ? norm(q) : fold(q);
    const pls = places.filter(pl => pkey(pl).includes(a)).sort((x, y) => y.n - x.n).slice(0, 6)
      .map(pl => ({ id: pl.id, html: `<span>${esc(plName(pl))}</span><span class="d num">${T("بلد", "şehir")} · ${AR(pl.n)}</span>` }));
    const ps = findPersons(q, 40).filter(p => withPlaces.has(p.id)).slice(0, 8)
      .map(p => ({ id: "@" + p.id, html: `<span>${esc(p.name)}</span><span class="d num">${deathTxt(p)}</span>` }));
    return [...pls, ...ps];
  }, id => {
    if (id[0] === "@") return showWho(id.slice(1));
    who_ = null; $("#fk").hidden = $("#fc").hidden = false;
    current = id; at = null; setHash(`#/map/${encodeURIComponent(id)}`); redraw(); m.focus(PL.get(id)); place(); }));
  if (who_) await showWho(who_.id);
  else { redraw(); if (current) { m.fit([PL.get(current)]); at = null; place(); } }
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
  G = { nodes, up, down, edges: g.edges.slice(), byId: new Map(nodes.map((n, i) => [n.id, i])) };
  ktGraph(G);
  return G;
}

// Büyük ekran: sahne öğesini tam ekrana alır (tarayıcı izin vermezse sayfayı kaplayan pencere olur)
const FS_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
function stageToggle(stage, btn, onChange) {
  const set = on => {
    stage.classList.toggle("full", on); document.body.classList.toggle("noscroll", on);
    btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", String(on));
    const t = on ? T("تصغير", "Küçült") : T("ملء الشاشة", "Büyük ekran"); btn.title = t; btn.setAttribute("aria-label", t);
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
const fsButton = () => `<button type="button" class="btn icon fsbtn" aria-pressed="false" title="${T("ملء الشاشة", "Büyük ekran")}" aria-label="${T("ملء الشاشة", "Büyük ekran")}">${FS_ICON}</button>`;

/* Silsileyi dışa aktarma (PNG / SVG). Ekrandaki ağaç ölçülüp bir sahneye çevrilir: kutular (kartlar,
   etiketler), çizgiler ve satır satır yazılar. PNG tuvalde çizilir (sayfa yazı tipleriyle); SVG aynı
   sahneden yazılır ve yazı tiplerini Google Fonts'tan çağırır. */
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;600;700&family=EB+Garamond:ital,wght@0,500;0,700;1,500&family=Noto+Serif:wght@400;600;700&family=Noto+Sans:wght@400;600&display=swap";
const DL_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
// tek indirme simgesi: üzerine gelince ya da tıklayınca PNG / SVG seçimi açılır
const expButtons = () => `<span class="dlmenu"><button type="button" class="btn icon dlbtn" aria-haspopup="true" aria-expanded="false" title="${T("تنزيل السلسلة", "Silsileyi indir")}" aria-label="${T("تنزيل", "İndir")}">${DL_ICON}</button>
  <span class="dlpop" role="menu"><button type="button" role="menuitem" data-exp="png">PNG <small>${T("صورة", "resim")}</small></button><button type="button" role="menuitem" data-exp="svg">SVG <small>${T("متجه", "vektör")}</small></button></span></span>`;
document.addEventListener("click", e => {
  const b = e.target.closest(".dlbtn");
  document.querySelectorAll(".dlmenu.open").forEach(m => { if (!b || !m.contains(b)) { m.classList.remove("open"); $(".dlbtn", m).setAttribute("aria-expanded", "false"); } });
  if (b) { const m = b.parentElement, on = !m.classList.contains("open"); m.classList.toggle("open", on); b.setAttribute("aria-expanded", String(on)); if (on) $(".dlpop button", m).focus(); }
  else if (e.target.closest("[data-exp]")) e.target.closest(".dlmenu")?.classList.remove("open");
});
document.addEventListener("keydown", e => { if (e.key === "Escape") document.querySelectorAll(".dlmenu.open").forEach(m => m.classList.remove("open")); });
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
const NI = {   // silsile görünüm simgeleri
  ego: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="8" y="10" width="8" height="4" rx="1"/><rect x="2" y="3" width="6" height="3" rx="1"/><rect x="16" y="3" width="6" height="3" rx="1"/><rect x="2" y="18" width="6" height="3" rx="1"/><rect x="16" y="18" width="6" height="3" rx="1"/><path d="M5 6v2h14V6M12 8v2M12 14v2M5 18v-2h14v2"/></g></svg>`,
  cols: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 3v18M12 3v18M20 3v18" opacity=".45"/><circle cx="4" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="20" cy="9" r="1.6"/><circle cx="20" cy="17" r="1.6"/><path d="M5.5 7.5C8 9 9.5 11 10.5 11.5M13.5 11.5C16 10 17 9.5 18.5 9.2M13.5 12.5C16 15 17 16.5 18.5 16.8"/></g></svg>`,
  full: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 16 9 8l5 9 5-11M9 8l10-2M4 16l10 1" opacity=".5"/><circle cx="4" cy="16" r="2" fill="currentColor"/><circle cx="9" cy="8" r="2" fill="currentColor"/><circle cx="14" cy="17" r="2" fill="currentColor"/><circle cx="19" cy="6" r="2" fill="currentColor"/></g></svg>`,
  lin: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18" stroke-dasharray="2 3"/><circle cx="12" cy="4" r="2.2" fill="currentColor"/><circle cx="12" cy="20" r="2.2"/><path d="M8 8h8M8 16h8" opacity=".5"/></g></svg>`,
};
const segBtn = (href, on, icon, label, hint) => `<a class="btn seg${on ? " on" : ""}" href="${href}" title="${esc(hint || label)}" aria-label="${esc(label)}"${on ? ` aria-current="true"` : ""}>${icon}<span class="lbl">${label}</span></a>`;
async function viewNet(view, id, mode) {
  const g = await graph();
  mode = mode || (id ? "ego" : "full");
  const cur = id || "jws1";
  view.innerHTML = `<h1>${T("سلسلة الشيوخ والتلاميذ", "Hoca–talebe silsilesi")}</h1>
    <div class="stage" id="nstage">
    <div class="filters stagebar"><span class="segs" role="group" aria-label="${T("طريقة العرض", "Görünüm")}">
      ${segBtn(`#/net/${esc(cur)}`, mode === "ego", NI.ego, T("سلسلة عَلَم", "Âlimin silsilesi"), T("العَلَم في الوسط، شيوخه فوقه وتلاميذه تحته", "Âlim ortada, hocaları üstte, talebeleri altta"))}
      ${segBtn(`#/asir${id ? `/${esc(id)}` : ""}`, mode === "cols", NI.cols, T("القرون", "Asırlar"), T("الأعلام في أعمدة القرون، وصلات المختار منحنيات", "Âlimler hicrî asır sütunlarında; seçilenin bağları eğrilerle"))}
      ${segBtn("#/net", mode === "full", NI.full, T("المشهد العام", "Genel görünüm"), T("الشبكة كلها على محور الزمن", "Bütün ağ, zaman ekseninde"))}</span>
      ${mode === "ego" ? `<span class="segs" role="group" aria-label="${T("الطبقات", "Kuşak")}"><button type="button" class="btn seg on" data-depth="1" title="${T("طبقة واحدة", "Bir kuşak")}" aria-label="${T("طبقة واحدة", "Bir kuşak")}">1</button><button type="button" class="btn seg" data-depth="2" title="${T("طبقتان", "İki kuşak: hocaların hocaları, talebelerin talebeleri")}" aria-label="${T("طبقتان", "İki kuşak")}">2</button></span>
        <button type="button" class="btn icon${LINEAGE ? " on" : ""}" id="lin" aria-pressed="${LINEAGE}" title="${T("الوصل بأبي حنيفة", "Ebû Hanîfe’ye bağla")}" aria-label="${T("الوصل بأبي حنيفة", "Ebû Hanîfe’ye bağla")}">${NI.lin}</button>` : ""}
      <span class="grow"></span><span id="nsearch"></span>${mode === "ego" ? expButtons() : ""}${shareBtn()}${fsButton()}</div>
    <div id="netbody"></div></div>`;
  const stage = $("#nstage");
  // âlim arama (her görünümde): genel görünümde ve asırlarda yakınlaşır, silsile görünümünde o âlimin silsilesine geçer
  const findNode = q => { const ar = /[؀-ۿ]/.test(q), a = ar ? norm(q) : fold(q);
    return g.nodes.map((n, i) => [n, i]).filter(([n]) => (ar ? norm(n.ar) : fold(n.tr + " " + (P.get(n.id)?.trs || ""))).includes(a))
      .sort((x, y) => y[0].deg - x[0].deg).slice(0, 12)
      .map(([n, i]) => ({ id: i, html: `<span>${esc(n.name)}</span><span class="d num">${n.d ? yearTxt(n.d, n.guess) : ""}</span>` })); };
  const search = pick => $("#nsearch").replaceWith(localSearch(T("ابحث عن عَلَم في السلسلة…", "Silsilede âlim ara…"), findNode, pick));
  if (mode === "full") {
    const net = fullNet($("#netbody"), g); stageToggle(stage, $(".fsbtn", stage), () => net.redraw());
    search(i => net.focus(+i));
    return;
  }
  if (mode === "cols") {
    const i0 = id ? g.byId.get(id) : undefined;
    const net = colNet($("#netbody"), g, i0);
    stageToggle(stage, $(".fsbtn", stage), () => net.redraw());
    search(i => net.focus(+i));
    if (id && i0 === undefined) toast(T("ليس لهذا العَلَم صلات في السلسلة", "Bu âlimin silsilede bağı yok"));
    return;
  }
  search(i => { location.hash = `#/net/${g.nodes[+i].id}`; });
  const i = g.byId.get(id);
  if (i === undefined) { $("#netbody").innerHTML = P.has(id) || SALAF.has(id)
    ? `<p class="empty">${plink(id)} ${T("ليس له شيوخ ولا تلاميذ من المترجمين.", ": biyografisi bulunanlar arasında hocası ya da talebesi yok.")}</p>`
    : `<p class="empty">${T("لا يوجد هذا العلم.", "Böyle bir âlim yok.")} <a href="#/net">${T("المشهد العام", "Genel görünüm")}</a></p>`; return; }
  document.title = `${T("سلسلة", "Silsile")}: ${g.nodes[i].name} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
  let depth = 1;
  const draw = () => egoNet($("#netbody"), g, i, depth, LINEAGE);
  view.querySelectorAll("[data-depth]").forEach(b => b.addEventListener("click", () => {
    depth = +b.dataset.depth; view.querySelectorAll("[data-depth]").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }); draw(); }));
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
    if (sel >= 0 && ok(N[sel])) { ctx.globalAlpha = 1; ctx.strokeStyle = col("--gold"); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(tx + sc * X(N[sel]), ty + sc * Y(N[sel]), 13, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
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
  // aramadan seçilen âlim: kendisi ve hoca/talebeleri ekrana sığacak biçimde yakınlaşılır
  const focus = i => { const w = cv.clientWidth, h = cv.clientHeight; select(i);
    const ns = [...hl].map(j => N[j]).filter(ok), xs = ns.map(X), ys = ns.map(Y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    sc = Math.max(1.5, Math.min(8, w / (x1 - x0 + 120), h / (y1 - y0 + 120)));
    tx = w / 2 - sc * (x0 + x1) / 2; ty = h / 2 - sc * (y0 + y1) / 2; draw(); };
  return { redraw: () => { fit(); draw(); }, focus };
}

// ---------- tuval yardımcıları: sürükleme, tekerlek ve iki parmakla yakınlaştırma, tıklama ----------
function panZoom(cv, h) {
  const ptrs = new Map(); let pinch = 0, moved = 0;
  const rel = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = rel(e); h.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, x, y); }, { passive: false });
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e); if (ptrs.size === 1) moved = 0; });
  cv.addEventListener("pointermove", e => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) { h.hover && h.hover(...rel(e)); return; }
    ptrs.set(e.pointerId, e);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), r = cv.getBoundingClientRect();
      if (pinch) h.zoom(d / pinch, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
      pinch = d; moved += 10; return;
    }
    const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY;
    moved += Math.abs(dx) + Math.abs(dy); h.pan(dx, dy);
  });
  cv.addEventListener("pointerup", e => { if (!ptrs.delete(e.pointerId)) return; if (ptrs.size < 2) pinch = 0;
    if (!ptrs.size && moved < 6 && h.click) h.click(...rel(e)); });
  cv.addEventListener("pointercancel", e => { ptrs.delete(e.pointerId); pinch = 0; });
  cv.addEventListener("pointerleave", () => h.leave && h.leave());
}
const sizeCanvas = (cv, ctx) => { const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); return [w, h]; };
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const shortName = id => { const n = who(id); return !n ? id : LANG === "tr" ? n.trs || n.tr : String(n.ar).split("،")[0]; };
const clip = (ctx, t, w) => { if (ctx.measureText(t).width <= w) return t; let s = t; while (s.length > 2 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1); return s.length > 2 ? s + "…" : ""; };
const FONT = px => LANG === "ar" ? `${px + 1}px 'Noto Naskh Arabic', serif` : `${px}px 'Noto Serif', serif`;
// seçili âlimin bilgi kartı (asır ve zaman görünümleri)
function infoCard(el, id, extra = "") {
  const p = P.get(id), n = who(id); if (!n) { el.hidden = true; return; }
  const gi = G && G.byId.get(id), nt = gi !== undefined ? G.up[gi].length : 0, ns = gi !== undefined ? G.down[gi].length : 0;
  const yrs = p && p.b ? (LANG === "tr" ? `${p.b}/${CE(p.b)} – ${p.d}/${CE(p.d)}` : `${AR(p.b)} – ${AR(p.d)}هـ`) : deathTxt(n);
  el.innerHTML = `<button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button>
    <b>${esc(n.name)}</b>${LANG === "tr" ? `<span class="arn" lang="ar" dir="rtl">${esc(n.ar)}</span>` : ""}
    <span class="num">${esc(yrs)}</span>${extra}
    <span class="num">${AR(nt)} ${T("شيوخ", "hoca")} · ${AR(ns)} ${T("تلاميذ", "talebe")}</span>
    <span class="lk">${p ? `<a href="#/p/${esc(id)}">${T("الترجمة", "Biyografi")}</a>` : ""}${gi !== undefined ? `<a href="#/net/${esc(id)}">${T("السلسلة", "Silsile")}</a>` : ""}${p && p.place ? `<a href="#/map/@${esc(id)}">${T("الخريطة", "Harita")}</a>` : ""}</span>`;
  el.hidden = false;
}
const hoverTip = (tip, wrap, x, y, html) => { if (!html) { tip.hidden = true; return; } tip.innerHTML = html; tip.hidden = false;
  tip.style.left = `${Math.max(4, Math.min(x + 14, wrap.clientWidth - tip.offsetWidth - 4))}px`; tip.style.top = `${Math.min(y + 16, wrap.clientHeight - tip.offsetHeight - 4)}px`; };
const tipHtml = (id, extra = "") => { const n = who(id), p = P.get(id); if (!n) return "";
  return `<b>${esc(n.name)}</b>${LANG === "tr" ? ` <span class="arn" lang="ar">${esc(n.ar.split("،")[0])}</span>` : ""}<br><span class="num">${esc(p && p.b ? (LANG === "tr" ? `${p.b}–${p.d}/${CE(p.b)}–${CE(p.d)}` : `${AR(p.b)}–${AR(p.d)}هـ`) : deathTxt(n))}</span>${extra}`; };

/* Silsile, asır sütunları: her âlim vefat ettiği hicrî asrın sütununda (sütun içinde vefat yılına göre,
   kalabalık asırlarda yan yana alt sütunlar). Adlar soluk; seçilen âlimin hocaları (altın) ve talebeleri
   (çivit) eğrilerle bağlanır. Arapçada asırlar sağdan sola dizilir. */
function colNet(host, g, sel) {
  host.innerHTML = `<p class="lede">${T("كل عمود قرن هجري، والأعلام فيه على سني وفاتهم. اضغط على اسم أو ابحث عنه لترى شيوخه (ذهبي) وتلاميذه (نيلي). اسحب للتنقل، ودوّر العجلة للتكبير.",
    "Her sütun bir hicrî asırdır; âlimler vefat yıllarına göre dizilidir. Bir ada tıklayın ya da arayın: hocaları altın, talebeleri çivit eğrilerle bağlanır. Sürükleyerek gezinin, tekerlekle yakınlaştırın.")}</p>
    <div class="netwrap"><canvas role="img" aria-label="${T("أعمدة القرون", "Asır sütunları")}"></canvas><div class="tip" hidden></div><div class="icard" hidden></div></div>`;
  const wrap = $(".netwrap", host), cv = $("canvas", host), ctx = cv.getContext("2d"), tip = $(".tip", host), card = $(".icard", host);
  const N = g.nodes, rtl = LANG === "ar", yr = n => n.d || n.x || 0;
  const ROWS = 42, SUBW = 200, ROWH = 18, HEAD = 54, GAP = 50;
  const byC = new Map();
  N.forEach((n, i) => { if (!yr(n)) return; const c = century(yr(n)); if (!byC.has(c)) byC.set(c, []); byC.get(c).push(i); });
  const cs = [...byC.keys()].sort((a, b) => a - b), pos = new Map(), cols = [];
  let X = 0;
  cs.forEach(c => {
    const l = byC.get(c).sort((a, b) => yr(N[a]) - yr(N[b]) || N[b].deg - N[a].deg), K = Math.ceil(l.length / ROWS);
    l.forEach((i, k) => pos.set(i, [X + Math.floor(k / ROWS) * SUBW + 10, HEAD + (k % ROWS) * ROWH + 10]));
    cols.push({ c, x0: X, w: K * SUBW, n: l.length }); X += K * SUBW + GAP;
  });
  const TW = X - GAP, TH = HEAD + ROWS * ROWH + 20;
  const px = x => rtl ? TW - x : x;   // Arapçada ayna
  let tx = 0, ty = 0, k = 1, cur = sel ?? -1, hov = -1;
  const hl = new Set();
  const setSel = i => { cur = i; hl.clear(); if (i >= 0) { hl.add(i); g.up[i].forEach(([j]) => hl.add(j)); g.down[i].forEach(([j]) => hl.add(j)); } };
  setSel(cur);
  const S = i => { const [x, y] = pos.get(i); return [tx + k * px(x), ty + k * y]; };
  const draw = () => {
    const [w, h] = sizeCanvas(cv, ctx);
    const ink = cssVar("--ink"), muted = cssVar("--muted"), gold = cssVar("--gold"), teal = cssVar("--teal"), rub = cssVar("--rubric"), paper = cssVar("--paper");
    ctx.textBaseline = "middle";
    cols.forEach((c, ci) => {   // sütun zemini ve başlığı
      const a = tx + k * px(c.x0), b = tx + k * px(c.x0 + c.w), x0 = Math.min(a, b), x1 = Math.max(a, b);
      if (x1 < 0 || x0 > w) return;
      ctx.fillStyle = ci % 2 ? "transparent" : cssVar("--mark"); ctx.fillRect(x0 - 12 * k, 0, x1 - x0 + 24 * k, h);
      ctx.fillStyle = gold; ctx.textAlign = "center"; ctx.font = FONT(Math.max(10, Math.min(16, 15 * k)));
      ctx.fillText(LANG === "tr" ? `${ROM(c.c)}. (${ROM(Math.floor((CE((c.c - 1) * 100 + 50) - 1) / 100) + 1)}.) asır` : `القرن ${CENT[c.c] || AR(c.c)}`, (x0 + x1) / 2, Math.max(14, ty + k * 18));
      ctx.fillStyle = muted; ctx.font = FONT(Math.max(9, Math.min(12, 11 * k)));
      ctx.fillText(`${AR(c.n)} ${T("عَلَمًا", "âlim")}`, (x0 + x1) / 2, Math.max(30, ty + k * 36));
    });
    // bağlar: seçilen (ve üzerine gelinen) âlimin
    const links = (i, strong) => {
      const [ax, ay] = S(i);
      const one = (j, c) => { const [bx, by] = S(j), dx = Math.max(40 * k, Math.abs(bx - ax) / 2) * (bx >= ax ? 1 : -1);
        ctx.strokeStyle = c; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(ax + dx, ay, bx - dx, by, bx, by); ctx.stroke(); };
      ctx.lineWidth = strong ? 1.6 : 1; ctx.globalAlpha = strong ? .85 : .35;
      g.up[i].forEach(([j]) => pos.has(j) && one(j, gold)); g.down[i].forEach(([j]) => pos.has(j) && one(j, teal));
      ctx.globalAlpha = 1; };
    if (hov >= 0 && hov !== cur && pos.has(hov)) links(hov, false);
    if (cur >= 0 && pos.has(cur)) links(cur, true);
    const fs = 11 * k, names = fs >= 6;
    ctx.font = FONT(Math.min(fs, 14)); ctx.textAlign = rtl ? "right" : "left";
    pos.forEach((_, i) => {
      const [x, y] = S(i); if (x < -SUBW * k || x > w + SUBW * k || y < -10 || y > h + 10) return;
      const on = hl.has(i), dim = cur >= 0 && !on, n = N[i];
      ctx.globalAlpha = dim ? .25 : on ? 1 : .6;
      ctx.fillStyle = i === cur ? teal : n.salaf ? muted : rub;
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.6, Math.min(4, 2.2 * Math.sqrt(k)) * (on ? 1.4 : 1)), 0, 7); ctx.fill();
      if (names || on) { ctx.fillStyle = on ? ink : muted; ctx.globalAlpha = dim ? .25 : on ? 1 : .55;
        const t = clip(ctx, shortName(n.id), (SUBW - 22) * k), tx_ = x + (rtl ? -6 : 6);
        if (on) { ctx.lineWidth = 3.5; ctx.strokeStyle = paper; ctx.strokeText(t, tx_, y); } ctx.fillText(t, tx_, y); }
    });
    ctx.globalAlpha = 1;
    if (cur >= 0 && pos.has(cur)) { const [x, y] = S(cur); ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke(); }
  };
  const near = (mx, my) => { let b = -1, bd = 1e9, span = 11 * k >= 6 ? (SUBW - 20) * k : 8;
    pos.forEach((_, i) => { const [x, y] = S(i), dy = Math.abs(my - y), along = rtl ? x - mx : mx - x;   // noktası ya da adı
      if (dy > 8 || along < -8 || along > span) return; const d = dy * dy + Math.max(0, -along) ** 2; if (d < bd) { bd = d; b = i; } });
    return b; };
  const pick = i => { setSel(i);
    if (i >= 0) { infoCard(card, N[i].id); history.replaceState(null, "", `#/asir/${N[i].id}`); } else { card.hidden = true; history.replaceState(null, "", "#/asir"); }
    draw(); };
  card.addEventListener("click", e => { if (e.target.closest(".x")) pick(-1); });
  panZoom(cv, {
    pan: (dx, dy) => { tx += dx; ty += dy; draw(); },
    zoom: (f, mx, my) => { const nk = Math.max(.12, Math.min(3, k * f)); f = nk / k; tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; k = nk; draw(); },
    click: (x, y) => pick(near(x, y)),
    hover: (x, y) => { const i = near(x, y); if (i !== hov) { hov = i; draw(); }
      hoverTip(tip, wrap, x, y, i >= 0 ? tipHtml(N[i].id, `<br><span class="num">${AR(g.up[i].length)} ${T("شيوخ", "hoca")} · ${AR(g.down[i].length)} ${T("تلاميذ", "talebe")}</span>`) : ""); },
    leave: () => { tip.hidden = true; if (hov >= 0) { hov = -1; draw(); } },
  });
  const fit = () => { const w = cv.clientWidth, h = cv.clientHeight; k = Math.max(.12, Math.min(1, h / TH)); ty = (h - TH * k) / 2; tx = rtl ? w - TW * k - 10 : 10; };
  const focus = i => { if (!pos.has(i)) return; const w = cv.clientWidth, h = cv.clientHeight; k = Math.max(k, .9);
    const [x, y] = pos.get(i); tx = w / 2 - k * px(x); ty = TH * k <= h ? (h - TH * k) / 2 : Math.min(0, Math.max(h - TH * k, h / 2 - k * y)); pick(i); };
  new ResizeObserver(() => draw()).observe(cv);
  fit();
  if (cur >= 0 && pos.has(cur)) focus(cur); else draw();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => host.contains(cv) && draw());
  return { redraw: () => draw(), focus };
}

// ---------- zaman haritası ----------
// bölge satırları doğudan batıya; el-Süreyyâ bölge kodları (places.region)
const REG_ORDER = ["Hind", "Sind", "Turkestan", "Transoxiana", "Khurasan", "Sijistan", "Kirman", "Faris", "Khuzistan", "Jibal", "Daylam", "Rihab",
  "Khazar", "Qipchaq", "Crimea", "Rum", "Aqur", "Iraq", "Badiyat al-Arab", "Sham", "Jazirat al-Arab", "Yemen", "Egypt", "Barqa", "Maghrib", "Andalus", "Sicile"];
const REG_EXTRA = { Rum: ["الروم (الأناضول)", "Rûm (Anadolu)"], Hind: ["الهند", "Hind"], Crimea: ["القرم", "Kırım"], Turkestan: ["تركستان", "Türkistan"],
  Qipchaq: ["دشت القبجاق", "Deşt-i Kıpçak"], "?": ["بلا بلد معروف", "Yeri bilinmeyen"] };
const TI = {   // zaman haritası düğmeleri
  prev: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  next: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  pp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l-7 7 7 7M20 12H7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21" cy="12" r="0"/></svg>`,
  np: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5l7 7-7 7M4 12h13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  fit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
// Zaman sekmesinin başında: asırların önde gelen Hanefî âlimleri, soldan sağa yavaşça çizilen altın bir dalga üzerinde
const RIBBON = [["jws1", "Ebû Hanîfe", "أبو حنيفة"], ["jw1825", "Ebû Yûsuf", "أبو يوسف"], ["jw1270", "İmam Muhammed", "محمد بن الحسن"],
  ["jw1086", "Îsâ b. Ebân", "عيسى بن أبان"], ["jw160", "Hassâf", "الخصاف"], ["jw204", "Tahâvî", "الطحاوي"], ["jw1532", "Mâtürîdî", "الماتريدي"],
  ["jw894", "Kerhî", "الكرخي"], ["jw155", "Cessâs", "الجصاص"], ["jw179", "Kudûrî", "القدوري"], ["jw1219", "Serahsî", "السرخسي"],
  ["qd765", "Fahrülislâm Pezdevî", "فخر الإسلام البزدوي"], ["gh479", "Necmeddin en-Nesefî", "نجم الدين النسفي"], ["jw1900", "Kâsânî", "الكاساني"],
  ["jw485", "Kādîhân", "قاضي خان"], ["jw1030", "Merginânî", "المرغيناني"], ["jw738", "Mevsılî", "الموصلي"], ["jw692", "Ebü’l-Berekât en-Nesefî", "حافظ الدين النسفي"],
  ["jw925", "Zeylaî", "الزيلعي"], ["gh389", "Sadrüşşerîa", "صدر الشريعة"], ["gh749", "İbnü’l-Hümâm", "ابن الهمام"], ["gh802", "Aynî", "العيني"],
  ["kt712", "Molla Hüsrev", "ملا خسرو"], ["fws22", "Kemalpaşazâde", "ابن كمال باشا"], ["ts894", "İbn Nüceym", "ابن نجيم"], ["fws170", "Ebüssuûd Efendi", "أبو السعود"]];
const STAR = r => { const pts = []; for (let i = 0; i < 16; i++) { const a = Math.PI / 8 * i - Math.PI / 2, rr = i % 2 ? r * .55 : r;
  pts.push(`${(Math.cos(a) * rr).toFixed(1)},${(Math.sin(a) * rr).toFixed(1)}`); } return pts.join(" "); };
function ribbon(host, onPick) {
  const lab = new Map(RIBBON.map(([id, tr, ar]) => [id, LANG === "tr" ? tr : ar]));
  const people = RIBBON.map(([id]) => P.get(id)).filter(p => p && p.d).sort((a, b) => a.d - b.d);
  const rtl = LANG === "ar", GAP = 150, PADX = 90, H = 230, MID = 118;
  const W = PADX * 2 + GAP * (people.length - 1);
  const pts = people.map((p, i) => ({ p, x: PADX + i * GAP, y: MID + (i % 2 ? -14 : 14) }));
  const sx = x => rtl ? W - x : x;
  // dalga: düğümler arasında ters yönde tepe noktaları; Catmull-Rom → Bezier
  const wave = [{ x: 20, y: MID }];
  pts.forEach((q, i) => { wave.push(q); if (i < pts.length - 1) wave.push({ x: q.x + GAP / 2, y: MID + (i % 2 ? 22 : -22) }); });
  wave.push({ x: W - 20, y: MID });
  let d = `M${sx(wave[0].x)},${wave[0].y}`;
  for (let i = 0; i < wave.length - 1; i++) {
    const p0 = wave[i - 1] || wave[i], p1 = wave[i], p2 = wave[i + 1], p3 = wave[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }, c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${sx(c1.x).toFixed(1)},${c1.y.toFixed(1)} ${sx(c2.x).toFixed(1)},${c2.y.toFixed(1)} ${sx(p2.x).toFixed(1)},${p2.y}`;
  }
  let cents = "", lastC = 0;
  pts.forEach((q, i) => { const c = century(q.p.d); if (c !== lastC) { const x = i ? q.x - GAP / 2 : 30;
    cents += `<line x1="${sx(x)}" x2="${sx(x)}" y1="${H - 26}" y2="${H - 16}"/><text x="${sx(x + 6)}" y="${H - 6}" text-anchor="${rtl ? "end" : "start"}">${LANG === "tr" ? `${ROM(c)}. asır` : `القرن ${CENT[c]}`}</text>`; lastC = c; } });
  const nodes = pts.map((q, i) => { const up = i % 2 === 0, big = i === 0, ty = up ? q.y - (big ? 50 : 42) : q.y + (big ? 44 : 38);
    return `<g class="rnode${big ? " big" : ""}" data-i="${i}" data-id="${esc(q.p.id)}" tabindex="0" role="button" aria-label="${esc(q.p.name)}" transform="translate(${sx(q.x)},${q.y})">
      <polygon points="${STAR(big ? 15 : 11)}"/><circle r="${big ? 3.4 : 2.6}"/>
      <text class="nm" y="${ty - q.y}" text-anchor="middle">${esc(lab.get(q.p.id))}</text>
      <text class="yr" y="${ty - q.y + 18}" text-anchor="middle">${esc(yearTxt(q.p.d))}</text></g>`; }).join("");
  host.innerHTML = `<div class="rhead"><h2>${T("أعلام المذهب عبر القرون", "Asırların önde gelen Hanefî âlimleri")}</h2>
      <button type="button" class="btn small" data-replay>${T("أعد العرض", "Yeniden oynat")}</button></div>
    <div class="rbox"><svg class="rsvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${T("أعلام المذهب عبر القرون", "Asırların önde gelen Hanefî âlimleri")}">
      <line class="raxis" x1="0" x2="${W}" y1="${H - 26}" y2="${H - 26}"/><g class="rcent">${cents}</g>
      <path class="rwave2" d="${d}" transform="translate(0,3)"/><path class="rwave" d="${d}"/>${nodes}</svg></div>`;
  const box = $(".rbox", host), wave1 = $(".rwave", host), wave2 = $(".rwave2", host), gs = [...host.querySelectorAll(".rnode")];
  const len = wave1.getTotalLength();
  let raf = 0, userScroll = false;
  box.addEventListener("pointerdown", () => { userScroll = true; });
  box.addEventListener("wheel", () => { userScroll = true; }, { passive: true });
  const play = () => {
    cancelAnimationFrame(raf); userScroll = false;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, dur = reduce ? 0 : people.length * 700;
    [wave1, wave2].forEach(w => { w.style.strokeDasharray = `${len}`; w.style.strokeDashoffset = `${len}`; });
    gs.forEach(g => g.classList.remove("on"));
    box.scrollLeft = rtl ? 0 : 0;
    const t0 = performance.now();
    const step = now => {
      if (!document.body.contains(box)) return;
      const t = dur ? Math.min(1, (now - t0) / dur) : 1, L = len * t;
      [wave1, wave2].forEach(w => { w.style.strokeDashoffset = `${len - L}`; });
      const head = wave1.getPointAtLength(L), hx = rtl ? W - head.x : head.x;
      gs.forEach((g, i) => { if (pts[i].x <= hx + 4) g.classList.add("on"); });
      if (!userScroll && box.scrollWidth > box.clientWidth) { const x = hx - box.clientWidth * .65; box.scrollLeft = rtl ? -Math.max(0, x) : Math.max(0, x); }
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  $("[data-replay]", host).addEventListener("click", play);
  const choose = g => onPick(g.dataset.id);
  gs.forEach(g => { g.addEventListener("click", () => choose(g)); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(g); } }); });
  // görünür olunca oynat
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); play(); } }, { threshold: .3 });
  io.observe(box);
}
/* Zaman haritası: her bölge bir satır; âlimler vefat yılına yerleştirilir, adları hep görünür.
   Ad etiketleri üst üste binmesin diye her satırda şeritlere (lane) dizilir; yakınlaştırınca yeniden dizilir.
   Kutu yerel olarak iki yönde kaydırılır; cetvel üstte, bölge adları başta sabit kalır. */
const AH = ce => (ce - 622.54 - .485) / 0.970224 + 1;
async function viewTime(view, sel) {
  const [PL, g, places] = await Promise.all([placesById(), graph(), load("places.json")]);
  const rtl = LANG === "ar";
  const lab = { ...REG_EXTRA };
  places.forEach(pl => { const f = pl.info; if (f && f.region_tr && pl.region && !REG_EXTRA[pl.region]) lab[pl.region] = [f.region_ar, f.region_tr]; });
  const items = IDX.filter(p => p.d).map(p => ({ p, reg: PL.get(p.place)?.region || "?", s: p.b && p.b < p.d ? p.b : p.d,
    nm: LANG === "tr" ? p.trs || p.tr : String(p.ar).split("،")[0] }));
  const byReg = new Map(); items.forEach(it => { if (!byReg.has(it.reg)) byReg.set(it.reg, []); byReg.get(it.reg).push(it); });
  const ord = r => r === "?" ? 999 : REG_ORDER.includes(r) ? REG_ORDER.indexOf(r) : 500;
  const rows = [...byReg.keys()].sort((a, b) => ord(a) - ord(b)).map(r => ({ r, items: byReg.get(r).sort((a, b) => a.s - b.s || a.p.d - b.p.d) }));
  rows.forEach(row => row.items.forEach(it => it.row = row));
  const Y0 = Math.floor((Math.min(...items.map(i => i.s)) - 10) / 10) * 10, Y1 = Math.max(...items.map(i => i.p.d)) + 60;
  const order = [...items].sort((a, b) => a.p.d - b.p.d || ord(a.reg) - ord(b.reg)), byId = new Map(items.map(it => [it.p.id, it]));
  items.forEach((it, k) => it.k = k);
  view.innerHTML = `<section class="ribbon" id="ribbon"></section><div class="stage tlstage" id="tstage">
    <div class="stagebar tlbar"><h1>${T("خريطة الزمن", "Zaman haritası")}</h1><span id="tsearch"></span>
      <span class="tlhint">${T("تنقّل بين الأعلام بالسهمين ← →، ويظهر العمر خطًّا لمن عُرف مولده ووفاته.", "←→ tuşlarıyla önceki ve sonraki âlime geçebilirsiniz. Doğum ve vefatı bilinenlerde ömür çizgi hâlinde gösterilir.")}</span>
      <span class="grow"></span>
      <button type="button" class="btn icon" data-nav="-1" title="${T("العَلَم السابق", "Önceki âlim")}" aria-label="${T("العَلَم السابق", "Önceki âlim")}">${rtl ? TI.next : TI.prev}</button>
      <button type="button" class="btn icon" data-nav="1" title="${T("العَلَم اللاحق", "Sonraki âlim")}" aria-label="${T("العَلَم اللاحق", "Sonraki âlim")}">${rtl ? TI.prev : TI.next}</button>
      <button type="button" class="btn icon" data-z="0.7" title="${T("تصغير (−)", "Uzaklaştır (−)")}" aria-label="${T("تصغير", "Uzaklaştır")}">−</button>
      <button type="button" class="btn icon" data-z="1.4" title="${T("تكبير (+)", "Yakınlaştır (+)")}" aria-label="${T("تكبير", "Yakınlaştır")}">+</button>
      ${shareBtn()}${fsButton()}</div>
    <div class="netwrap tl"><div class="tlbox" tabindex="0" aria-label="${T("خريطة الزمن", "Zaman haritası")}"><div class="tlgrid"></div></div><div class="icard" hidden></div></div></div>
    <p class="legend">${T(`${AR(items.length)} عَلَمًا معروف الوفاة، منهم ${AR(items.filter(i => i.p.b).length)} معروف المولد. النقطة المفرغة: وفاة مقدّرة. الأحمر: المختار وشيوخه وتلاميذه.`,
      `Vefatı bilinen ${items.length} âlim; ${items.filter(i => i.p.b).length} tanesinin doğumu da biliniyor. İçi boş nokta: tahminî vefat. Kırmızı: seçilen âlim, hocaları ve talebeleri. Sürükleyerek ya da kaydırarak gezinin; Ctrl + tekerlek yakınlaştırır.`)}</p>`;
  const box = $(".tlbox", view), grid = $(".tlgrid", view), card = $(".icard", view);
  const narrow = () => box.clientWidth < 600;
  const LW = () => narrow() ? 92 : 160, RH = 46, LH = 24, PAD = 10, MAXW = 240;
  let kx = 5, cur = null, els = [];
  // etiket genişlikleri (bir kez ölçülür)
  const mctx = document.createElement("canvas").getContext("2d");
  const measure = () => { mctx.font = `${narrow() ? 12 : 13}px ${getComputedStyle(grid).fontFamily}`; items.forEach(it => it.w = Math.min(MAXW, mctx.measureText(it.nm).width)); };
  const X = y => LW() + 16 + (y - Y0) * kx;
  const layout = () => {
    let top = 0;
    rows.forEach(row => { const ends = [];
      row.items.forEach(it => { const x0 = X(it.s) - 6, x1 = X(it.p.d) + 14 + it.w; let L = ends.findIndex(e => e + 10 <= x0);
        if (L < 0) { L = ends.length; ends.push(0); } ends[L] = x1; it.lane = L; });
      row.top = top; row.h = Math.max(ends.length * LH + PAD * 2, 70); top += row.h; });
    return top;
  };
  const render = () => {
    const H = layout(), W = X(Y1) + 40, lw = LW(), tick = [10, 25, 50, 100].find(s => s * kx >= 110) || 100, fine = tick >= 50 ? 10 : 5;
    const ceStep = tick, ceA = Math.ceil(CE(Y0) / ceStep) * ceStep, ceB = CE(Y1);
    let ruler = "", lines = "";
    for (let y = Math.ceil(Y0 / fine) * fine; y <= Y1; y += fine) {
      const x = X(y).toFixed(1), major = y % tick === 0;
      lines += `<i class="tlg${y % 100 === 0 ? " c" : major ? " m" : ""}" style="inset-inline-start:${x}px"></i>`;
      if (major && y > 0) ruler += `<span class="h num" style="inset-inline-start:${x}px">${LANG === "tr" ? y : AR(y)}</span>`;
    }
    for (let c = ceA; c <= ceB; c += ceStep) ruler += `<span class="m num" style="inset-inline-start:${X(AH(c)).toFixed(1)}px">${LANG === "tr" ? c : AR(c)}</span>`;
    const regs = rows.map((r, k) => { const [ar, tr] = lab[r.r] || [r.r, r.r];
      return `<div class="tlrow${k % 2 ? " odd" : ""}" style="top:${r.top}px;height:${r.h}px"><div class="tlreg"><div>
        <b lang="ar">${esc(ar)}</b>${LANG === "tr" ? `<span>${esc(tr)}</span>` : ""}<small class="num">${AR(r.items.length)}</small></div></div></div>`; }).join("");
    const its = items.map(it => { const y = it.row.top + PAD + it.lane * LH, xd = X(it.p.d), xs = X(it.s);
      return `${it.s < it.p.d ? `<b class="tll" data-k="${it.k}" style="inset-inline-start:${xs.toFixed(1)}px;width:${(xd - xs).toFixed(1)}px;top:${y + LH / 2}px"></b>` : ""}<a class="tli${it.p.est ? " est" : ""}" data-k="${it.k}" href="#/zaman/${esc(it.p.id)}" style="inset-inline-start:${(xd - 5).toFixed(1)}px;top:${y}px;max-width:${MAXW + 20}px" title="${esc(it.p.name)} · ${esc(deathTxt(it.p))}"><i></i><span>${esc(it.nm)}</span></a>`; }).join("");
    grid.style.width = `${W}px`; grid.style.setProperty("--lw", `${lw}px`);
    grid.innerHTML = `<div class="tlruler" style="width:${W}px"><div class="tlcorner"><b>${T("هجري", "Hicrî")}</b><span>${T("ميلادي", "Milâdî")}</span></div>${ruler}</div>
      <div class="tlbody" style="height:${H}px">${regs}${lines}<i class="tlsel" hidden></i>${its}</div>`;
    els = []; grid.querySelectorAll("[data-k]").forEach(el => { const k = +el.dataset.k; (els[k] = els[k] || []).push(el); });
    mark();
  };
  // scrollLeft RTL kutuda negatiftir; "baştan" uzaklık olarak okunur/yazılır
  const sL = () => Math.abs(box.scrollLeft), setSL = v => { box.scrollLeft = rtl ? -v : v; };
  const yearAtCenter = () => Y0 + (sL() + (box.clientWidth + LW()) / 2 - LW() - 16) / kx;
  const center = (year, top) => { setSL(X(year) - (box.clientWidth + LW()) / 2); if (top != null) box.scrollTop = top - (box.clientHeight - RH) / 2; };
  const rel = new Set();
  const mark = () => {
    grid.querySelectorAll(".on, .rel").forEach(el => el.classList.remove("on", "rel"));
    const ln = $(".tlsel", grid);
    if (!cur) { ln.hidden = true; return; }
    rel.forEach(id => { const it = byId.get(id); it && (els[it.k] || []).forEach(el => el.classList.add("rel")); });
    (els[cur.k] || []).forEach(el => el.classList.add("on"));
    ln.hidden = false; ln.style.insetInlineStart = `${X(cur.p.d)}px`;
  };
  const regLine = it => { const pl = PL.get(it.p.place), [ar, tr] = lab[it.reg] || [it.reg, it.reg]; return `<span>${esc(LANG === "tr" ? tr : ar)}${pl ? ` · ${esc(plName(pl))}` : ""}</span>`; };
  const pick = (it, go) => {
    cur = it; rel.clear();
    if (it) { const gi = g.byId.get(it.p.id);
      if (gi !== undefined) { g.up[gi].forEach(([j]) => rel.add(g.nodes[j].id)); g.down[gi].forEach(([j]) => rel.add(g.nodes[j].id)); }
      infoCard(card, it.p.id, regLine(it)); history.replaceState(null, "", `#/zaman/${it.p.id}`);
      document.title = `${T("الزمن", "Zaman")}: ${it.p.name} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
      if (go) center(it.p.d, RH + it.row.top + PAD + it.lane * LH); }
    else { card.hidden = true; history.replaceState(null, "", "#/zaman"); }
    mark();
  };
  card.addEventListener("click", e => { if (e.target.closest(".x")) pick(null); });
  grid.addEventListener("click", e => { const a = e.target.closest("a.tli"); if (!a) return; e.preventDefault(); if (drag.moved < 6) pick(items[+a.dataset.k]); });
  const zoom = f => { const y = cur ? cur.p.d : yearAtCenter(), nk = Math.max(1.2, Math.min(24, kx * f)); if (nk === kx) return;
    const fy = cur ? null : box.scrollTop / Math.max(1, box.scrollHeight);
    kx = nk; render(); if (cur) center(y, RH + cur.row.top + PAD + cur.lane * LH); else { center(y); box.scrollTop = fy * box.scrollHeight; } };
  // fareyle sürükleyerek kaydırma (dokunmatikte tarayıcının kendi kaydırması)
  const drag = { on: false, moved: 0 };
  box.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse" || e.button) return; drag.on = true; drag.moved = 0; drag.x = e.clientX; drag.y = e.clientY; });
  addEventListener("pointermove", e => { if (!drag.on || !box.isConnected) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy); if (drag.moved > 5) { box.classList.add("drag"); box.scrollLeft -= dx; box.scrollTop -= dy; } });
  addEventListener("pointerup", () => { drag.on = false; box.classList.remove("drag"); setTimeout(() => { drag.moved = 0; }, 0); });
  box.addEventListener("wheel", e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  const step = dir => { const i = cur ? order.indexOf(cur) : dir > 0 ? -1 : order.length;
    const it = order[Math.max(0, Math.min(order.length - 1, i + dir))]; if (it) pick(it, true); };
  view.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => step(+b.dataset.nav)));
  view.querySelectorAll("[data-z]").forEach(b => b.addEventListener("click", () => zoom(+b.dataset.z)));
  const key = e => {
    if (!document.body.contains(box)) { document.removeEventListener("keydown", key); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || /^(input|select|textarea)$/i.test(e.target.tagName || "")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); step((e.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1)); }
    else if (e.key === "+" || e.key === "=") zoom(1.4);
    else if (e.key === "-") zoom(.7);
  };
  document.addEventListener("keydown", key);
  $("#tsearch").replaceWith(localSearch(T("ابحث عن عَلَم…", "Âlim bul"), q => findPersons(q, 40).filter(p => byId.has(p.id)).slice(0, 12)
    .map(p => ({ id: p.id, html: `<span>${esc(p.name)}</span><span class="d num">${deathTxt(p)}</span>` })), id => pick(byId.get(id), true)));
  let lastW = 0;
  const refit = () => { if (!document.body.contains(box)) return; const nw = narrow(); if (nw === lastW) return; lastW = nw;
    const y = cur ? cur.p.d : null; measure(); render(); if (cur) center(y, RH + cur.row.top + PAD + cur.lane * LH); };
  stageToggle($("#tstage"), $("#tstage .fsbtn"), () => {});
  new ResizeObserver(refit).observe(box);
  measure(); lastW = narrow(); render();
  ribbon($("#ribbon"), id => { const it = byId.get(id); if (it) { pick(it, true); $("#tstage").scrollIntoView({ behavior: "smooth", block: "start" }); } });
  const it0 = sel && byId.get(sel);
  if (it0) pick(it0, true); else center(300, null);
  if (sel && !it0) toast(T("لا يُعرف لهذا العَلَم سنة وفاة", "Bu âlimin vefat yılı bilinmiyor"));
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (!document.body.contains(box)) return;
    const y = cur ? cur.p.d : yearAtCenter(), t = box.scrollTop; measure(); render(); if (cur) center(y, RH + cur.row.top + PAD + cur.lane * LH); else { center(y); box.scrollTop = t; } });
}

// ---------- kitap ağı ----------
/* Eserler (books.json): âlimlerin eserleri ve şerh / hâşiye / ihtisar / nazım ilişkileri.
   Üç bölüm: asırlara göre tür yoğunluğu (yığılmış sütun), eser aileleri (her satır bir ana metin ve ondan
   doğan şerh-hâşiye zinciri, yatayda müellifin vefat yılı) ve aranabilir liste. */
let BOOKS_NET;
const bookNet = async () => {
  if (BOOKS_NET) return BOOKS_NET;
  const d = await load("books.json");
  const byId = new Map(d.works.map(w => [w.id, w])), kids = new Map();
  d.works.forEach(w => { if (w.b && byId.has(w.b)) { if (!kids.has(w.b)) kids.set(w.b, []); kids.get(w.b).push(w); } });
  const root = w => { let x = w, n = 0; while (x.b && byId.has(x.b) && n++ < 20) x = byId.get(x.b); return x; };
  return (BOOKS_NET = { ...d, byId, kids, root });
};
const WK_ORDER = ["asl", "sharh", "hashiya", "ikhtisar", "nazm", "other"];
const WK = { asl: ["متن", "Ana metin"], sharh: ["شرح", "Şerh"], hashiya: ["حاشية وتعليق", "Hâşiye / ta‘lîk"], ikhtisar: ["اختصار", "İhtisar"],
  nazm: ["نظم", "Nazım"], other: ["أخرى", "Diğer (tahrîc, tekmile, fetâvâ)"], tahric: ["تخريج", "Tahrîc"], tekmile: ["تكملة", "Tekmile"], fetava: ["فتاوى", "Fetâvâ"] };
const wkind = k => WK_ORDER.includes(k) ? k : "other";
const wkName = k => T(...(WK[k] || WK.other));
const WK_SUF = { sharh: ["شرح", "şerhi"], hashiya: ["حاشية على", "hâşiyesi"], ikhtisar: ["مختصر", "muhtasarı"], nazm: ["نظم", "nazmı"],
  tahric: ["تخريج أحاديث", "tahrîci"], tekmile: ["تكملة", "tekmilesi"] };
// Türkçe adı olmayan (Arapça metinden gelen) türetilmiş eser: "el-Hidâye şerhi"; tersi Arapçada "شرح الهداية"
const wTitle = (w, d = 0) => {
  const own = LANG === "tr" ? w.tr : w.ar, base = BOOKS_NET && w.b && BOOKS_NET.byId.get(w.b), suf = WK_SUF[w.k];
  if (own) return own;
  if (base && suf && d < 3) return LANG === "tr" ? `${wTitle(base, d + 1)} ${suf[1]}` : `${suf[0]} ${wTitle(base, d + 1)}`;
  return w.ar || w.tr;
};
const wAuthor = w => w.a ? shortName(w.a) : w.an || "";
const wAuthorLink = w => w.a ? `<a href="#/p/${esc(w.a)}">${esc(shortName(w.a))}</a>` : esc(w.an || T("مجهول", "bilinmiyor"));
const wYear = w => w.y ? (LANG === "tr" ? `ö. ${w.y}/${CE(w.y)}` : `ت ${AR(w.y)}هـ`) : "";

function workCard(el, N, w) {
  const base = w.b && N.byId.get(w.b), kids = (N.kids.get(w.id) || []).slice().sort((a, b) => (a.y || 9999) - (b.y || 9999));
  const other = LANG === "tr" ? w.ar : w.tr;
  el.innerHTML = `<button type="button" class="x" aria-label="${T("إغلاق", "Kapat")}">×</button>
    <span class="wk k-${wkind(w.k)}">${wkName(w.k)}</span>
    <b>${esc(wTitle(w))}</b>${other ? `<span class="${LANG === "tr" ? "arn" : ""}" ${LANG === "tr" ? 'lang="ar" dir="rtl"' : 'lang="tr"'}>${esc(other)}</span>` : ""}
    <span>${wAuthorLink(w)}${w.y ? ` <span class="num">(${wYear(w)})</span>` : ""}</span>
    ${base ? `<span>${T("على", "Dayandığı eser:")} <a href="#/kitap/${esc(base.id)}">${esc(wTitle(base))}</a> — ${esc(wAuthor(base))}</span>` : w.bt ? `<span>${T("على", "Dayandığı eser:")} ${esc(w.bt)}</span>` : ""}
    ${kids.length ? `<span>${AR(kids.length)} ${T("عمل عليه", "eser buna dayanıyor")}:</span><span class="wkids">${kids.slice(0, 12).map(k => `<a href="#/kitap/${esc(k.id)}"><i class="k-${wkind(k.k)}"></i>${esc(wTitle(k))}</a>`).join("")}${kids.length > 12 ? `<em>+${AR(kids.length - 12)}</em>` : ""}</span>` : ""}
    ${w.s && w.s.length ? `<span class="wsrc">${w.s.map(i => esc(N.cites[i])).join(" · ")}</span>` : w.c ? `<span class="wsrc">${T("من قائمة المتون المشهورة", "Temel metinler listesinden")}</span>` : ""}`;
  el.hidden = false;
}

async function viewBooks(view, sel) {
  const N = await bookNet();
  const W = N.works.filter(w => w.y);
  const cent = y => Math.floor((y - 1) / 100) + 1;
  const C0 = 2, C1 = Math.max(...W.map(w => cent(w.y)));
  const counts = {}; for (let c = C0; c <= C1; c++) counts[c] = Object.fromEntries(WK_ORDER.map(k => [k, 0]));
  W.forEach(w => { const c = cent(w.y); if (counts[c]) counts[c][wkind(w.k)]++; });
  const derivedPeak = Object.entries(counts).map(([c, o]) => [c, o.sharh + o.hashiya]).sort((a, b) => b[1] - a[1])[0];
  // aileler: en az üç eserli kökler
  const fam = new Map();
  N.works.forEach(w => { const r = N.root(w); if (!fam.has(r.id)) fam.set(r.id, []); fam.get(r.id).push(w); });
  const fams = [...fam.entries()].map(([id, ws]) => ({ r: N.byId.get(id), ws: ws.filter(w => w.y) })).filter(f => f.ws.length >= 3 && f.r.y)
    .sort((a, b) => b.ws.length - a.ws.length).slice(0, 22).sort((a, b) => a.r.y - b.r.y);
  view.innerHTML = `<div class="pagehead"><h1>${T("شبكة الكتب", "Kitap ağı")}</h1><span class="c num">${AR(N.works.length)} ${T("كتابًا", "eser")}</span></div>
    <p class="lede">${T("مؤلفات الأعلام كما وردت في كتب الطبقات (بعد صيغ «صنّف» و«له» و«شرح» ونحوها) وفي «فقهاء الحنفية» لأحمد أوزل، وصلاتها: الشرح والحاشية والاختصار والنظم.",
      "Âlimlerin eserleri — tabakat maddelerinde telif ifadesiyle (صنّف، له، شرح…) anılanlar ve Ahmet Özel’in Hanefî Fıkıh Âlimleri’ndeki listeler — ve aralarındaki şerh, hâşiye, ihtisar ve nazım ilişkileri.")}</p>
    <section class="bsec"><h2>${T("أنواع التأليف في كل قرن", "Asırlara göre telif türleri")}</h2>
      <p class="legend">${T(`بحسب قرن وفاة المؤلف. أكثر القرون شروحًا وحواشي: القرن ${CENT[derivedPeak[0]] || AR(derivedPeak[0])}، ولقوائم أوزل المفصّلة للقرنين التاسع والعاشر أثر في هذا الارتفاع.`,
        `Müellifin vefat asrına göre (hicrî). Şerh ve hâşiyenin en yoğun olduğu asır: ${centName(+derivedPeak[0])}. IX–X. asırlardaki yükselişte Hanefî Fıkıh Âlimleri’nin bu dönem için verdiği ayrıntılı eser listelerinin de payı vardır.`)}</p>
      <div class="wlegend">${WK_ORDER.map(k => `<span><i class="k-${k}"></i>${wkName(k)}</span>`).join("")}</div>
      <div class="bchart" id="bchart"></div><div class="tip" hidden></div></section>
    <section class="bsec"><h2>${T("أسر الكتب", "Eser aileleri")}</h2>
      <p class="legend">${T("كل صف متن وما تفرّع عنه من شروح وحواشٍ ومختصرات، على محور سنة وفاة المؤلف. اضغط على كتاب لبطاقته.",
        "Her satır bir ana metin ve ondan doğan şerh, hâşiye ve ihtisarlardır; yatay eksen müellifin vefat yılıdır. Bir esere tıklayınca kartı açılır; eğriler eseri dayandığı esere bağlar.")}</p>
      <div class="netwrap bnwrap"><div class="tlbox bnbox"><div class="tlgrid bngrid"></div></div><div class="icard wcard" hidden></div></div></section>
    <section class="bsec"><h2>${T("كل الكتب", "Bütün eserler")}</h2>
      <div class="filters wfil"><span id="wsearch"></span>
        <select id="wkind" aria-label="${T("النوع", "Tür")}"><option value="">${T("كل الأنواع", "Bütün türler")}</option>${WK_ORDER.map(k => `<option value="${k}">${wkName(k)}</option>`).join("")}</select>
        <select id="wcent" aria-label="${T("القرن", "Asır")}"><option value="">${T("كل القرون", "Bütün asırlar")}</option>${Object.keys(counts).map(c => `<option value="${c}">${LANG === "tr" ? centName(+c) : CENT[c]}</option>`).join("")}</select></div>
      <ul class="wlist" id="wlist"></ul></section>`;
  // ---- yığılmış sütun ----
  const chart = $("#bchart"), tip = $(".bsec .tip", view);
  const drawChart = () => {
    const w = chart.clientWidth, h = 260, L = 34, B = 26, Tp = 18, cs = Object.keys(counts).map(Number);
    const max = Math.max(...cs.map(c => WK_ORDER.reduce((s, k) => s + counts[c][k], 0)));
    const step = [10, 20, 25, 50, 100].find(s => max / s <= 5) || 100, top = Math.ceil(max / step) * step;
    const bw = (w - L - 8) / cs.length, bar = Math.min(38, bw * .62), Y = v => Tp + (h - Tp - B) * (1 - v / top);
    let g = "";
    for (let v = 0; v <= top; v += step) g += `<line x1="${L}" x2="${w - 4}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 6}" y="${Y(v) + 4}" class="ax" text-anchor="end">${AR(v)}</text>`;
    cs.forEach((c, i) => {
      const cx = L + bw * i + bw / 2; let acc = 0, segs = "";
      WK_ORDER.forEach(k => { const n = counts[c][k]; if (!n) return;
        const y1 = Y(acc + n), y0 = Y(acc); acc += n;
        segs += `<rect class="k-${k}" x="${cx - bar / 2}" y="${y1}" width="${bar}" height="${Math.max(0, y0 - y1 - 2)}" rx="2" data-c="${c}" data-k="${k}" data-n="${n}"/>`; });
      g += segs + (acc ? `<text x="${cx}" y="${Y(acc) - 5}" class="tot" text-anchor="middle">${AR(acc)}</text>` : "")
        + `<text x="${cx}" y="${h - 8}" class="ax" text-anchor="middle">${LANG === "tr" ? ROM(c) : AR(c)}</text>`;
    });
    chart.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${T("أنواع التأليف في كل قرن", "Asırlara göre telif türleri")}">${g}</svg>`;
  };
  chart.addEventListener("pointermove", e => { const r = e.target.closest("rect"); if (!r) { tip.hidden = true; return; }
    const c = +r.dataset.c, tot = WK_ORDER.reduce((s, k) => s + counts[c][k], 0);
    tip.innerHTML = `<b>${LANG === "tr" ? centName(c) : `القرن ${CENT[c]}`}</b><br>${wkName(r.dataset.k)}: ${AR(r.dataset.n)} / ${AR(tot)}`;
    const b = chart.parentElement.getBoundingClientRect(); tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - b.left + 12, b.width - 200)}px`; tip.style.top = `${e.clientY - b.top + 12}px`; });
  chart.addEventListener("pointerleave", () => { tip.hidden = true; });
  // ---- aileler ----
  const box = $(".bnbox", view), grid = $(".bngrid", view), card = $(".wcard", view), rtl = LANG === "ar";
  const narrow = () => box.clientWidth < 600, LW = () => narrow() ? 110 : 200, LH = 24, PAD = 10, RH = 34;
  const ys = fams.flatMap(f => f.ws.map(w => w.y)), Y0 = Math.floor((Math.min(...ys) - 20) / 50) * 50, Y1 = Math.max(...ys) + 80;
  let kx = 3.2;
  const mctx = document.createElement("canvas").getContext("2d");
  const X = y => LW() + 16 + (y - Y0) * kx;
  let nodes = [];
  const drawNet = () => {
    mctx.font = `${narrow() ? 11 : 12}px ${getComputedStyle(grid).fontFamily}`;
    let top = 0; nodes = [];
    const rows = fams.map(f => {
      const ends = [], ws = f.ws.slice().sort((a, b) => a.y - b.y || (a === f.r ? -1 : 1));
      ws.forEach(w => { const lw = Math.min(200, mctx.measureText(wTitle(w)).width), x0 = X(w.y) - 6, x1 = X(w.y) + 14 + lw;
        let L = ends.findIndex(e => e + 8 <= x0); if (L < 0) { L = ends.length; ends.push(0); } ends[L] = x1;
        nodes.push({ w, row: f, lane: L, top }); });
      const h = Math.max(ends.length * LH + PAD * 2, 60); const r = { f, top, h }; top += h; return r;
    });
    nodes.forEach(n => { n.y = n.top + PAD + n.lane * LH + LH / 2; });
    const pos = new Map(nodes.map(n => [n.w.id, n])), H = top, Wd = X(Y1);
    let ruler = "", lines = "";
    for (let y = Math.ceil(Y0 / 50) * 50; y <= Y1; y += 50) { const x = X(y);
      lines += `<i class="tlg${y % 100 ? " m" : " c"}" style="inset-inline-start:${x}px"></i>`;
      ruler += `<span class="h num" style="inset-inline-start:${x}px">${LANG === "tr" ? y : AR(y)}</span><span class="m num" style="inset-inline-start:${x}px">${LANG === "tr" ? CE(y) : AR(CE(y))}</span>`; }
    const rowsHtml = rows.map((r, k) => `<div class="tlrow${k % 2 ? " odd" : ""}" style="top:${r.top}px;height:${r.h}px"><div class="tlreg"><div>
      <a href="#/kitap/${esc(r.f.r.id)}"><b>${esc(wTitle(r.f.r))}</b></a><span>${esc(wAuthor(r.f.r))}</span><small class="num">${AR(r.f.ws.length)} ${T("كتب", "eser")}</small></div></div></div>`).join("");
    // eğriler: SVG'de sol/sağ çevirmesi elle (RTL'de x = genişlik − x)
    const sx = x => rtl ? Wd - x : x;
    const curves = nodes.filter(n => n.w.b && pos.has(n.w.b)).map(n => { const p = pos.get(n.w.b), x1 = sx(X(p.w.y)), x2 = sx(X(n.w.y)), mx = (x1 + x2) / 2;
      return `<path class="k-${wkind(n.w.k)}" data-id="${esc(n.w.id)}" d="M${x1},${p.y} C${mx},${p.y} ${mx},${n.y} ${x2},${n.y}"/>`; }).join("");
    const dots = nodes.map(n => `<a class="bn k-${wkind(n.w.k)}${n.w === n.row.r ? " root" : ""}" data-id="${esc(n.w.id)}" href="#/kitap/${esc(n.w.id)}" style="inset-inline-start:${X(n.w.y) - 5}px;top:${n.y - LH / 2}px" title="${esc(wTitle(n.w))} — ${esc(wAuthor(n.w))} (${esc(wYear(n.w))})"><i></i><span>${esc(wTitle(n.w))}</span></a>`).join("");
    grid.style.width = `${Wd}px`; grid.style.setProperty("--lw", `${LW()}px`);
    grid.innerHTML = `<div class="tlruler" style="width:${Wd}px"><div class="tlcorner"><b>${T("هجري", "Hicrî")}</b><span>${T("ميلادي", "Milâdî")}</span></div>${ruler}</div>
      <div class="tlbody" style="height:${H}px">${rowsHtml}${lines}<svg class="bncurves" width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}" aria-hidden="true">${curves}</svg>${dots}</div>`;
    markSel();
  };
  let cur = null;
  const markSel = () => {
    grid.querySelectorAll(".on,.rel").forEach(e => e.classList.remove("on", "rel"));
    if (!cur) return;
    const rel = new Set([cur.id, ...(N.kids.get(cur.id) || []).map(k => k.id)]); let b = cur; while (b.b && N.byId.has(b.b)) { rel.add(b.b); b = N.byId.get(b.b); }
    grid.querySelectorAll("[data-id]").forEach(e => { if (e.dataset.id === cur.id) e.classList.add("on"); else if (rel.has(e.dataset.id)) e.classList.add("rel"); });
    grid.classList.add("focus");
  };
  const pick = (w, go) => { cur = w || null; grid.classList.toggle("focus", !!w);
    if (!w) { card.hidden = true; history.replaceState(null, "", "#/kitap"); markSel(); return; }
    workCard(card, N, w); history.replaceState(null, "", `#/kitap/${w.id}`); markSel();
    document.title = `${wTitle(w)} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
    const n = nodes.find(n => n.w === w);
    if (go && n) { const x = X(w.y) - box.clientWidth / 2; box.scrollLeft = rtl ? -x : x; box.scrollTop = n.y + RH - box.clientHeight / 2;
      box.closest(".bsec").scrollIntoView({ behavior: "smooth", block: "start" }); } };
  grid.addEventListener("click", e => { const a = e.target.closest("a.bn"); if (!a) return; e.preventDefault(); pick(N.byId.get(a.dataset.id)); });
  card.addEventListener("click", e => { if (e.target.closest(".x")) pick(null);
    const a = e.target.closest('a[href^="#/kitap/"]'); if (a) { e.preventDefault(); pick(N.byId.get(decodeURIComponent(a.getAttribute("href").slice(8))), true); } });
  // ---- liste ----
  const list = $("#wlist"); let q = "", lim = 60;
  const ar = s => /[؀-ۿ]/.test(s);
  const drawList = () => {
    const k = $("#wkind").value, c = +$("#wcent").value, qa = ar(q) ? norm(q) : fold(q);
    const rows = N.works.filter(w => (!k || wkind(w.k) === k) && (!c || (w.y && cent(w.y) === c))
      && (!q || (ar(q) ? norm(w.ar || "") : fold((w.tr || "") + " " + wAuthor(w))).includes(qa)))
      .sort((a, b) => (a.y || 9999) - (b.y || 9999));
    list.innerHTML = rows.slice(0, lim).map(w => `<li><span class="wk k-${wkind(w.k)}">${wkName(w.k)}</span>
      <a href="#/kitap/${esc(w.id)}" data-id="${esc(w.id)}">${esc(wTitle(w))}</a>
      <span class="d">${esc(wAuthor(w))}${w.y ? ` <span class="num">(${wYear(w)})</span>` : ""}</span>
      ${w.b && N.byId.has(w.b) ? `<span class="d">← ${esc(wTitle(N.byId.get(w.b)))}</span>` : ""}</li>`).join("")
      + (rows.length > lim ? `<li class="more"><button type="button" class="btn small" id="wmore">${T(`عرض المزيد (${AR(rows.length - lim)})`, `Daha fazla göster (${rows.length - lim})`)}</button></li>` : "")
      || `<li class="empty">${T("لا نتائج", "Sonuç yok")}</li>`;
  };
  list.addEventListener("click", e => { if (e.target.id === "wmore") { lim += 120; drawList(); return; }
    const a = e.target.closest("a[data-id]"); if (!a) return; e.preventDefault(); pick(N.byId.get(a.dataset.id), true); });
  $("#wkind").addEventListener("change", () => { lim = 60; drawList(); }); $("#wcent").addEventListener("change", () => { lim = 60; drawList(); });
  $("#wsearch").replaceWith(localSearch(T("ابحث عن كتاب أو مؤلف…", "Eser ya da müellif ara…"), s => { q = s; drawList();
    return []; }, () => {}));
  $(".wfil input").addEventListener("input", e => { q = e.target.value.trim(); drawList(); });
  let lastW = 0;
  new ResizeObserver(() => { if (!document.body.contains(chart) || chart.clientWidth === lastW) return; lastW = chart.clientWidth; drawChart(); drawNet(); }).observe(chart);
  drawChart(); drawNet(); drawList();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => document.body.contains(grid) && drawNet());
  const w0 = sel && N.byId.get(sel);
  if (w0) pick(w0, true); else if (sel) toast(T("لا يوجد هذا الكتاب", "Böyle bir eser yok"));
  else document.title = `${T("شبكة الكتب", "Kitap ağı")} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
}

// ---------- about ----------
// kitap tanıtımları (Türkçe, Arapça); el-Gurefü’l-aliyye'nin iki cildi tek kart
const BOOK_DESC = {
  qand: ["Semerkant’ta yetişmiş ya da şehre gelmiş âlimlerin alfabetik tarihi. Eserin aslı günümüze tam olarak ulaşmamış, bir seçmesi kalmıştır. Yalnız Hanefîlere ayrılmadığından Mâverâünnehir’in erken dönem muhaddis ve fakihleri için ayrıca değerlidir.",
    "تاريخ لمن نشأ بسمرقند أو دخلها من العلماء، مرتّب على الحروف. لم يصل الأصل كاملًا، وإنما بقي منتخب منه. ولأنه غير مقصور على الحنفية فهو مصدر نفيس لمحدّثي ما وراء النهر وفقهائه في القرون الأولى."],
  jawahir: ["Hanefî mezhebinin ilk müstakil ve kapsamlı tabakātı. Harf sırasına göre düzenlenmiştir. Sonunda künyeler, “İbn…” diye tanınanlar, nisbeler ve lakaplar için ayrı bölümler vardır. Sonraki bütün Hanefî tabakātının ana kaynağıdır.",
    "أول كتاب جامع مستقل في طبقات الحنفية، مرتّب على حروف المعجم، وفي آخره أبواب للكنى والأبناء والأنساب والألقاب. وعليه عوّل كل من صنّف في طبقات الحنفية بعده."],
  taj_tarajim: ["Eser telif etmiş Hanefî âlimlere ayrılmış muhtasar bir tabakāt. Her biyografide âlimin eserleri sayılır. Kureşî’nin kitabından yararlanır, ona bazı ekler yapar.",
    "مختصر في تراجم من صنّف من الحنفية، يذكر مع كل عَلَم مصنفاته، استفاد فيه من الجواهر المضية وزاد عليها."],
  ghuraf_v1: ["Müteahhir Hanefîlere, özellikle VIII–X. (XIV–XVI.) yüzyıllarda Şam, Mısır ve Anadolu’da yaşayanlara ayrılmış bir zeyl. Müellif çağdaşlarının ve hocalarının biyografilerini doğrudan tanıklıkla verir.",
    "ذيل في تراجم متأخري الحنفية، ولا سيما أهل الشام ومصر والروم في القرون الثامن إلى العاشر، يترجم فيه المؤلف لشيوخه ومعاصريه عن مشاهدة."],
  kataib: ["Ebû Hanîfe’den müellifin zamanına kadar Hanefî fakihlerini tabakalara (kuşaklara) göre sıralar. Osmanlı ulemâsı için erken ve önemli bir kaynaktır.",
    "رتّب فيه فقهاء الحنفية على الطبقات من أبي حنيفة إلى زمان المؤلف، وهو من أوائل المصادر وأهمها في علماء الدولة العثمانية."],
  tabaqat_saniyya: ["Harf sırasına göre düzenlenmiş, dönemin en hacimli Hanefî tabakātı. Önceki kitapları derler ve Memlük–Osmanlı dönemi Mısır, Şam ve Rûm âlimleriyle genişletir.",
    "أوسع كتب طبقات الحنفية في عصره، مرتّب على الحروف، جمع ما في الكتب قبله وزاد عليها كثيرًا من علماء مصر والشام والروم في العهدين المملوكي والعثماني."],
  athmar: ["Kureşî’nin el-Cevâhir’ine dayanan muhtasar bir Hanefî tabakātı. Sonunda nisbeler için kısa bir sözlük (kitâbü’l-ensâb) vardır. Bu sözlüğün maddeleri âlim sayılmaz; haritada ilgili şehrin penceresinde nisbe notu olarak gösterilir.",
    "مختصر في طبقات الحنفية مبني على الجواهر المضية، وفي آخره «كتاب الأنساب» في ضبط النسب. ومواد هذا الباب ليست تراجم، فتظهر في الخريطة تعليقاتٍ على البلد المنسوب إليه."],
  fawaid: ["Kefevî’nin Ketâib’inden seçilmiş biyografiler ve Leknevî’nin eklemeleri. Müellifin et-Ta‘lîkātü’s-seniyye adlı kendi hâşiyesiyle basılmıştır. Hint alt kıtası Hanefîleri için de başvuru kaynağıdır.",
    "انتخبه اللكنوي من كتائب أعلام الأخيار للكفوي وزاد عليه، وطُبع مع حاشيته «التعليقات السنية». وهو مرجع أيضًا لحنفية بلاد الهند."],
};
// ---------- katkı: okur önerileri ve yönetim ----------
// Onaylanan katkılar data/katki.json'dadır ve yüklenirken şahıs sayfalarına ve ağa eklenir (pipeline'ı yeniden koşmak gerekmez).
// Okur önerisi GitHub'da "[katkı]" başlıklı bir konu (issue) olur: KATKI_URL tanımlıysa hesap gerekmeden sunucu üzerinden,
// değilse okurun kendi GitHub hesabıyla hazır doldurulmuş konu formundan. Yönetici (#/yonetim) jetonunu bir kez girer;
// sonra hem kendi katkısını doğrudan yayımlar hem bekleyen önerileri onaylar ya da reddeder.
const REPO = "fukaha/tabaqat";
const KATKI_URL = "";   // öneri sunucusu (worker/README.md); boşsa GitHub konu formu kullanılır
const KT_FILE = "site/data/katki.json", KT_MARK = "<!-- katki";
const KT_REL = ["fiqh", "took", "hadith", "read", "companion"];
let KATKI = [];
const ktKey = x => `${x.t}>${x.s}`;
// yükleme sonrası: hoca/talebe sayıları (silsile bağlantısı ve arama süzgeci bunlara bakar)
function ktCounts(items, sign = 1) {
  items.forEach(x => { const t = P.get(x.t), s = P.get(x.s), k = x.op === "del" ? -sign : sign;
    if (t) t.ns = Math.max(0, t.ns + k); if (s) s.nt = Math.max(0, s.nt + k); });
}
// şahıs kaydına katkıları uygular (kopyası üzerinde; önbellekteki asıl kayıt değişmez)
function ktPerson(id, d0) {
  const mine = KATKI.filter(x => x.t === id || x.s === id);
  if (!mine.length) return d0;
  const d = { ...d0, teachers: d0.teachers.slice(), students: d0.students.slice() };
  mine.forEach(x => {
    const side = x.s === id ? "teachers" : "students", other = x.s === id ? x.t : x.s;
    if (x.op === "del") { d[side] = d[side].filter(r => r.id !== other); return; }
    const ev = [x.src, x.q || x.note || "", ""], i = d[side].findIndex(r => r.id === other);
    if (i < 0) d[side].push({ id: other, rels: [x.rel || "took"], n: 1, ev: [ev], user: true });
    else { const r = d[side][i]; d[side][i] = { ...r, n: r.n + 1, ev: [...r.ev, ev], rels: r.rels.includes(x.rel) ? r.rels : [...r.rels, x.rel], user: true }; }
  });
  return d;
}
// ağ: eklenen bağlar kenar, silinenler çıkarılır; ağda olmayan âlim düğüm olarak eklenir
function ktGraph(G) {
  const node = id => { if (G.byId.has(id)) return G.byId.get(id); const p = who(id); if (!p) return;
    const i = G.nodes.length; G.nodes.push({ id, ar: p.ar, tr: p.tr, d: p.d, deg: 0, x: p.d || 0, y: 0, guess: !!p.est, salaf: !!p.salaf,
      get name() { return LANG === "tr" ? this.tr : this.ar; } }); G.up.push([]); G.down.push([]); G.byId.set(id, i); return i; };
  KATKI.forEach(x => {
    if (x.op === "del") { const t = G.byId.get(x.t), s = G.byId.get(x.s); if (t === undefined || s === undefined) return;
      G.up[s] = G.up[s].filter(e => e[0] !== t); G.down[t] = G.down[t].filter(e => e[0] !== s);
      G.edges = G.edges.filter(e => !(e[0] === t && e[1] === s)); return; }
    const t = node(x.t), s = node(x.s); if (t === undefined || s === undefined || G.up[s].some(e => e[0] === t)) return;
    G.up[s].push([t, 1, 0]); G.down[t].push([s, 1, 0]); G.edges.push([t, s, 1, 0]); G.nodes[t].deg++; G.nodes[s].deg++;
  });
}
// gelen öneriyi denetler: yalnız bilinen alanlar, bilinen âlimler, sınırlı uzunluk
function ktClean(o) {
  if (!o || typeof o !== "object") return null;
  const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const x = { op: str(o.op, 5), t: str(o.t, 12), s: str(o.s, 12), rel: str(o.rel, 12), p: str(o.p, 12),
    src: str(o.src, 300), q: str(o.q, 1200), note: str(o.note, 1500), by: str(o.by, 80) };
  Object.keys(x).forEach(k => { if (!x[k]) delete x[k]; });
  if (!["add", "del", "note"].includes(x.op)) return null;
  if (x.op === "note") return P.has(x.p) || !x.p ? (x.note ? x : null) : null;
  if (!who(x.t) || !who(x.s) || x.t === x.s) return null;
  if (x.op === "add" && (!KT_REL.includes(x.rel) || !x.src)) return null;
  return x;
}
const ktName = id => { const p = who(id); return p ? `${p.tr || p.ar}${p.d ? ` (ö. ${p.d})` : ""}` : id; };
function ktIssue(x) {
  const pg = x.op === "note" ? x.p : x.s;
  const title = x.op === "add" ? `[katkı] ${ktName(x.t)} → ${ktName(x.s)} (hoca–talebe)`
    : x.op === "del" ? `[katkı] Hatalı bağ: ${ktName(x.t)} → ${ktName(x.s)}` : `[katkı] Düzeltme: ${x.p ? ktName(x.p) : "genel"}`;
  const L = [x.op === "add" ? `**Önerilen bağ:** ${ktName(x.t)} → ${ktName(x.s)} (${REL_L.tr[x.rel] || x.rel})`
    : x.op === "del" ? `**Hatalı olduğu bildirilen bağ:** ${ktName(x.t)} → ${ktName(x.s)}` : `**Düzeltme bildirimi**`];
  if (pg) L.push(`Sayfa: https://fukaha.github.io/tabaqat/#/p/${pg}`);
  if (x.src) L.push(`**Kaynak:** ${x.src}`);
  if (x.q) L.push(`**Kanıt metni:**\n> ${x.q}`);
  if (x.note) L.push(`**Açıklama:** ${x.note}`);
  if (x.by) L.push(`**Gönderen:** ${x.by}`);
  L.push("", `${KT_MARK}\n${JSON.stringify(x).replace(/--/g, "- -")}\n-->`);
  return { title: title.slice(0, 200), body: L.join("\n\n") };
}
const ktParse = body => { const m = String(body || "").match(/<!-- katki\s*([\s\S]*?)\s*-->/); if (!m) return null;
  try { return ktClean(JSON.parse(m[1])); } catch (e) { return null; } };

// GitHub API (yalnız yönetici jetonuyla)
const ktTok = () => { try { return localStorage.getItem("gh_token") || ""; } catch (e) { return ""; } };
async function gh(path, opt = {}) {
  const r = await fetch("https://api.github.com" + path, { ...opt, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${ktTok()}`,
    "X-GitHub-Api-Version": "2022-11-28", ...(opt.body ? { "Content-Type": "application/json" } : {}) } });
  if (!r.ok) { const m = (await r.json().catch(() => ({}))).message || ""; const e = new Error(`GitHub ${r.status}${m ? ": " + m : ""}`); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json();
}
const b64enc = s => { const b = new TextEncoder().encode(s); let t = ""; b.forEach(c => { t += String.fromCharCode(c); }); return btoa(t); };
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
let KT_BRANCH;
async function ktRead() {
  KT_BRANCH = KT_BRANCH || (await gh(`/repos/${REPO}`)).default_branch;
  try { const f = await gh(`/repos/${REPO}/contents/${KT_FILE}?ref=${encodeURIComponent(KT_BRANCH)}`);
    return { sha: f.sha, items: JSON.parse(b64dec(f.content)).items || [] }; }
  catch (e) { if (e.status === 404) return { sha: undefined, items: [] }; throw e; }
}
// katki.json'u günceller; arada başkası değiştirdiyse bir kez yeniden okuyup dener
async function ktWrite(mutate, message) {
  for (let i = 0; ; i++) {
    const { sha, items } = await ktRead(); mutate(items);
    try { await gh(`/repos/${REPO}/contents/${KT_FILE}`, { method: "PUT", body: JSON.stringify({ message, branch: KT_BRANCH, sha,
        content: b64enc(JSON.stringify({ items }, null, 1) + "\n") }) });
      ktApply(items); return items; }
    catch (e) { if (i || ![409, 422].includes(e.status)) throw e; }
  }
}
// yayındaki kopyayı hemen günceller (site birkaç dakika içinde yeniden yayımlanır)
function ktApply(items) { ktCounts(KATKI, -1); KATKI = items; ktCounts(KATKI); G = null; }
const ktToday = () => new Date().toISOString().slice(0, 10);
const ktMsg = x => x.op === "add" ? `Katkı: ${ktName(x.t)} → ${ktName(x.s)} hoca–talebe bağı` : `Katkı: ${ktName(x.t)} → ${ktName(x.s)} bağı kaldırıldı`;

// şahıs sayfasındaki "Katkı / düzeltme" penceresi
function katkiBox(id, d) {
  if ($(".ktbox")) return;
  const admin = !!ktTok(), me = P.get(id);
  const box = document.createElement("div"); box.className = "expbox ktbox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", T("اقتراح إضافة أو تصحيح", "Katkı ya da düzeltme öner"));
  const rels = [...d.teachers.map(r => ["t", r.id]), ...d.students.map(r => ["s", r.id])];
  box.innerHTML = `<form class="in ktform" novalidate><div class="hd"><b>${T("اقتراح إضافة أو تصحيح", "Katkı ya da düzeltme öner")}</b><span class="grow"></span>
      <button type="button" class="btn" data-x>${T("إغلاق", "Kapat")}</button></div>
    <p class="hint">${esc(me.name)} ${deathTxt(me)} — ${admin ? T("أنت مسجَّل مديرًا: ما تضيفه يُنشر مباشرة.", "Yönetici olarak girdiniz: eklediğiniz bağ doğrudan yayımlanır.")
      : T("يُراجَع اقتراحك قبل النشر.", "Öneriniz incelendikten sonra yayımlanır.")}</p>
    <fieldset class="ktop"><legend class="label">${T("نوع الاقتراح", "Ne önermek istiyorsunuz?")}</legend>
      <label><input type="radio" name="op" value="t" checked> ${T("شيخ لم يُذكر", "Eksik hoca")}</label>
      <label><input type="radio" name="op" value="s"> ${T("تلميذ لم يُذكر", "Eksik talebe")}</label>
      ${rels.length ? `<label><input type="radio" name="op" value="del"> ${T("صلة خاطئة", "Hatalı bağ")}</label>` : ""}
      <label><input type="radio" name="op" value="note"> ${T("خطأ آخر", "Başka bir hata")}</label></fieldset>
    <div class="ktf" data-for="t s"><span class="label" id="ktwho">${T("العَلَم", "Âlim")}</span><div class="ktpick"></div><p class="ktsel" hidden></p></div>
    <label class="ktf" data-for="t s"><span class="label">${T("نوع الصلة", "Bağ türü")}</span>
      <select name="rel">${KT_REL.map(k => `<option value="${k}">${REL[k]}</option>`).join("")}</select></label>
    <label class="ktf" data-for="del"><span class="label">${T("الصلة", "Hangi bağ?")}</span>
      <select name="del">${rels.map(([k, o], i) => `<option value="${i}">${k === "t" ? T("شيخه: ", "Hocası: ") : T("تلميذه: ", "Talebesi: ")}${esc(who(o)?.name || o)}</option>`).join("")}</select></label>
    <label class="ktf" data-for="t s"><span class="label">${T("المصدر والموضع (لازم)", "Kaynak ve sayfa (zorunlu)")}</span>
      <input name="src" maxlength="300" placeholder="${T("مثلًا: الجواهر المضية ٢/٤٥", "ör. el-Cevâhirü’l-mudıyye, II, 45")}"></label>
    <label class="ktf" data-for="t s"><span class="label">${T("نص الشاهد (اختياري)", "Kanıt metni (isteğe bağlı)")}</span>
      <textarea name="q" rows="2" maxlength="1200"></textarea></label>
    <label class="ktf" data-for="t s del note"><span class="label" data-l>${T("التوضيح", "Açıklama")}</span>
      <textarea name="note" rows="3" maxlength="1500"></textarea></label>
    ${admin ? "" : `<label class="ktf" data-for="t s del note"><span class="label">${T("اسمك (اختياري، يظهر للعموم)", "Adınız (isteğe bağlı, herkese açık görünür)")}</span>
      <input name="by" maxlength="80" autocomplete="name"></label>`}
    <input name="web" class="kthp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="kterr" role="alert" hidden></p>
    <div class="hd ktsub"><span class="grow"></span><button type="submit" class="btn gold">${admin ? T("انشر", "Yayımla") : T("أرسل", "Gönder")}</button></div>
    <div class="ktdone" hidden></div></form>`;
  const f = $("form", box), err = $(".kterr", box); let pick = "";
  const pk = localSearch(T("ابحث عن العَلَم…", "Âlim ara…"), q => findPersons(q, 12).filter(p => p.id !== id)
    .map(p => ({ id: p.id, html: `<span>${esc(p.name)}</span><span class="d">${deathTxt(p)}</span>` })), pid => {
      pick = pid; const s = $(".ktsel", box); s.hidden = false; s.innerHTML = `✓ ${plink(pid)} <span class="d num">${deathTxt(P.get(pid))}</span>`; });
  $(".ktpick", box).append(pk);
  const sync = () => { const op = f.op.value; box.querySelectorAll(".ktf").forEach(el => { el.hidden = !el.dataset.for.split(" ").includes(op); });
    $("#ktwho", box).textContent = op === "s" ? T("التلميذ", "Talebe") : T("الشيخ", "Hoca");
    $("[data-l]", box).textContent = op === "note" ? T("ما الخطأ؟ (لازم)", "Hata nedir? (zorunlu)") : op === "del" ? T("لماذا هي خاطئة؟", "Neden hatalı?") : T("التوضيح", "Açıklama");
    const b = $("[type=submit]", box); b.textContent = admin && op !== "note" ? T("انشر", "Yayımla") : T("أرسل", "Gönder"); };
  f.addEventListener("change", e => e.target.name === "op" && sync()); sync();
  const close = () => { box.remove(); document.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape" && !e.target.closest(".lsearch")) { e.stopPropagation(); close(); } };
  box.addEventListener("click", e => { if (e.target === box || e.target.closest("[data-x]")) close(); });
  document.addEventListener("keydown", key, true);
  f.addEventListener("submit", async e => {
    e.preventDefault(); err.hidden = true;
    const op = f.op.value, v = n => f[n] ? f[n].value : "";
    let x = { op: op === "del" ? "del" : op === "note" ? "note" : "add", rel: v("rel"), src: v("src"), q: v("q"), note: v("note"), by: v("by") };
    if (op === "t") Object.assign(x, { t: pick, s: id });
    else if (op === "s") Object.assign(x, { t: id, s: pick });
    else if (op === "del") { const [k, o] = rels[+v("del")] || []; Object.assign(x, k === "t" ? { t: o, s: id } : { t: id, s: o }); }
    else x.p = id;
    const fail = m => { err.textContent = m; err.hidden = false; };
    if ((op === "t" || op === "s") && !pick) return fail(T("اختر العَلَم من القائمة.", "Listeden bir âlim seçin."));
    if ((op === "t" || op === "s") && !x.src.trim()) return fail(T("اذكر المصدر والموضع.", "Kaynağı ve sayfasını yazın."));
    if (op === "note" && !x.note.trim()) return fail(T("اكتب الخطأ.", "Hatayı kısaca yazın."));
    x = ktClean(x); if (!x) return fail(T("تعذّر قبول الاقتراح.", "Öneri kabul edilemedi."));
    const done = html => { f.querySelectorAll(".ktop, .ktf, .ktsub").forEach(el => { el.hidden = true; }); const dn = $(".ktdone", box); dn.innerHTML = html; dn.hidden = false; };
    const btn = $("[type=submit]", box); btn.disabled = true;
    try {
      if (v("web")) return done(`<p>${T("شكرًا لك.", "Teşekkürler.")}</p>`);
      if (admin && x.op !== "note") {
        await ktWrite(items => items.push({ id: `k${Date.now().toString(36)}`, ...x, by: undefined, at: ktToday() }), ktMsg(x));
        toast(T("نُشر", "Yayımlandı")); close(); route(); return;
      }
      const iss = ktIssue(x);
      if (admin) { await gh(`/repos/${REPO}/issues`, { method: "POST", body: JSON.stringify({ ...iss, labels: ["katki"] }) }); return done(`<p>${T("سُجّل في لوحة الإدارة.", "Yönetim panelindeki listeye eklendi.")}</p>`); }
      if (KATKI_URL) {
        const r = await fetch(KATKI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(x) });
        if (!r.ok) throw new Error(String(r.status));
        return done(`<p><b>${T("وصل اقتراحك، شكرًا لك.", "Öneriniz ulaştı, teşekkürler.")}</b> ${T("يُنشر بعد المراجعة.", "İncelendikten sonra yayımlanacak.")}</p>`);
      }
      const url = `https://github.com/${REPO}/issues/new?labels=katki&title=${encodeURIComponent(iss.title)}&body=${encodeURIComponent(iss.body)}`;
      done(`<p>${T("يُرسل الاقتراح عبر GitHub: افتح الرابط، وسجّل الدخول إن لزم، ثم اضغط «Create».", "Öneri GitHub üzerinden iletilir: bağlantıyı açın, gerekirse giriş yapın ve “Create” düğmesine basın. Öneri hazır doldurulmuş gelir.")}</p>
        <p><a class="btn gold" href="${esc(url)}" target="_blank" rel="noopener">${T("افتح نموذج GitHub", "GitHub formunu aç")} ↗</a></p>`);
    } catch (e2) { btn.disabled = false; fail(`${T("تعذّر الإرسال", "Gönderilemedi")} (${e2.message}).`); }
  });
  (document.fullscreenElement || document.body).append(box); f.op[0].focus();
}

// yönetim paneli (#/yonetim): jeton, bekleyen öneriler, yayındaki katkılar
async function viewAdmin(view) {
  document.title = `${T("لوحة الإدارة", "Yönetim")} — ${UI.brand[LANG === "ar" ? 0 : 1]}`;
  if (!ktTok()) {
    view.innerHTML = `<div class="about ktadmin"><h1>${T("لوحة الإدارة", "Yönetim paneli")}</h1>
      <p class="lede">Buradan okur önerilerini onaylar ya da reddedersiniz; kendi eklediğiniz bağlar da doğrudan yayımlanır. Bunun için GitHub’da bir kez <b>ince ayarlı erişim jetonu</b> (fine-grained personal access token) oluşturun:</p>
      <ol class="ktsteps"><li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new ↗</a> sayfasını açın.</li>
        <li><i>Repository access</i> → <i>Only select repositories</i> → <code>${REPO}</code>.</li>
        <li><i>Permissions</i> → <i>Contents</i>: <b>Read and write</b>, <i>Issues</i>: <b>Read and write</b>.</li>
        <li>Jetonu oluşturup aşağıya yapıştırın.</li></ol>
      <form class="ktlogin"><input name="tok" type="password" autocomplete="off" placeholder="github_pat_…" aria-label="Jeton"><button class="btn gold">Giriş</button></form>
      <p class="kterr" role="alert" hidden></p>
      <p class="legend">Jeton yalnız bu tarayıcıda saklanır ve yalnız GitHub’a gönderilir. Ortak bir bilgisayarda işiniz bitince “Çıkış” deyin.</p></div>`;
    $(".ktlogin", view).addEventListener("submit", async e => {
      e.preventDefault(); const t = e.target.tok.value.trim(), er = $(".kterr", view); if (!t) return;
      try { localStorage.setItem("gh_token", t); const r = await gh(`/repos/${REPO}`);
        if (!r.permissions?.push) throw new Error(T("لا صلاحية كتابة", "Bu jetonun depoya yazma izni yok"));
        route(); }
      catch (x) { try { localStorage.removeItem("gh_token"); } catch (y) {} er.textContent = x.message; er.hidden = false; }
    });
    return;
  }
  view.innerHTML = `<div class="about ktadmin"><h1>${T("لوحة الإدارة", "Yönetim paneli")}<button type="button" class="btn small" id="ktout">${T("خروج", "Çıkış")}</button></h1>
    <section><h2>${T("اقتراحات تنتظر المراجعة", "Bekleyen öneriler")}<span class="c num" id="ktn"></span></h2><div id="ktq"><p class="empty">${T("جارٍ التحميل…", "Yükleniyor…")}</p></div></section>
    <section><h2>${T("الإضافات المنشورة", "Yayındaki katkılar")}<span class="c num" id="ktm"></span></h2><div id="ktl"></div>
      <p class="legend">${T("", "Kendi katkınızı eklemek için ilgili âlimin sayfasındaki “Katkı / düzeltme” düğmesini kullanın. Değişiklik birkaç dakika içinde sitede görünür.")}</p></section></div>`;
  $("#ktout").onclick = () => { try { localStorage.removeItem("gh_token"); } catch (e) {} route(); };
  const pair = x => `${plink(x.t)} <span class="d num">${deathTxt(who(x.t) || {})}</span> → ${plink(x.s)} <span class="d num">${deathTxt(who(x.s) || {})}</span>`;
  const desc = x => `<div class="ktrow-h"><span class="tag${x.op === "del" ? " del" : ""}">${x.op === "add" ? T("إضافة", "Ekleme") : x.op === "del" ? T("حذف", "Kaldırma") : T("تصحيح", "Düzeltme")}</span>
      ${x.op === "note" ? (x.p ? plink(x.p) : "") : pair(x)}${x.rel && x.op === "add" ? ` <span class="tag">${REL[x.rel]}</span>` : ""}</div>
    ${x.src ? `<p><span class="label">${T("المصدر", "Kaynak")}</span> ${esc(x.src)}</p>` : ""}
    ${x.q ? `<blockquote dir="auto">${esc(x.q)}</blockquote>` : ""}${x.note ? `<p dir="auto">${esc(x.note)}</p>` : ""}`;
  const fail = (el, e) => { el.insertAdjacentHTML("beforeend", `<p class="kterr" role="alert">${esc(e.message)}</p>`); };
  const loadAll = async () => {
    const [iss, { items }] = await Promise.all([gh(`/repos/${REPO}/issues?state=open&per_page=100`), ktRead()]);
    ktApply(items);
    const q = iss.filter(i => !i.pull_request).map(i => ({ i, x: ktParse(i.body) })).filter(o => o.x);
    $("#ktn").textContent = AR(q.length);
    $("#ktq").innerHTML = q.length ? q.map(({ i, x }, k) => `<article class="ktrow" data-k="${k}">${desc(x)}
        <p class="legend"><a href="${esc(i.html_url)}" target="_blank" rel="noopener">#${i.number}</a> · ${esc(i.user?.login || "")}${x.by ? ` · ${esc(x.by)}` : ""} · ${esc(i.created_at.slice(0, 10))}</p>
        <div class="ktact">${x.op === "note" ? `<button type="button" class="btn gold" data-a="ok">${T("تمّ", "Çözüldü")}</button>`
          : `<button type="button" class="btn gold" data-a="ok">${T("اقبل وانشر", "Onayla ve yayımla")}</button>`}
          <input type="text" placeholder="${T("سبب الرفض (اختياري)", "Ret gerekçesi (isteğe bağlı)")}" maxlength="300"><button type="button" class="btn" data-a="no">${T("ارفض", "Reddet")}</button></div></article>`).join("")
      : `<p class="empty">${T("لا اقتراحات جديدة.", "Bekleyen öneri yok.")}</p>`;
    $("#ktq").querySelectorAll(".ktrow").forEach(el => el.addEventListener("click", async e => {
      const b = e.target.closest("[data-a]"); if (!b) return; const { i, x } = q[+el.dataset.k];
      el.querySelectorAll("button").forEach(z => { z.disabled = true; });
      try {
        let msg;
        if (b.dataset.a === "ok") {
          if (x.op !== "note") await ktWrite(items => { if (!items.some(y => y.issue === i.number)) items.push({ id: `k${Date.now().toString(36)}`, ...x, at: ktToday(), issue: i.number }); },
            `${ktMsg(x)} (#${i.number})`);
          msg = x.op === "note" ? "Düzeltme yapıldı, teşekkürler." : "Onaylandı ve siteye eklendi, teşekkürler. Birkaç dakika içinde yayında görünür.";
        } else msg = `Bu öneri eklenmedi.${$("input", el).value.trim() ? " Gerekçe: " + $("input", el).value.trim() : ""}`;
        await gh(`/repos/${REPO}/issues/${i.number}/comments`, { method: "POST", body: JSON.stringify({ body: msg }) });
        await gh(`/repos/${REPO}/issues/${i.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: b.dataset.a === "ok" ? "completed" : "not_planned" }) });
        toast(b.dataset.a === "ok" ? T("قُبل", "Onaylandı") : T("رُفض", "Reddedildi")); await loadAll();
      } catch (x2) { el.querySelectorAll("button").forEach(z => { z.disabled = false; }); fail(el, x2); }
    }));
    $("#ktm").textContent = AR(items.length);
    $("#ktl").innerHTML = items.length ? items.slice().reverse().map(x => `<article class="ktrow" data-id="${esc(x.id)}">${desc(x)}
        <p class="legend">${esc(x.at || "")}${x.issue ? ` · <a href="https://github.com/${REPO}/issues/${+x.issue}" target="_blank" rel="noopener">#${+x.issue}</a>` : ""}${x.by ? ` · ${esc(x.by)}` : ""}</p>
        <div class="ktact"><button type="button" class="btn" data-a="undo">${T("تراجع", "Geri al")}</button></div></article>`).join("")
      : `<p class="empty">${T("لا شيء بعد.", "Henüz katkı yok.")}</p>`;
    $("#ktl").querySelectorAll("[data-a=undo]").forEach(b => b.addEventListener("click", async () => {
      const el = b.closest(".ktrow"), id = el.dataset.id, x = items.find(y => y.id === id); b.disabled = true;
      try { await ktWrite(its => { const k = its.findIndex(y => y.id === id); if (k >= 0) its.splice(k, 1); }, `Katkı geri alındı: ${ktName(x.t)} → ${ktName(x.s)}`);
        toast(T("أُلغي", "Geri alındı")); await loadAll(); }
      catch (e) { b.disabled = false; fail(el, e); }
    }));
  };
  try { await loadAll(); }
  catch (e) { $("#ktq").innerHTML = `<p class="kterr">${esc(e.message)}${e.status === 401 ? ` — ${T("انتهت صلاحية الرمز", "Jetonun süresi dolmuş ya da geçersiz; çıkış yapıp yenisini girin.")}` : ""}</p>`; }
}

function viewAbout(view) {
  const tr = LANG === "tr", n = x => AR(Number(x).toLocaleString(tr ? "tr-TR" : "en-US"));
  // kitaplar: aynı kısa künyeyi taşıyan ciltler tek kartta, müellifin vefatına göre sıralı
  const groups = new Map();
  Object.entries(BOOKS).forEach(([id, b]) => { const k = b.cite_tr_s || id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push([id, b]); });
  const cards = [...groups.values()].sort((a, b) => (a[0][1].death || 0) - (b[0][1].death || 0)).map(g => {
    const ids = g.map(x => x[0]), b = g[0][1];
    const entries = g.reduce((s, [, x]) => s + (x.entries || 0), 0), vols = g.length > 1 ? g.length : b.vols || 1;
    const inBook = IDX.filter(p => p.books.some(x => ids.includes(x))).length;
    const only = IDX.filter(p => p.books.length && p.books.every(x => ids.includes(x))).length;
    const ed = ((tr ? b.cite_tr : b.cite_ar) || "").match(/\(([^()]*)\)\s*$/)?.[1] || "";
    const title = tr ? (b.title_tr || b.title).replace(/\s*\([IVX]+\. cilt\)$/, "") : b.title.replace(/\s*—.*$/, "");
    const desc = (BOOK_DESC[ids[0]] || ["", ""])[tr ? 0 : 1];
    return `<article class="bcard">
      <h3><a href="#/b/${esc(ids[0])}">${esc(title)}</a></h3>
      <p class="bauth">${esc(bookAuthor(b))}${ed ? ` · <span class="bed">${esc(ed)}</span>` : ""}</p>
      <p>${esc(desc)}</p>
      <dl class="bnums num">
        <div><dt>${T("مادة", "madde")}</dt><dd>${n(entries)}</dd></div>
        <div><dt>${T("مجلد", "cilt")}</dt><dd>${n(vols)}</dd></div>
        <div><dt>${T("عَلَمًا في الموقع", "âlim (sitede)")}</dt><dd>${n(inBook)}</dd></div>
        <div><dt>${T("لا يوجد إلا فيه", "yalnız bu kitapta")}</dt><dd>${n(only)}</dd></div>
      </dl>
      ${ids.length > 1 ? `<p class="legend">${ids.map(i => `<a href="#/b/${esc(i)}">${esc(bookTitle(BOOKS[i]).match(/\(([^)]*)\)$/)?.[1] || BOOKS[i].title.split("—")[1] || i)}</a>`).join(" · ")}</p>` : ""}
    </article>`;
  }).join("");
  const totE = Object.values(BOOKS).reduce((s, b) => s + (b.entries || 0), 0);
  const multi = IDX.filter(p => p.books.length > 1).length;
  const nBooks = groups.size;
  const figs = `<dl class="afigs num">
      <div><dd>${n(nBooks)}</dd><dt>${T("كتب طبقات", "tabakāt kitabı")}</dt></div>
      <div><dd>${n(totE)}</dd><dt>${T("ترجمة (مادة)", "biyografi maddesi")}</dt></div>
      <div><dd>${n(IDX.length)}</dd><dt>${T("عَلَمًا بعد التوحيد", "birleştirilmiş âlim")}</dt></div>
      <div><dd>${n(multi)}</dd><dt>${T("مترجَمًا في أكثر من كتاب", "birden çok kitapta")}</dt></div></dl>`;
  const lead = `<article class="lead-card">
      <div class="lc-ic" aria-hidden="true">${ILL.divit}</div>
      <div><p class="kicker">${T("مدير المشروع", "Proje yürütücüsü")}</p>
      <h3>${T("د. حسن سَلَك", "Dr. Arş. Gör. Hasan Selek")}</h3>
      <p class="bauth">${T("جامعة أنقرة يلدرم بايزيد، كلية العلوم الإسلامية، قسم الفقه الإسلامي", "Ankara Yıldırım Beyazıt Üniversitesi, İslâmî İlimler Fakültesi, İslâm Hukuku Anabilim Dalı")}</p>
      <p>${T("وُلد في شُحوت من أعمال أفيون قره حصار، وتخرّج في كلية الإلهيات بجامعة نجم الدين أربكان (٢٠١٨). نجح سنة ٢٠١٩ في مسابقة مساعدي الخبراء بالمجلس الأعلى للشؤون الدينية، وعُيّن في السنة نفسها باحثًا مساعدًا في قسم الفقه الإسلامي بجامعة أنقرة يلدرم بايزيد، وفيها أتمّ الماجستير (٢٠٢٠) والدكتوراه. تدور أبحاثه حول الفكر الأصولي والفروعي في المذهب الحنفي الكلاسيكي، وتقاليد الاختصار والشرح، وشروح «الهداية» وحواشيها في العصر العثماني الكلاسيكي.",
        "Afyonkarahisar Şuhut’ta doğdu. Necmettin Erbakan Üniversitesi İlahiyat Fakültesi’nden mezun oldu (2018). 2019’da Din İşleri Yüksek Kurulu uzman yardımcılığı sınavını kazandı. Aynı yıl Ankara Yıldırım Beyazıt Üniversitesi İslâm Hukuku Anabilim Dalı’nda araştırma görevlisi oldu. Yüksek lisansını (2020) ve doktorasını bu üniversitede tamamladı. Klasik Hanefî usul ve fürû düşüncesi, ihtisar ve şerh geleneği ile Osmanlı klasik dönemi Hidâye şerh ve hâşiyeleri üzerine çalışmaktadır.")}</p>
      <p><a href="https://avesis.aybu.edu.tr/hselek" target="_blank" rel="noopener">${T("صفحته في AVESİS", "AVESİS sayfası")} ↗</a></p></div></article>`;
  const use = tr ? [
    ["Arama", "Ana sayfadaki kutuya bir âlimin adını, künyesini, nisbesini ya da lakabını Türkçe veya Arapça yazın: “Serahsî”, “Ebû Hafs el-Kebîr”, “السرخسي”. Arama harekeye, uzatmaya, hemzeye ve Türkçe şapkalı harflere duyarsızdır; “serahsi” de “Serahsî”yi bulur. Sonuçlar ↑/↓ ile gezilir, Enter ile açılır."],
    ["Detaylı arama", "Ad ile birlikte vefat yüzyılı aralığı (hicrî), kitap, şehir ve “silsilede hocası ya da talebesi olanlar” süzgeçleri birlikte kullanılabilir. Örneğin yalnız el-Kand’da geçen ve Buhara ile ilişkili V. yüzyıl âlimleri tek sorguyla listelenir."],
    ["Âlim sayfası", "Başta DİA yazımıyla tam ad, Arapça asıl ad ve vefat tarihi (hicrî/milâdî) yer alır. “Kaynaklar” bölümünde âlimin geçtiği her kitap cilt, sayfa ve madde numarasıyla verilir; atıflar İSNAD 2. edisyon dipnot biçimindedir. Ardından solda bir bilgi kartında hocalar ve talebeler bağ türüyle (fıkıh, hadis/rivayet, kıraat, sohbet…) sıralanır; her bağın “Kanıt” düğmesi bağın çıkarıldığı cümleyi kaynağıyla gösterir, “silsilesi” o kişinin silsilesini açar. Sağdaki harita âlimin doğduğu, yaşadığı, gittiği ve vefat ettiği yerleri gösterir. Haritadaki çizgi şehirleri biyografideki sırasıyla birleştirir (önce doğum ve nisbe, sonra vefat ve defin); bir yaklaşımdır, kronoloji değildir. Düz çizgi el-Süreyyâ’daki Mukaddesî yol ağını izler; kesikli çizgi, bilinen bir yol bulunmayan yerde kuş uçuşudur. Altında yalnız bu âlimin hoca–talebe ağı, en sonda da her kitaptaki biyografinin başından kısa bir alıntı yer alır: alıntılar esas alınan neşirdeki hâliyledir (Arapça, dipnotsuz); tam metin için verilen cilt ve sayfaya bakılmalıdır. Kitaplar seçilince alıntılar yan yana açılır."],
    ["Silsile", "Üstteki üç simge görünümü seçer. “Âlimin silsilesi” seçilen âlimi ortaya alır; hocaları üstte, talebeleri altta kartlar hâlinde dizilir ve çizgiler kartların üzerinden geçmez. “1 / 2” düğmeleri kuşak sayısıdır: iki kuşakta her kartın içinde hocanın hocaları ya da talebenin talebeleri görünür. Zincir simgesi (Ebû Hanîfe’ye bağla), hadisçilerin isnadı gibi âlimden Ebû Hanîfe’ye uzanan en kısa ve vefat tarihleriyle tutarlı hoca zincirini altın çizgiyle çizer. İndirme simgesinin üzerine gelince PNG ya da SVG seçilir. “Asırlar” görünümü bütün âlimleri hicrî asır sütunlarına dizer; bir âlim seçilince hocaları altın, talebeleri çivit eğrilerle bağlanır, üzerine gelince adı, vefatı ve bağ sayısı görünür. “Genel görünüm” bütün ağı zaman ekseninde gösterir. Her görünümdeki arama kutusu âlimi bulur: silsile görünümünde onun silsilesine geçer, diğerlerinde ona yakınlaşır."],
    ["Zaman haritası", "Sayfanın başındaki altın şerit, her asrın önde gelen Hanefî âlimlerini Ebû Hanîfe’den Ebüssuûd Efendi’ye kadar sırayla açar; bir yıldıza tıklayınca aşağıdaki haritada o âlime gidilir, “Yeniden oynat” şeridi baştan çizer. Haritada her satır bir bölgedir (Mâverâünnehir, Horasan, Irak, Şam, Mısır, Rûm…); âlim, başlıca şehrinin bölgesine yerleşir. Üstte hicrî ve altında milâdî yıl cetveli vardır. Her nokta bir vefattır ve adı yanında yazılıdır; doğumu biliniyorsa önündeki çizgi ömrünü gösterir, içi boş nokta tahminî vefattır. Bir ada tıklayınca âlim kırmızıyla işaretlenir, vefat yılında dikey bir çizgi çekilir, hocaları ve talebeleri de kırmızı noktayla gösterilir; bilgi kartı açılır. “Âlim bul” kutusu âlimi bulup ortalar; ←/→ tuşları ya da ‹ › düğmeleri vefat sırasına göre önceki ve sonraki âlime geçer. Harita sürükleyerek ya da kaydırarak gezilir; − + (ya da Ctrl + tekerlek) yakınlaştırır."],
    ["Harita", "Her daire biyografilerde geçen bir şehirdir. Dairenin ve adın büyüklüğü o şehirle ilişkili âlim sayısını gösterir. Alttaki küçük düğmelerle bağ türü (doğum, vefat, ikamet, seyahat, görev…) ve vefat yüzyılı süzülür. Bir şehre tıklanınca açılan pencerede el-Süreyyâ’dan şehrin bölgesi ve türü, Yâkût’un Mu‘cemü’l-büldân’ından kısa bir alıntı, varsa el-Esmârü’l-ceniyye’nin nisbe notu ve o şehirle ilişkili âlimler yer alır. Arama kutusu şehir yanında âlim de bulur: bir âlim seçilince yalnız onun şehirleri ve biyografideki sırayla güzergâhı gösterilir. Güzergâh, el-Süreyyâ’daki Mukaddesî yol ağı üzerinden en kısa yolla çizilir; yol bulunmayan yerde kesikli düz çizgi kullanılır. Yol simgesi bütün yol ağını soluk olarak gösterir."],
    ["Kitap ağı", "Âlimlerin eserleri iki kaynaktan derlenir: tabakat maddelerinde telif ifadesiyle (صنّف، له من التصانيف، وله، شرح، اختصر، نظم…) anılan «…» adlar ve Ahmet Özel’in Hanefî Fıkıh Âlimleri’ndeki eser listeleri. Okuma, atıf ya da nakil bildiren bağlamlar (قرأ، ذكر، في كتاب…) alınmaz. “Şerhu X”, “Hâşiye alâ X”, “Muhtasaru X” ve “شرح «X»” gibi adlar X’e bağlanır; Hidâye, Kenz, Vikâye, Kudûrî, Menâr gibi temel metinler ve meşhur şerhleri elle hazırlanmış bir listeyle eşleştirilir. Sayfada asırlara göre telif türleri (ana metin, şerh, hâşiye, ihtisar, nazım), her ana metinden doğan şerh–hâşiye zincirini zaman ekseninde gösteren “eser aileleri” ve aranabilir bir liste vardır. Âlim sayfasındaki “Eserleri” bölümü de buradan beslenir. Otomatik çıkarım olduğu için bazı adlar eksik ya da hatalı olabilir; her eserin kartında kaynağı görünür."],
    ["Dil, tema, bağlantılar ve kısayollar", "Sağ üstteki düğmelerle arayüz Arapça ile Türkçe, açık ile koyu tema arasında değiştirilir; seçim tarayıcıda hatırlanır. Her sayfanın, seçili âlim ya da şehir dahil, kendi adresi vardır (ör. #/p/jw821, #/zaman/jw821, #/map/@jw821); bağlantı simgesi bu adresi kopyalar. Klavyede “/” arama kutusuna gider, “?” kısayol listesini açar, “g” ardından h/s/z/m ana sayfa, silsile, zaman ve haritaya geçer."],
  ] : [
    ["البحث", "اكتب في مربع البحث في الصفحة الرئيسة اسم العَلَم أو كنيته أو نسبته أو لقبه بالعربية أو التركية: «السرخسي»، «أبو حفص الكبير»، «Serahsî». والبحث لا يتأثر بالحركات والتطويل وصور الهمزة. وتتنقل بين النتائج بالسهمين وتفتحها بمفتاح الإدخال."],
    ["البحث المفصّل", "يُجمع فيه بين الاسم وحدود قرن الوفاة والكتاب والبلد وقيد «من له شيوخ أو تلاميذ في السلسلة»؛ فيمكن مثلًا أن تُعرض أعلام القرن الخامس المرتبطون ببخارى ممن لم يُترجموا إلا في القند باستعلام واحد."],
    ["صفحة العَلَم", "في أعلاها الاسم الكامل وسنة الوفاة، ثم «المصادر» بمواضع الترجمة في كل كتاب بالجزء والصفحة ورقم الترجمة، بصيغة الإحالة العلمية. ثم بطاقة فيها الشيوخ والتلاميذ مع نوع الصلة (تفقّه، رواية، صحبة…)، وزر «الشاهد» يعرض العبارة التي استُخرجت منها الصلة مع موضعها، و«سلسلته» يفتح سلسلة ذلك العَلَم. وبجانبها خريطة بلدان المولد والإقامة والرحلة والوفاة؛ ويصل الخطّ البلدانَ على ترتيب ورودها في الترجمة (المولد والنسبة أولًا، والوفاة والمدفن آخرًا)، وهو تقريب لا تأريخ، والخط المتصل يسير على طرق المقدسي من مشروع الثريا، والمتقطع خط مستقيم حيث لا طريق معروف. وتحتهما شبكة صلات العَلَم وحده، وفي آخر الصفحة مقتطف قصير من أول الترجمة في كل كتاب كما هو في الطبعة المعتمدة دون الحواشي، ويُرجع في النص الكامل إلى الجزء والصفحة المذكورين، وتُفتح المقتطفات متجاورة باختيار الكتب."],
    ["السلسلة", "تختار الأيقونات الثلاث في الأعلى طريقة العرض. «سلسلة عَلَم» تضع العَلَم في الوسط، وشيوخه فوقه وتلاميذه تحته في بطاقات لا تتقاطع خطوطها معها. وزرّا «١ / ٢» عدد الطبقات. وأيقونة السلسلة (الوصل بأبي حنيفة) ترسم بخط ذهبي أقصر سلسلة شيوخ متسقة مع الوفيات من العَلَم إلى الإمام، على طريقة الإسناد. وعند المرور على أيقونة التنزيل يُختار PNG أو SVG. و«القرون» تضع الأعلام في أعمدة القرون الهجرية، فإذا اختير عَلَم وُصل بشيوخه بمنحنيات ذهبية وبتلاميذه بمنحنيات نيلية. و«المشهد العام» يعرض الشبكة كلها على محور الزمن. ومربع البحث في كل عرض يجد العَلَم."],
    ["خريطة الزمن", "في أعلى الصفحة شريط ذهبي يعرض أعلام المذهب في كل قرن من أبي حنيفة إلى أبي السعود، يُرسم تدريجًا، وبالضغط على نجمة يُنتقل إلى العلم في الخريطة أسفله. وفي الخريطة كل صف إقليم (ما وراء النهر، خراسان، العراق، الشام، مصر، الروم…) بحسب البلد الأشهر للعَلَم، وفي الأعلى مسطرة بالسنين الهجرية والميلادية. وكل نقطة وفاة عَلَم، واسمه مكتوب بجانبها، والخط قبلها عمره إن عُرف مولده، والنقطة المفرغة وفاة مقدّرة. وبالضغط على اسم يُعلَّم العَلَم بالأحمر مع خط عمودي عند سنة وفاته، وتُعلَّم نقاط شيوخه وتلاميذه بالأحمر، وتظهر بطاقة تعريفه. ومربع البحث يجد العَلَم ويضعه في الوسط، وسهما لوحة المفاتيح ينقلان إلى العَلَم السابق واللاحق في الوفاة."],
    ["الخريطة", "كل دائرة بلد ورد في التراجم، وحجمها وحجم اسمها على عدد الأعلام المرتبطين به. وتُصفّى بنوع الصلة (المولد، الوفاة، الإقامة، الرحلة، الولاية…) وبقرن الوفاة. وعند الضغط على بلد تظهر نافذة فيها إقليمه ونوعه من مشروع الثريا، ومقتطف من معجم البلدان لياقوت، وتعليق النسبة من الأثمار الجنية إن وُجد، وأسماء الأعلام المرتبطين به. ويُكبَّر بعجلة الفأرة أو بإصبعين، ويُحرَّك بالسحب. ومربع البحث يجد البلد أو العَلَم: فإذا اختير عَلَم ظهرت بلدانه وطريقه على ترتيب ورودها في الترجمة، مرسومًا على طرق المقدسي من مشروع الثريا بأقصر طريق، وحيث لا طريق معروف فبخط مستقيم متقطع. وأيقونة الطرق تُظهر شبكة الطرق كلها باهتة."],
    ["شبكة الكتب", "تُجمع مؤلفات الأعلام من مصدرين: ما ذُكر في مواد الطبقات بين «» بعد صيغ التأليف (صنّف، له من التصانيف، وله، شرح، اختصر، نظم…) دون سياقات القراءة والنقل (قرأ، ذكر، في كتاب…)، وقوائم المؤلفات في «فقهاء الحنفية» لأحمد أوزل. وتُربط الشروح والحواشي والمختصرات بأصولها، وتُطابق المتون المشهورة (الهداية، الكنز، الوقاية، القدوري، المنار…) وشروحها بقائمة معدّة يدويًا. وفي الصفحة أنواع التأليف في كل قرن، و«أسر الكتب» على محور الزمن، وقائمة قابلة للبحث، ومنها يُغذّى قسم «مؤلفاته» في صفحة العلم. ولأن الاستخراج آلي فقد يقع فيه نقص أو خطأ، ومصدر كل كتاب مذكور في بطاقته."],
    ["اللغة والمظهر والروابط", "تغيّر الأزرار في أعلى الصفحة لغة الواجهة بين العربية والتركية، والمظهر بين الفاتح والداكن، ويُحفظ الاختيار في المتصفح. ولكل صفحة رابطها الخاص (مثل ‎#/p/jw821‎ و‎#/zaman/jw821‎)، وأيقونة الرابط تنسخه. وفي لوحة المفاتيح: «/» للبحث، و«؟» لقائمة الاختصارات."],
  ];
  const useHtml = `<div class="howto">${use.map(([h, p]) => `<section><h3>${h}</h3><p>${p}</p></section>`).join("")}</div>`;
  if (tr) {
    view.innerHTML = `<div class="about">
    <h1>Proje hakkında</h1>
    <p class="lede big">Hanefî Tabakātı, Hanefî mezhebine mensup âlimlerin biyografilerini veren tabakāt kitaplarını tek bir dizinde birleştiren bir dijital beşerî bilimler projesidir. Aynı âlim farklı kitaplarda farklı adlarla, farklı ayrıntılarla ve bazen farklı vefat tarihleriyle anılır. Proje bu maddeleri tek bir âlim başlığı altında toplar ve her kaynağa cilt, sayfa ve madde numarasıyla atıf yapar.</p>
    <p class="lede">Biyografilerde geçen “filandan fıkıh öğrendi”, “ondan rivayet etti” gibi ifadelerden hoca–talebe ilişkileri çıkarılır. Bu ilişkilerle Ebû Hanîfe’den XIV. (XX.) yüzyıla uzanan bir ilim silsilesi kurulur. Doğum, vefat, ikamet, seyahat ve görev yerleri de haritaya dökülür; böylece mezhebin hangi şehirlerde, hangi yüzyıllarda ve kimler eliyle yayıldığı görülebilir. Amaç, araştırmacıya kaynağa dönmeyi kolaylaştıran güvenilir bir başvuru aracı sunmaktır: her bilgi, çıktığı metne ve sayfaya bağlanır.</p>
    ${figs}
    <section><h2>Yürütücü</h2>${lead}</section>
    <section><h2>Kitaplar</h2><p class="lede">Kitaplar müelliflerinin vefat tarihine göre sıralıdır. “Madde” kitaptaki biyografi sayısı, “âlim (sitede)” bu maddelerin birleştirildiği âlim sayısı, “yalnız bu kitapta” başka hiçbir kitapta biyografisi bulunmayan âlim sayısıdır.</p><div class="bcards">${cards}</div></section>
    <section><h2>Kullanım</h2>${useHtml}</section>
    <section><h2>Yöntem</h2>
      <p class="lede" style="color:var(--ink)">Bir âlimin farklı kitaplardaki biyografileri; ad, nesep, künye, nisbe, vefat yılı ve kitapların birbirine yaptığı atıflar karşılaştırılarak tek başlık altında toplandı; şüpheli eşleştirmeler elle gözden geçirildi.
      Hocalar ve talebeler biyografilerdeki ifadelerden («تفقّه على», «أخذ عن», «روى عنه», «من أصحاب»…) çıkarıldı; geçen ad nesep, künye ve nisbe uyumuna, vefat yıllarının yakınlığına ve biyografilerin birbirini doğrulamasına bakılarak sahibine bağlandı. Kesinleşmeyenler incelenmek üzere silsilenin dışında bırakıldı.
      Şehirler doğum, vefat, defin, seyahat, ikamet ve görev ifadelerinden ve nisbelerden çıkarıldı.
      Doğum yılları «ولد / مولده سنة…» ifadelerinden ya da vefat cümlesinde geçen yaştan («عن ثمانين سنة») hesaplandı; vefatla tutarsız olanlar atıldı.
      Esas alınan neşirlerin telif hakkına saygı gereği sitede biyografilerin tam metni değil, her kitaptan maddenin başından kısa bir Arapça alıntı ile cilt, sayfa ve madde numarası verilir.</p>
      <p class="lede" style="color:var(--ink)">Şahıs, eser ve yer adları TDV İslâm Ansiklopedisi (DİA) yazım usulüyle verilmiştir: Ebû Hanîfe, Muhammed b. Hasan eş-Şeybânî, Şemsüleimme el-Halvânî, el-Cevâhirü’l-muziyye… Adlar künye, isim, nesep, nisbe ve lakap sözlüklerinden otomatik kurulur; unvan ve tavsifler atılır. Tarihler hicrî/milâdî olarak verilir: (ö. 150/767). Milâdî yıl, hicrî yılın ortasına göre hesaplanmıştır; ay ve gün bilinmediğinden bir yıl sapabilir.</p>
      <p class="legend">“tercih” etiketli bağlar yalnız nisbe ya da şöhretle kurulmuştur. “[?]” işaretli vefat tarihleri kaynakta yoktur; hoca ve talebelerin vefatlarından tahmin edilmiştir. Hicrî yüzyıllar DİA’daki gibi yazılır: V. (XI.) yüzyıl. Eşleştirme ve çıkarımlar otomatik yapıldığından hata içerebilir; bildirimleriniz için yürütücüye yazabilirsiniz.</p></section>
    <section><h2>Türkçe başvuru kaynağı</h2><p class="lede">Ahmet Özel’in <i>Hanefî Fıkıh Âlimleri</i> (Ankara: Türkiye Diyanet Vakfı) adlı eserindeki maddeler sitedeki âlimlerle tek tek eşleştirilmiştir (213 kişi). Eşleşen âlimlerde kitaptaki vefat ve doğum tarihleri esas alınmış, sitedeki ad kitaptakiyle çeliştiğinde tam ad ve kısa ad kitaba göre düzeltilmiş (yalnız eksik olan doğru adlara dokunulmamıştır), kitapta açıkça geçen hoca–talebe bağları eklenmiş ve eser listeleri âlim sayfasına “Eserleri” başlığıyla konmuştur. Bu bağların “Kanıt” bölümünde kitaptaki cümle ve sayfa numarası görünür. Kitabın dipnotları metne karışık olduğundan bilgi yalnız madde metinlerinden alınmıştır.</p></section>
    <section><h2>Katkı ve düzeltme</h2><p class="lede">Bir biyografide geçtiği hâlde sitede görünmeyen bir hoca–talebe bağı ya da bir hata fark ederseniz, ilgili âlimin sayfasındaki <b>Katkı / düzeltme</b> düğmesiyle bildirebilirsiniz. Eklenecek bağ için kaynağı ve sayfasını yazmanız gerekir. Öneriler incelendikten sonra yayımlanır; eklenen bağlar âlim sayfasında “katkı” etiketi ve verilen kaynakla görünür, ağa ve silsileye de katılır. <a href="#/yonetim" class="d">Yönetim</a></p></section>
    <section><h2>Açık kaynaklar</h2><p class="lede">Koordinatlar, şehirlerin bölge ve türleri, Mukaddesî’nin yol ağı ile Yâkūt, Himyerî ve Sem‘ânî’den alıntılar al-Thurayya Gazetteer’dan (CC BY 4.0) alınmıştır; Osmanlı ve Hint şehirleri için elle eklemeler yapılmıştır. Kara ve nehir sınırları Natural Earth’ten (kamu malı). Sitenin kodu ve üretilen veriler <a href="https://github.com/fukaha/tabaqat" target="_blank" rel="noopener">GitHub</a>’da açıktır.</p></section></div>`;
    return;
  }
  view.innerHTML = `<div class="about">
    <h1>عن المشروع</h1>
    <p class="lede big">«طبقات الحنفية» مشروع رقمي يجمع كتب طبقات الحنفية في فهرس واحد. فالعَلَم الواحد يُذكر في الكتب المختلفة بأسماء مختلفة وتفاصيل متفاوتة، وربما بوفيات مختلفة؛ فيجمع المشروع تراجمه تحت عنوان واحد، ويحيل إلى كل مصدر بالجزء والصفحة ورقم الترجمة.</p>
    <p class="lede">وتُستخرج صلات الشيوخ والتلاميذ من عبارات التراجم مثل «تفقّه على فلان» و«روى عنه»، فتقوم منها سلسلة علمية من أبي حنيفة إلى القرن الرابع عشر. وتُرسم على الخريطة بلدان المولد والوفاة والإقامة والرحلة والولاية، فيظهر أين انتشر المذهب ومتى وعلى يد من. والغاية أداة مرجعية موثوقة تيسّر الرجوع إلى الأصول: فكل معلومة موصولة بالنص الذي أُخذت منه وبموضعها.</p>
    ${figs}
    <section><h2>مدير المشروع</h2>${lead}</section>
    <section><h2>الكتب</h2><p class="lede">الكتب مرتبة على وفيات مؤلفيها. «مادة» عدد التراجم في الكتاب، و«عَلَمًا في الموقع» عدد الأعلام الذين وُحّدت فيهم هذه التراجم، و«لا يوجد إلا فيه» عدد من لا ترجمة له في غيره.</p><div class="bcards">${cards}</div></section>
    <section><h2>طريقة الاستعمال</h2>${useHtml}</section>
    <section><h2>المنهج</h2>
      <p class="lede" style="color:var(--ink)">جُمعت تراجم العَلَم الواحد من الكتب المختلفة تحت عنوان واحد بمقارنة الاسم والنسب والكنية والنسبة وسنة الوفاة وإحالات الكتب بعضها على بعض، وراجع الإنسان ما التبس منها.
      واستُخرج الشيوخ والتلاميذ من عبارات التراجم («تفقّه على»، «أخذ عن»، «روى عنه»، «من أصحاب»…) ورُبط الاسم بصاحبه بموافقة النسب والكنية والنسبة، مع مراعاة تقارب الوفيات وتقاطع التراجم؛ وما لم يترجّح بقي خارج السلسلة للمراجعة.
      واستُخرجت البلدان من عبارات المولد والوفاة والدفن والرحلة والإقامة والولاية، ومن النسبة.
      واستُخرجت سنو المولد من عبارات «ولد / مولده سنة…» أو من العمر المذكور عند الوفاة («عن ثمانين سنة»)، وأُسقط ما خالف الوفاة.
      ومراعاةً لحقوق الطبعات المعتمدة لا تُنشر نصوص التراجم كاملة، بل مقتطف قصير من أول كل ترجمة مع الجزء والصفحة ورقم الترجمة.</p>
      <p class="legend">ما وُسم «ترجيح» ربطٌ بالنسبة أو الشهرة وحدها. الوفيات المسبوقة بـ«نحو» تقدير من طبقة الشيوخ والتلاميذ. ولأن التوحيد والاستخراج آليّان فقد يقع فيهما خطأ، ويُرجى إبلاغ مدير المشروع بما يُلحظ منه.</p></section>
    <section><h2>المرجع التركي</h2><p class="lede">طوبقت مواد كتاب «فقهاء الحنفية» (Hanefî Fıkıh Âlimleri) لأحمد أوزل على أعلام الموقع علمًا علمًا (٢١٣ علمًا)، فاعتُمدت فيه سنوات الوفاة والولادة، وصُحّح الاسم التركي إذا خالفه، وأضيفت صلات الشيوخ والتلاميذ المصرّح بها فيه مع العبارة ورقم الصفحة، وقوائم المؤلفات تحت عنوان «مؤلفاته». ولم يؤخذ من حواشي الكتاب شيء لاختلاطها بالمتن.</p></section>
    <section><h2>الإضافة والتصحيح</h2><p class="lede">إن وجدت صلة شيخ وتلميذ مذكورة في ترجمة ولا تظهر في الموقع، أو وقفت على خطأ، فاضغط زر <b>اقتراح أو تصحيح</b> في صفحة العَلَم. ولا بد في الإضافة من ذكر المصدر والموضع. تُنشر الاقتراحات بعد مراجعتها، وتظهر الصلة المضافة في صفحة العَلَم موسومة «إضافة» مع مصدرها، وتدخل في الشبكة والسلسلة. <a href="#/yonetim" class="d">الإدارة</a></p></section>
    <section><h2>المصادر المفتوحة</h2><p class="lede">الإحداثيات وأقاليم البلدان وأنواعها وشبكة طرق المقدسي والمقتطفات من ياقوت والحميري والسمعاني من مشروع الثريا (al-Thurayya Gazetteer، رخصة CC BY 4.0) مع إضافات يدوية لبلدان العهد العثماني والهند؛ وحدود اليابسة والأنهار من Natural Earth (ملك عام). وشفرة الموقع وبياناته مفتوحة على <a href="https://github.com/fukaha/tabaqat" target="_blank" rel="noopener">GitHub</a>.</p></section></div>`;
}

init().catch(e => { $("#view").innerHTML = `<p class="empty">${T("تعذّر تحميل البيانات", "Veriler yüklenemedi")}: ${esc(e.message)}</p>`; });

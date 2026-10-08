"""7./13. yüzyıl Hanefî fakihleri veri seti (vefatı h. 620-750 arası).

Sitenin birleşik kişi kayıtlarından (site/data/p), gizli depodaki tam metinlerden (kaynak/t) ve
Ahmet Özel, Hanefî Fıkıh Âlimleri eşleştirmelerinden (review/fikih_alimleri.yml) kişi başına bir satır
ve her bilgi için kaynak atfı taşıyan uzun tablolar üretir.

Çıktı tam metinden kısa kanıt cümleleri içerdiği için gizli depoya yazılır:
    python analysis/fakihler_620_750.py            → kaynak/analiz/fakihler_620_750.xlsx (+ .json)
"""
from __future__ import annotations

import glob
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from tabaqat.extract.names import birth_year, death_year  # noqa: E402
from tabaqat.normalize.arabic import normalize  # noqa: E402

H0, H1 = 620, 750
OUT = ROOT / "kaynak" / "analiz"

REGION = {"Transoxiana": "Mâverâünnehir", "Khurasan": "Horasan", "Iraq": "Irak", "Sham": "Şam (Suriye)",
          "Egypt": "Mısır", "Jazirat al-Arab": "Hicaz ve Arap Yarımadası", "Maghrib": "Mağrib", "Aqur": "Cezîre",
          "Yemen": "Yemen", "Andalus": "Endülüs", "Jibal": "Cibâl (Irâk-ı Acem)", "Rihab": "Rihâb (Azerbaycan-Kafkasya)",
          "Sind": "Sind", "Daylam": "Deylem", "Badiyat al-Arab": "Arap çölü", "Kirman": "Kirman", "Khuzistan": "Huzistan",
          "Sijistan": "Sîstan", "Barqa": "Berka", "Khazar": "Hazar", "Rum": "Rûm (Anadolu)", "Faris": "Fars",
          "Hind": "Hind", "Turkestan": "Türkistan", "Qipchaq": "Deşt-i Kıpçak", "Crimea": "Kırım"}
KIND = {"nisba": "nisbe", "origin": "asıl", "birth": "doğum", "residence": "ikamet", "travel": "seyahat",
        "activity": "rivayet/tahsil", "office": "görev/tedris", "death": "vefat", "burial": "defin"}
REL = {"fiqh": "fıkıh", "took": "ilim aldı", "hadith": "hadis/rivayet", "read": "kıraat", "companion": "sohbet",
       "manual": "elle", "chain": "silsile"}
WFORM = {"asl": "telif", "sharh": "şerh", "hashiya": "hâşiye", "ikhtisar": "ihtisar", "nazm": "nazım",
         "tekmile": "tekmile/zeyl", "tahric": "tahrîc", "fetava": "fetva"}
ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]


def CE(h: int) -> int:   # sitedeki çevrimle aynı (app.js CE)
    return int(622.54 + (h - 1) * 0.970224 + 0.485)


def hm(h) -> str:
    return f"{h}/{CE(h)}" if h else ""


# ---------- kaynak atıfları (DİA biçimi: Kureşî, el-Cevâhirü’l-mudıyye, IV, 73) ----------
BOOKS = json.load(open(ROOT / "site/data/index.json", encoding="utf-8"))["books"]


def dia_cite(book: str, cite: str) -> str:
    b = BOOKS.get(book, {})
    short = b.get("cite_tr_s") or cite
    m = re.search(r"(\d+)/([\d\-]+)(?:\s*\(رقم\s*(\d+)\))?", cite)
    if not m:   # tek ciltli: "تاج التراجم 203 (رقم 12)"
        m1 = re.search(r"\s([\d\-]+)(?:\s*\(رقم\s*(\d+)\))?\s*$", cite)
        if not m1:
            return short
        return f"{short}, s. {m1.group(1)}" + (f" (nr. {m1.group(2)})" if m1.group(2) else "")
    vol, pg, no = m.groups()
    if book == "ghuraf_v1":
        vol = "1"
    loc = f"s. {pg}" if (b.get("vols") or 1) == 1 and book not in ("ghuraf_v2",) else f"{ROMAN[int(vol)]}, {pg}"
    return f"{short}, {loc}" + (f" (nr. {no})" if no else "")


# ---------- veriler ----------
P: dict = {}
for f in glob.glob(str(ROOT / "site/data/p/*.json")):
    P.update(json.load(open(f, encoding="utf-8")))
T: dict = {}
for f in glob.glob(str(ROOT / "kaynak/t/*.json")):
    T.update(json.load(open(f, encoding="utf-8")))
PL = {p["id"]: p for p in json.load(open(ROOT / "site/data/places.json", encoding="utf-8"))}
WB = json.load(open(ROOT / "site/data/books.json", encoding="utf-8"))
OZEL = yaml.safe_load(open(ROOT / "review/fikih_alimleri.yml", encoding="utf-8"))
CANON = yaml.safe_load(open(ROOT / "review/works_canon.yml", encoding="utf-8"))
CITE_BOOK = {}   # Arapça atıf → kitap kimliği
for pid, p in P.items():
    for b, c, _ in p["sources"]:
        CITE_BOOK[c] = b


def cite_of(c: str) -> str:
    if c.startswith("Ahmet Özel"):
        m = re.search(r"s\. (\d+)", c)
        return f"Özel, Hanefî Fıkıh Âlimleri, s. {m.group(1)}" if m else c
    return dia_cite(CITE_BOOK.get(c, ""), c)


def plname(pid: str) -> str:
    p = PL.get(pid)
    return (p.get("name_tr") or p["name"]) if p else pid


def plregion(pid: str) -> str:
    p = PL.get(pid)
    return REGION.get(p.get("region"), p.get("region") or "") if p else ""


# ---------- eser alanı ----------
SECTION_FIELD = [(9, "fıkıh (fürû)"), (58, "usûl-i fıkıh"), (74, "akaid/kelâm"), (81, None), (87, None)]
CANON_FIELD = {"kashshaf": "tefsir", "beydawi": "tefsir", "miftah": "belâgat", "mutawwal": "belâgat",
               "mawaqif": "akaid/kelâm", "sharhmawaqif": "akaid/kelâm", "tawali": "akaid/kelâm", "tajrid": "akaid/kelâm",
               "sharhtajrid": "akaid/kelâm", "ibnhajib": "usûl-i fıkıh", "sharhibnhajib": "usûl-i fıkıh",
               "kafiya": "nahiv/sarf", "shafiya": "nahiv/sarf", "talkhis": "fıkıh (fürû)"}
_lines = open(ROOT / "review/works_canon.yml", encoding="utf-8").read().splitlines()
for i, ln in enumerate(_lines, 1):
    m = re.match(r"^([a-z]\w*):", ln)
    if m and m.group(1) not in CANON_FIELD:
        f = [fl for start, fl in SECTION_FIELD if start <= i]
        if f and f[-1]:
            CANON_FIELD[m.group(1)] = f[-1]

FIELD_AR = [   # normalize edilmiş Arapça başlıkta anahtar → alan (sıra önemli)
    (r"اصول|الفصول في|المنار", "usûl-i fıkıh"),
    (r"فتاوي|الفتاوي|واقعات|الواقعات|نوازل|منيه المفتي|القنيه", "fetva/vâkıât"),
    (r"فرايض|الفرايض|المواريث", "ferâiz"),
    (r"شروط|الشروط|محاضر|سجلات", "şurût"),
    (r"خلاف|الخلافيات|المختلف|المنظومه", "hilâf"),
    (r"تفسير|القران|التاويل|التنزيل", "tefsir"),
    (r"قراءات|القراءات|تجويد|الشاطبيه", "kıraat"),
    (r"حديث|احاديث|الاحاديث|مسند|المسند|مشيخه|اربعين|الاربعين|المصابيح|مشارق|صحيح|البخاري|معجم|تخريج|الاثار", "hadis"),
    (r"عقيده|عقايد|العقايد|التوحيد|الكلام|اعتقاد|الايمان|الطحاوي", "akaid/kelâm"),
    (r"نحو|النحو|الصرف|العروض|اللغه|المفصل|الكافيه|الاعراب|التصريف", "nahiv/sarf/lügat"),
    (r"البلاغه|المعاني|البيان|مفتاح", "belâgat"),
    (r"مناقب|تاريخ|طبقات|سيره|السير|وفيات", "tarih/menâkıb"),
    (r"تصوف|الزهد|الرقايق|السلوك|الاخلاق", "tasavvuf/ahlâk"),
    (r"طب|الطب", "tıp"),
    (r"فقه|الفقه|القدوري|الهدايه|الجامع|الكنز|الوقايه|الوافي|المختار|الصلاه|الحج|الزكاه|البيوع|الحيض|المبسوط", "fıkıh (fürû)"),
]
FIELD_TR = [
    (r"usûl|usul|menâr", "usûl-i fıkıh"), (r"fetâvâ|fetva|vâkıât|nevâzil|kunye", "fetva/vâkıât"),
    (r"ferâiz|feraiz", "ferâiz"), (r"şurût|mahâzır|sicillât", "şurût"), (r"hilâf|manzûme", "hilâf"),
    (r"tefsîr|tefsir|kur’ân", "tefsir"), (r"hadîs|ehâdîs|müsned|erbaîn|mesâbîh|meşârik", "hadis"),
    (r"akīde|akāid|tevhîd|kelâm", "akaid/kelâm"), (r"nahv|sarf|lugat", "nahiv/sarf/lügat"),
    (r"menâkıb|târîh|tabakāt", "tarih/menâkıb"),
]


def work_field(w: dict) -> tuple[str, str]:
    """(alan, dayanak)"""
    base = w.get("b")
    for cid in (w["id"], base):
        if cid and cid in CANON_FIELD:
            return CANON_FIELD[cid], ("temel metin listesi" if cid == w["id"] else f"dayandığı eser ({cid})")
    n = normalize(w.get("ar") or "")
    for rx, fl in FIELD_AR:
        if re.search(rf"(?<![ء-ي])(?:{rx})", n):
            return fl, "eser adı"
    t = (w.get("tr") or "").lower()
    for rx, fl in FIELD_TR:
        if re.search(rx, t):
            return fl, "eser adı"
    if base:   # şerh/hâşiye: dayandığı eserin adına bak
        bw = WBY.get(base)
        if bw:
            f, _ = work_field({"id": "-", "ar": bw.get("ar"), "tr": bw.get("tr")})
            if f:
                return f, "dayandığı eser adı"
    return "", ""


WBY = {w["id"]: w for w in WB["works"]}

# ---------- metin işaretleri ----------
def nk(s: str) -> str:
    return normalize(s)


GOREV = [   # (etiket, düzenli ifade normalize edilmiş metinde)
    ("kadılık", r"قاضي|القضاء|القضاه|ولي الحكم|الحكم ب|حاكم"),
    ("tedris/müderrislik", r"درس ب|مدرس|التدريس|درس في|المدرسه"),
    ("iftâ", r"افتي|المفتي|الفتوي|الفتيا|مفتي"),
    ("hitâbet/imamet", r"خطيب|الخطابه|خطب ب|امام الجامع|امامه"),
    ("hisbe", r"الحسبه|محتسب"),
    ("nezâret/vakıf idaresi", r"نظر |ناظر"),
    ("kitâbet/dîvân", r"كاتب|الانشاء|ديوان"),
    ("vezaret", r"وزير|الوزاره"),
    ("emirlik/askerî", r"الامير|امير|الاماره|نايب السلطنه"),
    ("hükümdarlık", r"السلطان [^\s]+ نفسه|ملك [^\s]+ بنفسه|تولي السلطنه|تسلطن"),
    ("hankah/meşihat", r"خانقاه|الخانقاه|مشيخه|شيخ الشيوخ|رباط"),
    ("hadis rivayeti", r"حدث|سمع منه|روي عنه|اجاز"),
]
OLAY = [
    ("Moğol istilâsı", r"التتار|التتر|المغل|المغول|جنكز|جنكيز|هولاكو|قازان|غازان"),
    ("Bağdat’ın düşüşü (656)", r"واقعه بغداد|اخذ بغداد|خراب بغداد|فتنه بغداد|قتل الخليفه"),
    ("Haçlılar", r"الفرنج|الافرنج|الصليب"),
    ("Hârizmşahlar", r"خوارزم ?شاه|الخوارزميه"),
    ("Eyyûbîler", r"الملك المعظم|الملك العادل|الملك الكامل|الملك الصالح|الملك الاشرف|الملك الناصر صلاح|الايوبي|بني ايوب"),
    ("Memlükler", r"الملك الظاهر|بيبرس|قلاوون|الملك الناصر محمد|الملك المنصور|المماليك|الجراكسه"),
    ("Selçuklular (Rûm/Irak)", r"السلجوق|سلجوق|بني سلجوق|علاء الدين كيقباد|كيخسرو"),
    ("Abbâsî hilâfeti", r"الخليفه|المستنصر|المستعصم|الناصر لدين الله"),
    ("fitne/sürgün/hapis", r"فتنه|نفي|سجن|حبس|امتحن|محنه"),
    ("şehâdet/katl", r"قتل شهيدا|استشهد|قتلوه|قتله التتار|قتل صبرا"),
]
GOC = r"(?<![ء-ي])(?:و|ف)?(?:انتقل|هاجر|نزح|جفل|هرب|فر من|خرج من|ارتحل|رحل الي|قدم|دخل|استوطن|سكن|نزل|توطن|اقام ب)(?![ء-ي])"


def hits(text: str, rules, width=70):
    n = nk(text)
    out = []
    for lab, rx in rules:
        m = re.search(rx, n)
        if m:
            a, b = max(0, m.start() - width), min(len(n), m.end() + width)
            out.append((lab, n[a:b].replace("\n", " ").strip()))
    return out


def snippet(text: str, rx: str, width=70):
    n = nk(text)
    m = re.search(rx, n)
    if not m:
        return None
    a, b = max(0, m.start() - width), min(len(n), m.end() + width)
    return n[a:b].replace("\n", " ").strip()


# ---------- kişi satırları ----------
def build():
    ids = [k for k, p in P.items() if p.get("death_h") and H0 <= p["death_h"] <= H1]
    ids.sort(key=lambda k: (P[k]["death_h"], P[k].get("est", False), P[k]["tr"] or ""))
    rows, L_place, L_rel, L_work, L_ev, L_src = [], [], [], [], [], []
    for no, pid in enumerate(ids, 1):
        p = P[pid]
        texts = T.get(pid, [])
        oz = OZEL.get(pid) or {}
        dh = p["death_h"]
        # kaynaklar
        cites = [dia_cite(b, c) for b, c, _ in p["sources"]]
        if oz:
            cites.append(f"Özel, Hanefî Fıkıh Âlimleri, s. {oz['sayfa']}")
        for b, c, h in p["sources"]:
            L_src.append({"kimlik": pid, "ad": p["trs"], "kaynak": dia_cite(b, c), "arapça atıf": c, "madde başlığı": h})
        # vefat dayanağı
        dsrc = [dia_cite(t["book"], t["cite"]) for t in texts if death_year(t["text"]) == dh]
        if oz.get("vefat") == dh:
            dsrc.append(f"Özel, s. {oz['sayfa']}")
        dnote = "tahminî (hoca-talebe tabakasından)" if p.get("est") else ("açık" if dsrc else "madde başlığı/fihrist notu")
        if oz.get("yaklasik"):
            dnote += "; Özel’de yaklaşık"
        # doğum
        births = []
        for t in texts:
            y_exp = birth_year(t["text"], None)
            y = birth_year(t["text"], dh if not p.get("est") else None)
            if y_exp and (not dh or 0 < dh - y_exp <= 120):
                births.append((y_exp, dia_cite(t["book"], t["cite"]), "açık"))
            elif y:
                births.append((y, dia_cite(t["book"], t["cite"]), "vefat yaşından hesap"))
        if oz.get("dogum"):
            births.append((oz["dogum"], f"Özel, s. {oz['sayfa']}", "açık"))
        bvals = Counter(b[0] for b in births)
        birth = bvals.most_common(1)[0][0] if bvals else None
        bsrc = "; ".join(sorted({f"{c} ({k})" for y, c, k in births if y == birth}))
        bconf = "; ".join(f"{y}: {c}" for y, c, k in births if y != birth)
        # yerler
        bykind = defaultdict(list)
        for plid, kind, cite, word in p["places"]:
            bykind[kind].append(plid)
            L_place.append({"kimlik": pid, "ad": p["trs"], "vefat": dh, "yer": plname(plid), "yer kimliği": plid,
                            "bölge": plregion(plid), "tür": KIND.get(kind, kind), "kaynak": cite_of(cite),
                            "metindeki kelime": word})
        uniq = lambda ks: list(dict.fromkeys(pl for k in ks for pl in bykind.get(k, [])))
        nis, born = uniq(["nisba", "origin"]), uniq(["birth"])
        live = uniq(["residence", "office", "death", "burial"])
        trav = [x for x in uniq(["travel", "activity"]) if x not in live]
        regs_live = list(dict.fromkeys(plregion(x) for x in live if plregion(x)))
        if regs_live:
            region, rbasis = regs_live, "ikamet/görev/vefat yerleri"
        elif born:
            region, rbasis = list(dict.fromkeys(plregion(x) for x in born if plregion(x))), "doğum yeri"
        elif trav:
            region, rbasis = list(dict.fromkeys(plregion(x) for x in trav if plregion(x))), "seyahat/rivayet yerleri"
        elif nis:
            region, rbasis = list(dict.fromkeys(plregion(x) for x in nis if plregion(x))), "nisbe (zayıf)"
        else:
            region, rbasis = [], ""
        # intikal / göç
        origin_pl = born or uniq(["origin"]) or nis
        o_regs = list(dict.fromkeys(plregion(x) for x in origin_pl if plregion(x)))
        obasis = "doğum" if born else ("asıl" if uniq(["origin"]) else ("nisbe" if nis else ""))
        moved, route = "", ""   # bilgi yoksa boş
        if origin_pl and live:
            new_regs = [r for r in regs_live if r not in o_regs]
            if new_regs:
                moved = "evet (bölgeler arası)" if obasis != "nisbe" else "olası (nisbeye göre)"
                route = f"{' / '.join(o_regs)} → {' / '.join(new_regs)}"
            elif [x for x in live if x not in origin_pl]:
                moved = "evet (bölge içi)" if obasis != "nisbe" else "olası (nisbeye göre)"
                route = f"{', '.join(plname(x) for x in origin_pl[:2])} → {', '.join(plname(x) for x in live if x not in origin_pl)}"
            else:
                moved = "hayır (aynı yerde)"
        elif trav and not live:
            moved = "yalnız seyahat kaydı"
        obasis = "doğum" if born else ("asıl" if uniq(["origin"]) else ("nisbe" if nis else ""))
        goc_ev = []
        for t in texts:
            s = snippet(t["text"], GOC)
            if s:
                goc_ev.append(f"{dia_cite(t['book'], t['cite'])}: …{s}…")
                break
        # hocalar / talebeler
        teachers = []
        for r in p["teachers"]:
            q = P.get(r["id"], {})
            teachers.append(f"{q.get('trs') or r['id']}" + (f" (ö. {q['death_h']})" if q.get("death_h") else ""))
            for cite, snip, word in r.get("ev", [])[:2]:
                L_rel.append({"kimlik": pid, "ad": p["trs"], "yön": "hocası", "karşı taraf": q.get("tr") or r["id"],
                              "karşı kimlik": r["id"], "karşı vefat": q.get("death_h"),
                              "bağ türü": ", ".join(REL.get(x, x) for x in r["rels"]), "zayıf": "evet" if r.get("weak") else "",
                              "kaynak": cite_of(cite), "kanıt": snip})
        ext_t = [e for e in p["ext"] if e[2] == "teacher"]
        for ar, d, role, rel, cite, tr in ext_t:
            teachers.append(f"{tr or ar}" + (f" (ö. {d})" if d else "") + " [biyografisi bu eserlerde yok]")
            L_rel.append({"kimlik": pid, "ad": p["trs"], "yön": "hocası", "karşı taraf": tr or ar, "karşı kimlik": "",
                          "karşı vefat": d, "bağ türü": REL.get(rel, rel), "zayıf": "", "kaynak": cite_of(cite), "kanıt": ar})
        for r in p["students"]:
            q = P.get(r["id"], {})
            for cite, snip, word in r.get("ev", [])[:1]:
                L_rel.append({"kimlik": pid, "ad": p["trs"], "yön": "talebesi", "karşı taraf": q.get("tr") or r["id"],
                              "karşı kimlik": r["id"], "karşı vefat": q.get("death_h"),
                              "bağ türü": ", ".join(REL.get(x, x) for x in r["rels"]), "zayıf": "evet" if r.get("weak") else "",
                              "kaynak": cite_of(cite), "kanıt": snip})
        # eserler
        works = [w for w in WB["works"] if w.get("a") == pid]
        wnames, wforms, wfields = [], Counter(), Counter()
        for w in works:
            fl, fb = work_field(w)
            nm = w.get("tr") or w.get("ar") or ""
            base = WBY.get(w.get("b") or "", {})
            wnames.append(nm + (f" ({WFORM.get(w['k'], w['k'])}: {base.get('tr') or base.get('ar')})" if base and w["k"] != "asl" else ""))
            wforms[WFORM.get(w["k"], w["k"])] += 1
            wfields[fl] += 1
            L_work.append({"kimlik": pid, "ad": p["trs"], "vefat": dh, "eser (Türkçe)": w.get("tr") or "", "eser (Arapça)": w.get("ar") or "",
                           "şekil": WFORM.get(w["k"], w["k"]), "dayandığı eser": base.get("tr") or base.get("ar") or "",
                           "ilim dalı": fl, "dal dayanağı": fb,
                           "kaynak": "; ".join(dict.fromkeys(cite_of(WB["cites"][i]) for i in w.get("s", []))) or "temel metin listesi"})
        # görev ve olay işaretleri
        gorev, olay = set(), set()
        for t in texts:
            c = dia_cite(t["book"], t["cite"])
            for lab, s in hits(t["text"], GOREV):
                gorev.add(lab)
                L_ev.append({"kimlik": pid, "ad": p["trs"], "vefat": dh, "tür": "görev/faaliyet", "işaret": lab, "kaynak": c, "kanıt": s})
            for lab, s in hits(t["text"], OLAY):
                olay.add(lab)
                L_ev.append({"kimlik": pid, "ad": p["trs"], "vefat": dh, "tür": "siyasî/sosyal olay", "işaret": lab, "kaynak": c, "kanıt": s})
        rows.append({
            "no": no, "kimlik": pid,
            "tam adı": p["tr"], "meşhur adı": p["trs"], "Arapça adı": p["name"],
            "doğum (h./m.)": hm(birth), "doğum dayanağı": bsrc, "doğum için farklı rivayet": bconf,
            "vefat (h./m.)": hm(dh), "vefat niteliği": dnote, "vefat dayanağı": "; ".join(dict.fromkeys(dsrc)),
            "çeyrek yüzyıl": f"{(dh - 1) // 25 * 25 + 1}-{(dh - 1) // 25 * 25 + 25}",
            "nisbe yerleri": ", ".join(plname(x) for x in nis),
            "doğum yeri": ", ".join(plname(x) for x in born),
            "yaşadığı bölge": ", ".join(region), "bölge dayanağı": rbasis,
            "bulunduğu şehir/köy": ", ".join(plname(x) for x in live),
            "seyahat/rivayet yerleri": ", ".join(plname(x) for x in trav),
            "intikal/göç": moved, "göç güzergâhı": route, "güzergâh dayanağı (çıkış)": obasis if moved else "",
            "göç ifadesi (ilk)": goc_ev[0] if goc_ev else "",
            "hocaları": "; ".join(teachers), "hoca sayısı": len(teachers) or None, "talebe sayısı": len(p["students"]) or None,
            "eserleri": "; ".join(wnames), "eser sayısı": len(works) or None,
            "eser şekilleri": ", ".join(f"{k} {v}" for k, v in wforms.most_common()),
            "eser alanları": ", ".join(f"{k} {v}" for k, v in wfields.most_common() if k),
            "görev/faaliyet (otomatik aday)": ", ".join(sorted(gorev)), "anılan siyasî/sosyal olaylar (otomatik aday)": ", ".join(sorted(olay)),
            "Özel’de maddesi": f"s. {oz['sayfa']}" if oz else "",
            "kaynaklar": "; ".join(cites), "kaynak sayısı": len(p["sources"]),
            "sitede": f"https://fukaha.github.io/tabaqat/#/p/{pid}",
        })
    return rows, L_place, L_rel, L_work, L_ev, L_src


GUIDE = [
    ("Kapsam", "Vefatı hicrî 620-750 (m. 1223-1349) arasında olan ve tabakāt eserlerinde maddesi bulunan Hanefîler. "
               "Vefatı açıkça kayıtlı olanlar ile vefatı zikredilmeyip hoca ve talebelerinin tabakasından tahmin edilenler "
               "“vefat niteliği” sütununda ayrılmıştır. Fakih olmayan (emîr, şair, tabib vb.) kişiler henüz ayıklanmamıştır."),
    ("Taranan eserler", "; ".join(b["cite_tr"] for k, b in BOOKS.items() if k != "ghuraf_v2")
     + "; Ahmet Özel, Hanefî Fıkıh Âlimleri (Ankara: Türkiye Diyanet Vakfı Yayınları, 1990)."),
    ("Atıf biçimi", "TDV İslâm Ansiklopedisi kaynakça üslûbu: müellif kısa adı, eser kısa adı, cilt (Roma rakamı), sayfa; "
                    "tek ciltli eserlerde “s.”. Madde numarası parantez içinde verilmiştir."),
    ("Tarih", "Hicrî/milâdî. Milâdî yıl hicrî yılın başladığı yıla göre hesaplanmıştır; hicrî yıl iki milâdî yıla taştığında "
              "DİA’daki gibi tek yıl gösterilir."),
    ("Güvenilir sütunlar", "tam adı, Arapça adı, vefat, vefat dayanağı, kaynaklar: maddelerin birleştirilmesi ve vefat yılları "
                           "daha önce elle denetlendi."),
    ("Aday sütunlar", "doğum, nisbe yerleri, doğum yeri, yaşadığı bölge, bulunduğu şehir/köy, intikal/göç, hocaları, eserleri, "
                      "görev ve olay işaretleri metinden otomatik çıkarılmıştır. Örneklem denetiminde eksikler (özellikle doğum yeri, "
                      "eser ve hoca) ve yanlış pozitifler (görev ve olay işaretleri) görülmüştür. Bu sütunlar tam metin okumasıyla "
                      "doğrulanacaktır; analizde henüz kesin veri olarak kullanılmamalıdır."),
    ("Yaşadığı bölge", "İkamet, görev, vefat ve defin yerlerinin bölgesi; bunlar yoksa sırasıyla doğum yeri, seyahat yerleri, nisbe. "
                       "Dayanak “bölge dayanağı” sütunundadır. Bölgeler el-Süreyyâ (al-Thurayya) coğrafî bölümlemesine göredir."),
    ("İntikal/göç", "Çıkış yeri (doğum, yoksa asıl, yoksa nisbe) ile ikamet/görev/vefat yerlerinin karşılaştırılması. "
                    "“olası (nisbeye göre)”: çıkış yalnız nisbeden bilindiği için göç kesin değildir."),
    ("Uzun tablolar", "Yerler, Hoca-talebe, Eserler, Görev ve olay adayları, Kaynak maddeleri sayfalarında her bilgi ayrı satırda, "
                      "kaynağı ve metindeki kanıt cümlesiyle verilmiştir. “kimlik” sütunu bütün sayfaları birbirine bağlar."),
    ("Telif", "Kanıt cümleleri telifli neşirlerden kısa alıntıdır; dosya yalnız araştırma ekibi içindir, yayımlanmamalıdır."),
]


def write_xlsx(rows, places, rels, works, ev, srcs, path):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    F = "Arial"
    head = PatternFill("solid", fgColor="1F3A5F")
    aday = PatternFill("solid", fgColor="FFF4D6")
    thin = Side(style="thin", color="D0D7E2")
    wb = Workbook()
    g = wb.active
    g.title = "Kılavuz"
    g["A1"] = "7./13. Yüzyıl Hanefî Fakihleri Veri Seti (h. 620-750)"
    g["A1"].font = Font(name=F, size=14, bold=True, color="1F3A5F")
    g["A2"] = "Hazırlanış: tabakat sitesi veri hattı (fukaha.github.io/tabaqat), analysis/fakihler_620_750.py"
    g["A2"].font = Font(name=F, size=9, italic=True, color="555555")
    for i, (k, v) in enumerate(GUIDE, 4):
        g.cell(i, 1, k).font = Font(name=F, bold=True)
        c = g.cell(i, 2, v)
        c.font = Font(name=F)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        g.cell(i, 1).alignment = Alignment(vertical="top")
    g.column_dimensions["A"].width = 20
    g.column_dimensions["B"].width = 110
    r0 = len(GUIDE) + 6
    g.cell(r0, 1, "Kapsam sayımı").font = Font(name=F, bold=True, size=12, color="1F3A5F")
    g.cell(r0 + 1, 1, "Sütun").font = Font(name=F, bold=True)
    g.cell(r0 + 1, 2, "Dolu satır (formül)").font = Font(name=F, bold=True)
    cols = list(rows[0].keys())
    n = len(rows) + 1
    for j, col in enumerate(["tam adı", "doğum (h./m.)", "nisbe yerleri", "doğum yeri", "yaşadığı bölge", "bulunduğu şehir/köy",
                             "hocaları", "eserleri", "Özel’de maddesi"], r0 + 2):
        L = get_column_letter(cols.index(col) + 1)
        g.cell(j, 1, col).font = Font(name=F)
        g.cell(j, 2, f'=COUNTIF(Fakihler!{L}2:{L}{n},"?*")').font = Font(name=F)
        g.cell(j, 2).alignment = Alignment(horizontal="left")
    j += 1
    L = get_column_letter(cols.index("vefat niteliği") + 1)
    g.cell(j, 1, "vefatı açık").font = Font(name=F)
    g.cell(j, 2, f'=COUNTIF(Fakihler!{L}2:{L}{n},"açık*")+COUNTIF(Fakihler!{L}2:{L}{n},"madde*")').font = Font(name=F)
    g.cell(j + 1, 1, "vefatı tahminî").font = Font(name=F)
    g.cell(j + 1, 2, f'=COUNTIF(Fakihler!{L}2:{L}{n},"tahminî*")').font = Font(name=F)
    for jj in (j, j + 1):
        g.cell(jj, 2).alignment = Alignment(horizontal="left")

    ADAY = {"doğum (h./m.)", "doğum dayanağı", "doğum için farklı rivayet", "nisbe yerleri", "doğum yeri", "yaşadığı bölge",
            "bölge dayanağı", "bulunduğu şehir/köy", "seyahat/rivayet yerleri", "intikal/göç", "göç güzergâhı",
            "güzergâh dayanağı (çıkış)", "göç ifadesi (ilk)", "hocaları", "hoca sayısı", "talebe sayısı", "eserleri",
            "eser sayısı", "eser şekilleri", "eser alanları", "görev/faaliyet (otomatik aday)",
            "anılan siyasî/sosyal olaylar (otomatik aday)"}
    WIDE = {"tam adı": 38, "meşhur adı": 24, "Arapça adı": 40, "hocaları": 50, "eserleri": 50, "kaynaklar": 60,
            "göç ifadesi (ilk)": 50, "kanıt": 70, "vefat dayanağı": 40, "doğum dayanağı": 34, "sitede": 18,
            "karşı taraf": 34, "eser (Türkçe)": 30, "eser (Arapça)": 30, "madde başlığı": 50, "arapça atıf": 30,
            "kaynak": 40, "bulunduğu şehir/köy": 24, "seyahat/rivayet yerleri": 24, "nisbe yerleri": 22}
    AR_COLS = {"Arapça adı", "kanıt", "eser (Arapça)", "madde başlığı", "arapça atıf", "metindeki kelime", "göç ifadesi (ilk)"}

    def sheet(title, data, mark_aday=False):
        ws = wb.create_sheet(title)
        if not data:
            return ws
        keys = list(data[0].keys())
        for c, k in enumerate(keys, 1):
            cell = ws.cell(1, c, k)
            cell.font = Font(name=F, bold=True, color="FFFFFF")
            cell.fill = head
            cell.alignment = Alignment(wrap_text=True, vertical="center")
            if mark_aday and k in ADAY:
                cell.fill = PatternFill("solid", fgColor="8A6D1F")
            ws.column_dimensions[get_column_letter(c)].width = WIDE.get(k, 14)
        for r, d in enumerate(data, 2):
            for c, k in enumerate(keys, 1):
                v = d.get(k)
                cell = ws.cell(r, c, v if v not in (None, "") else None)
                cell.font = Font(name=F, size=10)
                cell.border = Border(bottom=thin)
                cell.alignment = Alignment(wrap_text=k in WIDE, vertical="top",
                                           horizontal="right" if k in AR_COLS else None,
                                           readingOrder=2 if k in AR_COLS else 0)
                if mark_aday and k in ADAY:
                    cell.fill = aday
                if k == "sitede" and v:
                    cell.hyperlink = v
                    cell.font = Font(name=F, size=10, color="1F5FBF", underline="single")
        ws.freeze_panes = "D2" if mark_aday else "C2"
        ws.auto_filter.ref = ws.dimensions
        ws.row_dimensions[1].height = 32
        return ws

    sheet("Fakihler", rows, mark_aday=True)
    sheet("Yerler", places)
    sheet("Hoca-talebe", rels)
    sheet("Eserler", works)
    sheet("Görev ve olay adayları", ev)
    sheet("Kaynak maddeleri", srcs)
    wb.save(path)


if __name__ == "__main__":
    rows, *longs = build()
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump({"rows": rows, "places": longs[0], "relations": longs[1], "works": longs[2], "evidence": longs[3],
               "sources": longs[4]}, open(OUT / "fakihler_620_750.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    write_xlsx(rows, *longs, OUT / "fakihler_620_750.xlsx")
    print(len(rows), [len(x) for x in longs])

"""Madde başlığından şahıs adı, metinden vefat yılı çıkarımı ve isim ayrıştırma.

Ad, eşleştirme için parçalarına ayrılır:
- `chain`: nesep zinciri ["محمد", "احمد", "عبد الله", ...] (ism, baba, dede ...)
- `kunya`: "ابو بكر" (zincir içindeki "بن ابي بكر" hariç)
- `nisbas`: "ال..." ile başlayan nisbe/lakaplar (الحنفي gibi ayırt etmeyenler hariç)
- `laqabs`: "... الدين" lakapları
Hepsi `normalize` edilmiş (harekesiz, elif/ya/he birleşik) biçimdedir.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..normalize.arabic import normalize

# --- Başlık temizliği --------------------------------------------------------------

_NUM_PREFIX = re.compile(r"^و?[\[(]?\s*[\d٠-٩]+\s*[-.–]\s*")
_GHURAF_NUM = re.compile(r"^\[[٠-٩]+\]\s*")
_FASL = re.compile(r"^فصل:?\s+في\s+(مناقب|فضل|ذكر)\s+(الإمام\s+|الامام\s+)?")
_PIOUS = re.compile(r"\s*(\(?قدس سره\)?|رحمه?ة? الله( تعالى)?( عليه)?|رضي الله عنه|عليه السلام|"
                    r"صلى الله عليه وسلم)\s*")


def heading_name(heading: str) -> str:
    """Başlıktaki numara, köşeli/yuvarlak ayraç ve dua kalıplarını atar."""
    s = heading.replace("\n", " ")
    s = re.sub(r"^\s*/\s*", "", s)  # sayfa kırığı işareti
    s = _GHURAF_NUM.sub("", s)
    s = _NUM_PREFIX.sub("", s)
    s = re.sub(r"^\s*/\s*", "", s)
    s = _FASL.sub("", s)
    s = re.sub(r"^ترجمة\s*:?\s*", "", s)
    s = s.replace("«", "").replace("»", "")
    s = re.sub(r"[()\[\]]", "", s)
    s = _PIOUS.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip(" .،:-")


def lead_name(text: str, limit: int = 160) -> str:
    """Metnin ilk cümlesi (Ketâib ve Tâc'da tam ad burada verilir)."""
    first = re.split(r"[.:\n]", text.strip(), maxsplit=1)[0]
    return first[:limit].strip()


# --- Vefat yılı ------------------------------------------------------------------------

_ONES = {
    "واحد": 1, "احدي": 1, "احد": 1, "اثنتين": 2, "اثنين": 2, "ثنتين": 2, "اثنتي": 2, "اثني": 2,
    "ثلاث": 3, "ثلاثه": 3, "اربع": 4, "اربعه": 4, "خمس": 5, "خمسه": 5, "ست": 6, "سته": 6,
    "سبع": 7, "سبعه": 7, "ثمان": 8, "ثماني": 8, "ثمانيه": 8, "تسع": 9, "تسعه": 9,
}
_TENS = {"عشرين": 20, "ثلاثين": 30, "اربعين": 40, "خمسين": 50, "ستين": 60, "سبعين": 70,
         "ثمانين": 80, "تسعين": 90}
# normalize: ئ→ي; OCR: "ماته", "مانه", "مات"
_HUNDRED = ("مايه", "ميه", "ماه", "مائه", "مئه", "ماته", "مانه", "مات")
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def words_to_year(words: list[str]) -> int | None:
    """"خمس وتسعين وخمسمائه" → 595. Sayı olmayan ilk kelimede durur."""
    total, ones, used, skip = 0, 0, False, None
    for w in words:
        w = re.sub(r"[^\u0621-\u064a]", "", w)
        if w.startswith("و") and w[1:] and not w.startswith(("واحد",)):
            w = w[1:]
        if not w:
            break
        if w == "او" and skip is None:  # "ثمان او تسع واربعين": ikinci rivayet atlanır
            skip = True
            continue
        if skip:
            skip = False
            if w in _ONES:
                continue
        if w in _ONES:
            ones = _ONES[w]
        elif w in ("عشر", "عشره"):
            total += 10 + ones
            ones = 0
        elif w in _TENS:
            total += _TENS[w] + ones
            ones = 0
        elif w in _HUNDRED and w != "مات":
            total += 100 * (ones or 1)
            ones = 0
        elif w in ("مايتين", "ميتين", "مايتي", "ميتي", "ماتين"):
            total += 200
        elif any(w.endswith(h) and w[: -len(h)] in _ONES for h in _HUNDRED):
            h = next(h for h in _HUNDRED if w.endswith(h) and w[: -len(h)] in _ONES)
            total += 100 * _ONES[w[: -len(h)]]
        elif w in ("الف", "ألف"):
            total += 1000 * (ones or 1)
            ones = 0
        else:
            break
        used = True
    total += ones
    return total if used and 0 < total < 1400 else None


_DEATH_VERB = re.compile(r"(توفي|مات|وفاته|توفاه|قتل|استشهد|درج|المتوفي|المتوفى)")
_SANA = re.compile(r"سنه\s+(?:[^\s\d٠-٩]+\s+)?")


def death_year(text: str, window: int = 90) -> int | None:
    """Metindeki ilk "توفي/مات ... سنة ..." kalıbından hicrî yıl."""
    n = normalize(re.sub(r"\[\^\d+\]", "", text))
    for m in _DEATH_VERB.finditer(n):
        seg = n[m.end(): m.end() + window]
        if re.match(r"\s*(والده|ابوه|ابنه|اخوه|ولده|شيخه|زوجته|جده|عمه)", seg):
            continue  # başkasının vefatı
        s = re.search(r"سنه\s+", seg)
        if not s:
            continue
        rest = seg[s.end():]
        d = re.match(r"([\d٠-٩]{2,4})", rest)
        if d:
            y = int(d.group(1).translate(_DIGITS))
            if 0 < y < 1400:
                return y
        y = words_to_year(rest.split()[:8])
        if y:
            return y
    return None


def year_from_note(note: str) -> int | None:
    """Fihrist vefat notu "٨١٦هـ/١٤١٣م", "بعد ٦٥٦هـ" → 816 / 656."""
    m = re.search(r"([\d٠-٩]{2,4})\s*هـ", note)
    return int(m.group(1).translate(_DIGITS)) if m else None


# --- İsim ayrıştırma --------------------------------------------------------------------

_TITLES = {
    "الشيخ", "الامام", "القاضي", "الفقيه", "الحافظ", "السيد", "العالم", "الزاهد", "الواعظ",
    "الاديب", "الامير", "الحاكم", "الخطيب", "المحدث", "الاجل", "الثقه", "العلامه", "المولي",
    "الاستاذ", "الصدر", "الكبير", "العارف", "بالله", "مولانا", "المفتي", "الحنفي", "الفاضل",
    "المقرئ", "المقري", "الكامل", "الشهير", "الورع", "المعروف", "الفقيه،", "قاضي",
    "القضاه", "شيخ", "الاسلام", "النحوي", "اللغوي", "الاصولي", "المفسر", "المتكلم", "الصوفي",
    "المسند", "الرحاله", "الجليل", "الاكبر", "الاعظم", "النبي", "الصحابي", "التابعي",
    "المنعوت", "الملقب", "الملك", "السلطان", "المولي", "مولي", "المدعو", "الشهيد", "العلامه،", "الوزير", "الرئيس",
}
_WEAK_NISBA = {"الحنفي", "الفقيه", "القاضي", "الامام", "الشيخ", "الحافظ"}
# "شمس الأئمة", "افتخار الملة", "تاج الشريعة": ikinci kelimesiyle lakap
_LAQAB_TAIL = {"الدين", "الايمه", "الائمه", "المله", "الشريعه", "الاسلام", "الدوله", "الحق", "السنه"}
_COMPOUND_FIRST = ("عبد", "ابو", "ابي", "ام", "ابن", "ذو", "ذي")


def _is_nisba(u: str) -> bool:
    return u.startswith("ال") and u.endswith("ي") and " " not in u and len(u) > 4


def _is_laqab(u: str) -> bool:
    return " " in u and u.split()[-1] in _LAQAB_TAIL and not u.startswith(("عبد ", "ابو "))


def _units(words: list[str]) -> list[str]:
    """Kelimeleri isim birimlerine toplar: "عبد الله", "ابو بكر", "شمس الدين"."""
    out, i = [], 0
    while i < len(words):
        w = words[i]
        if w in _COMPOUND_FIRST and i + 1 < len(words):
            head = "ابو" if w == "ابي" else w
            if words[i + 1] in ("عبد", "ابي", "ابو") and i + 2 < len(words):  # "ابي عبد الله"
                nxt = "ابي" if words[i + 1] == "ابو" else words[i + 1]
                out.append(f"{head} {nxt} {words[i + 2]}")
                i += 3
            else:
                out.append(f"{head} {words[i + 1]}")
                i += 2
        elif i + 1 < len(words) and words[i + 1] in _LAQAB_TAIL:
            out.append(f"{w} {words[i + 1]}")
            i += 2
        elif w.startswith("عبد") and len(w) > 4 and w[3:5] == "ال":  # "عبدالله" yazımı
            out.append(f"عبد {w[3:]}")
            i += 1
        else:
            out.append(w)
            i += 1
    return out


@dataclass
class ParsedName:
    raw: str
    chain: list[str] = field(default_factory=list)
    kunya: str = ""
    nisbas: set[str] = field(default_factory=set)
    laqabs: set[str] = field(default_factory=set)

    @property
    def key(self) -> str:
        return " بن ".join(self.chain)


def parse_name(s: str) -> ParsedName:
    n = normalize(s)
    n = re.sub(r"[«»\"'()\[\]]", " ", n)
    n = re.sub(r"-\s*(ثلاثا|مرتين|ثلاث مرات)\s*-", " ", n)
    p = ParsedName(s)
    parts = [x.strip() for x in re.split(r"[،,؛]", n) if x.strip()]
    # Nesep zincirini taşıyan parça: "بن" içeren ilk parça, yoksa ilk parça
    ci = next((i for i, x in enumerate(parts) if re.search(r"(^| )(بن|ابن) ", x)), 0)
    for i, part in enumerate(parts):
        words = [w for w in part.split() if w]
        if i == ci:
            # "ابن" zincir içinde "بن" demektir; baştaki "ابن X" şöhrettir
            # ama lakap/nisbeden sonra gelen "ابن" şöhrettir: "كمال الدين ابن الهمام"
            words = ["بن" if (w == "ابن" and j > 0 and words[j - 1] not in _LAQAB_TAIL
                              and not _is_nisba(words[j - 1])) else w
                     for j, w in enumerate(words)]
            segs, cur = [], []
            for w in words:
                if w in ("بن", "بنت"):
                    segs.append(cur)
                    cur = []
                else:
                    cur.append(w)
            segs.append(cur)
            for k, seg in enumerate(segs):
                units = [u for u in _units(seg) if u not in _TITLES]
                if not units:
                    continue
                if k == 0:
                    # Zincirden önceki künye/lakaplar: "ابو العباس احمد" → künye + ism
                    while len(units) > 1 and (units[0].startswith("ابو ") or _is_laqab(units[0])
                                              or units[0] in _TITLES):
                        head = units.pop(0)
                        if head.startswith("ابو ") and not p.kunya:
                            p.kunya = head
                        elif _is_laqab(head):
                            p.laqabs.add(head)
                if k == 0 and len(segs) == 1:
                    # Zincirsiz başlık ("قوام الدين الاتقاني", "ابو عبد الله البصري", "الناطفي"):
                    # künye/lakap/nisbe ayrılır; geriye özel ad kalırsa zincirin ilk halkasıdır.
                    if units and units[0].startswith("ابو ") and not p.kunya:
                        p.kunya = units.pop(0)
                    named = bool(p.kunya or p.laqabs)
                    rest = []
                    for u in units:
                        if _is_nisba(u) or (named and u.startswith("ال")) or u.startswith("ابن "):
                            _extra(p, u)
                        else:
                            rest.append(u)
                    units = rest
                    if not units:
                        continue
                p.chain.append(units[0])
                for u in units[1:]:
                    _extra(p, u)
        else:
            for u in _units(words):
                _extra(p, u)
    return p


def _extra(p: ParsedName, u: str) -> None:
    if u.startswith("ابو ") and not p.kunya:
        p.kunya = u
    elif _is_laqab(u):
        p.laqabs.add(u)
    elif _is_nisba(u) and u not in _TITLES and u not in _WEAK_NISBA:
        p.nisbas.add(u)
    elif u.startswith("ابن ") and u[4:] not in _TITLES:
        p.nisbas.add(u)

"""Madde metninden hoca–talebe atıflarını çıkarır.

Her atıf, maddenin sahibine (özne) göre bir rol taşır:
  teacher  — anılan kişi öznenin hocası ("تفقه على X", "أخذ عن X", "سمع من X", "روى عن X")
  student  — anılan kişi öznenin talebesi ("تفقه عليه X", "أخذ عنه X", "روى عنه X")
Fevâid'in "أخذ عن A عن B عن C" zincirleri ayrıca A←B←C hoca bağlarını verir (`chain`).

Metin normalize edilir (ى→ي): "على" edatı ile "علي" adı ayırt edilemez; edattan sonra "بن" gelirse
ad sayılır.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..normalize.arabic import normalize

# (kalıp, rol, ilişki türü). Kalıp normalize edilmiş metinde, kelime başında aranır.
TRIGGERS: list[tuple[str, str, str]] = [
    (r"تفقه (?:عليه|به)\b", "student", "fiqh"),
    (r"تفقه (?:علي|عند)\b", "teacher", "fiqh"),
    (r"(?:اخذ|يروي|روي) (?:الفقه |العلم |العلوم |الادب |الحديث |القراءات |التفسير )?عنه\b",
     "student", "took"),
    (r"اخذ (?:الفقه |العلم |العلوم |العلوم الشرعيه |الادب |الحديث |القراءات |التفسير |الطريقه )?عن\b",
     "teacher", "took"),
    (r"(?:يروي|روي|حدث) عن\b", "teacher", "hadith"),
    (r"سمع منه\b", "student", "hadith"),
    (r"سمع من\b", "teacher", "hadith"),
    (r"قرا عليه\b", "student", "read"),
    (r"قرا (?:[^ .،]+ )?علي\b", "teacher", "read"),
    (r"تخرج (?:به|عليه)\b", "student", "fiqh"),
    (r"تخرج (?:علي|ب)\b", "teacher", "fiqh"),
    (r"(?:صحب|لازم)\b", "teacher", "companion"),
    (r"(?:من اصحاب|تلميذ|من تلامذه|من تلاميذ)\b", "teacher", "companion"),
    (r"(?:هو |وهو |كان )?استاذ\b", "student", "fiqh"),
    (r"وعنه\b", "student", "took"),
]
_TRIG = re.compile("|".join(f"(?P<t{i}>(?<![^\\s،.(«:])(?:و|ف|ثم )?{p})"
                            for i, (p, _, _) in enumerate(TRIGGERS)))

# Atıf bu kelimelerden birinde biter (yeni cümle/eylem)
_CLAUSE_END = re.compile(
    r"[.؛:!؟?\n\[]| (?:و|ف|ثم )?(?:تفقه|سمع|روي|يروي|قرا|اخذ|كان|مات|توفي|ولي|درس|قال|قدم|رحل|"
    r"حدث|برع|صنف|له|وله|هو|وهو|حتي|سنه|في سنه|ببغداد|ببخاري|بسمرقند|بدمشق|بمصر|بالقاهره|بحلب|"
    r"بمرو|ببلخ|بنيسابور|بمكه|بالمدينه|وجماعه|وغيره|وغيرهما|وغيرهم|وخلق|وطبقته|في اخرين|"
    r"مثل|منها|الاتي|المتقدم|المذكور|تقدم|ياتي|وسياتي|انتهي|ونحوه|وامثاله|ممن|منهم|الذي|التي|بها|به|"
    r"ذكره|ذكر|رضي|رحمه|قيل|انه|يقال|فقال|فلما|لما|في|فيما|من طبقه)\b")
# Bunlarla başlayan "atıf" kişi değildir
_NOT_PERSON = re.compile(
    r"^(مذهب|مذاهب|الحديث|الكثير|جماعه|علماء|فضلاء|مشايخ|شيوخ|اهل|اكابر|افاضل|بعض|غير|كثير|"
    r"جمع|عده|خلق|الفقه|العلم|علم|كتب|كتاب|الكتب|الطريق|فيه|منه|عنه|لي|له|ذلك|هذا|هذه|ان|انه|"
    r"الحنفيه|الحنابله|الشافعيه|المالكيه|مشايخها|علمايها|فضلايها|اصحابه|اصحابنا|عصره|زمانه|بلده|"
    r"النبي|رسول|الراي|الحديث|المذهب)\b")
_TITLES = re.compile(
    r"^(?:(?:امام الهدي|امام الحرمين|الشيخ|الامام|امام|العلامه|القاضي|الفقيه|الحافظ|المولي|المولى|السيد|الاستاذ|الصدر|قاضي القضاه|"
    r"شيخ الاسلام|شيخ الشيوخ|الشريف|الاديب|الخطيب|المسند|المحدث|الزاهد|العارف|الكبير|الاجل|"
    r"المقري|الرييس|العالم|الفاضل|الكامل|الجليل|المفتي|صاحب) )+")
_TAIL = re.compile(r"(?: (?:رحمهم الله|رحمهما الله|رحمه الله|رضي الله عنه|رضي الله عنهم|تعالي|وغيره|وغيرهم|وغيرهما|وجماعه|"
                   r"الكتب|وجماعته|وطبقته|في اخرين|وخلق|وامثالهم|ونحوهم|الاتي ذكره|المتقدم ذكره))+$")
# Akrabalık: "على أبيه", "تفقه عليه ابنه أحمد"
KIN = {"ابيه": "father", "والده": "father", "اباه": "father", "ابوه": "father",
       "عمه": "uncle", "جده": "grandfather", "خاله": "maternal_uncle", "اخيه": "brother",
       "اخوه": "brother", "اخاه": "brother", "ابنه": "son", "ولده": "son", "ابناه": "son",
       "حفيده": "grandson", "ابن اخيه": "nephew", "ابن اخته": "nephew", "صهره": "in_law",
       "زوجها": "husband", "ابنته": "daughter"}
_NAME_START = re.compile(r"^(?:ابي|ابو|ابا|ابن|بن|عبد|ام|بنت)$")


@dataclass
class Mention:
    role: str            # teacher | student | chain
    rel: str             # fiqh | took | hadith | read | companion
    text: str            # adın geçtiği kısım (normalize)
    kin: str = ""        # akrabalık (father, son, ...)
    snippet: str = ""    # kanıt cümlesi
    # zincirde: bu atıfın talebesi (önceki halka); None = madde sahibi
    student_text: str | None = None
    via_chain: bool = False  # "أخذ عن A عن B" zincirinin ilk halkası
    extra: dict = field(default_factory=dict)


def clean_text(text: str) -> str:
    text = text.split("<hr>")[0]
    text = re.sub(r"\[\^\d+\]|\(\^?[\d٠-٩*]+\)|<[^>]+>", " ", text)
    return normalize(text)


def _split_items(seg: str) -> list[str]:
    """"A، وB وC" → [A, B, C]. "بن"/"ابو" sonrası gelen "و…" kelimesi adın parçasıdır."""
    seg = re.sub(r"\s*،\s*", " ، ", seg)
    toks = seg.split()
    items, cur = [], []
    for i, w in enumerate(toks):
        if w == "،":
            if cur:
                items.append(cur)
            cur = []
            continue
        if (w.startswith("و") and len(w) > 2 and cur and not _NAME_START.match(cur[-1])
                and w not in ("وهب", "وكيع", "واصل", "وضاح", "الوليد", "ورقاء", "واقد")):
            items.append(cur)
            cur = [w[1:]]
            continue
        cur.append(w)
    if cur:
        items.append(cur)
    return [" ".join(x) for x in items]


_LAQAB = re.compile(r"\S+ (?:الدين|الايمه|الاسلام|المله|الشريعه|القضاه|المشايخ|العلماء|الحق)\b")
_KEEP_W = {"وهب", "وكيع", "واصل", "وضاح", "ورقاء", "واقد", "وهبان", "وجيه", "وحيد", "ولي"}


def _clean_item(s: str) -> str:
    s = s.strip(" ،()«»\"'-[]")
    s = re.sub(r"^(?:و)?(?:علي|من) ", "", s)
    if s.startswith("و") and s.split()[0] not in _KEEP_W and len(s.split()[0]) > 2:
        s = s[1:]
    s = _TAIL.sub("", s.rstrip(" .،؛")).strip()
    s = re.sub(r"^صاحب \S+ ", "", s)  # "صاحب الهداية علي بن أبي بكر"
    # "محمد بن الحسن تلميذ أبي حنيفة", "ابن سلمة تلميذ أبي سليمان": açıklama atılır
    s = re.split(r" (?:تلميذ|تلامذه|صاحب|شارح|مصنف|مولف|استاذ|والد|شيخ|خال|جد|قاضي بلده|"
                 r"الماضي|الاتي|المتقدم|المذكور)\b", s)[0]
    s = _TITLES.sub("", s).strip()
    return s


def name_like(s: str, vocab: set[str] | None = None) -> bool:
    """Parçanın bir kişi adına benzeyip benzemediği (liste içinde cümle devamını ayırmak için)."""
    w = s.split()
    if not w or len(w) > 14 or _NOT_PERSON.match(s):
        return False
    if s in KIN or any(s.startswith(k + " ") for k in KIN):
        return True
    if re.search(r"(^| )(بن|ابن|بنت)( |$)", s) or re.match(r"(ابي|ابو|ابا|ام) ", s):
        return True
    if _LAQAB.search(s):
        return True
    if len(w) <= 3 and re.search(r"(^| )ال\S{2,}ي$", s):  # "السرخسي", "محمد الكاكي"
        return True
    return bool(vocab) and len(w) <= 2 and w[0] in vocab


def _kin(item: str) -> tuple[str, str]:
    for k in sorted(KIN, key=len, reverse=True):
        if item == k or item.startswith(k + " "):
            return KIN[k], item[len(k):].strip()
    return "", item


def _names(seg: str, vocab) -> list[str]:
    """Listedeki adlar; ad olmayan ilk parçada liste biter (cümle devamı)."""
    out = []
    for item in _split_items(seg):
        item = _clean_item(item)
        if not name_like(item, vocab):
            if out or len(item.split()) > 3:
                break
            continue
        out.append(item)
    return out


def extract(text: str, book: str = "", vocab: set[str] | None = None) -> list[Mention]:
    t = clean_text(text)
    if book == "qand":  # Kand: tercümeden sonrası müellifin rivayet isnadıdır
        t = re.split(r"قال: (?:وبه )?(?:اخبرنا|حدثنا|انبانا|انشدنا)|\bاخبرنا\b", t)[0]
    out: list[Mention] = []
    last_teacher: str | None = None
    for m in _TRIG.finditer(t):
        i = next(int(k[1:]) for k, v in m.groupdict().items() if v)
        _, role, rel = TRIGGERS[i]
        rest = re.sub(r"^\s*[:،]\s*", " ", t[m.end():])
        # "على" edatından sonra "بن": "علي بن ..." adıdır, edat değil (Fevâid imlası)
        if m.group(0).endswith("علي") and re.match(r"\s*بن\b", rest):
            rest = "علي" + rest
        end = _CLAUSE_END.search(rest)
        seg = rest[:end.start()] if end else rest[:160]
        if len(seg) > 600:  # çok uzun parça: cümle sınırı bulunamadı
            seg = seg[:600].rsplit(" ", 1)[0]
        snippet = t[max(0, m.start() - 30): m.end() + len(seg) + 10].strip()
        links = [x.strip(" ،") for x in re.split(r"،?\s*\bعن ", " " + seg) if x.strip(" ،")]
        chain_from = None
        if role == "student" and m.group(0).endswith("عنه") and re.match(r"\s*،?\s*عن ", rest):
            # "تفقه على A، وأخذ العلوم عنه عن B عن C": A'dan geriye giden zincir
            chain_from, role = last_teacher, "teacher"
            links = [x.strip(" ،") for x in re.split(r"،?\s*\bعن ", rest[:len(seg) + 5])
                     if x.strip(" ،")]
            if not chain_from:
                continue
        if role == "teacher" and (chain_from or (len(links) > 1 and rel in ("took", "fiqh"))):
            # Zincir: "أخذ عن A عن B عن C" → A öznenin, B A'nın, C B'nin hocası
            prev = chain_from
            for j, link in enumerate(links):
                names = _names(link, vocab)
                if not names:
                    break
                first = j == 0 and not chain_from
                for name in (names if first else names[:1]):
                    kin, nm = _kin(name)
                    out.append(Mention("teacher" if first else "chain", rel, nm, kin, snippet,
                                       None if first else prev, via_chain=True,
                                       extra={"raw": name}))
                prev = names[0]
                if first:
                    last_teacher = names[0]
            continue
        if role == "student":
            seg = re.split(r"،?\s*\bعن ", seg)[0]
        for name in _names(seg, vocab):
            kin, nm = _kin(name)
            out.append(Mention(role, rel, nm, kin, snippet, extra={"raw": name}))
            if role == "teacher":
                last_teacher = name
    return out

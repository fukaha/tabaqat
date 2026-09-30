"""Kitap ağı: âlimlerin eserleri ve eserler arası ilişkiler (şerh, hâşiye, ihtisar, nazım, tekmile, tahrîc).

Kaynaklar
- tabakat maddeleri: «…» içindeki adlar, ancak önlerinde telif ifadesi varsa (صنّف، له من التصانيف، وله، شرح، اختصر، نظم…);
  "شرح «X»" → X'e şerh, "اختصر «X»" → ihtisar vb. Atıf ya da okuma bildiren bağlamlar (قرأ، ذكر، فى كتاب…) alınmaz.
- review/fikih_alimleri.yml: Ahmet Özel, Hanefî Fıkıh Âlimleri'ndeki eser listeleri (Türkçe).
- review/works_canon.yml: temel metinler ve meşhur şerhleri (elle); çıkarılan adlar bunlara bağlanır.

Çıktı site/data/books.json: {"works": [...], "kinds": [...]}.
"""
from __future__ import annotations

import re
from collections import defaultdict
from pathlib import Path

import yaml

KINDS = ["asl", "sharh", "hashiya", "ikhtisar", "nazm", "tekmile", "tahric", "fetava"]

# ---------- normalleştirme ----------
_TASHKEEL = re.compile(r"[ً-ْٰـ]")


def norm_ar(s: str) -> str:
    s = _TASHKEEL.sub("", s or "")
    s = re.sub(r"[إأآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    s = re.sub(r"[^ء-ي\s]", " ", s)
    words = [w for w in s.split() if w not in ("كتاب", "في", "فى", "على", "علي")]
    words = [w[2:] if w.startswith("ال") and len(w) > 3 else w for w in words]
    return " ".join(words)


_FOLD = str.maketrans("âîûÂÎÛāīūĀĪŪşŞçÇğĞıİöÖüÜḥṣṭẓḍġ", "aiuAIUaiuAIUsScCgGiIoOuUhstzdg")


def norm_tr(s: str) -> str:
    s = (s or "").translate(_FOLD).lower()
    s = re.sub(r"[’'‘`ʿʾ“”]", "", s)
    s = re.sub(r"\b(e[lsntdrz]|es|et)-", "", s)
    s = re.sub(r"(?<=\w)(l|s|t|d|r|z|n)-", " ", s)          # Kenzü’d-dekāik → kenzu d dekaik
    s = re.sub(r"[^a-z\s]", " ", s)
    out = []
    for w in s.split():
        if w in ("fi", "ala", "ale", "kitabu", "kitab", "li", "ve", "d", "l", "s", "t", "r", "z", "n"):
            continue
        if len(w) > 3:
            w = re.sub(r"[iuıe]$", "", w)                     # i‘râb sonu: kenzi / kenzu → kenz
        out.append(w)
    return " ".join(out)


def key(title: str) -> str:
    return ("ar:" + norm_ar(title)) if re.search(r"[؀-ۿ]", title) else ("tr:" + norm_tr(title))


# ---------- tür ve dayanak ----------
DERIV_AR = [
    (r"^(?:شرح|شرحه على)\s+", "sharh"), (r"^(?:حاشيه|حواشي|حاشيته|الحاشيه|الحواشي)\s+(?:علي\s+)?", "hashiya"),
    (r"^(?:تعليقه|تعليق|تعليقات|التعليقه)\s+(?:علي\s+)?", "hashiya"), (r"^(?:مختصر|اختصار|منتخب|تلخيص|تهذيب)\s+", "ikhtisar"),
    (r"^(?:نظم|منظومه في|ارجوزه في)\s+", "nazm"), (r"^(?:تكمله|تتمه|ذيل)\s+", "tekmile"), (r"^تخريج\s+(?:احاديث\s+)?", "tahric"),
]
_SEP = r"(?:[’'](?:l|s|ş|t|d|r|z|n)-|\s+)"
DERIV_TR = [
    (r"^(?:şerh(?:u|-i|ü)?)" + _SEP, "sharh"), (r"^(?:hâşiye(?:tü|tu)?|havâşî|ta[‘']?lîk(?:at|a)?)(?:\s+(?:alâ|ale))?" + _SEP, "hashiya"),
    (r"^(?:muhtasar(?:u|ü)|ihtisâr(?:u|ü)|telhîs(?:u|ü)|müntehab)" + _SEP, "ikhtisar"), (r"^(?:nazm(?:u|ü)?)" + _SEP, "nazm"),
    (r"^(?:tekmile(?:tü|tu)?|tetimme(?:tü)?|zeyl)" + _SEP, "tekmile"), (r"^(?:tahrîc(?:u|ü)?)(?:\s+ehâdîsi?)?" + _SEP, "tahric"),
]
INNER = [(r"(?:في|فى) شرح\s+(.+)$", "sharh"), (r"\b(?:fî )?şerh[iu]" + _SEP + "(.+)$", "sharh"), (r"(?:في|فى) تخريج (?:احاديث|أحاديث)\s+(.+)$", "tahric"),
         (r"\bfî tahrîci ehâdîsi\s+(.+)$", "tahric")]
VERB = {"شرح": "sharh", "شرحه": "sharh", "اختصر": "ikhtisar", "اختصره": "ikhtisar", "نظم": "nazm", "حشى": "hashiya",
        "علق": "hashiya", "خرج أحاديث": "tahric", "خرّج أحاديث": "tahric"}


def derive(title: str) -> tuple[str | None, str | None]:
    """(tür, dayandığı eserin adı) — ad bir şerh/hâşiye/ihtisar adıysa."""
    t = title.strip()
    tn = _TASHKEEL.sub("", t)
    tn = re.sub(r"[إأآ]", "ا", tn).replace("ة", "ه").replace("ى", "ي")
    for pat, k in DERIV_AR:
        m = re.match(pat, tn)
        if m and len(tn[m.end():]) > 1:
            return k, tn[m.end():]
    low = t[:1].lower() + t[1:]
    for pat, k in DERIV_TR:
        m = re.match(pat, low, re.I)
        if m and len(t[m.end():]) > 1:
            return k, t[m.end():]
    for pat, k in INNER:
        m = re.search(pat, tn if re.search(r"[؀-ۿ]", t) else t)
        if m:
            return k, m.group(1)
    return None, None


# ---------- Arapça metinlerden çıkarım ----------
_CUE = re.compile(r"(صنّ?ف|ألّ?ف|التصانيف|تصانيفه|تصانيف|مصنفاته|المصنفات|مصنفات|تآليفه|التآليف|مؤلفاته|له كتاب|وله|له|"
                  r"شرحه|شرح|اختصره|اختصر|نظم|جمع|علّ?ق|حشّ?ى|كتب على|رتّ?ب|خرّ?ج أحاديث|وضع|عمل)\s*(?:كتاب|كتابا)?\s*$")
_NEG = re.compile(r"(قال|ذكره|ذكر|نقل|رأيت|رأيته|حكى|روى|كذا|قرأ|قرأت|سمع|سمعت|درّ?س|أقرأ|حفظ|عرض|صاحب|مصنّ?ف|مؤلف|تفقه|أخذ|"
                  r"نظر|طالع|أفتى|انظر|ترجمته|ليس له|نحوا من|مثل|فى كتاب|في كتاب|المذكورة|يعرف|اشتهر)")
_GENERIC = {"كتابا", "كتاب", "حواشي", "حواشى", "حاشيه", "حاشية", "مختصر", "مختصرا", "تاريخ", "شرحا", "رساله", "رسالة", "الفتاوى",
            "تصانيف", "مصنف", "مجلد", "منه", "فيه", "تفسير", "ديوان", "مشيخه", "مشيخة", "معجم شيوخه", "التاريخ", "تعليقه", "تعليقة"}
_BADTITLE = re.compile(r"(قال|رحمه|رضى|رضي|اللهم|سنة|سنه|توفى|توفي|مات|حدثنا|أخبرنا|بن\s)")


def extract_ar(entries: dict, owner: dict) -> list[dict]:
    """entries: madde anahtarı → madde; owner: madde anahtarı → kişi kimliği."""
    out = []
    for key_, e in entries.items():
        pid = owner.get(key_)
        text = e.get("text") or ""
        if not pid or "«" not in text:
            continue
        prev_end, prev_ok = -999, False
        for m in re.finditer(r"«([^«»]{2,90})»", text):
            before = text[max(0, m.start() - 70):m.start()]
            seg = re.split(r"[.؛:]\s|\n", before)[-1]
            gap = text[prev_end:m.start()] if prev_end > 0 else ""
            chained = prev_ok and 0 < m.start() - prev_end < 45 and not re.search(r"[.؛\n]", gap) and not _NEG.search(gap)
            cue = _CUE.search(seg.strip())
            ok = chained or ((cue or re.search(r"(صنّ?ف|التصانيف|تصانيف|مصنفات|تآليف|مؤلفات)", seg)) and not _NEG.search(seg[-30:]))
            title = re.sub(r"\s+", " ", m.group(1)).strip(" ،,")
            prev_end = m.end()
            if not ok or _BADTITLE.search(title) or len(title.split()) > 12 or _TASHKEEL.sub("", title) in _GENERIC:
                prev_ok = False
                continue
            prev_ok = True
            verb = None
            if cue:
                v = re.sub(r"\s*(?:كتاب|كتابا)?\s*$", "", cue.group(1))
                verb = VERB.get(_TASHKEEL.sub("", v))
            # "وله «الحواشي» على «الهداية»": genel ad + على «X» → X'e hâşiye/şerh
            out.append({"author": pid, "title": title, "verb": verb, "src": key_,
                        "snippet": re.sub(r"\s+", " ", text[max(0, m.start() - 60):m.end() + 20]).strip()})
    return out


# ---------- ağ ----------
def build(root: Path, info: dict, entries: dict, owner: dict, cite: dict, tr_names: dict, deaths: dict) -> dict:
    canon = yaml.safe_load((root / "review" / "works_canon.yml").read_text(encoding="utf-8")) or {}
    hfa_path = root / "review" / "fikih_alimleri.yml"
    hfa = (yaml.safe_load(hfa_path.read_text(encoding="utf-8")) or {}) if hfa_path.exists() else {}

    works: dict[str, dict] = {}
    alias: dict[str, str] = {}
    for wid, c in canon.items():
        a = c.get("author")
        if a and a not in info:
            raise KeyError(f"works_canon.yml: bilinmeyen müellif {a} ({wid})")
        works[wid] = {"id": wid, "ar": c["ar"], "tr": c["tr"], "a": a, "an": c.get("author_tr"), "y": c.get("year"),
                      "k": c.get("kind", "asl"), "b": c.get("base"), "c": 1, "s": []}
        for t in [c["ar"], *(c.get("ar_alt") or []), c["tr"], *(c.get("tr_alt") or [])]:
            alias.setdefault(key(t), wid)
    for w in works.values():
        if w["b"] and w["b"] not in works:
            raise KeyError(f"works_canon.yml: bilinmeyen dayanak {w['b']} ({w['id']})")

    by_author_key: dict[tuple, str] = {}
    n = 0

    def canon_of(title: str) -> str | None:
        k = key(title)
        if k in alias:
            return alias[k]
        first = k.split(":", 1)[1].split(" ")[:1]
        for ak, wid in alias.items():       # "et-Telvîh fî keşfi hakâiki’t-Tavzîh" → et-Telvîh
            a = ak.split(":", 1)[1]
            if ak[:3] == k[:3] and len(a) >= 5 and (" " not in a and first == [a] or " " in a and k.split(":", 1)[1].startswith(a + " ")):
                return wid
        return None

    def clean_base(t: str) -> str:
        t = re.sub(r"\s+li(?:[’'](?:l|t|s|ş|d|r|z|n)-|-|\s)\S+$", "", t.strip())      # "… li’l-Hılâtî" (müellif adı)
        t = re.sub(r"^(?:evâili|dîbâceti|dibâceti|bâbi|kitâbi)\s+", "", t)
        t = re.sub(r"^(?:اوائل|أوائل|ديباجه|ديباجة)\s+", "", t)
        return t

    def derived_of(t: str) -> str | None:
        """"Şerhi’l-Miftâh" gibi bir türetilmiş eser adı: o türden ve o dayanaktan bir eser (önce elle kayıtlı olan)."""
        k2, b2 = derive(t)
        if not k2:
            return None
        b = canon_of(clean_base(b2))
        if not b:
            return None
        hits = [w for w in works.values() if w.get("b") == b and w.get("k") == k2]
        hits.sort(key=lambda w: (not w.get("c"), w["id"]))
        return hits[0]["id"] if hits else None

    def add(author: str, title: str, lang: str, src: str, verb: str | None = None) -> None:
        nonlocal n
        cw = canon_of(title)
        if cw and not verb:
            w = works[cw]
            if w["a"] in (None, author) or (w["a"] and author and deaths.get(author) == deaths.get(w["a"])):
                if w["a"] is None and not w["an"]:
                    w["a"] = author
                if src not in w["s"]:
                    w["s"].append(src)
            return                                # başkasının temel eseri: atıf, telif değil
        kind, base_title = derive(title)
        base = None
        if verb:                                  # "شرح «الهداية»" → الهداية'ye şerh
            kind, base_title, base = verb, title, cw
            title = {"sharh": "شرح ", "ikhtisar": "مختصر ", "nazm": "نظم ", "hashiya": "حاشية على ",
                     "tahric": "تخريج أحاديث "}[verb] + title
        k = key(title)
        if base_title and not base:
            base_title = clean_base(base_title)
            base = canon_of(base_title) or by_author_key.get(("*", key(base_title))) or derived_of(base_title)
        wid = by_author_key.get((author, k))
        if wid:
            if src not in works[wid]["s"]:
                works[wid]["s"].append(src)
            return
        n += 1
        wid = f"w{n}"
        works[wid] = {"id": wid, ("ar" if lang == "ar" else "tr"): title, "a": author, "k": kind or "asl", "b": base,
                      "bt": base_title if base_title and not base else None, "s": [src]}
        by_author_key[(author, k)] = wid
        by_author_key.setdefault(("*", k), wid)

    for x in extract_ar(entries, owner):
        add(x["author"], x["title"], "ar", x["src"], x["verb"])
    for pid, c in hfa.items():
        src = f"hfa:{pid}"
        for t in c.get("eserler") or []:
            add(pid, t, "tr", src)

    # yıl: müellifin vefatı; türetilmiş eserin dayanağı yoksa ya da kendine dayanıyorsa bağ kurulmaz
    for w in works.values():
        if w.get("a"):
            w["y"] = deaths.get(w["a"])
        if w.get("b") == w["id"]:
            w["b"] = None
    # atıf metinleri
    cites = sorted({s for w in works.values() for s in w["s"]})
    ci = {s: i for i, s in enumerate(cites)}
    out = []
    for w in works.values():
        if not w.get("c") and not w["s"]:
            continue
        rec = {k: v for k, v in w.items() if v not in (None, [], "") and k != "s"}
        rec["s"] = [ci[s] for s in w["s"]]
        out.append(rec)
    return {"works": out, "cites": [cite.get(s, s) for s in cites], "kinds": KINDS}

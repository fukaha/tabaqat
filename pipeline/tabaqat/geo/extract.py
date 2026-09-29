"""Madde metninden yer atıfları: doğum, vefat, defin, yolculuk, ikamet, görev, faaliyet, köken.

Tetikleyici fiilden ("ولد", "مات", "دفن", "رحل", "قدم", "سكن", "ولي قضاء", "حدث"...) sonra,
cümle bitmeden gelen ilk yer adı alınır: "توفي في رجب سنة ... ببخارى". "بها / فيها" en son anılan
yere döner ("قدم بغداد وحدث بها").
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..network.extract import clean_text
from .gazetteer import Gazetteer, key

KINDS = {
    "birth": r"ولد|مولده|مولدي",
    "death": r"مات|توفي|توفاه|وفاته|قتل|استشهد|درج|وفاتي",
    "burial": r"دفن|قبره|ضريحه|مدفون",
    "travel": r"رحل|ارتحل|سافر|قدم|دخل|ورد|انتقل|توجه|وصل|حج|عاد|رجع|خرج|هاجر|وفد|اتي|جاء",
    "residence": r"سكن|استوطن|نزل|قطن|اقام|جاور|توطن|نشا|استقر|مقيما|نزيل",
    "office": r"قضاء|قاضي|قاضيا|ولي|تولي|وظيفه|مدرسا|درس|خطيب|خطابه|مفتي|افتي|مشيخه|امامه",
    "activity": r"حدث|سمع|تفقه|قرا|اخذ|روي|املي|اشتغل|تخرج|برع|اجتمع|لقي",
    "origin": r"من اهل|اصله من|من قري|اصله",
}
_TRIG = re.compile(r"(?<!\S)(?:[وف])?(" + "|".join(f"(?P<{k}>{v})" for k, v in KINDS.items())
                   + r")(?=\S{0,3}(?:\s|$))")
_PREP = re.compile(r"^(?:[وف]?(?:ب|ل)|في|الي|الى|من|[وف])$")
_STOP = set(".؛:؟!\n")
_PRON = {"بها", "فيها", "بها،", "فيها،", "بها.", "اليها", "منها"}
WINDOW = 14
PRON_REACH = 120   # "بها" en çok bu kadar karakter önce anılan yere döner
# tetikleyiciyle yer arasına girebilen, bağımsız yer bildirmeyen kelimeler (tarih, zaman)


@dataclass
class PlaceMention:
    place: str
    kind: str
    text: str
    snippet: str
    pos: int


def _tokens(text: str) -> list[tuple[str, int]]:
    return [(m.group(), m.start()) for m in re.finditer(r"[^\s.؛:،,؟!()\[\]«»\"]+|[.؛:؟!\n]", text)]


def _match_at(gz: Gazetteer, toks: list[tuple[str, int]], i: int) -> tuple[str, int, str] | None:
    """toks[i]'den başlayan en uzun yer adı (başındaki ب/و/ل/في… atılarak): (yer, uzunluk, metin)."""
    for n in range(min(gz.max_words, 4), 0, -1):
        words = [t for t, _ in toks[i:i + n]]
        if len(words) < n or any(w in _STOP for w in words):
            continue
        first = words[0]
        variants = [first]
        m = re.match(r"^(?:[وف]?ب|[وف]?ل|[وف])(?=\S{2,})", first)
        if m:
            variants.append(first[m.end():])
            if first[m.end():].startswith("ل") and not first[m.end():].startswith("ال"):
                variants.append("ا" + first[m.end():])  # "لبخارى" / "للري" → "الري"
        for v in variants:
            s = key(" ".join([v] + words[1:]))
            if s in gz.ignore:
                continue
            ids = gz.by_name.get(s)
            if ids:
                return ids[0], n, s
    return None


def extract(text: str, gz: Gazetteer) -> list[PlaceMention]:
    text = clean_text(text)
    toks = _tokens(text)
    out: list[PlaceMention] = []
    last_place: str | None = None
    last_pos = -10**6
    trig_at: dict[int, str] = {}
    for m in _TRIG.finditer(text):
        kind = next(k for k in KINDS if m.group(k))
        trig_at[m.start()] = kind
    pos2i = {p: i for i, (_, p) in enumerate(toks)}
    starts = sorted((pos2i[p], k) for p, k in trig_at.items() if p in pos2i)
    # ayrıca "بها/فيها" yalnız bir tetikleyicinin penceresindeyse sayılır
    for ti, kind in starts:
        j = ti + 1
        if kind == "origin" and toks[ti][0] == "ابن":
            continue
        end = min(len(toks), ti + WINDOW)
        while j < end:
            w = toks[j][0]
            if w in _STOP:
                break
            if w in _PRON and last_place and toks[j][1] - last_pos <= PRON_REACH:
                out.append(PlaceMention(last_place, kind, w, _snip(text, toks[ti][1]), toks[j][1]))
                break
            hit = _match_at(gz, toks, j)
            if hit:
                prev = toks[j - 1][0] if j - 1 > ti else ""
                prefixed = (hit[2] != key(toks[j][0]) or bool(_PREP.match(prev))
                            or j == ti + 1)
                if prefixed:
                    out.append(PlaceMention(hit[0], kind, hit[2], _snip(text, toks[ti][1]),
                                            toks[j][1]))
                    last_place, last_pos = hit[0], toks[j][1]
                    break
                j += hit[1]
                continue
            # yeni bir tetikleyiciye gelindiyse bu pencere biter
            if toks[j][1] in trig_at:
                break
            j += 1
        # tetikleyiciden bağımsız: pencere dışında anılan yer "son yer" olarak izlenir
    return out


def _snip(text: str, pos: int) -> str:
    return text[max(0, pos - 40): pos + 140]


def nisba_places(nisbas, gz: Gazetteer) -> list[tuple[str, str]]:
    out = []
    for nb in nisbas:
        pid = gz.by_nisba.get(key(nb))
        if pid:
            out.append((pid, nb))
    return out

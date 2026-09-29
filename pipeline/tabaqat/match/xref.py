"""Muhakkik dipnotlarındaki "ترجمته في ..." atıflarının ayrıştırılması ve çözülmesi.

Biçimler (kaynak kitaba göre değişir):
    الجواهر المضية، برقم ٤٩٤            → numara
    "الجواهر المضية" للقرشي (٤/ ٤١٦ - ٤١٧) → cilt/sayfa
    الجواهر المضية:٣٩٨،١/ ٣٩٩            → cilt 1, sayfa 398-399 (RTL dizilimi)
    تاج التراجم ٥٩ / (ص: ١٠٥)           → sayfa
    كتائب أعلام الأخيار، برقم ٥٩٣         → numara
Atıfta verilen yer yalnız aday üretir; eşleşme isim karşılaştırmasıyla doğrulanır.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .records import Rec

_D = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
N = r"[٠-٩\d]+"

TARGETS = {
    "jawahir": r"الجواهر\s*المضي[ةه]",
    "tabaqat_saniyya": r"الطبقات\s*السني[ةه]",
    "taj_tarajim": r"تاج\s*التراجم",
    "fawaid": r"الفوائد\s*البهي[ةه]",
    "kataib": r"كتائب\s*أعلام\s*الأخ[يب]ار",
}
# Adın ardından numara/sayfa bilgisine kadar izin verilen ara metin (müellif adı, tırnak, parantez)
_GAP = r"[\"”»]?\s*(?:ل[^\s(،:؛]+(?:\s+[^\s(،:؛]+)?)?\s*[،,:]?\s*(?:\([^)]*?\)\s*:?)??\s*\(?\s*"


@dataclass
class Ref:
    target: str
    number: int | None = None
    vol: int | None = None
    page: int | None = None
    text: str = ""


def _int(s: str) -> int:
    return int(s.translate(_D))


def parse_refs(text: str) -> list[Ref]:
    out = []
    for target, pat in TARGETS.items():
        for m in re.finditer(pat, text):
            tail = text[m.end(): m.end() + 60]
            g = re.match(_GAP, tail)
            rest = tail[g.end():] if g else tail
            rest = re.sub(r"^(ص\s*:?\s*|صفحة\s*)", "", rest)
            r = Ref(target, text=text[m.start(): m.end() + 40])
            num = re.match(rf"(?:برقم|الرقم\s*:?|رقم\s*:?|ترجمة\s*رقم)\s*({N})", rest)
            if num:
                r.number = _int(num.group(1))
                out.append(r)
                continue
            # "٣٩٨،١/ ٣٩٩" (RTL): cilt 1, sayfa 398
            vp = re.match(rf"(?:({N})\s*[،,]\s*)?({N})\s*/\s*({N})", rest)
            if vp:
                a, b = _int(vp.group(2)), _int(vp.group(3))
                if vp.group(1):
                    r.vol, r.page = a, min(b, _int(vp.group(1)))
                elif a <= 5 < b or (a <= 5 and b <= 5):
                    r.vol, r.page = a, b
                elif b <= 5 < a:
                    r.vol, r.page = b, a
                else:
                    continue
                out.append(r)
                continue
            pg = re.match(rf"({N})", rest)
            if pg:
                r.page = _int(pg.group(1))
                out.append(r)
    return out


class Resolver:
    def __init__(self, recs: list[Rec]):
        self.by_num: dict[tuple[str, int], list[Rec]] = {}
        self.by_book: dict[str, list[Rec]] = {}
        for r in recs:
            if r.number is not None and not r.series:
                self.by_num.setdefault((r.book_id, r.number), []).append(r)
            self.by_book.setdefault(r.book_id, []).append(r)

    def candidates(self, ref: Ref) -> list[Rec]:
        if ref.number is not None:
            c = list(self.by_num.get((ref.target, ref.number), []))
            if ref.target == "tabaqat_saniyya" or c:
                return c
        out = []
        if ref.page is not None:
            for r in self.by_book.get(ref.target, []):
                if ref.vol not in (None, r.vol):
                    continue
                if r.page_start - 1 <= ref.page <= r.page_end:
                    out.append(r)
        if ref.number is not None and not out and ref.target != "tabaqat_saniyya":
            pass
        return out

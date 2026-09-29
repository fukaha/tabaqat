"""Muhakkik fihristi (Word) ile madde numaralarını ve isimlerini düzeltme.

Fihrist satırı: "[٢٦]إبراهيم بن محمد بن سليمان ... [ت. ٩١٦هـ/١٥١١م]1/102"
→ madde no, harekeli tam isim, vefat notu, cilt/sayfa.

`apply_index` her fihrist maddesinin başlığını temiz sayfalarda, fihristteki sayfa ve
komşularında arar; en iyi eşleşen bloğa doğru numarayı yazar. OCR'ın okuyamadığı ya da
varak numarasıyla karıştırdığı numaralar böylece düzelir; hiçbir fihrist maddesine
denk gelmeyen numaralar silinir.
"""
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import asdict, dataclass
from difflib import SequenceMatcher
from pathlib import Path

from ..normalize.arabic import normalize

_AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
_LINE = re.compile(r"^\[(\d+)\]\s*(.*?)\s*(\d+)/(\d+)\s*$")
_DEATH = re.compile(r"\s*\[ت\.\s*([^\]]*)\]\s*$")
_LEAD_NUM = re.compile(r"^\[[٠-٩]+\]\s*")


@dataclass
class IndexEntry:
    number: int
    name: str        # fihristteki harekeli isim (vefat notu hariç)
    death: str       # "٩١٦هـ/١٥١١م", "بعد ٦٥٦هـ/١٢٥٨م", "؟"
    vol: int
    page: int

    @property
    def heading(self) -> str:
        d = f" [ت. {self.death}]" if self.death else ""
        return f"{self.name}{d}"


def read_docx_index(path: str | Path) -> list[IndexEntry]:
    xml = zipfile.ZipFile(path).read("word/document.xml").decode("utf-8")
    out = []
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        t = "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p)).strip()
        m = _LINE.match(t)
        if not m:
            continue  # başlık ve harf bölümleri
        body = m.group(2)
        d = _DEATH.search(body)
        death = d.group(1).strip().translate(_AR) if d else ""
        name = body[:d.start()].strip() if d else body
        out.append(IndexEntry(int(m.group(1)), name, death, int(m.group(3)), int(m.group(4))))
    return sorted(out, key=lambda e: e.number)


def save_index(entries: list[IndexEntry], path: str | Path) -> None:
    Path(path).write_text(json.dumps([asdict(e) for e in entries], ensure_ascii=False, indent=1),
                          encoding="utf-8")


def load_index(path: str | Path) -> list[IndexEntry]:
    return [IndexEntry(**d) for d in json.loads(Path(path).read_text(encoding="utf-8"))]


def _key(s: str, n: int = 45) -> str:
    return normalize(_LEAD_NUM.sub("", s).replace("## ", ""))[:n]


def _sim(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


@dataclass
class IndexReport:
    matched: int = 0
    renumbered: list = None      # (eski, yeni, sayfa)
    recovered: list = None       # OCR'da numarası olmayan, fihristle bulunan
    unnumbered: list = None      # fihristle eşleşmeyip numarası silinen bloklar
    not_found: list = None       # metinde başlığı bulunamayan fihrist maddeleri


def apply_index(pages, index: list[IndexEntry], vol: int, window: int = 1,
                min_ratio: float = 0.6) -> IndexReport:
    """Temiz sayfaların madde numaralarını fihriste göre düzeltir (yerinde)."""
    rep = IndexReport(0, [], [], [], [])
    by_page: dict[int, list[tuple]] = {}
    for p in pages:
        for i, b in enumerate(p.blocks):
            by_page.setdefault(p.page, []).append((p, i))
    # Bütün (fihrist maddesi, blok) adaylarını puanla; en yüksek puandan başlayarak ata,
    # böylece benzer isimli komşu maddeler birbirinin bloğunu kapmaz.
    cands = []
    for ie in (e for e in index if e.vol == vol):
        want = _key(ie.name)
        for pg in range(ie.page - window, ie.page + window + 1):
            for p, i in by_page.get(pg, []):
                r = _sim(want, _key(p.blocks[i], len(want))) + 0.05 * (pg == ie.page)
                if r >= min_ratio:
                    cands.append((r, ie.number, pg, p, i))
    cands.sort(key=lambda c: -c[0])
    taken: dict[tuple, int] = {}
    done: set[int] = set()
    for r, num, pg, p, i in cands:
        if num in done or (id(p), i) in taken:
            continue
        taken[(id(p), i)] = num
        done.add(num)
        old = re.match(r"^\[([٠-٩]+)\]", p.blocks[i])
        oldn = int(old.group(1).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))) if old else None
        if oldn is None:
            rep.recovered.append((num, p.page))
        elif oldn != num:
            rep.renumbered.append((oldn, num, p.page))
        else:
            rep.matched += 1
        p.blocks[i] = f"[{str(num).translate(_AR)}] {_LEAD_NUM.sub('', p.blocks[i])}"
    rep.not_found = sorted(e.number for e in index if e.vol == vol and e.number not in done)
    # Fihristle eşleşmeyen numaralı bloklar: numara yanlıştır (varak ya da OCR hatası)
    for p in pages:
        for i, b in enumerate(p.blocks):
            if (id(p), i) not in taken and _LEAD_NUM.match(b):
                rep.unnumbered.append((b[:40], p.page))
                p.blocks[i] = _LEAD_NUM.sub("", b)
    return rep

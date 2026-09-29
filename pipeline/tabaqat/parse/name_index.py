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


def read_ocr_index(root: str | Path, first_pdf: int, last_pdf: int) -> list[IndexEntry]:
    """OCR'lanmış fihrist sayfaları: tablo satırları "| ٧ | أبو معاذ | خالد بن سليمان |"
    ya da düz satır "٧٢ أبو الفرج رستم بن العباس". Ad = künye + isim. Sayfa bilgisi yoktur."""
    d2 = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
    out: dict[int, IndexEntry] = {}
    for pdf in range(first_pdf, last_pdf + 1):
        meta = json.loads((Path(root) / f"page-{pdf}" / "page-metadata.json").read_text(encoding="utf-8"))
        for b in meta["blocks"]:
            for line in b["content"].split("\n"):
                line = line.strip()
                if line.startswith("|"):
                    cells = [c.strip() for c in line.strip("|").split("|")]
                    if len(cells) >= 2 and re.fullmatch(r"[٠-٩]+", cells[0]):
                        n, name = int(cells[0].translate(d2)), " ".join(c for c in cells[1:] if c)
                    else:
                        continue
                else:
                    m = re.match(r"^([٠-٩]+)\s+(\S.*)$", line)
                    if not m or b["type"] not in ("text", "list"):
                        continue
                    n, name = int(m.group(1).translate(d2)), m.group(2).strip()
                out.setdefault(n, IndexEntry(n, name, "", 1, 0))
        # Sütun sütun okunmuş tablo: önce tek başına numaralar, sonra künyeler, sonra isimler.
        # Künye sütunu boş hücre içerdiğinden satırla eşlenemez; isimler numaralarla sıralıdır.
        cells = [ln.strip() for b in meta["blocks"] if b["type"] == "text"
                 for ln in b["content"].split("\n") if ln.strip()]
        nums = [int(c.translate(d2)) for c in cells if re.fullmatch(r"[٠-٩]+", c)]
        names = [c for c in cells if not re.fullmatch(r"[٠-٩]+", c) and not _KUNYA.fullmatch(c)
                 and not re.match(r"^[٠-٩]+\s", c)]
        if len(nums) > 1 and len(names) == len(nums):
            for n, name in zip(nums, names):
                out.setdefault(n, IndexEntry(n, name, "", 1, 0))
    return [out[k] for k in sorted(out)]


_KUNYA = re.compile(r"(أبو|أبي|أم) \S+( \S+)?")


_TITLES = re.compile(r"^((الشيخ|الإمام|الامام|القاضي|الفقيه|الحافظ|السيد|العالم|الزاهد|الواعظ|"
                     r"الأديب|الاديب|الأمير|الامير|الحاكم|الخطيب|المحدث|الأجل|الاجل|الحجاج|الثقة)\s+)+")


def _name_key(s: str) -> str:
    s = normalize(re.sub(r"^[٠-٩]+\s*[-–]\s*\S+\s*:?\s*", "", s))
    s = s.replace("ابي ", "ابو ").replace("عبد ال", "عبدال")
    return _TITLES.sub("", s)[:40]


def align_by_name(heads: list[tuple[int, str]], index: list[IndexEntry],
                  min_ratio: float = 0.55) -> dict[int, IndexEntry]:
    """Metin maddelerini (no, başlık) sırayı koruyarak fihriste isimle hizalar.

    Fihrist numaralaması metinden kayabildiği için (Kand'da sonda +٦) numaraya değil
    isme bakılır; Needleman-Wunsch benzeri bir hizalama atlanan/fazla maddeleri yutar.
    """
    a = [_name_key(h) for _, h in heads]
    b = [_name_key(e.name) for e in index]
    n, m = len(a), len(b)
    gap = -0.35
    band = 40  # numara farkı sınırlı: yalnız köşegen çevresinde hesapla
    NEG = float("-inf")
    score = [[NEG] * (m + 1) for _ in range(n + 1)]
    move = [[0] * (m + 1) for _ in range(n + 1)]
    score[0][0] = 0.0
    for j in range(1, m + 1):
        score[0][j], move[0][j] = gap * j, 2
    for i in range(1, n + 1):
        score[i][0], move[i][0] = gap * i, 1
        lo, hi = max(1, i - band), min(m, i + band)
        for j in range(lo, hi + 1):
            best, mv = NEG, 0
            if score[i - 1][j - 1] > NEG:
                r = SequenceMatcher(None, a[i - 1], b[j - 1], autojunk=False).ratio()
                best, mv = score[i - 1][j - 1] + (r - min_ratio), 3
            if score[i - 1][j] + gap > best:
                best, mv = score[i - 1][j] + gap, 1
            if score[i][j - 1] + gap > best:
                best, mv = score[i][j - 1] + gap, 2
            score[i][j], move[i][j] = best, mv
    out: dict[int, IndexEntry] = {}
    i, j = n, m
    while i > 0 and j > 0:
        mv = move[i][j]
        if mv == 3:
            if SequenceMatcher(None, a[i - 1], b[j - 1], autojunk=False).ratio() >= min_ratio:
                out[heads[i - 1][0]] = index[j - 1]
            i, j = i - 1, j - 1
        elif mv == 1:
            i -= 1
        else:
            j -= 1
    return out

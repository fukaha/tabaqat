"""el-Gurefü'l-aliyye OCR temizleyici testleri.

Yardımcı kurallar kaynaksız çalışır; bütün cilt testleri OCR klasörü yoksa atlanır.
"""
import re
from pathlib import Path

import pytest

from tabaqat.cli import clean_ocr, load_book, parse_book
from tabaqat.parse.mistral_ocr import _GLUED_MARK, _SUP, _pick_entry

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("ghuraf_v1")
SRC = ROOT / CFG["source"]
needs_src = pytest.mark.skipif(not SRC.exists(), reason="OCR kaynağı yok")
D = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")


def test_pick_entry_prefers_plausible_number():
    assert _pick_entry([22, 4], 3) == 4           # "[٢٢] [٤] /": varak + madde
    assert _pick_entry([8], 6) == 8               # 7 düşmüş; 8 değiştirilmez
    assert _pick_entry([364], 263) == 264         # OCR ٢↔٣ hatası
    assert _pick_entry([35, 36], 25) == 26        # "[٣٥] [٣٦]": varak + yanlış okunmuş ٢٦
    assert _pick_entry([372], 290) is None        # varak numarası
    assert _pick_entry([159], 657, head_like=False) is None  # metin devamında varak


def test_footnote_marks_removed():
    s = "ناصر الدين٧ وشرحها،٨ الصفدي:١ بسم الله¹ $^{٣}$ سنة ٨١٦هـ/١٤١٣م"
    s = _GLUED_MARK.sub("", _SUP.sub("", s))
    assert s == "ناصر الدين وشرحها، الصفدي: بسم الله  سنة ٨١٦هـ/١٤١٣م"


@pytest.fixture(scope="module")
def pages():
    return clean_ocr(CFG)


@needs_src
def test_pages_and_numbers(pages):
    assert pages[0].page == 9 and pages[-1].page == 813 and len(pages) == 805


@needs_src
def test_no_footnotes_or_apparatus_left(pages):
    txt = "\n".join(p.text for p in pages)
    assert not re.search(r"[¹²³⁴⁵⁶⁷⁸⁹]", txt)
    assert not re.search(r"(^|\s)/(\s|$)", txt)                       # varak işareti
    assert not any(re.match(r"^[٠-٩]+\.?\s", b) for p in pages for b in p.blocks)  # dipnot satırı
    assert "انظر ترجمته في" not in txt


@needs_src
def test_entry_numbers_monotonic():
    entries = parse_book(CFG)
    nums = [e.number for e in entries]
    # Basılı baskıda sıra yer yer numarayı izlemez (٢٥١ sayfa ٤٨١'de, ٢٤٩-٢٥٠'den önce)
    assert len(set(nums)) == len(nums) and [e.page_start for e in entries] == sorted(e.page_start for e in entries)
    assert len(nums) == 495 and nums[-1] == 496  # ٢١٩'un başlığı OCR'da yok
    (e,) = [e for e in entries if e.number == 26]
    assert "إبراهيم بن محمد بن سليمان بن عَوْن" in e.heading_raw and e.page_start == 102


CFG2 = load_book("ghuraf_v2")


@pytest.mark.skipif(not (ROOT / CFG2["source"]).exists(), reason="OCR kaynağı yok")
def test_volume2_continues_numbering():
    entries = parse_book(CFG2)
    nums = [e.number for e in entries]
    assert nums[0] == 497 and nums[-1] == 942
    assert nums == list(range(497, 943))  # fihristle hepsi
    # Hâtime (ص ٦٣١-) maddeye eklenmez; son madde yalnız başlıktan ibarettir
    assert entries[-1].page_end == 630


INDEX = ROOT / "data/index/ghuraf.json"


@pytest.mark.skipif(not INDEX.exists(), reason="fihrist yok")
def test_index_complete():
    from tabaqat.parse.name_index import load_index
    idx = load_index(INDEX)
    assert [e.number for e in idx] == list(range(1, 943))
    assert sum(e.vol == 1 for e in idx) == 496 and sum(e.vol == 2 for e in idx) == 446
    e = idx[25]
    assert e.number == 26 and e.page == 102 and e.death == "٩١٦هـ/١٥١١م"
    assert e.name.startswith("إبراهيم بن محمد بن سليمان بن عَوْن")


@needs_src
def test_entries_follow_index_pages_and_names():
    from tabaqat.parse.name_index import load_index
    idx = {e.number: e for e in load_index(INDEX)}
    for cfg in (CFG, CFG2):
        for e in parse_book(cfg):
            assert e.page_start == idx[e.number].page
            assert e.name == idx[e.number].name

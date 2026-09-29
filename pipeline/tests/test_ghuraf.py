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
    assert nums == sorted(nums) and len(set(nums)) == len(nums)
    assert len(nums) >= 485 and nums[-1] == 496
    (e,) = [e for e in entries if e.number == 26]
    assert "إبراهيم بن محمد بن سليمان بن عَوْن" in e.heading_raw and e.page_start == 102

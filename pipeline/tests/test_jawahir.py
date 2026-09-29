"""el-Cevâhirü'l-mudiyye parser testleri (epub yoksa atlanır)."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.cli import load_book, parse_book

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("jawahir")
EPUB = ROOT / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse_book(CFG)


def test_numbers_complete(entries):
    nums = Counter(e.number for e in entries if e.number)
    assert set(nums) == set(range(1, 2116))
    # Basılı nüshada tekrarlanan numaralar ("(م)" = mükerrer)
    assert {n for n, c in nums.items() if c > 1} == {1973, 2025, 2041}


def test_abu_hanifa(entries):
    e = entries[0]
    assert e.number is None and "النعمان" in e.heading_raw
    assert (e.vol, e.page_start, e.page_end) == (1, 49, 63)
    assert "### فصل فى ذكر مولده ووفاته" in e.text


def test_inline_heading_split(entries):
    (e,) = [e for e in entries if e.number == 2106]
    assert "النجم الملطى" in e.heading_raw and e.text.startswith("صاحبنا")
    (prev,) = [e for e in entries if e.number == 2105]
    assert "٢١٠٦" not in prev.text


def test_indexes_volume_excluded(entries):
    assert all(e.vol in (1, 2, 3, 4) for e in entries)
    assert sum(1 for e in entries if e.references) > 1600

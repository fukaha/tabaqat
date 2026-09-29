"""el-Esmârü'l-ceniyye parser testleri (epub yoksa atlanır)."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.cli import load_book, parse_book

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("athmar")
EPUB = ROOT / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse_book(CFG)


def test_two_numbered_series(entries):
    main = Counter(e.number for e in entries if e.number and not e.series)
    yaman = Counter(e.number for e in entries if e.number and e.series == "yaman")
    assert set(main) == set(range(1, 731)) and max(main.values()) == 1
    assert set(yaman) == set(range(1, 15))


def test_preamble_abu_hanifa(entries):
    e = entries[0]
    assert e.heading_raw == "أبو حنيفة النعمان بن ثابت"
    assert (e.vol, e.page_start) == (1, 127)
    assert "### [مشايخ الإمام]." in e.text


def test_companion_chapters_are_entries(entries):
    heads = [e.heading_raw for e in entries if e.section == "تلامذته"]
    assert len(heads) == 10 and any("أبي يوسف" in h for h in heads)


def test_kunya_nisba_women_entries(entries):
    c = Counter(e.section for e in entries if e.number is None)
    assert c["كتاب الكنى"] == 56 and c["كتاب الأنساب"] == 137 and c["«كتاب النساء»"] == 5


def test_heading_only_entries_not_merged(entries):
    (e,) = [e for e in entries if e.number == 15 and not e.series]
    assert "مشايخ قاضي خان" in e.heading_raw and e.group is None


def test_stops_before_khatima_and_indexes(entries):
    assert max(e.page_end for e in entries) < 805

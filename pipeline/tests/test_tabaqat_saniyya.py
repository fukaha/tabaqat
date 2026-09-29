"""et-Tabakâtü's-seniyye parser testleri (epub yoksa atlanır)."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.cli import load_book
from tabaqat.parse.turath_epub import parse

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("tabaqat_saniyya")
EPUB = ROOT / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse(str(EPUB), CFG["book_id"], CFG["start_after_heading"],
                 CFG["unnumbered_entry"], CFG["section_heading"])


def one(entries, n):
    (e,) = [e for e in entries if e.number == n]
    return e


def test_all_numbers_once(entries):
    nums = Counter(e.number for e in entries if e.number)
    assert set(nums) == set(range(1, 1389)) and max(nums.values()) == 1


def test_abu_hanifa_unnumbered_entry(entries):
    e = entries[0]
    assert e.number is None and "الإمام الأعظم" in e.heading_raw
    assert (e.vol, e.page_start, e.page_end) == (1, 73, 169)
    assert "### فصل فى ذكر مولده" in e.text  # alt başlıklar madde içinde kalır


def test_paragraph_heading_uses_page_title(entries):
    e = one(entries, 187)  # "چلبى": başlık <p> olarak gelmiş
    assert e.heading_raw.startswith("١٨٧ - أحمد بن حمزة")
    assert any("الشقائق النعمانية" in r for r in e.references)


def test_volume_catchword_not_duplicated(entries):
    assert (one(entries, 276).vol, one(entries, 276).page_start) == (1, 421)
    assert (one(entries, 277).vol, one(entries, 277).page_start) == (2, 7)


def test_separator_splits_entries(entries):
    a, b = one(entries, 1340), one(entries, 1341)
    assert a.text == "" and b.text.startswith("من درب حديد") and a.group is None
    assert any("كتائب أعلام الأخيار، برقم ٢٩١" in r for r in a.references)


def test_star_notes_are_references(entries):
    assert sum(1 for e in entries if e.references) > 1300
    assert not any("(^" in e.text or "(^" in e.heading_raw for e in entries)

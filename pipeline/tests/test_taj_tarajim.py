"""Tâcü't-terâcim parser testleri (epub yoksa atlanır)."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.cli import load_book
from tabaqat.parse.turath_epub import parse

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("taj_tarajim")
EPUB = ROOT / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse(str(EPUB), CFG["book_id"], CFG["start_after_heading"])


def test_all_numbers_once(entries):
    nums = Counter(e.number for e in entries)
    assert set(nums) == set(range(1, 355)) and max(nums.values()) == 1


def test_single_volume_pages(entries):
    assert all(e.vol == 1 and 86 <= e.page_start <= e.page_end <= 367 for e in entries)


def test_tahawi(entries):
    (e,) = [e for e in entries if e.number == 21]
    assert "الطحاوي" in e.heading_raw


def test_entities_unescaped(entries):
    assert not any("&quot;" in e.text for e in entries)

"""el-Fevâidü'l-behiyye parser testleri (epub yoksa atlanır)."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.cli import load_book, parse_book

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("fawaid")
EPUB = ROOT / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse_book(CFG)


def test_every_heading_between_letters_is_an_entry(entries):
    # حرف الألف .. الخاتمة arası 495 başlık = 21 harf bölümü + 474 madde
    assert len(entries) == 474
    assert len({e.section for e in entries}) == 21
    assert not any("حرف" in e.heading_raw[:6] for e in entries)


def test_unnumbered_single_volume(entries):
    assert all(e.number is None and e.vol == 1 and 7 <= e.page_start <= 233 for e in entries)
    assert len({e.seq for e in entries}) == len(entries)


def test_first_and_abu_yusuf(entries):
    assert entries[0].heading_raw.startswith("(إبراهيم بن إسماعيل)")
    assert entries[0].section == "(حرف الألف)"
    assert any(e.heading_raw.startswith("[يعقوب بن إبراهيم] بن حبيب أبو يوسف") for e in entries)

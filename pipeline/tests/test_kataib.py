"""Ketâib parser'ı için gerçek epub üzerinde bütünlük testleri (epub yoksa atlanır)."""
from pathlib import Path

import pytest

from tabaqat.cli import load_book, parse_book

CFG = load_book("kataib")
EPUB = Path(__file__).resolve().parents[2] / CFG["source"]
pytestmark = pytest.mark.skipif(not EPUB.exists(), reason="kaynak epub yok")


@pytest.fixture(scope="module")
def entries():
    return parse_book(CFG)


def by_number(entries, n):
    return [e for e in entries if e.number == n]


def test_numbers_contiguous(entries):
    nums = [e.number for e in entries]
    assert nums[0] == 1
    assert set(range(1, max(nums) + 1)) == set(nums)  # "و[٥٠٣ - ...]" dahil hiçbiri düşmemeli


def test_volume_pages_present(entries):
    assert all(e.vol in (1, 2, 3, 4) and e.page_start for e in entries)


def test_abu_khazim_entry(entries):
    (e,) = by_number(entries, 174)
    assert "أبو خازم" in e.heading_raw
    assert (e.vol, e.page_start) == (2, 5)
    assert e.page_end == 7
    assert any("الجواهر المضية" in r for r in e.references)  # çapraz atıf ayrı tutulur
    assert "عبد الحميد بن عبد العزيز" in e.text


def test_prefixed_heading_and_shared_text(entries):
    (a,) = by_number(entries, 502)
    (b,) = by_number(entries, 503)
    assert a.text == b.text and a.group == b.group is not None


def test_group_of_co_entries(entries):
    grp = {e.group for e in entries if e.number in (361, 362, 363, 364, 365)}
    assert len(grp) == 1 and None not in grp


def test_duplicate_number_in_print_kept(entries):
    # Basılı nüshada ٧٣٢ iki farklı kişiye verilmiş; ikisi de korunur, seq benzersizdir.
    assert len(by_number(entries, 732)) == 2
    assert len({e.seq for e in entries}) == len(entries) == 810

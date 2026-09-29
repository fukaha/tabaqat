"""el-Kand fî zikri ulemâi Semerkand (Mistral OCR) testleri; kaynak yoksa atlanır."""
import re
from pathlib import Path

import pytest

from tabaqat.cli import clean_ocr, load_book, parse_book
from tabaqat.parse.name_index import IndexEntry, align_by_name

ROOT = Path(__file__).resolve().parents[2]
CFG = load_book("qand")
needs_src = pytest.mark.skipif(not (ROOT / CFG["source"]).exists(), reason="OCR kaynağı yok")


def test_align_by_name_absorbs_numbering_shift():
    heads = [(1, "١ - ترجمة: أبي معاذ خالد بن سليمان"), (2, "٢ - ترجمة: الشيخ أبي حامد خلف بن الفرج"),
             (3, "٣ - ترجمة: أبي محمد عبدالله بن علي بن حمد")]
    index = [IndexEntry(1, "أبو معاذ خالد بن سليمان", "", 1, 0),
             IndexEntry(2, "أبو حامد خلف بن الفرج", "", 1, 0),
             IndexEntry(3, "أبو محمد عبدالله بن علي الجويقي", "", 1, 0),  # metinde yok
             IndexEntry(4, "أبو محمد عبدالله بن علي بن حمد", "", 1, 0)]
    m = align_by_name(heads, index)
    assert m[1].number == 1 and m[2].number == 2 and m[3].number == 4


@pytest.fixture(scope="module")
def entries():
    return parse_book(CFG)


@needs_src
def test_entries_complete(entries):
    assert [e.number for e in entries] == list(range(1, 1011))
    assert entries[0].page_start == 21 and entries[-1].page_end == 552
    assert sum(bool(e.name) for e in entries) == len(entries)


@needs_src
def test_names_from_index(entries):
    e = entries[0]
    assert e.name == "أبو معاذ خالد بن سليمان البلخي"   # başlıkta "خالد" eksik
    assert entries[-1].name == "أبو علي كرسم بن محمد بن نمرون"  # fihristte ١٠١٦


@needs_src
def test_clean_text():
    txt = "\n".join(p.text for p in clean_ocr(CFG))
    assert not re.search(r"\([٠-٩]{1,2}\)", txt)          # dipnot işaretleri
    assert not re.search(r"\[[٠-٩]+\s*/\s*\S\]", txt)     # varak işaretleri
    assert "فهرس التراجم" not in txt

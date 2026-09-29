"""Şahıs birleştirme: ad/vefat çıkarımı birim testleri ve üretilmiş şahıs listesinin tutarlılığı."""
from collections import Counter
from pathlib import Path

import pytest

from tabaqat.extract.names import death_year, heading_name, parse_name, words_to_year
from tabaqat.match.canon import fix_ya, hijri_to_greg_year, tidy
from tabaqat.match.persons import build
from tabaqat.match.xref import parse_refs

ROOT = Path(__file__).resolve().parents[2]


def test_words_to_year():
    assert words_to_year("خمس وتسعين وخمسمايه".split()) == 595
    assert words_to_year("تسع وستين وثلاث ميه،".split()) == 369
    assert words_to_year("اثنتي عشره ومايتين".split()) == 212
    # Fevâid imlası/dizgisi: "ثلثمائة", "خمسائة", "تسعين وثلاثة" (= ثلاثمائة)
    assert death_year("مات سنة إحدى وعشرين وثلثمائة") == 321
    assert death_year("مات بمرو سنة ثلاث وأربعين وخمسائة") == 543
    assert death_year("مات سنة تسعين وثلاثة") == 390
    assert death_year("مات سنة ست عشرة وست مائة") == 616
    assert words_to_year("ثمان وتسعين وسبعمايه».".split()) == 798
    assert death_year("وتوفي سنة ٥٩٥ هـ") == 595
    assert death_year("ثم توفي والده سنة خمسين، ومات هو سنة ستين ومائة") == 160


def test_parse_name():
    p = parse_name(heading_name("٦ - إبراهيم بن أحمد بن أبى الفرج ابن أبى عبد الله بن الشريد "
                                "الدمشقى، أبو إسحاق، المنعوت زين الدين"))
    assert p.chain == ["ابراهيم", "احمد", "ابو الفرج", "ابو عبد الله", "الشريد"]
    assert p.kunya == "ابو اسحاق" and "الدمشقي" in p.nisbas and "زين الدين" in p.laqabs
    p = parse_name(heading_name("[٥٥٦ - قوام الدين الأتقاني]"))
    assert p.chain == [] and p.nisbas == {"الاتقاني"} and p.laqabs == {"قوام الدين"}
    p = parse_name(heading_name("أبو عبد الله البصري"))
    assert p.chain == [] and p.kunya == "ابو عبد الله"


def test_canon():
    assert fix_ya("أبى بكر البخارى بن موسى بن على") == "أبي بكر البخاري بن موسى بن علي"
    assert tidy("محمد بن أحمد ابن محمد ٤١ و بن على البخارى", True) == "محمد بن أحمد بن محمد بن علي البخاري"
    assert hijri_to_greg_year(816) == 1413 and hijri_to_greg_year(774) == 1372


def test_parse_refs():
    (r,) = parse_refs("ترجمته فى: الجواهر المضية، برقم ٤٩٤.")
    assert (r.target, r.number) == ("jawahir", 494)
    r = parse_refs('و"الجواهر المضية" للقرشي (٤/ ٤١٦ - ٤١٧)')[0]
    assert (r.vol, r.page) == (4, 416)
    r = parse_refs("القرشي، الجواهر المضية:٣٩٨،١/ ٣٩٩؛ التميمي")[0]
    assert (r.vol, r.page) == (1, 398)


@pytest.fixture(scope="module")
def res():
    return build(ROOT)


def by_key(res, key):
    return next(p for p in res.persons if p["id"] == res.cid[key])


def test_every_entry_once(res):
    keys = [s["key"] for p in res.persons for s in p["sources"]]
    assert len(keys) == len(set(keys)) == len(res.recs)


def test_no_two_primary_entries_of_a_book(res):
    for p in res.persons:
        prim = Counter(res.recs[s["key"]].book for s in p["sources"] if not res.recs[s["key"]].secondary)
        assert max(prim.values(), default=0) <= 1 or p["id"] in {res.cid[a] for a, _ in res.same}, p["id"]


def test_abu_hanifa_single_person(res):
    p = by_key(res, "athmar:1")
    books = {s["book"] for s in p["sources"]}
    assert {"jawahir", "tabaqat_saniyya", "athmar", "kataib"} <= books
    assert p["heading"].startswith("النعمان بن ثابت") and "١٥٠هـ" in p["heading"]


def test_tahawi(res):
    p = by_key(res, "jawahir:205")  # الجواهر رقم ٢٠٤ (seq 205)
    assert "الطحاوي" in p["name"]
    assert {"tabaqat_saniyya", "taj_tarajim", "athmar", "kataib"} <= {s["book"] for s in p["sources"]}


def test_ghuraf_names_from_index(res):
    p = next(p for p in res.persons if p["id"] == "gh479")
    assert p["name"].startswith("عمر بن محمد بن أحمد بن إسماعيل") and "٥٣٧هـ" in p["death"]
    # İbnü'l-Adîm (عمر بن أحمد بن هبة الله، ت. ٦٦٠) ile karışmamalı
    assert all("هبة الله" not in s["heading"] for s in p["sources"])


def test_repeated_chain_and_page_xref(res):
    # Esmâr'ın "الجواهر ٣/ ٣٤٨-٣٤٩" atfı o sayfada başlayan Hutenî maddesine gider
    assert res.cid["athmar:593"] == res.cid["jawahir:1522"]
    # "محمد بن محمد بن محمد" + البخاري tek başına aynı kişi saymaya yetmez
    assert res.cid["ghuraf_v2:208"] != res.cid["jawahir:1523"]
    # Fevâid'de başlık etiketi almamış Cessâs maddesi Cessâs'a, Verrâk Verrâk'a
    assert res.cid["fawaid:39"] == res.cid["jawahir:156"]
    assert res.cid["fawaid:38"] == res.cid["jawahir:155"]


def test_birth_year():
    from tabaqat.extract.names import birth_year
    assert birth_year("مولده ببلخ، في سادس جمادى الآخرة، سنة ست وثلاثين وخمسمائة. سمع وحدّث", 616) == 536
    assert birth_year("وُلد سنة ثمانٍ عشرة ومائة. ومات سنة ست ومائتين", 206) == 118
    assert birth_year("وولد له سنة خمسين وأربعمائة ابنه محمد", 500) is None     # başkasının doğumu
    assert birth_year("مولده سنة عشر وسبعمائة", 650) is None                    # vefattan sonra: atılır
    assert birth_year("وتوفي سنة ثلاث وثمانين ومائة، عن ثمانين سنة", 183) == 103  # yaştan

import json
from pathlib import Path

import pytest

from tabaqat.geo.extract import extract
from tabaqat.geo.gazetteer import Gazetteer

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def gz():
    return Gazetteer(ROOT)


def test_kinds_and_pronoun(gz):
    t = ("ولد ببخارى سنة ثلاث وتسعين، وقدم بغداد وحدث بها، ثم رحل إلى مكة فجاور بها، "
         "وتوفي في رجب سنة خمس وعشرين وخمسمائة بسمرقند، ودفن بجاكرديزه.")
    got = [(m.kind, gz.places[m.place].name) for m in extract(t, gz)]
    assert got == [("birth", "بخارى"), ("travel", "بغداد"), ("activity", "بغداد"),
                   ("travel", "مكة"), ("residence", "مكة"), ("death", "سمرقند"),
                   ("burial", "سمرقند")]


def test_common_words_are_not_places(gz):
    assert not extract("روي عنه ابنه، وقدم عليه جده سنه ثمانين", gz)


def test_nisba(gz):
    assert gz.by_nisba["البخاري"].startswith("BUKHARA")
    assert gz.by_nisba["الرازي"].startswith("RAYY")
    assert gz.by_nisba["المرغيناني"].startswith("MARGHINAN")


def test_shaybani_places():
    path = ROOT / "data" / "person_places.json"
    if not path.exists():
        pytest.skip("coğrafya üretilmemiş")
    pp = json.loads(path.read_text(encoding="utf-8"))
    kinds = {(x["kind"], x["place"]) for x in pp["jw1270"]}
    assert ("birth", "WASIT_463E321N_S") in kinds
    assert ("death", "RAYY_515E356N_S") in kinds


def test_short_names():
    from tabaqat.export import short_name
    assert short_name("الحسن بن منصور بن أبي القاسم الأوزجندي، الفرغاني الإمام الكبير، المعروف بقاضي خان") == "قاضي خان"
    assert short_name("عبيد الله بن الحسين بن دلال بن دلهم أبو الحسن، الكرخي") == "أبو الحسن الكرخي"
    assert short_name("عبد العزيز بن أحمد بن نصر بن صالح الحلواني، الملقب شمس الأئمة") == "شمس الأئمة الحلواني"
    assert short_name("الحسين بن علي بن حجاج بن علي الإمام، الملقب حسام الدين الصغناقي") == "حسام الدين الصغناقي"
    assert short_name("خطيب زاده") == "خطيب زاده"


def test_roads_shortest_path():
    from tabaqat.geo.roads import Roads
    net = Roads([["A", "B", 1000, [[0, 0], [0.01, 0]]], ["B", "C", 1000, [[0.01, 0], [0.02, 0]]],
                 ["A", "C", 5000, [[0, 0], [0.01, 0.02], [0.02, 0]]]])
    sids, d = net.route("A", "C")
    assert sids == [1, 2] and d == 2.0
    assert net.route("C", "A")[0] == [-2, -1]          # ters yön işaretli
    assert net.snap("X", 0.011, 0.0) == "B"             # ağda olmayan yer en yakın menzile
    assert net.snap("Y", 5, 5) is None                  # çok uzaksa bağlanmaz

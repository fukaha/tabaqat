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
    assert got == [("birth", "بخارة"), ("travel", "بغداد"), ("activity", "بغداد"),
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

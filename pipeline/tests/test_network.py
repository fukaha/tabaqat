"""Hoca–talebe ağı: çıkarım ve çözümleme testleri."""
import json
from pathlib import Path

import pytest

from tabaqat.network.extract import extract

ROOT = Path(__file__).resolve().parents[2]


def roles(text, book=""):
    return [(m.role, m.text, m.kin) for m in extract(text, book)]


def test_teacher_and_student_lists():
    r = roles("تفقّه على أبى بكر الأعمش، وأبى جعفر الهندوانىّ. وتفقّه عليه ابنه أحمد، وأبو نصر.")
    assert ("teacher", "ابي بكر الاعمش", "") in r and ("teacher", "ابي جعفر الهندواني", "") in r
    assert ("student", "احمد", "son") in r


def test_madhhab_is_not_a_teacher():
    assert roles("وتفقه على مذهب أبي حنيفة، وبرع فيه.") == []


def test_list_stops_at_clause():
    r = roles("قرأ على علماء عصره وبلغ رتبة الفضل والكمال")
    assert r == []


def test_fawaid_chain():
    ms = extract("أخذ عن قوام الدين الكاكي عن حسام الدين السغناقي عن حافظ الدين البخاري", "fawaid")
    assert [(m.role, m.text, m.student_text) for m in ms] == [
        ("teacher", "قوام الدين الكاكي", None),
        ("chain", "حسام الدين السغناقي", "قوام الدين الكاكي"),
        ("chain", "حافظ الدين البخاري", "حسام الدين السغناقي")]


def test_chain_after_anhu():
    # "تفقه على A، وأخذ العلوم عنه عن B": B, A'nın hocası; B öznenin talebesi değil
    ms = extract("تفقه على شمس الأئمة الكردري، وأخذ العلوم عنه عن فخر الدين قاضي خان، عن ظهير الدين")
    assert [(m.role, m.student_text) for m in ms][:2] == [("teacher", None),
                                                          ("chain", "شمس الايمه الكردري")]


@pytest.fixture(scope="module")
def rel():
    path = ROOT / "data" / "relations.json"
    if not path.exists():
        pytest.skip("ağ üretilmemiş")
    data = json.loads(path.read_text(encoding="utf-8"))
    persons = {s["key"]: p["id"] for p in json.loads((ROOT / "data" / "persons.json").read_text(
        encoding="utf-8")) for s in p["sources"]}
    return {(e["teacher"], e["student"]) for e in data}, persons


@pytest.mark.parametrize("teacher,student", [
    ("jawahir:1", "jawahir:1826"),          # Ebû Hanîfe → Ebû Yûsuf
    ("jawahir:1", "jawahir:1271"),          # Ebû Hanîfe → İmam Muhammed
    ("jawahir:822", "kataib:313"),          # Halvânî → Bekir ez-Zerencerî
    ("jawahir:1462", "jawahir:719"),        # Kemmârî → Abdullah el-Hayzâhazî
    ("jawahir:719", "jawahir:121"),         # "أخذ عن والده": baba → oğul
])
def test_known_edges(rel, teacher, student):
    edges, cid = rel
    assert (cid[teacher], cid[student]) in edges

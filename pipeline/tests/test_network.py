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
    ("jawahir:1271", "jawahir:626"),        # "من أصحاب محمد" (Süleymân b. Şuayb, v. 278)
    ("jawahir:1271", "jawahir:1776"),       # "تفقه على أبي يوسف ومحمد" (Hişâm er-Râzî, vefatı yok)
])
def test_known_edges(rel, teacher, student):
    edges, cid = rel
    assert (cid[teacher], cid[student]) in edges


def test_bare_muhammad_needs_near_death(rel):
    edges, cid = rel
    sh = cid["jawahir:1271"]
    assert (sh, cid["kataib:110"]) not in edges       # Züfer (v. 158) İmam Muhammed'in talebesi değil
    assert (sh, cid["qand:192"]) not in edges         # "ابنه محمد": Şakîk'in oğlu


def test_external_scholars():
    path = ROOT / "data" / "relations_external.json"
    if not path.exists():
        pytest.skip("ağ üretilmemiş")
    ext = json.loads(path.read_text(encoding="utf-8"))
    # Ali b. el-Ca'd (v. 230) maddesindeki "روى عنه البخاري" İmam Buhârî'dir, Hanefî bir Buhârî değil
    assert any(x["key"] == "jawahir:956" and x["death"] == 256 for x in ext)


def test_clean_mention():
    from tabaqat.network.resolve import clean_mention
    assert clean_mention("بن المديني") == "ابن المديني"
    assert clean_mention("ابن حجر الكثير") == "ابن حجر"
    assert clean_mention("جعفر بن") == "جعفر"


def test_abu_hanifa_teachers(rel):
    edges, cid = rel
    ah = cid["jawahir:1"]
    assert (cid["jawahir:541"], ah) in edges        # Hammâd b. Ebî Süleymân → Ebû Hanîfe
    assert cid["jawahir:541"] == cid["kataib:90"]   # Cevâhir ve Ketâib'deki Hammâd tek şahıs
    assert (cid["jawahir:597"], ah) not in edges     # Züfer talebesidir, hocası değil


def test_pre_hanafi_hidden():
    from tabaqat.export import pre_hanafi
    persons = json.loads((ROOT / "data" / "persons.json").read_text(encoding="utf-8"))
    cid = {s["key"]: p["id"] for p in persons for s in p["sources"]}
    salaf = pre_hanafi(ROOT, persons)
    assert cid["kataib:79"] in salaf and cid["kataib:24"] in salaf   # en-Nehaî, Hz. Peygamber
    assert cid["jawahir:541"] in salaf                                # Hammâd
    assert cid["jawahir:1"] not in salaf and cid["kataib:98"] not in salaf   # Ebû Hanîfe, Mâlik

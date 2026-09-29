"""Türkçe (DİA usulü) ad aktarımı."""
from pathlib import Path

import pytest

from tabaqat.tr.names import Namer

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def namer():
    return Namer(ROOT)


@pytest.mark.parametrize("ar, full, short", [
    ("عبيد الله بن الحسين بن دلال بن دلهم أبو الحسن، الكرخي",
     "Ebü’l-Hasen Ubeydullah b. Hüseyin b. Dellâl el-Kerhî", "Ebü’l-Hasen el-Kerhî"),
    ("عبد العزيز بن أحمد بن نصر بن صالح الحلواني، الملقب شمس الأئمة",
     "Şemsüleimme Abdülazîz b. Ahmed b. Nasr el-Halvânî", "Şemsüleimme el-Halvânî"),
    ("محمد بن أحمد بن أبي سهل أبو بكر، السرخسي",
     "Ebû Bekr Muhammed b. Ahmed b. Ebî Sehl es-Serahsî", "Ebû Bekr es-Serahsî"),
    ("أبو أحمد عبدالكريم بن عبدالرحمن السمرقندي",
     "Ebû Ahmed Abdülkerîm b. Abdirrahmân es-Semerkandî", "Ebû Ahmed es-Semerkandî"),
    ("الحسين بن علي بن حجاج بن علي الإمام، الملقب حسام الدين الصغناقي",
     "Hüsâmeddin Hüseyin b. Alî b. Haccâc es-Sığnâkī", "Hüsâmeddin es-Sığnâkī"),
    ("البزدوي", "Pezdevî", "Pezdevî"),
])
def test_dia_names(namer, ar, full, short):
    assert namer.render(ar) == (full, short)


def test_known_as_and_override(namer):
    # "المعروف ب…" şöhreti kısa ad olur; elle düzeltme dosyası önceliklidir
    full, short = namer.render("الحسن بن منصور بن أبي القاسم الأوزجندي، الفرغاني، المعروف بقاضي خان، فخر الدين")
    assert short == "Kādîhan" and full.startswith("Fahreddin Hasan b. Mansûr")
    assert namer.render("النعمان بن ثابت", "jws1")[1] == "Ebû Hanîfe"

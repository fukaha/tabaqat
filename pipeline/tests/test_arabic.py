from tabaqat.normalize.arabic import normalize
from tabaqat.schema import Entry


def test_strips_diacritics_and_unifies_letters():
    assert normalize("أَبُو حَنِيفَةَ النُّعْمَانُ") == "ابو حنيفه النعمان"
    assert normalize("مُوسَى") == normalize("موسي")


def test_tatweel_and_spaces():
    assert normalize("محمـــد   بن  علي") == "محمد بن علي"


def test_source_ref():
    e = Entry("tabaqat_saniyya", 1, "h", "t", vol=2, page_start=10, page_end=12)
    assert e.source_ref == "tabaqat_saniyya:2:10-12"

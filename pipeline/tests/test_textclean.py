"""Yayın metni temizliği: dipnotlar, tarama boşlukları, bölünen paragraflar, şiir."""
from tabaqat.textclean import clean_text


def test_footnotes_and_notes_removed():
    t = "ودفن بمدينة أبيار [^1]، وأتى به.\n\n<hr>\n\nفى م: «شيخه» خطأ."
    assert clean_text(t) == "ودفن بمدينة أبيار، وأتى به."


def test_spaces_and_ocr_line_breaks():
    t = "وكان يعقد\nالأزرار ، ثم  ولي القضاء ( بدمشق ) ."
    assert clean_text(t) == "وكان يعقد الأزرار، ثم ولي القضاء (بدمشق)."


def test_page_split_paragraph_joined():
    t = "وتعاني النظم،\n\nفتولع أيضاً بالأزجال.\n\nودخل الشام."
    assert clean_text(t) == "وتعاني النظم، فتولع أيضاً بالأزجال.\n\nودخل الشام."


def test_verse_kept():
    v = "أَنَا ابْنُ جَلَا وَطَلَّاعُ الشَّنَايَا مَتَى أَضَعُ العِمَامَةَ تَعْرِفُونِي"
    t = f"قال:\n\n{v}\n\nفعاد ذلك منه."
    assert clean_text(t).split("\n\n") == ["قال:", v, "فعاد ذلك منه."]

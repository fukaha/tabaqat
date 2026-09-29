"""Arapça arama/eşleştirme normalizasyonu."""
import re

_HARAKAT = re.compile(r"[ؐ-ًؚ-ٰٟۖ-ۭ]")
_TATWEEL = "ـ"
_TRANS = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي", "ئ": "ي", "ؤ": "و",
    "ة": "ه",
    "ک": "ك", "ی": "ي",
})


def normalize(text: str) -> str:
    """Harekeleri, tatweel'i at; elif/ya/he varyantlarını birleştir; boşlukları sadeleştir."""
    text = _HARAKAT.sub("", text).replace(_TATWEEL, "")
    text = text.translate(_TRANS)
    return re.sub(r"\s+", " ", text).strip()

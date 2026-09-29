"""Şahsın esas adı: el-Gurefü'l-aliyye fihristinin yazım tarzı.

    إبراهيم بن أحمد بن إسماعيل، الجعفري، الدمشقي، الحنفي، الشيخ برهان الدين [ت. ٧٧٤هـ/١٣٧٢م]

- Nesep zinciri "بن" ile (satır başı/ara "ابن" → "بن"), ardından virgülle nisbe/lakap/künye.
- Mısır baskılarındaki kelime sonu noktasız "ى" (البخارى، أبى، على) → "ي"; gerçek elif-i maksûre
  (موسى، عيسى، يحيى، مصطفى ...) korunur.
- Vefat: "[ت. <hicrî>هـ/<mîlâdî>م]". Yalnız yıl bilindiğinde mîlâdî yıl, hicrî yılın başladığı
  yıldır (Guref fihristi tam tarihten çevirir; yıl bazen bir sonrakidir). Guref şahıslarında
  fihristin notu aynen kullanılır.
"""
from __future__ import annotations

import re

_AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
_MAQSURA = {
    "موسى", "عيسى", "يحيى", "مصطفى", "مرتضى", "مجتبى", "المصطفى", "المرتضى", "الهدى", "ضحى", "مرعى",
    "يعلى", "الأعلى", "المثنى", "مولى", "المولى", "الدنيا", "حتى", "على",  # "على" aşağıda ayrıca
    "ليلى", "سلمى", "بشرى", "نعمى", "حبى", "العظمى", "الكبرى", "الصغرى", "الوسطى", "القصوى",
    "المستعلى", "مرضى", "المرتجى", "عقبى", "رضى", "الرضى", "هدى", "تقى", "يرى", "لدى", "إلى",
    "متى", "أبقى", "أولى", "الأولى", "سوى", "كسرى", "بخارى", "قرى", "القرى", "الورى", "النصارى",
    "طوبى", "زكى", "زوطى",
}


def fix_ya(s: str) -> str:
    """Kelime sonundaki noktasız "ى"yi, gerçek elif-i maksûre değilse "ي" yapar."""
    def one(m: re.Match) -> str:
        w = m.group(0)
        bare = re.sub(r"[ً-ْ]", "", w)
        if bare == "على":  # isim konumunda (بن على / على بن) "علي"; edat nadirdir
            return w[:-1] + "ي"
        if bare in _MAQSURA or bare.lstrip("و") in _MAQSURA:
            return w
        return w[:-1] + "ي"
    return re.sub(r"[ء-يً-ْ]*ى(?=[ً-ْ]*(?:[^ء-يً-ْ]|$))",
                  one, s)


def fix_ibn(s: str) -> str:
    """Zincir içindeki "ابن"i "بن" yapar ("المعروف بابن" ve baştaki "ابن" kalır)."""
    return re.sub(r"(?<=[ء-يً-ْ]) ابن (?!(?:ال|أبي |أبى ))(?=\S)",
                  lambda m: " بن ", s) if s else s


def hijri_to_greg_year(h: int) -> int:
    """Tablo takvimiyle hicrî yıl başının mîlâdî (1582 öncesi Jülyen) yılı."""
    jd = 1948439.5 + 354 * (h - 1) + (3 + 11 * h) // 30 + 15
    z = int(jd + 0.5)
    if z >= 2299161:  # Gregoryen
        a = int((z - 1867216.25) / 36524.25)
        z = z + 1 + a - a // 4
    b = z + 1524
    c = int((b - 122.1) / 365.25)
    d = int(365.25 * c)
    e = int((b - d) / 30.6001)
    month = e - 1 if e < 14 else e - 13
    return c - 4716 if month > 2 else c - 4715


def death_note(h: int) -> str:
    return f"{str(h).translate(_AR)}هـ/{str(hijri_to_greg_year(h)).translate(_AR)}م"


def tidy(name: str, dotless_ya: bool) -> str:
    name = re.sub(r"(?<=\s)[٠-٩]+\s*[وظ](?=\s)", "", name)  # yazma nüsha varak işareti "٤١ و"
    name = re.sub(r"^\s*/\s*", "", name)
    name = re.sub(r"\s+", " ", name).strip(" .،:-")
    name = re.sub(r"\s*،\s*", "، ", name)
    if dotless_ya:  # muhakkik fihristi dışındaki adlar: harekesiz (şedde dahil)
        name = re.sub(r"[\u064b-\u0652]", "", name)
        name = fix_ya(name)
    return fix_ibn(name)


def heading(name: str, death: str) -> str:
    return f"{name} [ت. {death}]" if death else name

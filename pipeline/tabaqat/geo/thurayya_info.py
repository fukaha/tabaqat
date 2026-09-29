"""Yer bilgi kartları için el-Süreyyâ (al-Thurayya, CC BY 4.0) verisinden kısa tanıtım.

Kaynak: https://github.com/althurayya/althurayya.github.io deposunun yerel bir kopyası.
    master/places_full.geojson  yer künyesi (transliterasyon, bölge, tür, konum kesinliği) ve
                                Himyerî'nin er-Ravzü’l-mi‘târ maddesine bağlantı
    texts/JK_000129_*.json      Yâkût, Mu‘cemü’l-büldân maddeleri
    texts/JK_000952_*.json      Sem‘ânî, el-Ensâb maddeleri
    sources/*.json              Himyerî, er-Ravzü’l-mi‘târ maddeleri

Her yer için künye bilgileri ve bir kaynaktan kısa bir alıntı seçilir: önce Yâkût (başlığı yerin
adıyla aynı olan madde), yoksa Himyerî, yoksa Sem‘ânî'nin nisbe maddesi.

    python -m tabaqat.geo.thurayya_info /yol/althurayya.github.io
    → data/gazetteer/thurayya_info.json
"""
from __future__ import annotations

import glob
import html
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from ..normalize.arabic import normalize

MAX = 240   # alıntı uzunluğu (harf)

REGION = {   # el-Süreyyâ bölge kodu → (Arapça, Türkçe)
    "Transoxiana": ("ما وراء النهر", "Mâverâünnehir"), "Khurasan": ("خراسان", "Horasan"),
    "Iraq": ("العراق", "Irak"), "Sham": ("الشام", "Şam"), "Egypt": ("مصر", "Mısır"),
    "Jazirat al-Arab": ("جزيرة العرب", "Arap Yarımadası"), "Maghrib": ("المغرب", "Mağrib"),
    "Aqur": ("أقور (الجزيرة)", "Cezîre"), "Yemen": ("اليمن", "Yemen"), "Andalus": ("الأندلس", "Endülüs"),
    "Jibal": ("الجبال", "Cibâl"), "Rihab": ("الرحاب", "Rihâb (Kafkasya)"), "Sind": ("السند", "Sind"),
    "Daylam": ("الديلم", "Deylem"), "Badiyat al-Arab": ("بادية العرب", "Arap çölü"),
    "Kirman": ("كرمان", "Kirman"), "Khuzistan": ("خوزستان", "Huzistan"), "Mafaza": ("المفازة", "Mefâze"),
    "Sijistan": ("سجستان", "Sicistan"), "Barqa": ("برقة", "Berka"), "Sicile": ("صقلية", "Sicilya"),
    "Khazar": ("الخزر", "Hazar"), "Rum": ("الروم", "Rûm (Anadolu)"), "Faris": ("فارس", "Fars"),
    "Hind": ("الهند", "Hind"),
}
TYPE = {"metropoles": ("حاضرة", "büyük şehir"), "capitals": ("قصبة إقليم", "eyalet merkezi"),
        "towns": ("مدينة", "şehir"), "villages": ("قرية", "köy"), "regions": ("ناحية", "bölge"),
        "quarters": ("محلة", "mahalle"), "sites": ("موضع", "mevki"), "waystations": ("منزل", "menzil"),
        "waters": ("ماء", "su"), "xroads": ("ملتقى طرق", "kavşak")}
ALIAS = {"مرو": "مرو الشاهجان"}   # Yâkût'taki madde başlığı
CERT = {"certain": "", "uncertain": "?", "approximate": "~"}
BOOK = {"yaqut": ("ياقوت، معجم البلدان", "Yâkūt, Mu‘cemü’l-büldân"),
        "himyari": ("الحميري، الروض المعطار", "Himyerî, er-Ravzü’l-mi‘târ"),
        "samani": ("السمعاني، الأنساب", "Sem‘ânî, el-Ensâb")}


def _plain(s: str) -> str:
    s = re.sub(r"<h1[^>]*>.*?</h1>", " ", s or "", flags=re.S)
    s = re.sub(r"\[v\.\s*\d+,\s*p\.\s*\d+\]|\[v\.[^\]]*$", " ", s)   # sayfa işaretleri
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    return re.sub(r"\s+", " ", s).strip()


def excerpt(text: str, n: int = MAX) -> str:
    """İlk cümle(ler), en çok n harf; kelime ortasında kesilmez."""
    t = _plain(text)
    if len(t) <= n:
        return t
    cut = t[:n]
    stop = max(cut.rfind(c) for c in ".،؛:")
    if stop > n * .55:
        return cut[:stop + 1].rstrip("،؛:") + ("" if cut[stop] == "." else "…")
    return cut[:cut.rfind(" ")].rstrip("،؛:") + "…"


def _vp(ref: str) -> str:
    m = re.search(r"Vol\.\s*(\d+),\s*pp?\.\s*([\d-]+)", ref or "")
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def _k(s: str) -> str:
    return normalize(re.sub(r"[^\w\s]", " ", s or "")).strip()


def _entries(root: Path, pattern: str) -> dict[str, list[dict]]:
    by = defaultdict(list)
    for f in sorted(glob.glob(str(root / "texts" / pattern))):
        for ft in json.loads(Path(f).read_text(encoding="utf-8")).get("features", []):
            p = ft.get("properties", {})
            if p.get("title") and p.get("text"):
                by[_k(p["title"].split(" والنسبة")[0])].append(p)   # "سرخس والنسبة السرخسي"
    return by


def build(thur: Path, places: list[dict]) -> dict[str, dict]:
    feats = {f["properties"]["cornuData"]["cornu_URI"]: f["properties"]
             for f in json.loads((thur / "master" / "places_full.geojson").read_text(encoding="utf-8"))["features"]}
    yaqut, samani = _entries(thur, "JK_000129_*.json"), _entries(thur, "JK_000952_*.json")
    out = {}
    for pl in places:
        f = feats.get(pl["id"]) or {"cornuData": {}}   # el-Süreyyâ dışındaki yerler: yalnız Yâkût
        c = f["cornuData"]
        reg = REGION.get(c.get("region_code", ""), ("", c.get("region_spelled", "")))
        typ = TYPE.get(c.get("top_type_hom", ""), ("", ""))
        info = {"translit": c.get("toponym_translit", ""), "region_ar": reg[0], "region_tr": reg[1],
                "type_ar": typ[0], "type_tr": typ[1], "cert": CERT.get(c.get("coord_certainty", ""), "")}
        names = [_k(ALIAS.get(x, x)) for x in dict.fromkeys(_k(n) for n in (pl["name"], c.get("toponym_arabic")) if n)]
        names += [n[2:] if n.startswith("ال") else "ال" + n for n in names]   # harfitarifli/harfitarifsiz
        name = next((n for n in names if n in yaqut), names[0])
        src = None
        cands = yaqut.get(name, [])
        if cands:   # aynı adlı birden çok madde: bölgesini anan, sonra en uzun
            key = _k(reg[0].split(" (")[0])
            cands = sorted(cands, key=lambda p: (key and key in _k(p["text"]), len(p["text"])), reverse=True)
            src = ("yaqut", cands[0]["text"], _vp(cands[0].get("reference")))
        else:
            for fn in f.get("sources_arabic", {}):
                p = thur / "sources" / fn
                if p.exists():
                    ft = json.loads(p.read_text(encoding="utf-8"))["features"][0]
                    src = ("himyari", ft["text"], "")
                    break
        if not src and samani.get(name + "ي"):
            s = samani[name + "ي"][0]
            src = ("samani", s["text"], _vp(s.get("reference")))
        if src:
            info.update(src=src[0], text=excerpt(src[1]), page=src[2])
        if src or c:
            out[pl["id"]] = {k: v for k, v in info.items() if v}
    return out


def main() -> None:
    thur = Path(sys.argv[1])
    root = Path(__file__).resolve().parents[3]
    places = json.loads((root / "data" / "places.json").read_text(encoding="utf-8"))
    info = build(thur, places)
    dst = root / "data" / "gazetteer" / "thurayya_info.json"
    dst.write_text(json.dumps(info, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    print(f"{len(info)} yer, {sum('src' in v for v in info.values())} alıntı → {dst}")


if __name__ == "__main__":
    main()

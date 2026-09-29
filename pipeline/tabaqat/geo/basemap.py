"""Site haritası için sade temel harita: Natural Earth (kamu malı) kara, göl ve büyük nehirler →
site/data/basemap.json (eşdikdörtgen izdüşümde SVG yolları).

    python -m tabaqat.geo.basemap <natural-earth-geojson-dizini>
(ne_50m_land, ne_50m_lakes, ne_50m_rivers_lake_centerlines .geojson dosyaları)
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

BBOX = (22.0, 8.0, 92.0, 50.0)   # boylam/enlem: Mısır–Hind, Yemen–Kıpçak
K = 20.0                          # derece başına birim
LAT0 = 35.0
RIVERS = {"Nile", "Rosetta Branch", "Damietta Branch", "Euphrates", "Firat", "Al Furat", "Tigris",
          "Dicle", "Shatt al Arab", "Amu  Darya", "Amu Darya", "Panj", "Syr Darya", "Naryn",
          "Indus", "Ganges", "Yamuna", "Chenab", "Volga", "Ural", "Kura", "Helmand", "Zeravshan",
          "Kizilirmak", "Sakarya", "Dnieper", "Don"}
STEP = 0.08


def project(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - BBOX[0]) * math.cos(math.radians(LAT0)) * K, (BBOX[3] - lat) * K)


def _inside(ring, pad=3.0) -> bool:
    return any(BBOX[0] - pad < x < BBOX[2] + pad and BBOX[1] - pad < y < BBOX[3] + pad
               for x, y in ring)


def _path(ring, close: bool) -> str:
    pts, last = [], None
    for lon, lat in ring:
        if last and abs(lon - last[0]) < STEP and abs(lat - last[1]) < STEP:
            continue
        last = (lon, lat)
        x, y = project(lon, lat)
        pts.append(f"{x:.1f} {y:.1f}")
    if len(pts) < (4 if close else 2):
        return ""
    return "M" + "L".join(pts) + ("Z" if close else "")


def _rings(geom):
    t, c = geom["type"], geom["coordinates"]
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def build(src: Path, out: Path) -> dict:
    def layer(name, close, keep=lambda f: True):
        gj = json.loads((src / f"{name}.geojson").read_text(encoding="utf-8"))
        parts = []
        for f in gj["features"]:
            if not keep(f):
                continue
            for r in _rings(f["geometry"]):
                if _inside(r):
                    p = _path(r, close)
                    if p:
                        parts.append(p)
        return "".join(parts)

    w, h = project(BBOX[2], BBOX[1])
    res = {"bbox": BBOX, "k": K, "lat0": LAT0, "width": round(w, 1), "height": round(h, 1),
           "land": layer("ne_50m_land", True),
           "lakes": layer("ne_50m_lakes", True),
           "rivers": layer("ne_50m_rivers_lake_centerlines", False,
                           lambda f: (f["properties"].get("name_en") or f["properties"].get("name"))
                           in RIVERS)}
    out.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {k: len(v) for k, v in res.items() if isinstance(v, str)}


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[3]
    print(build(Path(sys.argv[1]), root / "site" / "data" / "basemap.json"))

"""Yer adları sözlüğü: el-Süreyyâ (data/gazetteer/thurayya.tsv, CC BY 4.0) + review/places_extra.yml.

Aynı adı taşıyan birden çok yer varsa önce elle eşleme, sonra yerleşim türü (büyük şehir > merkez >
kasaba > bölge > köy) ve Hanefî coğrafyasının ağırlıklı bölgeleri öne alınır.
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from ..normalize.arabic import normalize

TYPE_RANK = {"metropoles": 0, "capitals": 1, "towns": 2, "regions": 3, "quarters": 4,
             "villages": 5, "sites": 6}
# waystations, xroads, waters: menzil ve nehir adları metinde çoğu zaman yer anlamında geçmez
REGION_RANK = {"Transoxiana": 0, "Khurasan": 0, "Iraq": 0, "Sham": 0, "Egypt": 0, "Rum": 0,
               "Jibal": 1, "Jazirat al-Arab": 1, "Aqur": 1, "Hind": 1, "Daylam": 2, "Sijistan": 2,
               "Faris": 2, "Rihab": 2, "Khuzistan": 2}
_TYPE_TR = {"metropoles": "şehir", "capitals": "şehir", "towns": "kasaba", "regions": "bölge",
            "quarters": "mahalle", "villages": "köy", "sites": "mevki"}


@dataclass
class Place:
    id: str
    name: str
    lat: float
    lon: float
    type: str
    region: str
    names: set[str] = field(default_factory=set)


def key(s: str) -> str:
    s = normalize(s)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _nisba_of(name: str) -> str | None:
    base = name[2:] if name.startswith("ال") else name
    if " " in base or len(base) < 3:
        return None
    base = re.sub(r"[هاي]$", "", base)
    return "ال" + base + "ي" if len(base) >= 2 else None


class Gazetteer:
    def __init__(self, root: Path):
        extra = yaml.safe_load((root / "review" / "places_extra.yml").read_text(encoding="utf-8"))
        self.ignore = {key(x) for x in extra.get("ignore") or []}
        self.places: dict[str, Place] = {}
        self.by_name: dict[str, list[str]] = {}
        cand: dict[str, list[tuple]] = {}
        with open(root / "data" / "gazetteer" / "thurayya.tsv", encoding="utf-8") as f:
            for row in csv.DictReader(f, delimiter="\t"):
                if row["type"] not in TYPE_RANK:
                    continue
                names = {key(row["ar"])} | {key(x) for x in row["ar_other"].split(",") if x.strip()}
                p = Place(row["uri"], row["ar"], float(row["lat"]), float(row["lon"]), row["type"],
                          row["region"], names)
                self.places[p.id] = p
                for n in names:
                    if n and n not in self.ignore and len(n.replace("ال", "", 1)) >= 3:
                        cand.setdefault(n, []).append((TYPE_RANK[p.type],
                                                       REGION_RANK.get(p.region, 3), p.id))
        for pid, (names, lat, lon, typ, region) in (extra.get("new") or {}).items():
            p = Place(pid, names[0], float(lat), float(lon), typ, region, {key(n) for n in names})
            self.places[pid] = p
            for n in p.names:
                cand.setdefault(n, []).insert(0, (-1, -1, pid))
        for n, lst in cand.items():
            lst.sort()
            self.by_name[n] = [x[2] for x in lst]
        for n, pid in (extra.get("alias") or {}).items():
            if pid in self.places:
                self.by_name[key(n)] = [pid]
                self.places[pid].names.add(key(n))
        for pid, name in (extra.get("label") or {}).items():
            if pid in self.places:
                self.places[pid].name = name
        # nisbe → yer: düzenli türetme + elle düzensizler
        self.by_nisba: dict[str, str] = {}
        for n, ids in self.by_name.items():
            p = self.places[ids[0]]
            if p.type in ("metropoles", "capitals", "towns", "regions"):
                nb = _nisba_of(n)
                if nb and nb not in self.by_nisba:
                    self.by_nisba[nb] = ids[0]
        for nb, pid in (extra.get("nisba") or {}).items():
            if pid in self.places:
                self.by_nisba[key(nb)] = pid
        self.max_words = max(len(n.split()) for n in self.by_name)

    def lookup(self, name: str) -> str | None:
        ids = self.by_name.get(key(name))
        return ids[0] if ids else None

    def type_tr(self, pid: str) -> str:
        return _TYPE_TR.get(self.places[pid].type, "")

"""Coğrafya: data/places.json (kullanılan yerler, ağırlıklar) ve data/person_places.json.

Şahıs başına yer atıfları (doğum, vefat, defin, yolculuk, ikamet, görev, faaliyet, köken) ve
nisbelerden çıkan yerler. Yer ağırlığı: o yerle ilişkili şahıs sayısı, türe ve hicrî asra göre.
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

from ..match.records import load_records
from .extract import extract, nisba_places
from .gazetteer import Gazetteer

KIND_AR = {"birth": "مولد", "death": "وفاة", "burial": "مدفن", "travel": "رحلة", "residence": "إقامة",
           "office": "ولاية/تدريس", "activity": "تحديث/طلب", "origin": "أصل", "nisba": "نسبة"}


def build(root: Path) -> dict:
    gz = Gazetteer(root)
    recs = {r.key: r for r in load_records(root)}
    persons = json.loads((root / "data" / "persons.json").read_text(encoding="utf-8"))
    entries = {}
    for b in {r.book_id for r in recs.values()}:
        for e in json.loads((root / "data" / "entries" / f"{b}.json").read_text(encoding="utf-8")):
            entries[f"{b}:{e['seq']}"] = e

    out: dict[str, list[dict]] = {}
    usage: dict[str, Counter] = defaultdict(Counter)
    cent: dict[str, Counter] = defaultdict(Counter)
    persons_at: dict[str, set[str]] = defaultdict(set)
    stats = Counter()
    for p in persons:
        keys = [s["key"] for s in p["sources"]]
        items, seen = [], set()
        for k in keys:
            e = entries.get(k)
            if not e or not e["text"]:
                continue
            for m in extract(e["text"], gz):
                if (m.place, m.kind) in seen:
                    continue
                seen.add((m.place, m.kind))
                items.append({"place": m.place, "kind": m.kind, "key": k, "text": m.text,
                              "snippet": m.snippet})
        nisbas = {x for k in keys for n in recs[k].names for x in n.nisbas}
        for pid, nb in nisba_places(sorted(nisbas), gz):
            if (pid, "nisba") not in seen:
                seen.add((pid, "nisba"))
                items.append({"place": pid, "kind": "nisba", "key": keys[0], "text": nb,
                              "snippet": ""})
        if not items:
            continue
        out[p["id"]] = items
        d = p.get("death_h") or p.get("death_est")
        c = str((int(d) - 1) // 100 + 1) if d else "?"
        for it in items:
            usage[it["place"]][it["kind"]] += 1
            stats[it["kind"]] += 1
            if p["id"] not in persons_at[it["place"]]:
                persons_at[it["place"]].add(p["id"])
                cent[it["place"]][c] += 1
    places = []
    for pid, kinds in usage.items():
        pl = gz.places[pid]
        places.append({"id": pid, "name": pl.name, "lat": pl.lat, "lon": pl.lon, "type": pl.type,
                       "region": pl.region, "n": len(persons_at[pid]), "kinds": dict(kinds),
                       "centuries": dict(cent[pid])})
    places.sort(key=lambda x: -x["n"])
    (root / "data" / "places.json").write_text(json.dumps(places, ensure_ascii=False, indent=1),
                                               encoding="utf-8")
    (root / "data" / "person_places.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    stats["persons_with_places"] = len(out)
    stats["places"] = len(places)
    return dict(stats)

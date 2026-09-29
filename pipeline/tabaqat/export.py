"""Statik site verisi: site/data/.

index.json   kitaplar + şahıs listesi (arama)
p/NN.json    şahıs ayrıntıları, kimliğin sayısal kısmı % 64'e göre parçalı (tembel yükleme)
graph.json   hoca–talebe ağı (düğüm + kenar)
places.json  yerler, ağırlıklar ve yerle ilişkili şahıslar
t/NN.json    madde metinleri (her kaynak: başlık, metin, dipnotlar, "ترجمته في"), p/ ile aynı parçalama;
             şahıs sayfasında açılınca yüklenir
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import yaml

SHARDS = 64


def shard(pid: str) -> int:
    d = re.sub(r"\D", "", pid)
    return int(d) % SHARDS if d else 0


def _century(d) -> int | None:
    return (int(d) - 1) // 100 + 1 if d else None


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _layout(years, edges, col=10, sweeps=24):
    """Zaman eksenli katmanlı yerleşim: x = vefat yılı (10 yıllık sütun), sütun içinde sıra
    komşuların ortalama konumuna göre (barycenter). Vefatı bilinmeyen komşularından tahmin edilir."""
    n = len(years)
    nb = [[] for _ in range(n)]
    for t, s_, *_ in edges:
        nb[t].append((s_, 30))    # talebe ≈ hoca + 30
        nb[s_].append((t, -30))
    y = list(years)
    guessed = [not v for v in y]
    for _ in range(20):
        for i in range(n):
            if guessed[i]:
                g = [y[j] + d for j, d in nb[i] if y[j]]
                if g:
                    y[i] = round(sum(g) / len(g))
    y = [max(1, v) if v else 0 for v in y]
    cols: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        cols[y[i] // col].append(i)
    order = {i: k for c in cols.values() for k, i in enumerate(c)}
    pos_y = {}

    def place():
        for c in cols.values():
            h = len(c)
            for k, i in enumerate(c):
                pos_y[i] = (k - (h - 1) / 2)
    place()
    for _ in range(sweeps):
        for c in cols.values():
            c.sort(key=lambda i: (sum(pos_y[j] for j, _ in nb[i]) / len(nb[i])) if nb[i]
                   else pos_y[i])
        place()
    return [v for v in y], [round(pos_y[i], 1) for i in range(n)], guessed


def _texts(root: Path, persons: list[dict]) -> dict[int, dict]:
    entries = {}
    for f in sorted((root / "data" / "entries").glob("*.json")):
        for e in json.loads(f.read_text(encoding="utf-8")):
            entries[f"{e['book_id']}:{e['seq']}"] = e
    out: dict[int, dict] = defaultdict(dict)
    for p in persons:
        items = []
        for s in p["sources"]:
            e = entries.get(s["key"])
            if not e:
                continue
            items.append({"book": s["book"], "cite": s["cite"], "heading": e.get("heading_raw") or "",
                          "text": (e.get("text") or "").strip(), "notes": e.get("footnotes") or {},
                          "refs": e.get("references") or []})
        if items:
            out[shard(p["id"])][p["id"]] = items
    return out


def export(root: Path) -> dict:
    data, out = root / "data", root / "site" / "data"
    persons = json.loads((data / "persons.json").read_text(encoding="utf-8"))
    rel = json.loads((data / "relations.json").read_text(encoding="utf-8"))
    ext = json.loads((data / "relations_external.json").read_text(encoding="utf-8"))
    pp = json.loads((data / "person_places.json").read_text(encoding="utf-8"))
    places = json.loads((data / "places.json").read_text(encoding="utf-8"))
    books = {}
    for f in sorted((root / "books").glob("*.yml")):
        b = yaml.safe_load(f.read_text(encoding="utf-8"))
        books[b["book_id"]] = {"title": b["title"], "author": b.get("author", ""),
                               "death": b.get("author_death_h")}
    cite = {s["key"]: s["cite"] for p in persons for s in p["sources"]}
    info = {p["id"]: p for p in persons}

    teachers, students = defaultdict(list), defaultdict(list)
    for e in rel:
        weak = all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"])
        ev = [[cite.get(x["key"], ""), x["snippet"][:160], x["text"]] for x in e["evidence"][:3]]
        item = {"rels": e["rels"], "n": e["n"], "weak": weak, "ev": ev}
        teachers[e["student"]].append({"id": e["teacher"], **item})
        students[e["teacher"]].append({"id": e["student"], **item})
    exts = defaultdict(list)
    for x in ext:
        exts[x["subject"]].append([x["name"], x["death"], x["role"], x["rel"],
                                   cite.get(x["key"], "")])

    main_place = {}
    for pid, items in pp.items():
        order = {"birth": 0, "nisba": 1, "origin": 2, "residence": 3, "death": 4}
        best = sorted(items, key=lambda it: order.get(it["kind"], 9))
        main_place[pid] = best[0]["place"]

    index, shards = [], defaultdict(dict)
    for p in persons:
        pid = p["id"]
        d, est = p.get("death_h"), False
        if not d and p.get("death_est"):
            d, est = p["death_est"], True
        index.append([pid, p["name"], d, int(est), len(p["sources"]), len(teachers[pid]),
                      len(students[pid]), main_place.get(pid, "")])
        shards[shard(pid)][pid] = {
            "name": p["name"], "heading": p.get("heading", ""), "death": p.get("death", ""),
            "death_h": d, "est": est,
            "sources": [[s["book"], s["cite"], s.get("heading", "")] for s in p["sources"]],
            "teachers": sorted(teachers[pid], key=lambda x: -x["n"]),
            "students": sorted(students[pid], key=lambda x: -x["n"]),
            "ext": exts.get(pid, []),
            "places": [[it["place"], it["kind"], cite.get(it["key"], ""), it["text"]]
                       for it in pp.get(pid, [])],
        }
    _dump(out / "index.json", {"books": books, "persons": index})
    for k, v in shards.items():
        _dump(out / "p" / f"{k:02d}.json", v)
    texts = _texts(root, persons)
    for k, v in texts.items():
        _dump(out / "t" / f"{k:02d}.json", v)

    in_net = sorted({x for e in rel for x in (e["teacher"], e["student"])})
    pos = {pid: i for i, pid in enumerate(in_net)}
    deg = defaultdict(int)
    for e in rel:
        deg[e["teacher"]] += 1
        deg[e["student"]] += 1
    edges = [[pos[e["teacher"]], pos[e["student"]], e["n"],
              int(all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"]))]
             for e in rel]
    years = [info[pid].get("death_h") or info[pid].get("death_est") for pid in in_net]
    xs, ys, guessed = _layout(years, edges)
    nodes = []
    for i, pid in enumerate(in_net):
        nodes.append([pid, info[pid]["name"], years[i], deg[pid], xs[i], ys[i], int(guessed[i])])
    _dump(out / "graph.json", {"nodes": nodes, "edges": edges})

    people_at = defaultdict(list)
    for pid, items in pp.items():
        for it in items:
            people_at[it["place"]].append([pid, it["kind"]])
    _dump(out / "places.json", [{**pl, "people": people_at[pl["id"]]} for pl in places])
    return {"persons": len(index), "shards": len(shards), "nodes": len(nodes),
            "edges": len(edges), "places": len(places)}

"""Ağ onay sayfası: site/network-review/data.json ve sayfa kararlarının review/relations.yml'e işlenmesi.

Sayfada iki tür karar verilir:
  belirsiz atıf  → adaylardan biri seçilir ("pick" + pid) ya da "none" (hiçbiri)
  bağ            → "reject" (yanlış) ya da "ok" (doğru)
review/relations.yml:  choose: [{key, text, pid}], reject: [[hoca, talebe]], ok: [[hoca, talebe]]
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import yaml


def write_review_data(root: Path) -> dict:
    rel = json.loads((root / "data" / "relations.json").read_text(encoding="utf-8"))
    unres = json.loads((root / "data" / "relations_unresolved.json").read_text(encoding="utf-8"))
    persons = json.loads((root / "data" / "persons.json").read_text(encoding="utf-8"))
    cite = {s["key"]: s["cite"] for p in persons for s in p["sources"]}
    cid = {s["key"]: p["id"] for p in persons for s in p["sources"]}
    pinfo = {p["id"]: p for p in persons}
    used: set[str] = set()

    freq = Counter(u["text"] for u in unres if u["status"] == "ambiguous")
    amb = []
    for u in unres:
        if u["status"] != "ambiguous" or not u["candidates"]:
            continue
        subj = cid.get(u["key"])
        amb.append({"id": f"{u['key']}|{u['text']}", "key": u["key"], "cite": cite.get(u["key"], ""),
                    "subj": subj, "role": u["role"], "rel": u["rel"], "text": u["text"],
                    "kin": u["kin"], "cands": u["candidates"], "f": freq[u["text"]],
                    "snippet": u.get("snippet", "")})
        used.add(subj)
        used.update(u["candidates"])
    amb.sort(key=lambda a: (-a["f"], a["text"], a["key"]))

    edges = []
    for e in rel:
        weak = all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"])
        edges.append({"id": f"{e['teacher']}|{e['student']}", "t": e["teacher"], "s": e["student"],
                      "n": e["n"], "rels": e["rels"], "weak": weak,
                      "ev": [{"key": x["key"], "cite": cite.get(x["key"], ""), "rel": x["rel"],
                              "via": x["via"], "text": x["text"], "how": x["how"],
                              "snippet": x["snippet"]} for x in e["evidence"][:6]]})
        used.update((e["teacher"], e["student"]))
    edges.sort(key=lambda e: (not e["weak"], e["n"], e["id"]))

    people = {}
    for pid in used:
        if pid in pinfo:
            p = pinfo[pid]
            people[pid] = [p["name"], p.get("death") or "", len(p["sources"]),
                           [s["cite"] for s in p["sources"]][:4]]
    out = root / "site" / "network-review"
    out.mkdir(parents=True, exist_ok=True)
    (out / "data.json").write_text(json.dumps({"people": people, "amb": amb, "edges": edges},
                                              ensure_ascii=False, separators=(",", ":")),
                                   encoding="utf-8")
    return {"ambiguous": len(amb), "edges": len(edges), "people": len(people)}


def apply_decisions(root: Path, path: Path) -> dict:
    """Sayfanın kararları ({"id": {"k": ..., "pid": ...}}) → review/relations.yml"""
    got = json.loads(path.read_text(encoding="utf-8"))
    yml = root / "review" / "relations.yml"
    cur = (yaml.safe_load(yml.read_text(encoding="utf-8")) or {}) if yml.exists() else {}
    choose = {(c["key"], c["text"]): c for c in cur.get("choose") or []}
    reject = {tuple(x) for x in cur.get("reject") or []}
    ok = {tuple(x) for x in cur.get("ok") or []}
    n = Counter()
    for id_, v in got.items():
        k = v.get("k") if isinstance(v, dict) else v
        a, b = id_.split("|", 1)
        if k == "pick" and v.get("pid"):
            choose[(a, b)] = {"key": a, "text": b, "pid": v["pid"]}
        elif k == "none":
            choose.pop((a, b), None)
        elif k == "reject":
            reject.add((a, b)), ok.discard((a, b))
        elif k == "ok":
            ok.add((a, b)), reject.discard((a, b))
        n[k] += 1
    body = {"choose": sorted(choose.values(), key=lambda c: (c["key"], c["text"])),
            "reject": [list(x) for x in sorted(reject)], "ok": [list(x) for x in sorted(ok)]}
    head = ("# Hoca–talebe ağı insan kararları. choose: belirsiz atıf için seçilen şahıs;\n"
            "# reject: yanlış bağ [hoca, talebe]; ok: doğrulanmış bağ.\n")
    yml.write_text(head + yaml.safe_dump(body, allow_unicode=True, sort_keys=False, width=200),
                   encoding="utf-8")
    return dict(n)

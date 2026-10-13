"""Kureşî, el-Cevâhirü'l-mudıyye: madde madde inceleme dosyaları.

Her madde için başlık, metin, muhakkik dipnotları ve pipeline'ın o maddeden çıkardığı şahıs, vefat,
hoca–talebe bağları, eserler ve yerler yan yana konur. Çıktı gizli depoya yazılır (metin telifli):
    kaynak/analiz/kuresi/dosya/parti_NNN.json   (50 madde)
    python analysis/kuresi_dosya.py
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "kaynak" / "analiz" / "kuresi" / "dosya"
BOOK, N = "jawahir", 50


def main():
    E = json.load(open(ROOT / "data" / "entries" / f"{BOOK}.json", encoding="utf-8"))
    persons = json.load(open(ROOT / "data" / "persons.json", encoding="utf-8"))
    idx = json.load(open(ROOT / "site" / "data" / "index.json", encoding="utf-8"))["persons"]
    tr = {r[0]: r[9] for r in idx}
    owner, cite, name = {}, {}, {}
    for p in persons:
        name[p["id"]] = p["name"]
        for s in p["sources"]:
            owner[s["key"]] = p
            cite[s["key"]] = s["cite"]
    rel = defaultdict(list)
    for r in json.load(open(ROOT / "data" / "relations.json", encoding="utf-8")):
        for ev in r["evidence"]:
            if ev["key"].startswith(BOOK + ":"):
                rel[ev["key"]].append({"hoca": r["teacher"], "hoca_ad": tr.get(r["teacher"]) or r["teacher_name"],
                                       "talebe": r["student"], "talebe_ad": tr.get(r["student"]) or r["student_name"],
                                       "tur": ev["rel"], "yol": ev["via"], "metindeki": ev["text"], "nasil": ev["how"]})
    for x in json.load(open(ROOT / "data" / "relations_external.json", encoding="utf-8")):
        if x["key"].startswith(BOOK + ":"):
            rel[x["key"]].append({"dis_kayit": x["name"], "rol": x["role"], "tur": x["rel"], "metindeki": x["text"]})
    pl_name = {p["id"]: p.get("name_tr") or p["name"] for p in json.load(open(ROOT / "site" / "data" / "places.json", encoding="utf-8"))}
    places = defaultdict(list)
    for pid, L in json.load(open(ROOT / "data" / "person_places.json", encoding="utf-8")).items():
        for x in L:
            if x["key"].startswith(BOOK + ":"):
                places[x["key"]].append({"yer": pl_name.get(x["place"], x["place"]), "kimlik": x["place"], "tur": x["kind"], "metindeki": x["text"]})
    B = json.load(open(ROOT / "site" / "data" / "books.json", encoding="utf-8"))
    works = defaultdict(list)
    for w in B["works"]:
        for i in w.get("s") or []:
            works[B["cites"][i]].append({"eser": w.get("tr") or w.get("ar"), "ar": w.get("ar"), "tur": w.get("k"), "yazar": w.get("a")})
    rows = []
    for e in E:
        key = f"{BOOK}:{e['seq']}"
        p = owner.get(key)
        fn = e.get("footnotes") or {}
        if isinstance(fn, str):
            fn = {}
        rows.append({
            "anahtar": key, "sira": int(e["seq"]), "no": e.get("number"), "cilt": e["vol"], "sayfa": f"{e['page_start']}-{e['page_end']}",
            "bolum": e.get("section"), "atif": cite.get(key),
            "baslik": e["heading_raw"], "metin": e["text"].split("<hr>")[0].strip(), "dipnotlar": fn,
            "sahis": p and {"kimlik": p["id"], "ad": p["name"], "tr": tr.get(p["id"]), "vefat": p.get("death_h"), "vefat_tahmini": p.get("death_est"),
                            "diger_kaynaklar": [s["key"] for s in p["sources"] if s["key"] != key]},
            "baglar": rel.get(key, []), "yerler": places.get(key, []),
            "eserler": [w for w in works.get(cite.get(key), []) if not p or w["yazar"] == p["id"]],
        })
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(0, len(rows), N):
        (OUT / f"parti_{i // N + 1:03d}.json").write_text(json.dumps(rows[i:i + N], ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(rows), "madde,", (len(rows) + N - 1) // N, "parti")


if __name__ == "__main__":
    main()

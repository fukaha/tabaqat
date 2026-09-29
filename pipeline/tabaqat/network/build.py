"""Hoca–talebe ağı: data/relations.json, data/relations_unresolved.json.

Kenar = (hoca şahıs, talebe şahıs); her kenar kanıtlarını (madde, ilişki türü, cümle) taşır.
Aynı ilişki birden çok kitapta geçerse kanıtlar birikir; kenarın güveni kanıt sayısıyla artar.
review/aliases.yml: metindeki ad → madde anahtarı (ör. "أبي حنيفة": jawahir:1) elle eşleme.
review/relations.yml: insan kararları (reject: [[hoca, talebe], ...]; add: [...]).
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import yaml

from ..match.records import load_records
from .extract import extract
from .resolve import Person, Resolution, Resolver

REL_TR = {"fiqh": "تفقه", "took": "أخذ", "hadith": "سماع/رواية", "read": "قراءة",
          "companion": "صحبة"}


def _load_yaml(path: Path) -> dict:
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}) if path.exists() else {}


def load_people(root: Path):
    recs = {r.key: r for r in load_records(root)}
    persons = json.loads((root / "data" / "persons.json").read_text(encoding="utf-8"))
    cid, people = {}, []
    for p in persons:
        keys = [s["key"] for s in p["sources"]]
        for k in keys:
            cid[k] = p["id"]
        names = [n for k in keys for n in recs[k].names]
        heads = [recs[k].name for k in keys] + [recs[k].heading for k in keys
                                                if recs[k].book_id in ("kataib",)]
        people.append(Person(p["id"], names, p.get("death_h") or p.get("death_est"), len(keys),
                             sure=bool(p.get("death_h")), headings=heads))
    return recs, persons, cid, people


def build(root: Path) -> dict:
    recs, persons, cid, people = load_people(root)
    by_pid = {p.pid: p for p in people}
    aliases_raw = _load_yaml(root / "review" / "aliases.yml")
    aliases = {}
    for k, v in aliases_raw.items():  # "محمد": "jawahir:1271@zincir" yalnız zincirlerde geçerli
        key, _, only = str(v).partition("@")
        if key in cid:
            aliases[("@zincir " if only == "zincir" else "") + k] = cid[key]
    decisions = _load_yaml(root / "review" / "relations.yml")
    rejected = {tuple(x) for x in decisions.get("reject") or []}
    res = Resolver(people, aliases)
    entries = {}
    for b in {r.book_id for r in recs.values()}:
        for e in json.loads((root / "data" / "entries" / f"{b}.json").read_text(encoding="utf-8")):
            entries[f"{b}:{e['seq']}"] = e

    chosen = {(c["key"], c["text"]): c["pid"] for c in decisions.get("choose") or []}
    edges, unresolved, stats = _pass(entries, recs, cid, by_pid, res, rejected, chosen)
    # Vefatı bilinmeyenlere ağdan tahmin: hocalarının vefatı + 30 / talebelerinin − 30
    est = _estimate_deaths(edges, by_pid)
    for pid, d in est.items():
        by_pid[pid].death, by_pid[pid].sure = d, False
    stats["death_estimated"] = len(est)
    edges, unresolved, stats2 = _pass(entries, recs, cid, by_pid, res, rejected, chosen)
    stats2["death_estimated"] = len(est)
    stats = stats2
    out = []
    names = {p["id"]: p["name"] for p in persons}
    for (t, s), ev in edges.items():
        books = {x["key"].split(":")[0] for x in ev}
        out.append({"teacher": t, "student": s, "teacher_name": names[t], "student_name": names[s],
                    "rels": sorted({x["rel"] for x in ev}), "books": sorted(books),
                    "n": len(ev), "evidence": ev})
    for a in decisions.get("add") or []:
        out.append({"teacher": a[0], "student": a[1], "teacher_name": names.get(a[0], ""),
                    "student_name": names.get(a[1], ""), "rels": ["manual"], "books": [], "n": 1,
                    "evidence": [{"key": "", "rel": "manual", "via": "human", "text": "",
                                  "how": "elle", "snippet": ""}]})
    out.sort(key=lambda x: (-x["n"], x["teacher"], x["student"]))
    (root / "data" / "relations.json").write_text(json.dumps(out, ensure_ascii=False, indent=1),
                                                  encoding="utf-8")
    (root / "data" / "relations_unresolved.json").write_text(
        json.dumps(unresolved, ensure_ascii=False, indent=1), encoding="utf-8")
    stats["edges"] = len(out)
    stats["persons_in_network"] = len({x for e in out for x in (e["teacher"], e["student"])})
    return dict(stats)


def _estimate_deaths(edges, by_pid) -> dict[str, int]:
    guesses: dict[str, list[int]] = defaultdict(list)
    for (t, s), ev in edges.items():
        if all("zayıf" in x["how"] for x in ev):
            continue
        dt, ds = by_pid[t].death, by_pid[s].death
        if dt and not ds and by_pid[t].sure:
            guesses[s].append(dt + 30)
        if ds and not dt and by_pid[s].sure:
            guesses[t].append(ds - 30)
    out = {}
    for pid, g in guesses.items():
        g.sort()
        out[pid] = g[len(g) // 2]
    return out


def _pass(entries, recs, cid, by_pid, res, rejected, chosen):
    edges: dict[tuple[str, str], list[dict]] = defaultdict(list)
    unresolved = []
    stats = Counter()
    for key, e in entries.items():
        if key not in cid or not e["text"]:
            continue
        subj = by_pid[cid[key]]
        mentions = extract(e["text"], recs[key].book_id, res.isms)
        chain_pid: dict[str, str | None] = {}
        for m in mentions:
            stats["mentions"] += 1
            ctx = subj
            if m.role == "chain":  # zincirde özne önceki halkadır
                sp = chain_pid.get(m.student_text or "")
                ctx = by_pid.get(sp) if sp else None
            role = "teacher" if m.role in ("teacher", "chain") else "student"
            r = None
            if (key, m.text) in chosen:  # onay sayfasında seçilen aday
                r = Resolution(chosen[(key, m.text)], "resolved", 9, "insan")
            elif m.text:  # "أبيه أبي حفص الكبير": önce adla
                r = res.resolve(m.text, role, ctx, chain=m.role == "chain" or m.via_chain)
            if m.kin and (r is None or r.pid is None) and ctx is not None:
                r = res.kin(m.kin, m.text, ctx)
            if m.role in ("teacher", "chain"):
                chain_pid[m.extra.get("raw", m.text)] = r.pid if r else None
            if r is None or r.pid is None:
                stats[r.status if r else "unresolved"] += 1
                unresolved.append({"key": key, "role": m.role, "rel": m.rel, "text": m.text,
                                   "kin": m.kin, "status": r.status if r else "unresolved",
                                   "candidates": r.candidates if r else [],
                                   "snippet": m.snippet[:220]})
                continue
            stats["resolved"] += 1
            if m.role == "teacher":
                t, s = r.pid, subj.pid
            elif m.role == "student":
                t, s = subj.pid, r.pid
            else:  # chain: r hoca, önceki halka talebe
                sp = chain_pid.get(m.student_text or "")
                if not sp:
                    continue
                t, s = r.pid, sp
            if t == s or (t, s) in rejected:
                continue
            edges[(t, s)].append({"key": key, "rel": m.rel, "via": m.role, "text": m.text,
                                  "how": r.how, "snippet": m.snippet[:220]})
    return edges, unresolved, stats

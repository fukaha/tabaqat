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
from ..normalize.arabic import normalize
from .extract import extract
from .resolve import External, Person, Resolution, Resolver, _exact_key

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
    # "محمد": "jawahir:1271@zincir@yakın" → zincirlerde her zaman, başka yerde vefat yakınsa
    for k, v in aliases_raw.items():
        key, *flags = str(v).split("@")
        if key not in cid:
            continue
        if not flags:
            aliases[k] = cid[key]
        for f in flags:
            aliases[f"@{f} {k}"] = cid[key]
    decisions = _load_yaml(root / "review" / "relations.yml")
    rejected = {tuple(x) for x in decisions.get("reject") or []}
    externals: dict[str, list[External]] = defaultdict(list)
    for group in _load_yaml(root / "review" / "external.yml").values():
        for k, (death, name) in group.items():
            for alt in str(k).split("|"):
                externals[alt.strip()].append(External(name, int(death)))
    res = Resolver(people, aliases, externals)
    entries = {}
    for b in {r.book_id for r in recs.values()}:
        for e in json.loads((root / "data" / "entries" / f"{b}.json").read_text(encoding="utf-8")):
            entries[f"{b}:{e['seq']}"] = e
    recip = _Recip(entries, cid, people, res)

    chosen = {(c["key"], c["text"]): c["pid"] for c in decisions.get("choose") or []}
    ctx = dict(entries=entries, recs=recs, cid=cid, by_pid=by_pid, res=res, rejected=rejected,
               chosen=chosen, recip=recip)
    edges, unresolved, ext, stats = _pass(**ctx, prev=None)
    # Vefatı bilinmeyenlere ağdan tahmin: hocalarının vefatı + 30 / talebelerinin − 30
    est = _estimate_deaths(edges, by_pid)
    fixed = _fix_unsure(edges, by_pid)   # tek kaynaklı, ağla çelişen okumalar ("٩٨" ← 197)
    est.update(fixed)
    for pid, d in est.items():
        by_pid[pid].death, by_pid[pid].sure = d, False
    (root / "data" / "death_estimates.json").write_text(
        json.dumps(dict(sorted(est.items())), ensure_ascii=False, indent=0), encoding="utf-8")
    # 2. ve 3. tur: belirsizler önceki turun bağlarıyla (çapraz kayıt) ve yakın vefatla çözülür
    for _ in range(2):
        edges, unresolved, ext, stats = _pass(**ctx, prev=edges)
    stats["death_estimated"] = len(est) - len(fixed)
    stats["death_fixed"] = len(fixed)
    stats["reverse_dropped"] = _drop_reverse(edges, by_pid)
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
    (root / "data" / "relations_external.json").write_text(
        json.dumps(ext, ensure_ascii=False, indent=1), encoding="utf-8")
    _write_doubtful(root, unresolved, names)
    stats["edges"] = len(out)
    stats["persons_in_network"] = len({x for e in out for x in (e["teacher"], e["student"])})
    return dict(stats)


def _drop_reverse(edges, by_pid) -> int:
    """Aynı çift iki yönde bağlıysa ("من أصحاب ابن المبارك مثل ... محمد بن الحسن" gibi yanlış
    okunmuş cümleler): hocası belirgin biçimde daha geç ölmüş yön, yoksa kanıtı az olan yön düşer."""
    dropped = 0
    for (t, s) in list(edges):
        if (s, t) not in edges or (t, s) not in edges:
            continue
        dt, ds = by_pid[t].death, by_pid[s].death
        if dt and ds and abs(dt - ds) > 5:
            bad = (t, s) if dt > ds else (s, t)
        elif len(edges[(t, s)]) != len(edges[(s, t)]):
            bad = (t, s) if len(edges[(t, s)]) < len(edges[(s, t)]) else (s, t)
        else:
            continue
        del edges[bad]
        dropped += 1
    return dropped


def _fix_unsure(edges, by_pid) -> dict[str, int]:
    """Tek kaynaklı vefat okuması, vefatı kesin en az iki hoca/talebesinin gösterdiğinden
    fazla sapıyorsa (90 yıldan çok) ağdan tahmin edilen yıl kullanılır (yüzler hanesi düşmüş okumalar)."""
    guesses: dict[str, list[int]] = defaultdict(list)
    for (t, s), ev in edges.items():
        if all("zayıf" in x["how"] for x in ev):
            continue
        T, S = by_pid[t], by_pid[s]
        if T.sure and T.death and S.death and not S.sure:
            guesses[s].append(T.death + 30)
        if S.sure and S.death and T.death and not T.sure:
            guesses[t].append(S.death - 30)
    out = {}
    for pid, g in guesses.items():
        if len(g) < 2:
            continue
        g.sort()
        m = g[len(g) // 2]
        d = by_pid[pid].death
        # Ebû Hanîfe öncesine düşen okuma (ör. Vekî' "٩٨") için daha dar pay
        if abs(m - d) > 90 or (d < 150 and abs(m - d) > 60):
            out[pid] = m
    return out


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


class _Recip:
    """Çapraz kayıt: adayın kendi maddelerinde öznenin ayırt edici adı geçiyor mu?"""

    def __init__(self, entries, cid, people, res: Resolver):
        texts: dict[str, list[str]] = defaultdict(list)
        for key, e in entries.items():
            if key in cid and e["text"]:
                texts[cid[key]].append(normalize(e["text"]))
        self.text = {pid: " ".join(t) for pid, t in texts.items()}
        self.keys: dict[str, set[str]] = {}
        for p in people:
            ks = {h for h in (_exact_key(x) for x in p.headings) if len(h.split()) >= 2
                  and len(h) >= 9}
            for n in p.names:
                if len(n.chain) >= 3:
                    ks.add(" بن ".join(n.chain[:3]))
                for x in n.nisbas:
                    if n.kunya:
                        ks.add(f"{n.kunya} {x}")
                    if len(res.by_nisba.get(x, ())) <= 2 and len(x) >= 7:
                        ks.add(x)
            self.keys[p.pid] = ks
        self._memo: dict[tuple, bool] = {}

    def __call__(self, cand: str, subj: str) -> bool:
        k = (cand, subj)
        if k not in self._memo:
            t = self.text.get(cand, "")
            self._memo[k] = any(x in t for x in self.keys.get(subj, ()))
        return self._memo[k]


def _pass(entries, recs, cid, by_pid, res, rejected, chosen, recip, prev):
    edges: dict[tuple[str, str], list[dict]] = defaultdict(list)
    linked: dict[tuple[str, str], set[str]] = defaultdict(set)   # (özne, rol) → önceki bağlar
    if prev:
        for (t, s) in prev:
            linked[(s, "teacher")].add(t)
            linked[(t, "student")].add(s)
    unresolved, external = [], []
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
                r = res.resolve(m.text, role, ctx, chain=m.role == "chain" or m.via_chain,
                                context=m.snippet, kin=bool(m.kin))
            if m.kin and (r is None or r.pid is None) and ctx is not None:
                r = res.kin(m.kin, m.text, ctx)
            # Dış kişi (Buhârî, İbn Maîn…): Hanefî aday güçlü değilse ve vefat uyuyorsa
            if r is not None and not m.kin and r.how not in ("insan", "elle", "tam ad") and (
                    r.pid is None or r.score < 6 or "meşhur" in r.how or "zayıf" in r.how):
                x = res.external(m.text, role, ctx, bool(r.scored) and m.rel != "hadith")
                hanafi = (r.pid and m.rel == "fiqh" and res.chron(r.pid, ctx, role) == "near")
                if x and not hanafi:
                    r = Resolution(None, "external", external=(x.name, x.death))
            if r is not None and r.status == "ambiguous" and prev is not None:
                r = res.disambiguate(r, m.text, role, ctx, linked.get((ctx.pid, role), set())
                                     if ctx else set(), (lambda c, _s=ctx: _s is not None and recip(c, _s.pid)))
            if m.role in ("teacher", "chain"):
                chain_pid[m.extra.get("raw", m.text)] = r.pid if r else None
            if r is not None and r.status == "external":
                stats["external"] += 1
                external.append({"key": key, "subject": subj.pid, "role": m.role, "rel": m.rel,
                                 "text": m.text, "name": r.external[0], "death": r.external[1],
                                 "snippet": m.snippet[:220]})
                continue
            if r is None or r.pid is None:
                stats[r.status if r else "unresolved"] += 1
                unresolved.append({"key": key, "role": m.role, "rel": m.rel, "text": m.text,
                                   "kin": m.kin, "status": r.status if r else "unresolved",
                                   "reason": r.reason if r else "",
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
    return edges, unresolved, external, stats


REASON_TR = {"yalnız ism": "Adaylarla yalnız ism uyuşuyor (ör. \"أحمد\", \"إبراهيم الصفار\"); aday çok.",
             "birden çok yakın aday": "Vefatı uyan birden çok aday var.",
             "vefatı bilinmeyen aday var": "Vefatı uyan tek aday var ama vefatı bilinmeyen başka adaylar da var.",
             "vefat bilinmiyor": "Madde sahibinin vefatı bilinmiyor; adaylar ayırt edilemiyor.",
             "adayların vefatı bilinmiyor": "Adayların vefatı bilinmiyor.",
             "vefat uymuyor": "Hiçbir adayın vefatı uymuyor (muhtemelen başka bir kişi).",
             "ad uyumu zayıf": "Ad unsurları adaylara zayıf uyuyor (ör. künye çelişiyor).",
             "": "Aday puanları eşit."}


def _write_doubtful(root: Path, unresolved: list[dict], names: dict[str, str]) -> None:
    """Belirlenemeyen / çok şüpheli atıflar: review/supheli_atiflar.md (sonra dönülecek)."""
    amb = [u for u in unresolved if u["status"] == "ambiguous"]
    by_reason: dict[str, list[dict]] = defaultdict(list)
    for u in amb:
        by_reason[u.get("reason", "")].append(u)
    lines = ["# Şüpheli ve belirlenemeyen atıflar", "",
             "Ağ inşasında adayı tek kişiye indirilemeyen atıflar. Onay sayfasının \"أسماء ملتبسة\" "
             "sekmesinde de aynı liste var; karar verildikçe buradan düşer.", "",
             f"Toplam: {len(amb)} atıf.", ""]
    for reason, items in sorted(by_reason.items(), key=lambda x: -len(x[1])):
        lines += [f"## {REASON_TR.get(reason, reason)} ({len(items)})", "",
                  "| madde | ad | ilişki | adaylar | cümle |", "|---|---|---|---|---|"]
        for u in sorted(items, key=lambda u: (u["text"], u["key"])):
            c = "، ".join(names.get(p, p)[:40] for p in u["candidates"][:4])
            snip = u["snippet"][:90].replace("|", "/").replace("\n", " ")
            lines.append(f"| {u['key']} | {u['text']} | {u['role']}/{u['rel']} | {c} | {snip} |")
        lines.append("")
    miss = Counter(u["text"] for u in unresolved if u["status"] == "unresolved" and u["text"])
    lines += [f"## Hiçbir maddeye uymayan adlar ({sum(miss.values())} atıf, {len(miss)} ad)", "",
              "Kitaplarda maddesi olmayan kişiler (çoğu muhaddis ya da Hanefî olmayan âlimler); "
              "sık geçenler review/external.yml'e eklenerek dış kişi olarak ağa bağlanabilir.", "",
              "| ad | kaç kez |", "|---|---|"]
    lines += [f"| {t} | {n} |" for t, n in miss.most_common() if n >= 2]
    lines.append("")
    (root / "review" / "supheli_atiflar.md").write_text("\n".join(lines), encoding="utf-8")

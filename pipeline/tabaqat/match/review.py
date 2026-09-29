"""Onay sayfasının verisi (site/review/data.json) ve sayfadan gelen kararların alınması.

Sayfa her çifti "a|b" anahtarıyla (a < b, madde anahtarları) tanır. Kararlar sayfanın
veritabanında tutulur; `apply_decisions` onları review/decisions.yml'e işler.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from .cluster import Link, _pair

# Gerekçe notlarının Arapça karşılıkları (önek eşleşmesi)
_NOTES = [
    (r"^künye birden çok kişiye uyuyor", "الكنية تصدق على أكثر من شخص"),
    (r"^künye$", "اتفاق الكنية"),
    (r"^nisbe: (.*)", r"اتفاق النسبة: \1"),
    (r"^lakap$", "اتفاق اللقب"),
    (r"^vefat farklı (\d+)/(\d+)", r"اختلاف سنة الوفاة: \1 / \2"),
    (r"^vefat (\d+)/(\d+)", r"سنة الوفاة متقاربة: \1 / \2"),
    (r"^vefat (\d+), (\S+) müellifinden çok sonra", r"الوفاة \1 بعد وفاة مؤلف أحد الكتابين بزمن طويل"),
    (r"^vefat (\d+)$", r"اتفاق سنة الوفاة: \1"),
    (r"^zincir (\d+)\. halkada ayrılıyor", r"يختلف النسب في الحلقة \1"),
    (r"^atıf: (.*)", r"إحالة المحقق: \1"),
    (r"^aynı kitapta birden çok aday", "للمادة أكثر من مرشح في كتاب واحد"),
    (r"^çakışma: (\S+) kitabında zaten başka bir madde var", r"تعارض: للشخص مادة أخرى في الكتاب نفسه"),
    (r"^çakışma: ad uyuşmuyor.*", "تعارض: الاسم لا يتفق مع مواد أخرى في المجموعة"),
    (r"^çakışma: vefat.*", "تعارض: سنة الوفاة لا تتفق مع المجموعة"),
    (r"^çakışma: insan kararı.*", "تعارض مع قرار سابق"),
]


def note_ar(n: str) -> str:
    for pat, rep in _NOTES:
        if re.match(pat, n):
            return re.sub(pat, rep, n)
    return n


def pair_id(a: str, b: str) -> str:
    x, y = _pair(a, b)
    return f"{x}|{y}"


def write_review_data(root: Path, pending: list[Link], recs, cid: dict[str, str],
                      persons: list[dict], max_text: int = 6000) -> Path:
    texts: dict[str, dict] = {}
    for b in {r.book_id for r in recs.values()}:
        for e in json.loads((root / "data" / "entries" / f"{b}.json").read_text(encoding="utf-8")):
            texts[f"{b}:{e['seq']}"] = e
    by_id = {p["id"]: p for p in persons}
    from .persons import cite  # döngüsel içe aktarımı önle

    entries, people, pairs = {}, {}, []
    for ln in sorted(pending, key=lambda l: (-l.sim, -l.score)):
        for k in (ln.a, ln.b):
            if k not in entries:
                r, e = recs[k], texts[k]
                t = e["text"]
                entries[k] = {
                    "name": r.name, "heading": e["heading_raw"].replace("\n", " "), "cite": cite(r),
                    "death": r.death, "person": cid[k],
                    "text": t[:max_text] + (" …" if len(t) > max_text else ""),
                }
            pid = cid[k]
            if pid not in people:
                p = by_id[pid]
                people[pid] = {"heading": p["heading"],
                               "sources": [[s["key"], s["cite"], s["heading"]] for s in p["sources"]]}
        x, y = _pair(ln.a, ln.b)
        pairs.append({"id": f"{x}|{y}", "a": x, "b": y, "kind": ln.kind, "score": round(ln.score, 1),
                      "sim": round(ln.sim, 2), "notes": [note_ar(n) for n in ln.notes]})
    out = root / "site" / "review" / "data.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"pairs": pairs, "entries": entries, "persons": people},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return out


def apply_decisions(root: Path, path: Path) -> tuple[int, int]:
    """Sayfadan alınan {"a|b": "same"|"different"|...} kararlarını decisions.yml'e işler."""
    from .persons import read_decisions, write_decisions
    review = root / "review"
    same, diff = read_decisions(review)
    got = json.loads(path.read_text(encoding="utf-8"))
    ns = nd = 0
    for pid, k in got.items():
        a, b = pid.split("|")
        pr = _pair(a, b)
        if k == "same":
            same.add(pr), diff.discard(pr)
            ns += 1
        elif k == "different":
            diff.add(pr), same.discard(pr)
            nd += 1
    write_decisions(review, same, diff)
    return ns, nd

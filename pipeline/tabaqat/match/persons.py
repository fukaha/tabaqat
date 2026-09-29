"""Kümelerden şahıs kayıtları, onay dosyaları.

review/decisions.yml   insan kararları (kalıcı):  same: [[a, b], ...]  different: [[a, b], ...]
review/pending.yml     onay bekleyen çiftler (her koşuda yeniden yazılır). "karar" alanına
                       "aynı" ya da "farklı" yazılıp `tabaqat match` çalıştırılınca kararlar
                       decisions.yml'e taşınır.
data/persons.json      birleşik şahıs listesi
"""
from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import yaml

from .canon import death_note, heading, tidy
from .cluster import Link, _pair, cluster, demote_ambiguous, name_links, xref_links
from .records import Rec, load_records

BOOK_TITLE = {
    "ghuraf": "الغرف العلية", "qand": "القند", "jawahir": "الجواهر المضية",
    "tabaqat_saniyya": "الطبقات السنية", "taj_tarajim": "تاج التراجم", "kataib": "كتائب أعلام الأخيار",
    "athmar": "الأثمار الجنية", "fawaid": "الفوائد البهية",
}
BOOK_CODE = {"ghuraf": "gh", "qand": "qd", "jawahir": "jw", "tabaqat_saniyya": "ts",
             "taj_tarajim": "tj", "kataib": "kt", "athmar": "at", "fawaid": "fw"}
# Esas ad için kitap önceliği (Guref ve Kand muhakkik/müellif fihristinden)
NAME_PRIORITY = ["ghuraf", "qand", "jawahir", "tabaqat_saniyya", "taj_tarajim", "fawaid", "athmar",
                 "kataib"]
_YES = {"aynı", "ayni", "evet", "same", "نعم"}
_NO = {"farklı", "farkli", "hayır", "hayir", "different", "لا"}


def cite(r: Rec) -> str:
    pages = str(r.page_start) if r.page_end in (0, r.page_start) else f"{r.page_start}-{r.page_end}"
    vol = f"{r.vol}/" if r.book in ("jawahir", "tabaqat_saniyya", "kataib", "athmar", "ghuraf") else ""
    num = f" (رقم {r.number})" if r.number is not None else ""
    return f"{BOOK_TITLE[r.book]} {vol}{pages}{num}"


def _canonical(members: list[Rec]) -> tuple[str, int | None, str, int | None]:
    """→ (esas ad, vefat yılı, vefat notu, tahmini vefat)

    Vefat başlıkta yalnız güvenilirse yer alır: Guref fihristi, elle düzeltme ya da en az iki
    kaynağın (±1 yıl) uyuştuğu metin kaydı. Tek kaynaklı metin kaydı yalnız tahmin olarak kalır.
    """
    gh = [r for r in members if r.book == "ghuraf"]
    qd = [r for r in members if r.book == "qand" and r.name]
    if gh:
        name = min(gh, key=lambda x: x.seq).name
    elif qd:
        name = tidy(qd[0].name, False)
    else:
        def rank(r: Rec):  # en az üç halkalı nesep veren, öncelikli kitabın başlığı
            chain = len(r.names[0].chain) if r.names else 0
            return (-min(chain, 3), NAME_PRIORITY.index(r.book), r.secondary, r.seq)
        name = tidy(min(members, key=rank).name, dotless_ya=True)
    for r in gh:
        if r.death_note and r.death_note != "elle":
            return name, r.death, r.death_note, r.death
    manual = [r.death for r in members if r.death_note == "elle"]
    if manual:
        return name, manual[0], death_note(manual[0]), manual[0]
    # yüzler hanesi düşmüş okumalar ("سنة ست" → 6): 41'den küçük yıl yalnız Ketâib'in sahâbe bölümünde
    years = [r.death for r in members
             if r.death and (r.death >= 41 or (r.book == "kataib" and (r.number or 999) < 100))]
    if not years:
        return name, None, "", None
    support = {y: sum(1 for x in years if abs(x - y) <= 1) for y in years}
    best = max(support, key=lambda y: (support[y], years.count(y)))
    if support[best] >= 2:
        return name, best, death_note(best), best
    return name, None, "", Counter(years).most_common(1)[0][0]


def _anchor(members: list[Rec], dup_numbers: set) -> str:
    """Kalıcı kimlik: öncelikli kitaptaki maddenin numarası (jw974); numarasız ya da basılı
    nüshada tekrarlanan numarada kitap içi sıra (kt732_620, fws15)."""
    r = min(members, key=lambda x: (NAME_PRIORITY.index(x.book), x.secondary, x.seq))
    code = BOOK_CODE[r.book] + ("2" if r.book_id == "ghuraf_v2" and r.number is None else "")
    if r.number is None or r.series:
        return f"{code}s{r.seq}"
    if (r.book, r.number) in dup_numbers:
        return f"{code}{r.number}_{r.seq}"
    return f"{code}{r.number}"


def read_decisions(review: Path) -> tuple[set, set]:
    path = review / "decisions.yml"
    d = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else None
    d = d or {}
    same = {_pair(*p) for p in d.get("same") or []}
    diff = {_pair(*p) for p in d.get("different") or []}
    # pending.yml'e işlenmiş kararları al
    pend = review / "pending.yml"
    if pend.exists():
        for item in yaml.safe_load(pend.read_text(encoding="utf-8")) or []:
            k = str(item.get("karar") or "").strip().lower()
            pr = _pair(item["a"], item["b"])
            if k in _YES:
                same.add(pr)
                diff.discard(pr)
            elif k in _NO:
                diff.add(pr)
                same.discard(pr)
    return same, diff


def write_decisions(review: Path, same: set, diff: set) -> None:
    review.mkdir(parents=True, exist_ok=True)
    head = ("# İnsan kararları: aynı kişi (same) / farklı kişi (different) olan madde çiftleri.\n"
            "# Anahtar biçimi kitap:sıra (data/entries/<kitap>.json içindeki seq).\n")
    body = yaml.safe_dump({"same": [list(p) for p in sorted(same)],
                           "different": [list(p) for p in sorted(diff)]},
                          allow_unicode=True, default_flow_style=None, sort_keys=False)
    (review / "decisions.yml").write_text(head + body, encoding="utf-8")


def write_pending(review: Path, pending: list[Link], recs: dict[str, Rec], cid: dict[str, str]) -> None:
    items = []
    for i, ln in enumerate(sorted(pending, key=lambda l: (-l.sim, -l.score)), 1):
        a, b = recs[ln.a], recs[ln.b]
        items.append({
            "no": i, "karar": "", "a": ln.a, "b": ln.b,
            "a_ad": a.name[:120], "a_yer": cite(a), "a_vefat": a.death,
            "b_ad": b.name[:120], "b_yer": cite(b), "b_vefat": b.death,
            "a_sahis": cid[ln.a], "b_sahis": cid[ln.b],
            "tur": "atıf" if ln.kind == "xref" else "isim",
            "puan": round(ln.score, 1), "benzerlik": round(ln.sim, 2), "gerekce": ln.notes,
        })
    head = ("# Onay bekleyen eşleşmeler. \"karar\" alanına aynı / farklı yazın, sonra\n"
            "#   python -m tabaqat.cli match\n"
            "# çalıştırın: kararlar review/decisions.yml'e taşınır, bu dosya yeniden üretilir.\n")
    (review / "pending.yml").write_text(
        head + yaml.safe_dump(items, allow_unicode=True, sort_keys=False, width=200), encoding="utf-8")


@dataclass
class Result:
    recs: dict[str, Rec]
    persons: list[dict]
    cid: dict[str, str]          # madde anahtarı → şahıs kimliği
    links: list[Link]
    pending: list[Link]
    same: set
    diff: set


def build(root: Path) -> Result:
    recs = load_records(root)
    by_key = {r.key: r for r in recs}
    review = root / "review"
    same, diff = read_decisions(review)
    links = xref_links(recs) + name_links(recs)
    # aynı çift hem atıf hem isimle bulunduysa atıflı olan kalır
    best: dict[tuple, Link] = {}
    for ln in links:
        cur = best.get(ln.pair)
        if cur is None or (ln.status == "auto", ln.kind == "xref", ln.sim) > (cur.status == "auto", cur.kind == "xref", cur.sim):
            best[ln.pair] = ln
    links = list(best.values())
    demote_ambiguous(links, by_key)
    groups, pending = cluster(recs, links, same, diff)

    nums = Counter((r.book, r.number) for r in recs if r.number is not None and not r.series)
    dup_numbers = {k for k, n in nums.items() if n > 1}
    persons, cid = [], {}
    for g in groups:
        members = sorted((by_key[k] for k in g), key=lambda r: (NAME_PRIORITY.index(r.book), r.seq))
        pid = _anchor(members, dup_numbers)
        name, year, note, est = _canonical(members)
        for r in members:
            cid[r.key] = pid
        persons.append({
            "id": pid, "name": name, "death": note, "death_h": year, "death_est": est,
            "heading": heading(name, note),
            "sources": [{"key": r.key, "book": r.book_id, "number": r.number, "vol": r.vol,
                         "page_start": r.page_start, "page_end": r.page_end, "cite": cite(r),
                         "heading": r.name} for r in members],
        })
    persons.sort(key=lambda p: p["name"])
    assert len({p["id"] for p in persons}) == len(persons), "şahıs kimliği çakışması"
    return Result(by_key, persons, cid, links, pending, same, diff)


def run(root: Path) -> dict:
    res = build(root)
    persons, pending, links = res.persons, res.pending, res.links
    review = root / "review"
    (root / "data" / "persons.json").write_text(json.dumps(persons, ensure_ascii=False, indent=1),
                                                encoding="utf-8")
    write_decisions(review, res.same, res.diff)
    write_pending(review, pending, res.recs, res.cid)
    from .review import write_review_data
    write_review_data(root, pending, res.recs, res.cid, persons)
    multi = sum(1 for p in persons if len(p["sources"]) > 1)
    return {"entries": len(res.recs), "persons": len(persons), "multi_source": multi,
            "auto_links": sum(1 for l in links if l.status == "auto"), "pending": len(pending),
            "decisions": len(res.same) + len(res.diff)}

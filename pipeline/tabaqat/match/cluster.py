"""Kitaplar arası şahıs birleştirme (yarı otomatik).

1. Aday çiftler: muhakkik atıfları (güvenilir olduğu doğrulanmış türler) + isim bloklama.
2. Her çift sınıflanır: `auto` (kendiliğinden birleşir), `pending` (insan onayı bekler).
3. İnsan kararları (`review/decisions.yml`: same / different) her şeyin önündedir.
4. Birleştirme union-find ile, en güçlü bağdan başlayarak yapılır. Aynı kitabın iki asıl maddesi
   (tekrar niteliğindeki künye/nisbe bölümleri hariç) bir şahısta birleşemez; böyle bir bağ
   çakışma olarak onaya düşer. Böylece bir şahıs iki kez kaydedilmez, iki şahıs da karışmaz.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .records import BOOK_DEATH, LATE, Rec, compare, token_sim
from .xref import Resolver, parse_refs

# Doğrulamada tutarlı çıkan atıf türleri (kaynak, hedef, tür). Diğerleri başka baskılara gider
# (ör. Hulv'un Ketâib numaraları, Tâc'ın Bağdat baskısı sayfaları).
TRUSTED_REFS = {
    ("tabaqat_saniyya", "jawahir", "num"), ("jawahir", "tabaqat_saniyya", "num"),
    ("kataib", "jawahir", "vp"), ("athmar", "jawahir", "vp"), ("athmar", "tabaqat_saniyya", "vp"),
    ("athmar", "tabaqat_saniyya", "p"), ("kataib", "taj_tarajim", "p"),
    ("kataib", "tabaqat_saniyya", "num"), ("jawahir", "fawaid", "p"),
    ("tabaqat_saniyya", "fawaid", "p"), ("athmar", "fawaid", "p"),
}


@dataclass
class Link:
    a: str
    b: str
    kind: str            # "xref" | "name" | "human"
    status: str          # "auto" | "pending"
    score: float
    sim: float
    notes: list[str] = field(default_factory=list)

    @property
    def pair(self) -> tuple[str, str]:
        return (self.a, self.b) if self.a < self.b else (self.b, self.a)


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a < b else (b, a)


def xref_links(recs: list[Rec]) -> list[Link]:
    res = Resolver(recs)
    out = []
    for r in recs:
        for t in r.refs:
            for ref in parse_refs(t):
                kind = "num" if ref.number is not None else ("vp" if ref.vol else "p")
                if (r.book_id, ref.target, kind) not in TRUSTED_REFS:
                    continue
                cands = res.candidates(ref)
                if not cands:
                    continue
                # eşit ad benzerliğinde atıfın ilk sayfasında başlayan madde öne alınır
                best = max(cands, key=lambda x: (token_sim(r, x), x.page_start == ref.page,
                                                 compare(r, x).total))
                ts, sc = token_sim(r, best), compare(r, best)
                late = any("müellifinden" in n for n in sc.notes)
                # metinden çıkan vefat yılı hatalı olabilir: ad tam örtüşüyorsa atıf yeter
                clash = late or (any(n.startswith("vefat farklı") for n in sc.notes)
                                 and not (sc.matched >= 3 and ts >= 0.9))
                if ts >= 0.6 and not sc.ism_conflict and not clash and (sc.conflict < 0 or sc.total >= 4):
                    status = "auto"
                elif ts >= 0.4:
                    status = "pending"
                else:
                    continue  # atıf başka bir kişiye/baskıya gidiyor
                out.append(Link(r.key, best.key, "xref", status, sc.total, ts,
                                [f"atıf: {ref.text.strip()[:60]}"] + sc.notes))
    return out


def _block_keys(r: Rec) -> set[str]:
    keys = set()
    for p in r.names:
        if len(p.chain) >= 2:
            keys.add("c:" + p.chain[0] + "|" + p.chain[1])
        firsts = [p.chain[0]] if p.chain else []
        for n in p.nisbas:
            for f in firsts:
                keys.add(f"n:{f}|{n}")
            if p.kunya:
                keys.add(f"k:{p.kunya}|{n}")
            for lq in p.laqabs:
                keys.add(f"l:{lq}|{n}")
        if p.kunya and p.chain:
            keys.add(f"kc:{p.kunya}|{p.chain[0]}")
    return keys


def _can_pair(a: Rec, b: Rec) -> bool:
    if a.book != b.book:
        return True
    return a.secondary != b.secondary  # kitabın künye/nisbe bölümündeki tekrar


def name_links(recs: list[Rec], max_block: int = 400) -> list[Link]:
    blocks: dict[str, list[Rec]] = defaultdict(list)
    for r in recs:
        for k in _block_keys(r):
            blocks[k].append(r)
    seen: set[tuple[str, str]] = set()
    out = []
    for k, rs in blocks.items():
        if len(rs) < 2 or len(rs) > max_block:
            continue
        for i in range(len(rs)):
            for j in range(i + 1, len(rs)):
                a, b = rs[i], rs[j]
                pr = _pair(a.key, b.key)
                if pr in seen or not _can_pair(a, b):
                    continue
                seen.add(pr)
                sc = compare(a, b)
                if sc.conflict >= 0 and sc.conflict < 2:
                    continue
                ts = token_sim(a, b)
                status = None
                if sc.conflict < 0 and sc.total >= 4 and ts >= 0.6 and (sc.matched >= 2 or sc.total >= 5):
                    status = "auto"
                elif (sc.conflict >= 3 and sc.total >= 6 and ts >= 0.6
                      and any(n.startswith("nisbe") for n in sc.notes)
                      and not any(n.startswith("vefat farklı") for n in sc.notes)):
                    status = "auto"  # uzun nesebin derin halkasında yazım farkı
                elif sc.total >= 3 and ts >= 0.5 and sc.notes:
                    status = "pending"
                chainless = not any(p.chain for p in a.names) or not any(p.chain for p in b.names)
                if (chainless and ("künye" in sc.notes or "lakap" in sc.notes)
                        and any(n.startswith("nisbe") for n in sc.notes) and ts >= 0.99 and sc.total >= 2.5):
                    status = "auto"  # "ابو الحسن الكرخي" ↔ tam ad; aşağıda tekliği denetlenir
                if status == "auto" and _degenerate(a, b) and not any(
                        n.startswith("vefat ") and "farklı" not in n for n in sc.notes):
                    status = "pending"  # "محمد بن محمد بن محمد" + yaygın nisbe: vefatla doğrulanmalı
                if status:
                    out.append(Link(a.key, b.key, "name", status, sc.total, ts, sc.notes))
    _chainless_unique(out, {r.key: r for r in recs})
    return out


def _degenerate(a: Rec, b: Rec) -> bool:
    """İki maddeden birinin nesebi tek bir adın tekrarından ibaretse ("محمد بن محمد بن محمد")."""
    for r in (a, b):
        chains = [p.chain for p in r.names if p.chain]
        if chains and all(len(set(c)) == 1 for c in chains):
            return True
    return False


def _chainless_unique(links: list[Link], recs: dict[str, Rec]) -> None:
    """Zincirsiz (künye/lakap + nisbe) bir madde, adayları farklı kişilere (farklı ism) gidiyorsa
    otomatik bağlanmaz; iki kişiyi köprüleyip birleştirmesin."""
    by: dict[str, list[Link]] = defaultdict(list)
    for ln in links:
        for k in (ln.a, ln.b):
            if not any(p.chain for p in recs[k].names):
                by[k].append(ln)
    for k, group in by.items():
        targets = [recs[ln.b if ln.a == k else ln.a] for ln in group]
        isms = {t.names[0].chain[0] for t in targets if t.names and t.names[0].chain}
        if len(isms) > 1:
            for ln in group:
                if ln.status == "auto":
                    ln.status = "pending"
                    ln.notes.append("künye birden çok kişiye uyuyor")


def demote_ambiguous(links: list[Link], recs: dict[str, Rec]) -> None:
    """Bir madde aynı kitapta birden çok adaya otomatik bağlanıyorsa (belirgin fark yoksa)
    hepsi onaya düşer."""
    by: dict[tuple[str, str], list[Link]] = defaultdict(list)
    for ln in links:
        if ln.status != "auto":
            continue
        by[(ln.a, recs[ln.b].book)].append(ln)
        by[(ln.b, recs[ln.a].book)].append(ln)
    for group in by.values():
        if len(group) < 2:
            continue
        # xref'le desteklenenler, yalnız isimle kurulanlardan üstündür
        group.sort(key=lambda l: (l.kind == "xref", l.score), reverse=True)
        top, second = group[0], group[1]
        clear = (top.kind == "xref" and second.kind != "xref") or top.score - second.score >= 2
        for ln in group:
            if clear and ln is top:
                continue
            ln.status = "pending"
            ln.notes.append("aynı kitapta birden çok aday")


class UF:
    def __init__(self, keys):
        self.p = {k: k for k in keys}
        self.members = {k: {k} for k in keys}

    def find(self, k):
        while self.p[k] != k:
            self.p[k] = self.p[self.p[k]]
            k = self.p[k]
        return k

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if len(self.members[ra]) < len(self.members[rb]):
            ra, rb = rb, ra
        self.p[rb] = ra
        self.members[ra] |= self.members.pop(rb)


def _ism_clash(x: Rec, y: Rec) -> bool:
    """İki maddenin hiçbir ad biçimi ism'de uyuşmuyorsa (ikisinde de zincir varken) True."""
    if not any(p.chain for p in x.names) or not any(p.chain for p in y.names):
        return False
    return compare(x, y).ism_conflict


def _sure_death(keys: set[str], recs: dict[str, Rec]) -> int | None:
    """Kümenin güvenilir vefatı: fihrist/elle verilen ya da en az iki maddenin (±1) uyuştuğu yıl."""
    for k in keys:
        if recs[k].death_note:
            return recs[k].death
    years = [recs[k].death for k in keys if recs[k].death]
    sup = {y: sum(1 for x in years if abs(x - y) <= 1) for y in years}
    best = max(sup, key=sup.get, default=None)
    return best if best is not None and sup[best] >= 2 else None


def _conflict(ma: set[str], mb: set[str], recs: dict[str, Rec], different: set) -> str | None:
    books_a = {(recs[k].book, recs[k].secondary) for k in ma}
    for k in mb:
        r = recs[k]
        if not r.secondary and (r.book, False) in books_a:
            return f"{r.book} kitabında zaten başka bir madde var"
    for x in ma:
        for y in mb:
            if _pair(x, y) in different:
                return "insan kararı: farklı kişiler"
    for x in ma:
        for y in mb:
            if _ism_clash(recs[x], recs[y]):
                return f"ad uyuşmuyor: {recs[x].name[:30]} / {recs[y].name[:30]}"
    da, db = _sure_death(ma, recs), _sure_death(mb, recs)
    if da and db and abs(da - db) > 10:
        return f"vefat uyuşmuyor: {da}/{db}"
    books = {recs[k].book for k in ma | mb}
    for k in ma | mb:
        d = recs[k].death
        late = [b for b in books if d and d > BOOK_DEATH[b] + LATE]
        if late and recs[k].death_note:
            return f"vefat {d}: {late[0]} müellifinden çok sonra"
    return None


def cluster(recs: list[Rec], links: list[Link], same: set, different: set):
    """→ (kümeler: list[set[key]], onay bekleyen bağlar, çakışan otomatik bağlar)"""
    by_key = {r.key: r for r in recs}
    uf = UF(by_key)
    for a, b in same:
        if a in by_key and b in by_key:
            uf.union(a, b)
    decided = same | different
    order = sorted((l for l in links if l.status == "auto" and l.pair not in decided),
                   key=lambda l: (l.kind != "xref", -l.sim, -l.score))
    conflicts = []
    for ln in order:
        ra, rb = uf.find(ln.a), uf.find(ln.b)
        if ra == rb:
            continue
        why = _conflict(uf.members[ra], uf.members[rb], by_key, different)
        if why:
            ln.notes.append("çakışma: " + why)
            conflicts.append(ln)
            continue
        uf.union(ln.a, ln.b)
    pending = []
    seen = set()
    for ln in [l for l in links if l.status == "pending"] + conflicts:
        if ln.pair in decided or ln.pair in seen:
            continue
        if uf.find(ln.a) == uf.find(ln.b):
            continue  # başka yoldan zaten birleşti
        seen.add(ln.pair)
        pending.append(ln)
    return list(uf.members.values()), pending

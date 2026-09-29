"""Metinde anılan adı şahıs listesine bağlar.

Aday şahıslar ism, künye, nisbe, lakap ve şöhretle (ابن X) toplanır; nesep uyumuyla puanlanır ve
kronolojiyle süzülür (hoca, talebeden çok sonra ölmüş olamaz vb.). Tek ve belirgin aday yoksa
atıf "belirsiz" ya da "çözülemedi" kalır; review/aliases.yml elle eşleme verir.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from ..extract.names import ParsedName, parse_name
from ..normalize.arabic import normalize

# Hoca/talebe vefatları arasındaki makul fark (hicrî yıl)
TEACHER_AFTER = 25     # hoca, talebeden en çok bu kadar sonra ölmüş olabilir
TEACHER_BEFORE = 110   # hoca, talebeden en çok bu kadar önce ölmüş olabilir
_KUNYA_A = re.compile(r"(^| )ابا ")
# "@yakın" eşlemesi (tek başına "محمد" → İmam Muhammed): vefatlar yakınsa ya da cümlede Ebû Hanîfe'nin
# öteki ashabı da anılıyorsa ("تفقه على أبي يوسف ومحمد") uygulanır.
NEAR_MAX = 90
# Belirsiz atıflarda "yakın vefat": hoca talebeden en çok 10 yıl sonra, en çok 80 yıl önce ölmüş
NEAR_LO, NEAR_HI = -10, 80
_PEERS = re.compile(r"(?:ابي|ابو) يوسف|زفر|الحسن بن زياد")


@dataclass
class Person:
    pid: str
    names: list[ParsedName]
    death: int | None
    n_sources: int
    sure: bool = True            # vefat güvenilir mi (fihrist / iki kaynak)
    headings: list[str] = field(default_factory=list)   # şöhret başlıkları ("أبو علي النسفي")


@dataclass
class Resolution:
    pid: str | None
    status: str                  # resolved | ambiguous | unresolved | external
    score: float = 0
    how: str = ""                # hangi ad unsurlarıyla
    candidates: list[str] = field(default_factory=list)
    scored: list[tuple] = field(default_factory=list)   # (puan, kaynak sayısı, pid, nasıl)
    reason: str = ""             # çözülemediyse neden
    external: tuple | None = None   # (dış kişi adı, vefat)


@dataclass
class External:
    name: str
    death: int


def clean_mention(s: str) -> str:
    """Liste bölünmesinden kalan artıklar: "عن X", "بن المديني", "الطحاوي فأكثر"."""
    s = re.sub(r"^عن ", "", s)
    s = re.sub(r"^بن ", "ابن ", s)
    s = re.sub(r" (?:فاكثر|فاكثر عنه|واكثر|الكثير|كثيرا)$", "", s)
    s = re.sub(r"(?:^| )(?:بن|ابن|ابو|ابي)$", "", s)  # yarım kalmış ad: "جعفر بن"
    return s.strip()


def prep(s: str) -> str:
    s = normalize(s)
    s = _KUNYA_A.sub(lambda m: m.group(1) + "ابو ", s)
    s = re.sub(r"\bالمعروف (?:ب)?", "", s)
    return s.strip()


def _exact_key(s: str) -> str:
    s = prep(s)
    s = re.sub(r"^\[?[\d٠-٩]+ ?[-.] ?|[\[\]()«»،,.]", " ", s)
    s = re.sub(r"(^| )ابي ", r"\1ابو ", s)
    s = re.sub(r"^(?:الشيخ|الامام|القاضي|الفقيه|المولي|السيد|العلامه) ", "", s.strip())
    return re.sub(r"\s+", " ", s).strip()


class Resolver:
    def __init__(self, persons: list[Person], aliases: dict[str, str] | None = None,
                 externals: dict[str, list[External]] | None = None):
        self.persons = {p.pid: p for p in persons}
        self.aliases = {prep(k): v for k, v in (aliases or {}).items()}
        self.externals = {prep(k): v for k, v in (externals or {}).items()}
        self.by_ism: dict[str, set] = defaultdict(set)
        self.by_kunya: dict[str, set] = defaultdict(set)
        self.by_nisba: dict[str, set] = defaultdict(set)
        self.by_laqab: dict[str, set] = defaultdict(set)
        self.by_chain2: dict[tuple, set] = defaultdict(set)
        self.by_exact: dict[str, set] = defaultdict(set)
        for p in persons:
            if (p.n_sources == 1 and all(len(_exact_key(h).split()) == 1 for h in p.headings)
                    and all(not n.chain and not n.kunya for n in p.names)):
                continue  # Esmâr'ın nisbe açıklamaları ("الدمياطي: نسبة إلى…"): şahıs değil
            for h in p.headings:
                h = _exact_key(h)
                # yalnız künyeden ibaret başlık ("أبو بكر") tam ad sayılmaz
                if len(h.split()) >= 2 and not re.fullmatch(r"(?:ابو|ام) (?:عبد )?\S+", h):
                    self.by_exact[h].add(p.pid)
            for n in p.names:
                if n.chain:
                    self.by_ism[n.chain[0]].add(p.pid)
                if len(n.chain) >= 2:
                    self.by_chain2[(n.chain[0], n.chain[1])].add(p.pid)
                if n.kunya:
                    self.by_kunya[n.kunya].add(p.pid)
                for x in n.nisbas:
                    self.by_nisba[x].add(p.pid)
                for x in n.laqabs:
                    self.by_laqab[x].add(p.pid)
        self.isms = set(self.by_ism)

    # --- puan -------------------------------------------------------------------------------
    @staticmethod
    def _score(m: ParsedName, cand: Person) -> tuple[float, str]:
        best, how = -1.0, ""
        for n in cand.names:
            s, parts = 0.0, []
            if m.chain and n.chain:
                k = 0
                while k < min(len(m.chain), len(n.chain)) and m.chain[k] == n.chain[k]:
                    k += 1
                if k < min(len(m.chain), len(n.chain)):
                    continue  # nesep çelişkisi
                if k:
                    s += 2 + 3 * (k - 1)
                    parts.append(f"nesep{k}")
            elif m.chain and not n.chain:
                continue
            if m.kunya and n.kunya:
                if m.kunya == n.kunya:
                    s += 2
                    parts.append("künye")
                else:
                    s -= 1
            common = m.nisbas & n.nisbas
            if common:
                s += 2 * len(common) + (1 if any(x.startswith("ابن ") for x in common) else 0)
                parts.append("nisbe")
            elif m.nisbas and n.nisbas and len(m.chain) < 3:
                s -= 2  # nisbeler çelişiyor
            if m.laqabs & n.laqabs:
                s += 2
                parts.append("lakap")
            if s > best:
                best, how = s, "+".join(parts)
        return best, how

    def _candidates(self, m: ParsedName) -> set[str]:
        c: set[str] = set()
        if len(m.chain) >= 2:
            c |= self.by_chain2.get((m.chain[0], m.chain[1]), set())
        elif m.chain:
            c |= self.by_ism.get(m.chain[0], set())
        if m.kunya:
            c |= self.by_kunya.get(m.kunya, set()) if not m.chain else set()
        for x in m.nisbas:
            c |= self.by_nisba.get(x, set()) if not m.chain or len(m.chain) == 1 else set()
        for x in m.laqabs:
            c |= self.by_laqab.get(x, set())
        return c

    @staticmethod
    def _chrono_ok(cand: Person, subj: Person, role: str) -> bool:
        if not cand.death or not subj.death:
            return True
        slack = 0 if cand.sure and subj.sure else 40  # tek kaynaklı vefat okuması yanlış olabilir
        d = cand.death - subj.death
        if role == "teacher":
            return -TEACHER_BEFORE - slack <= d <= TEACHER_AFTER + slack
        return -TEACHER_AFTER - slack <= d <= TEACHER_BEFORE + slack

    @staticmethod
    def _near(cand: Person, subj: Person, role: str) -> bool:
        """Hoca talebeden önce, en çok NEAR_MAX yıl önce ölmüş (birkaç yıl pay)."""
        if not cand.death or not subj.death:
            return False
        d = subj.death - cand.death if role == "teacher" else cand.death - subj.death
        return -5 <= d <= NEAR_MAX

    def resolve(self, text: str, role: str, subject: Person | None,
                chain: bool = False, context: str = "", kin: bool = False) -> Resolution:
        s = clean_mention(prep(text))
        for key in (s, "@zincir " + s if chain else None):
            if key and key in self.aliases:
                pid = self.aliases[key]
                # elle eşleme de kronolojiye uymalı: "والجوزجاني تلميذ محمد بن الحسن" gibi
                # başka birini anlatan cümle 4. asır madde sahibine bağlanmasın
                if subject is None or pid == subject.pid or self._chrono_ok(
                        self.persons[pid], subject, role):
                    return Resolution(pid, "resolved", 9, "elle")
                return Resolution(None, "unresolved", reason="vefat uymuyor")
        pid = self.aliases.get("@yakın " + s)
        if pid and subject is not None and not kin and (
                pid == subject.pid or self._near(self.persons[pid], subject, role)
                or (not subject.death and _PEERS.search(prep(context)))):
            return Resolution(pid, "resolved", 7, "elle+yakın")
        r = self._exact(s, role, subject)
        if r:
            return r
        m = parse_name(s)
        if len(m.chain) == 1 and m.chain[0].startswith("ال") and (m.nisbas or m.laqabs):
            m.nisbas.add(m.chain.pop())  # "الجمال الملطي": ism değil
        if m.chain and re.fullmatch(r"\S+ (?:الدين|الايمه|الاسلام|المله|الشريعه)", m.chain[0]):
            m.laqabs.add(m.chain.pop(0))  # "أكمل الدين": lakap
        if not (m.chain or m.kunya or m.nisbas or m.laqabs):
            return Resolution(None, "unresolved")
        scored = []
        for pid in self._candidates(m):
            if subject and pid == subject.pid:
                continue
            p = self.persons[pid]
            if subject and not self._chrono_ok(p, subject, role):
                continue
            sc, how = self._score(m, p)
            if sc > 0:
                scored.append((sc, p.n_sources, pid, how))
        if not scored:
            return Resolution(None, "unresolved")
        scored.sort(reverse=True)
        top = scored[0]
        same_top = [x for x in scored if x[0] == top[0]]
        cands = [x[2] for x in scored[:5]]
        full = scored[:10]
        # Zayıf eşleşme (yalnız nisbe ya da lakap): tek, belirgin ve çok kaynaklı aday gerekir;
        # yalnız ism ya da yalnız künye hiçbir zaman yetmez.
        weak = top[0] < 4
        second = scored[1][0] if len(scored) > 1 else -99
        if len(same_top) == 1 and not weak and top[0] - second >= 1:
            return Resolution(top[2], "resolved", top[0], top[3], cands, full)
        if (len(same_top) == 1 and weak and ("nisbe" in top[3] or "lakap" in top[3])
                and top[1] >= 2 and top[0] - second >= 2):
            return Resolution(top[2], "resolved", top[0], top[3] + "+zayıf", cands, full)
        # eşit puanda kaynak sayısı belirgin üstünse (meşhur kişi) kabul: "الطحاوي"
        if len(same_top) > 1 and same_top[0][1] >= 3 and same_top[1][1] <= 1 and (
                not weak or "nisbe" in top[3]):
            return Resolution(top[2], "resolved", top[0], top[3] + "+meşhur", cands, full)
        return Resolution(None, "ambiguous", top[0], top[3], cands, full)

    # --- vefat yakınlığı, dış kişiler, çapraz kayıt ---------------------------------------
    @staticmethod
    def gap(cand_death: int | None, subj: Person | None, role: str) -> int | None:
        """Talebenin vefatı − hocanın vefatı."""
        if not cand_death or subj is None or not subj.death:
            return None
        return subj.death - cand_death if role == "teacher" else cand_death - subj.death

    def chron(self, pid: str, subj: Person | None, role: str) -> str:
        g = self.gap(self.persons[pid].death, subj, role)
        if g is None:
            return "?"
        return "near" if NEAR_LO <= g <= NEAR_HI else "far"

    def external(self, text: str, role: str, subject: Person | None,
                 has_candidates: bool) -> External | None:
        exts = self.externals.get(clean_mention(prep(text)))
        if not exts:
            return None
        if subject is not None and subject.death:
            fit = [e for e in exts
                   if NEAR_LO <= (self.gap(e.death, subject, role) or 999) <= NEAR_HI]
            return fit[0] if len(fit) == 1 else None
        # vefat bilinmiyorsa: ad tek bir dış kişiye aitse ve aynı adda Hanefî aday yoksa
        return exts[0] if len(exts) == 1 and not has_candidates else None

    def disambiguate(self, r: Resolution, text: str, role: str, subject: Person | None,
                     linked: set[str], recip) -> Resolution:
        """Belirsiz atıf: çapraz kayıt (aynı kişiyle başka yerde kurulmuş bağ ya da adayın
        maddesinde öznenin anılması), yakın vefat ve şöhret sırasıyla tek aday aranır."""
        if not r.scored:
            return r
        m = parse_name(clean_mention(prep(text)))
        ism_only = len(m.chain) <= 1 and not (m.kunya or m.nisbas or m.laqabs)
        best = r.scored[0][0]
        if best < 2:  # künye çelişkisi ya da tek zayıf unsur
            return Resolution(None, "ambiguous", r.score, r.how, r.candidates, r.scored,
                              reason="ad uyumu zayıf")
        pool = [(sc, n, pid) for sc, n, pid, _ in r.scored if sc == best]
        ch = {pid: self.chron(pid, subject, role) for _, _, pid in pool}
        ok = [x for x in pool if ch[x[2]] != "far"]

        def done(x, how):
            return Resolution(x[2], "resolved", x[0], how, r.candidates, r.scored)

        def fail(reason):
            return Resolution(None, "ambiguous", r.score, r.how, r.candidates, r.scored,
                              reason=reason)

        # yalnız ism ("أحمد") için adayın maddesinde anılmak yetmez; önceki bağ gerekir
        cross = [x for x in ok if x[2] in linked or (not ism_only and recip(x[2]))]
        if len(cross) == 1:
            return done(cross[0], "çapraz kayıt")
        if cross:
            ok = cross
        if ism_only and not cross:
            return fail("yalnız ism")
        if not ok:
            return fail("vefat uymuyor")

        def famous(xs):
            xs = sorted(xs, key=lambda x: -x[1])
            if xs[0][1] >= 3 and (len(xs) == 1 or xs[1][1] <= xs[0][1] - 2):
                return xs[0]
            return None

        near = [x for x in ok if ch[x[2]] == "near"]
        unknown = [x for x in ok if ch[x[2]] == "?"]
        if len(near) == 1:
            x = near[0]
            if all(u[1] < x[1] or (x[1] >= 2 and u[1] == 1) for u in unknown):
                return done(x, "yakın vefat")
            return fail("vefatı bilinmeyen aday var")
        if len(near) > 1:
            x = famous(near)
            return done(x, "yakın vefat+meşhur") if x else fail("birden çok yakın aday")
        x = famous(ok)
        if x:
            return done(x, "meşhur")
        return fail("vefat bilinmiyor" if subject is None or not subject.death
                    else "adayların vefatı bilinmiyor")

    def _exact(self, s: str, role: str, subject: Person | None) -> Resolution | None:
        """Şöhret başlığıyla tam eşleşme; "أبي عبد الله أبي حفص الصغير" gibi önekli biçimde
        sondaki parçalar da denenir."""
        words = _exact_key(s).split()
        # yalnız baştaki künye ("ابو عبد الله") ya da lakap ("نجم الدين") atlanabilir
        starts, i = [0], 0
        while i < len(words) - 2:
            if words[i] == "ابو":
                i += 3 if words[i + 1] == "عبد" else 2
            elif words[i + 1] in ("الدين", "الايمه", "الاسلام", "المله", "الشريعه"):
                i += 2
            else:
                break
            starts.append(i)
        for i in starts:
            key = " ".join(words[i:])
            if len(words) - i < 2:
                continue
            named = [self.persons[pid] for pid in self.by_exact.get(key, set())
                     if not subject or pid != subject.pid]
            hits = [p for p in named if not subject or self._chrono_ok(p, subject, role)]
            if named and not hits:
                # ad tam olarak bir kişiye ait ama vefat uymuyor ("روي عن أبي بكر الصديق" gibi
                # nakil): başka bir adaya kaydırılmaz
                return Resolution(None, "unresolved", reason="vefat uymuyor")
            if not hits:
                continue
            if len(hits) > 1:  # künye bölümündeki eşlenmemiş tekrar madde: çok kaynaklı olan
                multi = [p for p in hits if p.n_sources >= 2]
                hits = multi if len(multi) == 1 else hits
            if len(hits) == 1:
                return Resolution(hits[0].pid, "resolved", 8, "tam ad")
            return None
        return None

    # --- akrabalık --------------------------------------------------------------------------
    def kin(self, kin: str, name: str, subject: Person) -> Resolution:
        chains = [n.chain for n in subject.names if len(n.chain) >= 2]
        if not chains:
            return Resolution(None, "unresolved", how="akraba")
        chain = max(chains, key=len)
        target: list[str] | None = None
        nm = parse_name(prep(name)).chain[:1] if name else []
        if kin == "father":
            target = chain[1:]
        elif kin == "grandfather" and len(chain) >= 3:
            target = chain[2:]
        elif kin in ("son", "daughter") and nm:
            target = nm + chain
        elif kin == "brother" and nm:
            target = nm + chain[1:]
        elif kin == "grandson" and nm:
            target = None
        if not target:
            return Resolution(None, "unresolved", how="akraba")
        best: dict[str, int] = {}
        for p in self.persons.values():
            if p.pid == subject.pid:
                continue
            for n in p.names:
                k = 0
                while k < min(len(n.chain), len(target)) and n.chain[k] == target[k]:
                    k += 1
                if k >= 2 and k == min(len(n.chain), len(target)):
                    if kin in ("father", "grandfather", "uncle") and not self._chrono_ok(
                            p, subject, "teacher"):
                        continue
                    best[p.pid] = max(best.get(p.pid, 0), k)
        top = max(best.values(), default=0)
        hits = {pid for pid, k in best.items() if k == top}
        if len(hits) == 1:
            return Resolution(hits.pop(), "resolved", 6, f"akraba:{kin}")
        return Resolution(None, "ambiguous" if hits else "unresolved", how=f"akraba:{kin}",
                          candidates=sorted(hits)[:5])

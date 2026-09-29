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
    def __init__(self, persons: list[Person], aliases: dict[str, str] | None = None):
        self.persons = {p.pid: p for p in persons}
        self.aliases = {prep(k): v for k, v in (aliases or {}).items()}
        self.by_ism: dict[str, set] = defaultdict(set)
        self.by_kunya: dict[str, set] = defaultdict(set)
        self.by_nisba: dict[str, set] = defaultdict(set)
        self.by_laqab: dict[str, set] = defaultdict(set)
        self.by_chain2: dict[tuple, set] = defaultdict(set)
        self.by_exact: dict[str, set] = defaultdict(set)
        for p in persons:
            for h in p.headings:
                h = _exact_key(h)
                if len(h.split()) >= 2:
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

    def resolve(self, text: str, role: str, subject: Person | None,
                chain: bool = False) -> Resolution:
        s = prep(text)
        for key in (s, "@zincir " + s if chain else None):
            if key and key in self.aliases:
                return Resolution(self.aliases[key], "resolved", 9, "elle")
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
        # Zayıf eşleşme (yalnız nisbe ya da lakap): tek, belirgin ve çok kaynaklı aday gerekir;
        # yalnız ism ya da yalnız künye hiçbir zaman yetmez.
        weak = top[0] < 4
        second = scored[1][0] if len(scored) > 1 else -99
        if len(same_top) == 1 and not weak and top[0] - second >= 1:
            return Resolution(top[2], "resolved", top[0], top[3], cands)
        if (len(same_top) == 1 and weak and ("nisbe" in top[3] or "lakap" in top[3])
                and top[1] >= 2 and top[0] - second >= 2):
            return Resolution(top[2], "resolved", top[0], top[3] + "+zayıf", cands)
        # eşit puanda kaynak sayısı belirgin üstünse (meşhur kişi) kabul: "الطحاوي"
        if len(same_top) > 1 and same_top[0][1] >= 3 and same_top[1][1] <= 1 and (
                not weak or "nisbe" in top[3]):
            return Resolution(top[2], "resolved", top[0], top[3] + "+meşhur", cands)
        return Resolution(None, "ambiguous", top[0], top[3], cands)

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
            hits = [self.persons[pid] for pid in self.by_exact.get(key, set())
                    if not subject or (pid != subject.pid
                                       and self._chrono_ok(self.persons[pid], subject, role))]
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

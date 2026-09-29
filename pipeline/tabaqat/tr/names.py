"""Arapça şahıs adlarını TDV İslâm Ansiklopedisi (DİA) yazım usulüyle Türkçeye aktarır.

Ad önce parçalarına ayrılır (lakap, künye, nesep, nisbeler, şöhret); unvanlar ve
tavsifler atılır. Her parça `review/tr/*.tsv` sözlüklerinden okunur; sözlükte olmayan
kelime `unknown` kümesine yazılır ve adda atlanır. DİA düzeni:

    Lakap Künye İsim b. Baba b. Dede nisbeler     (ör. Burhâneddin Ebü’l-Hasen Alî b. Ebî Bekr
                                                   el-Fergānî el-Merginânî)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

HARAKAT = re.compile("[ً-ْٰـ]")
SUN = set("تثدذرزسشصضطظلن")
SUN_TR = {"ت": "t", "ث": "s", "د": "d", "ذ": "z", "ر": "r", "ز": "z", "س": "s", "ش": "ş",
          "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ل": "l", "ن": "n"}

# adda atlanan unvan ve tavsifler
TITLES = set("""الإمام الامام العلامة الشيخ الفقيه القاضي الحافظ المحدث المفتي الأمير الامير المقرئ المقري
النحوي الأصولي الاصولي الزاهد الواعظ الأديب الاديب المتكلم الصوفي العالم الكبير الصغير الأكبر
الأصغر الحنفي الشافعي المالكي الحنبلي المفسر الخطيب المدرس الرئيس الفاضل الشهيد الأجل الاجل
المعمر المسند الثقة العارف الولي السيد الشريف الأوحد البارع المحقق المدقق الصالح الورع العابد
المؤرخ المتفنن الإمامُ المولى الفرضي اللغوي الطبيب الكاتب الوزير السلطان الملك""".split())
KNOWN_AS = {"المعروف", "المشهور", "الشهير", "عرف", "يعرف", "ويعرف", "وعرف", "الملقب", "يلقب",
            "لقبه", "المنعوت", "المدعو", "المكنى"}
STOP = {"هو", "وقيل", "قيل", "ويقال", "يقال", "صاحب", "أحد", "احد", "من", "في", "والد", "ولد",
        "أخو", "اخو", "رحمه", "الله", "تعالى", "نسبة", "إلى", "الى", "المتوفى", "سنة", "وهو"}
LAQAB_TAIL = {"الدين", "الأئمة", "الائمة", "الإسلام", "الاسلام", "الشريعة", "القضاة", "الملة", "الحق"}
TR_UP = str.maketrans({"i": "İ", "ı": "I"})


def strip(s: str) -> str:
    s = HARAKAT.sub("", s)
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    s = re.sub(r"\bعبد(?=ال)", "عبد ", s)
    s = re.sub(r"(?<![^\s])(أبو|ابو)(?=[^\s])", r"\1 ", s)
    s = s.replace("أ", "أ").replace("ـ", "")
    return s


def cap(s: str) -> str:
    return s[:1].translate(TR_UP).upper() + s[1:] if s else s


def load_tsv(path: Path) -> dict[str, str]:
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "\t" not in line:
            continue
        a, b = line.split("\t", 1)
        out[strip(a).strip()] = b.strip()
    return out


@dataclass
class Parts:
    laqab: list[str] = field(default_factory=list)
    kunya: list[str] = field(default_factory=list)      # ["أبو", "الحسن"]
    nasab: list[list[str]] = field(default_factory=list)  # her halka bir kelime listesi
    nisba: list[str] = field(default_factory=list)
    shuhra: list[str] = field(default_factory=list)
    known: bool = False            # şöhret "المعروف ب…" gibi açıkça verilmiş


def _is_article(w: str) -> bool:
    return w.startswith("ال") and len(w) > 3


class Namer:
    def __init__(self, root: Path):
        d = root / "review" / "tr"
        self.ism = load_tsv(d / "ism.tsv")            # محمد → Muhammed  (makaleli ad: الحسن → Hasan)
        self.nisba = load_tsv(d / "nisba.tsv")        # بخاري → Buhârî  (makalesiz)
        self.laqab = load_tsv(d / "laqab.tsv")        # شمس الدين → Şemseddin
        self.kunya = load_tsv(d / "kunya.tsv")        # أبو الحسن → Ebü’l-Hasen (istisnalar)
        self.full = load_tsv(d / "override.tsv")      # kişi kimliği → tam ad | kısa ad
        self.laqab_first = {k.split()[0] for k in self.laqab}
        self.unknown: dict[str, dict[str, int]] = {}

    # ---------- ayrıştırma ----------
    def parse(self, name: str) -> Parts:
        s = strip(name)
        toks = [t for t in re.split(r"[\s،,.:؛;\-–—]+", s) if t and not re.fullmatch(r"[\d٠-٩]+|و", t)]
        P, i, n = Parts(), 0, len(toks)

        def name_unit(j):
            """j'de bir ad birimi (isim, عبد X, أبو X) varsa (kelimeler, sonraki indeks)."""
            if j >= n:
                return None, j
            w = toks[j]
            if w in {"عبد", "عبيد"} and j + 1 < n:
                return [w, toks[j + 1]], j + 2
            if j + 1 < n and toks[j + 1] == "الله" and f"{w} الله" in self.ism:
                return [f"{w} الله"], j + 2
            if w in {"أبو", "ابو", "أبي", "ابي", "أبا"} and j + 1 < n:
                if toks[j + 1] in {"عبد", "عبيد"} and j + 2 < n:
                    return [w, toks[j + 1], toks[j + 2]], j + 3
                return [w, toks[j + 1]], j + 2
            if w in TITLES or w in KNOWN_AS or w in STOP or w in {"بن", "ابن"}:
                return None, j
            return [w], j + 1

        rest = []
        while i < n:
            w = toks[i]
            if w in KNOWN_AS and i + 1 < n and (toks[i + 1].startswith("ب") or w in {"الملقب", "يلقب", "لقبه", "المنعوت", "المدعو", "المكنى"}):
                j = i + 1
                if toks[j] in {"ب", "بـ"}:
                    j += 1
                x = toks[j]
                if x.startswith("ب") and len(x) > 2 and x not in self.laqab_first and (w not in {"الملقب", "يلقب", "لقبه", "المنعوت", "المدعو", "المكنى"}
                                                          or x[1:3] == "ال" or x[1:] in self.ism or x[1:] in self.laqab_first):
                    x = x[1:]
                sh = [x]
                j += 1
                if j < n and (toks[j] in LAQAB_TAIL or toks[j] in {"زاده", "باشا", "بك", "بيك", "خان", "جلبي", "أفندي"}
                              or sh[0] in {"ابن", "أبي", "ابي"}):
                    sh.append(toks[j]); j += 1
                if sh[-1] in {"الدين", "الأئمة", "الائمة", "الإسلام"}:
                    P.laqab.append(" ".join(sh))
                else:
                    P.shuhra.insert(0, " ".join(sh))
                    P.known = True
                i = j
                continue
            if i + 1 < n and toks[i + 1] in LAQAB_TAIL and not _is_article(w) or f"{w} {toks[i + 1] if i + 1 < n else ''}" in self.laqab:
                P.laqab.append(f"{w} {toks[i + 1]}")
                i += 2
                continue
            if (w in {"أبو", "ابو"} or (i == 0 and w in {"أبي", "ابي", "أبا"})) and not P.kunya:
                u, j = name_unit(i)
                P.kunya = u
                i = j
                continue
            if not P.nasab and w not in TITLES and w not in STOP and w not in {"بن", "ابن"} \
                    and not (_is_article(w) and w.endswith("ي")):
                u, j = name_unit(i)
                if u:
                    chain = [u]
                    while j < n and toks[j] in {"بن", "ابن"}:
                        u2, j2 = name_unit(j + 1)
                        if not u2:
                            break
                        chain.append(u2)
                        j = j2
                    if len(chain) > 1 or not _is_article(w):
                        P.nasab = chain
                        i = j
                        continue
            if w == "ابن" and i + 1 < n and P.nasab and (toks[i + 1] in TITLES or toks[i + 1] in {"قاضي", "شيخ", "أخي", "أخت", "عم", "بنت"}):
                break      # "ابن الشيخ …", "ابن قاضي القضاة …": babanın tavsifi
            if w == "ابن" and i + 1 < n:
                u, j = name_unit(i + 1)
                if not u:
                    u, j = [toks[i + 1]], i + 2
                if u:
                    P.shuhra.append("ابن " + " ".join(u))
                    i = j
                    continue
            if _is_article(w) and w.endswith("ي") and w not in TITLES:
                P.nisba.append(w)
            elif i + 1 < n and toks[i + 1] == "زاده":
                P.shuhra.append(f"{w} زاده")
                i += 2
                continue
            elif w not in TITLES and w not in STOP:
                rest.append(w)
            i += 1
        if not P.nasab and rest and not P.shuhra and not P.kunya:
            P.shuhra.append(" ".join(rest[:3]))
        return P

    # ---------- aktarma ----------
    def _miss(self, cat, w):
        self.unknown.setdefault(cat, {}).setdefault(w, 0)
        self.unknown[cat][w] += 1

    def art(self, w: str, stem: str) -> str:
        """Makale: el-Buhârî, es-Semerkandî, eş-Şeybânî."""
        c = w[2:3]
        return f"e{SUN_TR[c]}-{stem}" if c in SUN else f"el-{stem}"

    def ism_tr(self, w: str) -> str | None:
        v = self.ism.get(w) or (self.ism.get(w[2:]) if _is_article(w) else None)
        if v == "-":
            return None
        if v:
            return v
        self._miss("ism", w)
        return None

    def abd(self, u: list[str], gen: bool) -> str | None:
        """عبد الله → Abdullah / (b.) Abdillâh; عبد العزيز → Abdülazîz / Abdilazîz."""
        key = " ".join(u)
        if key in self.ism and not gen:
            return self.ism[key]
        if key + " #gen" in self.ism and gen:
            return self.ism[key + " #gen"]
        head, x = u[0], u[1]
        stem = self.ism.get(x[2:] if _is_article(x) else x)
        if stem is None:
            self._miss("ism", x)
            return None
        stem = {"İ": "i", "I": "ı"}.get(stem[0], stem[0].lower()) + stem[1:]
        pre = "Ubeyd" if head == "عبيد" else "Abd"
        if _is_article(x):
            c = x[2:3]
            art = SUN_TR[c] if c in SUN else "l"
            v = "i" if gen else ("u" if head == "عبيد" else "ü")
            return f"{pre}{v}{art}{stem}"
        return f"{pre}{'i' if gen else 'ü'}{stem}"

    def unit(self, u: list[str], gen: bool = False) -> str | None:
        if u[0] in {"أبو", "ابو", "أبي", "ابي", "أبا"} and len(u) > 1:
            key = "أبو " + " ".join(u[1:])
            if key in self.kunya:
                k = self.kunya[key]
                return k.replace("Ebû", "Ebî").replace("Ebü’l-", "Ebi’l-") if gen else k
            x = u[1:]
            if x[0] in {"عبد", "عبيد"} and len(x) > 1:
                inner = self.abd(x, True)
                return inner and (f"Ebî {inner}" if gen else f"Ebû {inner}")
            if _is_article(x[0]):
                stem = self.ism_tr(x[0])
                if not stem:
                    return None
                c = x[0][2:3]
                if c in SUN:
                    return f"Eb{'i' if gen else 'ü'}’{SUN_TR[c]}-{stem}"
                return f"{'Ebi' if gen else 'Ebü'}’l-{stem}"
            stem = self.ism_tr(x[0])
            return stem and (f"Ebî {stem}" if gen else f"Ebû {stem}")
        if u[0] in {"عبد", "عبيد"} and len(u) > 1:
            return self.abd(u, gen)
        return self.ism_tr(u[0])

    def nisba_tr(self, w: str) -> str | None:
        stem = self.nisba.get(w[2:]) or self.nisba.get(w)
        if stem == "-":
            return None
        if stem is None:
            self._miss("nisba", w)
            return None
        return stem if stem.startswith(("el-", "e")) and "-" in stem[:4] else self.art(w, stem)

    def laqab_tr(self, s: str) -> str | None:
        for k in (s, s[1:], s[2:]):
            if k in self.laqab:
                v = self.laqab[k]
                return None if v == "-" else v
        self._miss("laqab", s)
        return None

    def shuhra_tr(self, s: str) -> str | None:
        if s in self.laqab:
            return self.laqab[s]
        w = s.split()
        if w[0] == "ابن" and len(w) > 1:
            x = self.unit(w[1:], gen=True) if w[1] in {"أبي", "ابي", "أبو", "عبد", "عبيد"} else None
            if x is None and len(w) == 2:
                if _is_article(w[1]):
                    stem = self.ism.get(w[1][2:]) or self.nisba.get(w[1][2:])
                    if stem is None:
                        self._miss("ism", w[1])
                        return None
                    c = w[1][2:3]
                    return f"İbnü’{SUN_TR[c]}-{stem}" if c in SUN else f"İbnü’l-{stem}"
                stem = self.ism_tr(w[1])
                return stem and f"İbn {stem}"
            return x and f"İbn {x}"
        if len(w) == 2 and w[1] == "زاده":
            stem = self.ism.get(w[0]) or self.nisba.get(w[0])
            if not stem or stem == "-":
                self._miss("ism", w[0])
                return None
            return f"{stem}zâde"
        out = []
        for x in w:
            t = self.ism.get(x) or (self.nisba_tr(x) if _is_article(x) else self.ism_tr(x))
            if not t:
                return None
            out.append(t)
        return " ".join(out)

    def render(self, name: str, pid: str = "") -> tuple[str, str]:
        """(tam ad, kısa ad)."""
        if pid in self.full:
            full, _, short = self.full[pid].partition("|")
            if full.strip():
                return full.strip(), (short.strip() or full.strip())
            return self.render(name)[0], short.strip()
        P = self.parse(name)
        parts = []
        lq = [x for x in (self.laqab_tr(l) for l in P.laqab) if x][:1]
        parts += lq
        ku = self.unit(P.kunya) if P.kunya else None
        if ku:
            parts.append(ku)
        nas = []
        for k, u in enumerate(P.nasab[:3]):
            t = self.unit(u, gen=k > 0)
            if not t:
                break
            nas.append(t)
        if nas:
            parts.append(" b. ".join(nas))
        nis = [x for x in (self.nisba_tr(w) for w in dict.fromkeys(P.nisba)) if x][:3]
        parts += nis
        sh = [x for x in (self.shuhra_tr(s) for s in P.shuhra[:1]) if x]
        if not nas and not ku and sh:
            parts += sh
        full = " ".join(parts).strip()
        # tek başına nisbe ya da şöhret: makalesiz (Pezdevî, İbnü’l-Melik)
        solo = lambda x: re.sub(r"^e[lstşzdrn]-", "", x) if x and " " not in x else x
        full = cap(solo(full))
        # kısa ad: şöhret > lakap + son nisbe > künye + son nisbe > isim + nisbe
        last = nis[-1] if nis else ""
        if sh and (P.known or not (nas or ku)):
            short = sh[0]
        elif lq and last:
            short = f"{lq[0]} {last}"
        elif ku and last:
            short = f"{ku} {last}"
        elif nas and last:
            short = f"{nas[0]} {last}"
        elif nas:
            short = " b. ".join(nas[:2])
        else:
            short = full
        short = cap(solo(short))
        return full or short, short

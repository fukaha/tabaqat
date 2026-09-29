"""Eşleştirme için madde kayıtları ve isim karşılaştırma puanı."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..extract.names import (_TITLES, ParsedName, death_year, heading_name, lead_name, parse_name,
                             year_from_note)
from ..normalize.arabic import normalize

# Aynı kitabın iki cildi tek kitap sayılır
BOOK_OF = {"ghuraf_v1": "ghuraf", "ghuraf_v2": "ghuraf"}
BOOKS = ["ghuraf_v1", "ghuraf_v2", "qand", "jawahir", "tabaqat_saniyya", "taj_tarajim", "kataib",
         "athmar", "fawaid"]
# Kitabın asıl (isimler) bölümü dışında kalan, çoğu kez tekrar olan maddeler: künye/nisbe/lakap
_SECONDARY = re.compile(r"^(«?كتاب (الكنى|الأنساب|النساء)|«?باب الكنى|أبو |أم |ابن |فصل: فيمن)")
# Şahıs biyografisi olmayan bölümler: el-Esmârü’l-ceniyye'nin nisbe sözlüğü ("الطّرسوسيّ: بفتح الطاء…
# نسبة إلى مدينة من بلاد الروم. منها …"). Bu maddeler şahıs sayılmaz; nisbe açıklaması olarak
# yer penceresinde gösterilir (export._nisba_notes).
NOT_PERSON = re.compile(r"^«?كتاب الأنساب")
# Metnin ilk cümlesinde tam adı veren kitaplar
_LEAD_BOOKS = {"kataib", "taj_tarajim"}


@dataclass
class Rec:
    key: str                 # "jawahir:974" (book_id:seq)
    book: str                # ghuraf_v1/v2 → ghuraf
    book_id: str
    seq: int
    number: int | None
    vol: int
    page_start: int
    page_end: int
    heading: str
    name: str                # temiz ad (fihrist ya da başlık)
    names: list[ParsedName] = field(default_factory=list)
    death: int | None = None
    death_note: str = ""     # fihristteki vefat notu (varsa)
    secondary: bool = False
    series: str = ""
    refs: list[str] = field(default_factory=list)


def load_overrides(root: Path) -> dict:
    """review/overrides.yml: {"kitap:sıra": {ad: ..., vefat: ...}} — başlığı ad olmayan ya da
    vefatı yanlış okunan maddeler için elle düzeltme."""
    import yaml
    path = root / "review" / "overrides.yml"
    return (yaml.safe_load(path.read_text(encoding="utf-8")) or {}) if path.exists() else {}


def load_records(root: Path) -> list[Rec]:
    over = load_overrides(root)
    out = []
    for b in BOOKS:
        path = root / "data" / "entries" / f"{b}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        numbered = any(e["number"] is not None for e in data)
        for e in data:
            if NOT_PERSON.search(e["section"] or ""):
                continue
            name = e["name"] or heading_name(e["heading_raw"])
            variants = [name]
            hn = heading_name(e["heading_raw"])
            if e["name"] and hn and hn != name and b != "qand":
                variants.append(hn)
            if b in _LEAD_BOOKS and e["text"]:
                lead = lead_name(e["text"])
                if re.search(r" (بن|ابن) ", lead):  # yalnız nesep veren ilk cümle
                    variants.append(lead)
            names = [parse_name(v) for v in variants if v]
            death = year_from_note(e["death"]) if e["death"] else None
            r = Rec(
                key=f"{b}:{e['seq']}", book=BOOK_OF.get(b, b), book_id=b, seq=e["seq"],
                number=e["number"], vol=e["vol"] or 1, page_start=e["page_start"] or 0,
                page_end=e["page_end"] or e["page_start"] or 0, heading=e["heading_raw"],
                name=name, names=names, death=death or death_year(e["text"]),
                death_note=e["death"], secondary=bool(_SECONDARY.search(e["section"] or ""))
                or (numbered and e["number"] is None),  # numaralı kitapta numarasız: fasıl/tekrar
                series=e["series"], refs=e["references"],
            )
            o = over.get(r.key)
            if o:
                if o.get("ad"):
                    r.name = o["ad"]
                    r.names = [parse_name(o["ad"])] + r.names
                if o.get("vefat"):
                    r.death, r.death_note = int(o["vefat"]), r.death_note or "elle"
            out.append(r)
    NISBA_FREQ.clear()
    for r in out:
        for n in {n for p in r.names for n in p.nisbas}:
            NISBA_FREQ[n] = NISBA_FREQ.get(n, 0) + 1
    return out


# Nisbe sıklığı: nadir nisbe (≤ RARE madde) güçlü, yaygın olan (البخاري) zayıf kanıttır
NISBA_FREQ: dict[str, int] = {}
RARE = 8


# --- Karşılaştırma ----------------------------------------------------------------------

def _u(x: str) -> str:
    x = x.replace(" ", "")
    return x[2:] if x.startswith("ال") and len(x) > 4 else x


def _unit_eq(a: str, b: str) -> bool:
    return _u(a) == _u(b)


@dataclass
class Score:
    total: float
    matched: int         # baştan eşleşen zincir halkası
    conflict: int        # ilk uyuşmazlığın yeri (-1: yok)
    notes: list[str]

    @property
    def ism_conflict(self) -> bool:
        return self.conflict == 0


def _compare_names(a: ParsedName, b: ParsedName) -> Score:
    notes = []
    m, conflict = 0, -1
    for x, y in zip(a.chain, b.chain):
        if _unit_eq(x, y):
            m += 1
        else:
            conflict = m
            break
    s = float(m)
    if not a.chain or not b.chain:  # yalnız künye/nisbe ile bilinen
        s = 0.0
        if a.kunya and a.kunya == b.kunya:
            s += 1.5
            notes.append("künye")
        # zincirli taraftaki ism, diğerinin nisbesi olabilir ("الشهيد")
    elif conflict >= 0:
        s -= 3 if conflict > 0 else 10
        notes.append(f"zincir {conflict + 1}. halkada ayrılıyor")
    if a.chain and b.chain and a.kunya and b.kunya:
        if a.kunya == b.kunya:
            s += 1
            notes.append("künye")
        else:
            s -= 0.5
    shared = (a.nisbas & b.nisbas)
    if shared:
        w = sum(2 if NISBA_FREQ.get(n, 0) <= RARE else 1 for n in shared)
        s += min(3, w)
        notes.append("nisbe: " + "، ".join(sorted(shared)))
    elif a.nisbas and b.nisbas:
        s -= 1
    lq = a.laqabs & b.laqabs
    if lq:
        s += 1
        notes.append("lakap")
    elif a.laqabs and b.laqabs:
        s -= 0.5
    return Score(s, m, conflict, notes)


def compare(r1: Rec, r2: Rec) -> Score:
    best = None
    for a in r1.names:
        for b in r2.names:
            sc = _compare_names(a, b)
            if best is None or sc.total > best.total:
                best = sc
    if r1.death and r2.death:
        d = abs(r1.death - r2.death)
        if d <= 1:
            best.total += 2
            best.notes.append(f"vefat {r1.death}")
        elif d <= 3:
            best.total += 1
            best.notes.append(f"vefat {r1.death}/{r2.death}")
        elif d > 10:
            best.total -= 4
            best.notes.append(f"vefat farklı {r1.death}/{r2.death}")
        else:
            best.total -= 1
    for x, y in ((r1, r2), (r2, r1)):
        if x.death and x.death > BOOK_DEATH[y.book] + LATE:
            best.total -= 6
            best.notes.append(f"vefat {x.death}, {y.book} müellifinden çok sonra")
    return best


# Müelliflerin vefatı: bir kitapta, müellifinden çok sonra ölmüş biri yer alamaz
BOOK_DEATH = {"qand": 537, "jawahir": 775, "taj_tarajim": 879, "ghuraf": 953, "kataib": 990,
              "tabaqat_saniyya": 1010, "athmar": 1014, "fawaid": 1304}
LATE = 60


# --- Kelime örtüşmesi (atıf doğrulaması için gevşek ölçü) --------------------------------

_STOP = {"بن", "ابن", "بنت", "ابو", "ابي", "ام", "عبد", "الدين", "الله", "المعروف", "الشهير", "المشهور",
         "ويقال", "قاضي", "القضاه", "هو", "في", "من", "و", "ثم", "الاصل", "المولي", "المولى"}


def _tokens(p: ParsedName) -> set[str]:
    out = set()
    for w in re.findall(r"[\u0621-\u064a]+", normalize(p.raw)):
        w = w[1:] if w.startswith("ب") and w[1:].startswith(("ابن", "ال")) else w  # "بابن"، "بالبدر"
        w = w[3:] if w.startswith("ابن") and len(w) > 5 else w
        if w in _STOP or w in _TITLES or len(w) < 2:
            continue
        out.add(_u(w))
    return out


def token_sim(r1: Rec, r2: Rec) -> float:
    """İki kaydın ad kelimelerinden küçük kümenin ne kadarı büyüğünde var (0-1)."""
    best = 0.0
    for a in r1.names:
        ta = _tokens(a)
        for b in r2.names:
            tb = _tokens(b)
            if ta and tb:
                best = max(best, len(ta & tb) / min(len(ta), len(tb)))
    return best

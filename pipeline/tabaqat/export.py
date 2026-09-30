"""Statik site verisi: site/data/.

index.json   kitaplar + şahıs listesi (arama)
p/NN.json    şahıs ayrıntıları, kimliğin sayısal kısmı % 64'e göre parçalı (tembel yükleme)
graph.json   hoca–talebe ağı (düğüm + kenar)
places.json  yerler, ağırlıklar ve yerle ilişkili şahıslar
t/NN.json    madde metinleri (her kaynak: başlık, metin, dipnotlar, "ترجمته في"), p/ ile aynı parçalama;
             şahıs sayfasında açılınca yüklenir
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import yaml

from .extract.names import birth_year
from .geo.roads import DETOUR, Roads, km
from .textclean import clean_text
from .tr.names import Namer, load_tsv
from .works import build as build_works

SHARDS = 64


def shard(pid: str) -> int:
    d = re.sub(r"\D", "", pid)
    return int(d) % SHARDS if d else 0


def _century(d) -> int | None:
    return (int(d) - 1) // 100 + 1 if d else None


def _dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def _layout(years, edges, col=10, sweeps=24):
    """Zaman eksenli katmanlı yerleşim: x = vefat yılı (10 yıllık sütun), sütun içinde sıra
    komşuların ortalama konumuna göre (barycenter). Vefatı bilinmeyen komşularından tahmin edilir."""
    n = len(years)
    nb = [[] for _ in range(n)]
    for t, s_, *_ in edges:
        nb[t].append((s_, 30))    # talebe ≈ hoca + 30
        nb[s_].append((t, -30))
    y = list(years)
    guessed = [not v for v in y]
    for _ in range(20):
        for i in range(n):
            if guessed[i]:
                g = [y[j] + d for j, d in nb[i] if y[j]]
                if g:
                    y[i] = round(sum(g) / len(g))
    y = [max(1, v) if v else 0 for v in y]
    cols: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        cols[y[i] // col].append(i)
    order = {i: k for c in cols.values() for k, i in enumerate(c)}
    pos_y = {}

    def place():
        for c in cols.values():
            h = len(c)
            for k, i in enumerate(c):
                pos_y[i] = (k - (h - 1) / 2)
    place()
    for _ in range(sweeps):
        for c in cols.values():
            c.sort(key=lambda i: (sum(pos_y[j] for j, _ in nb[i]) / len(nb[i])) if nb[i]
                   else pos_y[i])
        place()
    return [v for v in y], [round(pos_y[i], 1) for i in range(n)], guessed


def pre_hanafi(root: Path, persons: list[dict]) -> set[str]:
    """review/pre_hanafi.yml: Ebû Hanîfe öncesi kişiler (sitede sayfası yok, silsilede "السلف")."""
    cfg = yaml.safe_load((root / "review" / "pre_hanafi.yml").read_text(encoding="utf-8")) or {}
    until = cfg.get("kataib_until") or 0
    out = set(cfg.get("persons") or {})
    for p in persons:
        keys = [s["key"] for s in p["sources"]]
        if all(k.startswith("kataib:") and int(k.split(":")[1]) <= until for k in keys):
            out.add(p["id"])
    return out


def _excerpt(items: list[dict], n: int = 230) -> str:
    """Kart özeti: en uzun metnin başı; dipnot işaretleri, başlıklar ve muhakkik eki atılır."""
    order = ["kataib", "athmar", "jawahir", "tabaqat_saniyya", "fawaid", "taj_tarajim",
             "ghuraf_v1", "ghuraf_v2", "qand"]
    ok = [x for x in items if len(x["text"]) >= 80
          and not re.match(r"\s*(?:#|بسم الله|الحمد لله|فصل)", x["text"])]
    best = min(ok, key=lambda x: order.index(x["book"]) if x["book"] in order else 99,
               default=None)
    if not best:
        return ""
    t = best["text"].split("<hr>")[0]
    t = re.sub(r"\[\^\w+\]|^#+\s*|<[^>]+>", " ", t, flags=re.M)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= n:
        return t
    cut = t[:n].rsplit(" ", 1)[0]
    return cut.rstrip("،,.:؛ ") + "…"


def _nisba_notes(root: Path) -> dict[str, list[dict]]:
    """el-Esmârü’l-ceniyye'nin nisbe sözlüğü (كتاب الأنساب): şahıs değil, nisbe açıklaması. Nisbenin
    bağlı olduğu yere not olarak eklenir: {"n": "الطّرسوسيّ", "text": "بفتح الطاء…", "page": "2/749"}."""
    from .geo.gazetteer import Gazetteer, key
    from .match.records import NOT_PERSON
    path = root / "data" / "entries" / "athmar.json"
    if not path.exists():
        return {}
    gz, out = Gazetteer(root), defaultdict(list)
    for e in json.loads(path.read_text(encoding="utf-8")):
        if not NOT_PERSON.search(e.get("section") or ""):
            continue
        k = key(e["heading_raw"])
        pid = gz.by_nisba.get(k) or gz.by_nisba.get(key("ال" + k)) or gz.by_nisba.get(key(k.removeprefix("ال")))
        if pid:
            out[pid].append({"n": e["heading_raw"].strip(), "text": clean_text(e.get("text")).replace("\n\n", " "),
                             "page": f"{e['vol']}/{e['page_start']}"})
    return out


def _entries(root: Path) -> dict[str, dict]:
    entries = {}
    for f in sorted((root / "data" / "entries").glob("*.json")):
        for e in json.loads(f.read_text(encoding="utf-8")):
            entries[f"{e['book_id']}:{e['seq']}"] = e
    return entries


def _quote(text: str, n: int = 320) -> str:
    """Sitede yayımlanan kısa alıntı: maddenin ilk cümleleri (en çok n harf), cümle sonunda kesilir.
    Tam metinler telifli modern neşirlerden geldiği için yalnız bu alıntı yayımlanır (bkz. export(full_text=...))."""
    t = text.split("<hr>")[0]
    t = re.sub(r"\[\^\w+\]|^#+\s*|<[^>]+>", " ", t, flags=re.M)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= n:
        return t
    ends = [m.end() for m in re.finditer(r"[.؛!؟:](?=\s)", t[:n + 1]) if m.end() >= n // 3]
    if ends:
        return t[:ends[-1]].rstrip() + " …"
    return t[:n].rsplit(" ", 1)[0].rstrip("،,.:؛ ") + " …"


def _texts(root: Path, persons: list[dict], entries: dict[str, dict], full_text: bool = False) -> dict[int, dict]:
    out: dict[int, dict] = defaultdict(dict)
    for p in persons:
        items = []
        for s in p["sources"]:
            e = entries.get(s["key"])
            if not e:
                continue
            # yayın metni: tarama kusurları giderilmiş, dipnotsuz
            text = clean_text(e.get("text"))
            item = {"book": s["book"], "cite": s["cite"], "heading": e.get("heading_raw") or "", "text": text}
            if not full_text:
                q = _quote(text)
                if q != text:
                    item.update(text=q, short=1)
            items.append(item)
        if items:
            out[shard(p["id"])][p["id"]] = items
    return out


_HARAKAT = re.compile("[\u064b-\u0652\u0670]")
_KNOWN_AS = re.compile(r"(?:المعروف|الشهير|المشهور|عرف)\s*(?:ب|بـ)\s*(ابن \S+|[^\s،,(.]+(?:\s(?:زاده|باشا|بك|جلبي|أفندي|حلبي|خان|القضاة|الأئمة|الإسلام|الشهيد))?)")
_LQ1 = {"شمس", "فخر", "برهان", "ظهير", "حسام", "ركن", "نجم", "صدر", "تاج", "علاء", "جلال",
        "حافظ", "حميد", "نور", "سراج", "قوام", "زين", "بدر", "شرف", "كمال", "أكمل", "عز", "عماد",
        "نصير", "رضي", "مجد", "سيف", "جمال", "محيي", "قطب", "صفي", "شهاب", "تقي", "سعد", "نظام",
        "مجير", "عون", "بهاء", "معين", "ضياء", "رشيد", "أمين", "عفيف", "ولي", "حسن", "خير"}


def _laqab(name: str) -> str:
    """"الملقب ب…" ya da "X الدين / X الأئمة" lakabı (bitişik bâ harfi ayıklanır)."""
    for pat in (r"الملقب\s*(\S+ (?:الدين|الأئمة))", r"(\S+ الدين)", r"(\S+ الأئمة)"):
        for m in re.finditer(pat, name):
            w = m.group(1)
            if w[0] == "ب" and w.split()[0][1:] in _LQ1:
                w = w[1:]
            if w.split()[0] in _LQ1:
                return w
    return ""


_KUNYA = re.compile(r"(?:أبو|ابو) (?:عبد )?[^\s،,.]+")
_TITLES = {"الحنفي", "القاضي", "الصوفي", "الشافعي", "الحنبلي", "المالكي", "الأصولي", "النحوي"}
_SHORT = {"jws1": "أبو حنيفة", "jw1270": "محمد بن الحسن الشيباني", "jw1825": "أبو يوسف",
          "jw1061": "عمر بن صاحب الهداية", "jw891": "عبيد الله المحبوبي",
          "qd597": "أبو زيد الدبوسي", "kt168": "أبو حفص الصغير", "qd538": "عبد العزيز بن عمر",
          "jw104": "أبو حفص الكبير", "gh479": "نجم الدين النسفي"}


def short_name(name: str, pid: str = "") -> str:
    """Silsile rozetleri için kısa ad: şöhret; yoksa lakap/künye + son nisbe."""
    if pid in _SHORT:
        return _SHORT[pid]
    name = _HARAKAT.sub("", name).replace("ـ", "").strip()
    m = _KNOWN_AS.search(name)
    if m:
        return m.group(1).strip()
    words = re.sub("[،,.]", " ", name).split()
    if words[0].startswith("ال") and (len(words) < 2 or words[1] != "بن"):
        return words[0]
    nisba = ""
    for i in range(len(words) - 1, 1, -1):
        w = words[i]
        if w.startswith("ال") and w.endswith("ي") and len(w) > 4 and w not in _TITLES \
                and words[i - 1] not in {"بن", "ابن", "عبد", "أبو", "أبي", "ابو"}:
            nisba = w
            break
    k = _KUNYA.search(name)
    lead = _laqab(name) or (k and k.group(0))
    if lead and nisba:
        return f"{lead} {nisba}"
    i = words.index("بن") if "بن" in words else len(words)
    ism = " ".join(words[:max(1, min(i, 2))])
    if nisba:
        return f"{ism} {nisba}"
    if i == 1 and len(words) > 2:
        return " ".join(words[:4] if words[2] in {"أبي", "ابن"} and len(words) > 3 else words[:3])
    return ism


def _chains(info: dict, rel: list[dict], salaf: set[str], want: int = 30) -> list[list[str]]:
    """Ebû Hanîfe'den geç dönem âlimlere, kesin vefatlarla tutarlı en kısa silsileler."""
    death = {pid: p.get("death_h") or p.get("death_est") for pid, p in info.items()}
    up = defaultdict(list)
    for e in rel:
        t, s = e["teacher"], e["student"]
        if all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"]):
            continue
        dt, ds = death.get(t), death.get(s)
        if dt and ds and 0 < ds - dt <= 90 and s not in salaf:
            up[s].append((e["n"], t))
    deg = defaultdict(int)
    for e in rel:
        deg[e["teacher"]] += 1
        deg[e["student"]] += 1
    src = "jws1"

    def path(pid):
        prev, q = {pid: None}, [pid]
        while q and src not in prev:
            nq = []
            for x in q:
                for _, t in sorted(up[x], key=lambda it: (-deg[it[1]], -it[0])):
                    if t not in prev:
                        prev[t] = x
                        nq.append(t)
            q = nq
        if src not in prev:
            return None
        out = [src]
        while prev[out[-1]] is not None:
            out.append(prev[out[-1]])
        return out

    # asırlara göre sıra sıra seç: her asırdan en çok anılan uç, aynı şeyhten ikinci uç yok
    by_c = defaultdict(list)
    for pid in info:
        if pid in salaf or not death.get(pid) or death[pid] < 400:
            continue
        p = path(pid)
        if p and 6 <= len(p) <= 14:
            by_c[_century(death[pid])].append((-(len(info[pid]["sources"]) * 3 + deg[pid]), pid, p))
    for v in by_c.values():
        v.sort()
    chosen, seen = [], set()
    while len(chosen) < want and any(by_c.values()):
        for c in sorted(by_c):
            while by_c[c]:
                _, pid, p = by_c[c].pop(0)
                if p[-2] not in seen:
                    seen.add(p[-2])
                    chosen.append(p)
                    break
    return chosen[:want]


# şahıs sayfasındaki güzergâhla aynı sıra: önce nisbe/asıl/doğum, en sonda vefat/defin
TR_SOURCE = "Ahmet Özel, Hanefî Fıkıh Âlimleri"


def _tr_source(root: Path, info: dict, rel: list, ext: list, pp: dict, cite: dict) -> dict[str, dict]:
    """review/fikih_alimleri.yml: Ahmet Özel, Hanefî Fıkıh Âlimleri'nden vefat/doğum düzeltmeleri, tam adlar, eserler,
    hoca–talebe bağları, biyografisi olmayan hocalar ve yerler. Var olan bağ ve yerler tekrar eklenmez.
    Döndürür: kimlik → {"born", "ad", "works", "src"}."""
    path = root / "review" / "fikih_alimleri.yml"
    cfg = (yaml.safe_load(path.read_text(encoding="utf-8")) or {}) if path.exists() else {}
    have = {(e["teacher"], e["student"]) for e in rel}
    out = {}
    for pid, c in cfg.items():
        if pid not in info:
            raise KeyError(f"fikih_alimleri.yml: bilinmeyen kimlik {pid}")
        key, ev = f"hfa:{pid}", c.get("kanit") or {}
        src = f"{TR_SOURCE}, “{c.get('madde') or pid}”" + (f", s. {c['sayfa']}" if c.get("sayfa") else "")
        cite[key] = src
        if c.get("vefat"):
            if c.get("yaklasik") and not info[pid].get("death_h"):
                info[pid]["death_est"], info[pid]["hfa_est"] = int(c["vefat"]), True
            elif not c.get("yaklasik"):
                if info[pid].get("death_h") != int(c["vefat"]):
                    info[pid]["death"] = ""        # kaynaktaki (eski) vefat ibaresi artık geçerli değil
                info[pid]["death_h"] = int(c["vefat"])
        out[pid] = {"born": int(c.get("dogum") or 0), "ad": c.get("ad"), "kisa": c.get("kisa"), "works": c.get("eserler") or [], "src": src}
        for role in ("hocalar", "talebeler"):
            for other, kind in c.get(role) or []:
                if other not in info:
                    raise KeyError(f"fikih_alimleri.yml: bilinmeyen kimlik {other}")
                t, s = (other, pid) if role == "hocalar" else (pid, other)
                if (t, s) in have:
                    continue
                have.add((t, s))
                rel.append({"teacher": t, "student": s, "rels": [kind], "books": [], "n": 1,
                            "evidence": [{"key": key, "rel": kind, "via": "human", "text": "", "how": "elle",
                                          "snippet": ev.get(other, "")}]})
        for name, _tr, death, kind in c.get("dis_hocalar") or []:
            ext.append({"key": key, "subject": pid, "role": "teacher", "rel": kind, "text": name,
                        "name": name, "death": death, "tr": _tr, "snippet": ev.get("dis", "")})
        for place, kind in c.get("yerler") or []:
            items = pp.setdefault(pid, [])
            if not any(it["place"] == place and it["kind"] == kind for it in items):
                items.append({"place": place, "kind": kind, "key": key, "text": "", "snippet": ev.get(place, "")})
    return out


KIND_ORDER = ["nisba", "origin", "birth", "residence", "travel", "activity", "office", "death", "burial"]


def place_seq(items: list[dict], places: dict) -> list[str]:
    """Şahsın şehirleri biyografideki sırayla (bölge kayıtları hariç), ardışık tekrarlar atılır."""
    seq: list[str] = []
    for k in KIND_ORDER:
        for it in items:
            pl = places.get(it["place"])
            if it["kind"] == k and pl and pl.get("type") != "regions" and (not seq or seq[-1] != it["place"]):
                seq.append(it["place"])
    return seq


def _roads(root: Path, pp: dict, places: dict, salaf: set) -> dict | None:
    """el-Süreyyâ yol ağı ve şahısların şehirleri arasındaki güzergâhlar (Dijkstra).

    e: her güzergâhın noktaları, düz dizi hâlinde yüzde bir dereceyle [boylam×100, enlem×100, ...]
    r: "A|B" → işaretli kenar numaraları (+i kayıttaki yönde, -i ters yönde; 1'den başlar).
       Yol ağına bağlanamayan ya da yolu çok dolambaçlı olan çiftler listede yoktur (düz çizilir).
    """
    path = root / "data" / "gazetteer" / "roads.json"
    if not path.exists():
        return None
    net = Roads(json.loads(path.read_text(encoding="utf-8")))
    snap = {pid: net.snap(pid, pl["lon"], pl["lat"]) for pid, pl in places.items() if pl.get("type") != "regions"}
    pairs = set()
    for pid, items in pp.items():
        if pid in salaf:
            continue
        seq = place_seq(items, places)
        pairs.update((a, b) for a, b in zip(seq, seq[1:]))
    r = {}
    for a, b in sorted(pairs):
        na, nb = snap.get(a), snap.get(b)
        if not na or not nb or na == nb:
            continue
        got = net.route(na, nb)
        if not got:
            continue
        sids, dist = got
        direct = km((places[a]["lon"], places[a]["lat"]), (places[b]["lon"], places[b]["lat"]))
        if dist <= DETOUR * direct + 30:
            r[f"{a}|{b}"] = sids
    edges = [[round(v * 100) for pt in e[3] for v in pt] for e in net.edges]
    return {"e": edges, "r": r}


def export(root: Path, full_out: Path | None = None) -> dict:
    """site/data/t/ parçalarına yalnız kısa alıntı yazılır. Tam metin parçaları full_out/t/ altına yazılır:
    bu, gizli kaynak deposudur (fukaha/tabaqat-kaynak); site onu yalnız yönetici jetonuyla okur."""
    data, out = root / "data", root / "site" / "data"
    persons = json.loads((data / "persons.json").read_text(encoding="utf-8"))
    rel = json.loads((data / "relations.json").read_text(encoding="utf-8"))
    ext = json.loads((data / "relations_external.json").read_text(encoding="utf-8"))
    pp = json.loads((data / "person_places.json").read_text(encoding="utf-8"))
    places = json.loads((data / "places.json").read_text(encoding="utf-8"))
    books = {}
    for f in sorted((root / "books").glob("*.yml")):
        b = yaml.safe_load(f.read_text(encoding="utf-8"))
        books[b["book_id"]] = {"title": b["title"], "author": b.get("author", ""),
                               "death": b.get("author_death_h")}
    for bid, v in load_tsv(root / "review" / "tr" / "books.tsv").items():
        if bid in books:
            t, _, a = v.partition("|")
            books[bid].update(title_tr=t.strip(), author_tr=a.strip())
    # İSNAD 2. edisyon dipnot künyeleri (ilk atıf, kısa atıf; Türkçe ve Arapça)
    for bid, v in load_tsv(root / "review" / "tr" / "isnad.tsv").items():
        if bid in books:
            f = [x.strip() for x in v.split("|")]
            books[bid].update(cite_tr=f[0], cite_tr_s=f[1], cite_ar=f[2], cite_ar_s=f[3])
    cite = {s["key"]: s["cite"] for p in persons for s in p["sources"]}
    # "Proje hakkında" sayfası için kitap başına madde ve cilt sayısı
    for s in {s["key"]: s for p in persons for s in p["sources"]}.values():
        if s["book"] in books:
            b = books[s["book"]]
            b["entries"] = b.get("entries", 0) + 1
            b["vols"] = max(b.get("vols", 1), s.get("vol") or 1)
    info = {p["id"]: p for p in persons}
    hfa = _tr_source(root, info, rel, ext, pp, cite)
    # Türkçe adlar (DİA yazımı): tam ad, kısa ad
    namer = Namer(root)
    TR = {p["id"]: namer.render(p["name"], p["id"]) for p in persons}
    # Hanefî Fıkıh Âlimleri'ne göre düzeltilen tam adlar (elle girilmiş tam ad varsa o kalır; kısa ad değişmez)
    for pid, h in hfa.items():
        if h["ad"] and not (namer.full.get(pid, "").partition("|")[0].strip()):
            TR[pid] = (h["ad"], h["kisa"] or TR[pid][1] if not namer.full.get(pid) else TR[pid][1])
    salaf = pre_hanafi(root, persons)
    # ağdan tahmin edilen / düzeltilen vefatlar (kesin vefatı olmayanlar için)
    dest_path = data / "death_estimates.json"
    dest = json.loads(dest_path.read_text(encoding="utf-8")) if dest_path.exists() else {}
    for p in persons:
        if not p.get("death_h") and p["id"] in dest:
            if not p.get("hfa_est"):                  # Hanefî Fıkıh Âlimleri'nin yaklaşık tarihi önce gelir
                p["death_est"] = dest[p["id"]]
    listed = [p for p in persons if p["id"] not in salaf]

    teachers, students = defaultdict(list), defaultdict(list)
    for e in rel:
        weak = all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"])
        ev = [[cite.get(x["key"], ""), x["snippet"][:160], x["text"]] for x in e["evidence"][:3]]
        item = {"rels": e["rels"], "n": e["n"], "weak": weak, "ev": ev}
        teachers[e["student"]].append({"id": e["teacher"], **item})
        students[e["teacher"]].append({"id": e["student"], **item})
    exts = defaultdict(list)
    for x in ext:
        exts[x["subject"]].append([x["name"], x["death"], x["role"], x["rel"],
                                   cite.get(x["key"], ""), x.get("tr") or namer.render(x["name"])[1]])

    main_place = {}
    for pid, items in pp.items():
        order = {"birth": 0, "nisba": 1, "origin": 2, "residence": 3, "death": 4}
        best = sorted(items, key=lambda it: order.get(it["kind"], 9))
        main_place[pid] = best[0]["place"]

    entries = _entries(root)
    index, shards = [], defaultdict(dict)
    for p in listed:
        pid = p["id"]
        d, est = p.get("death_h"), False
        if not d and p.get("death_est"):
            d, est = p["death_est"], True
        # doğum yılı: ilk kaynaktaki "ولد/مولده سنة …" ya da ölüm yaşından (zaman haritasında ömür çizgisi)
        born = hfa.get(pid, {}).get("born") or next((b for s in p["sources"] if s["key"] in entries
                                          for b in [birth_year(entries[s["key"]].get("text") or "", d)] if b), 0)
        index.append([pid, p["name"], d, int(est), len(p["sources"]), len(teachers[pid]),
                      len(students[pid]), main_place.get(pid, ""),
                      sorted({s["book"] for s in p["sources"]}), TR[pid][0], TR[pid][1], born])
        shards[shard(pid)][pid] = {
            "name": p["name"], "tr": TR[pid][0], "trs": TR[pid][1],
            "heading": p.get("heading", ""), "death": p.get("death", ""),
            "death_h": d, "est": est,
            "sources": [[s["book"], s["cite"], s.get("heading", "")] for s in p["sources"]],
            "teachers": sorted(teachers[pid], key=lambda x: -x["n"]),
            "students": sorted(students[pid], key=lambda x: -x["n"]),
            "ext": exts.get(pid, []),
            "places": [[it["place"], it["kind"], cite.get(it["key"], ""), it["text"]]
                       for it in pp.get(pid, [])],
        }
    salaf_info = {pid: [info[pid]["name"], info[pid].get("death_h") or info[pid].get("death_est"),
                        TR[pid][0], TR[pid][1]]
                  for pid in sorted(salaf)}
    _dump(out / "index.json", {"books": books, "persons": index, "salaf": salaf_info})
    for k, v in shards.items():
        _dump(out / "p" / f"{k:02d}.json", v)
    full = _texts(root, listed, entries, full_text=True)
    texts = _texts(root, listed, entries)
    if full_out:
        for k, v in full.items():
            _dump(Path(full_out) / "t" / f"{k:02d}.json", v)
    for k, v in texts.items():
        _dump(out / "t" / f"{k:02d}.json", v)
    # kartlar için kısa özet (ilk kaynağın metninin başı) ve öne çıkan âlimler
    excerpts = {pid: _excerpt(items) for v in full.values() for pid, items in v.items()}
    _dump(out / "excerpts.json", {k: v for k, v in excerpts.items() if v})
    score = {r[0]: r[4] * 3 + r[5] + r[6] for r in index}
    featured = sorted((r for r in index if excerpts.get(r[0])), key=lambda r: -score[r[0]])[:18]
    _dump(out / "featured.json", [r[0] for r in featured])

    in_net = sorted({x for e in rel for x in (e["teacher"], e["student"])})
    pos = {pid: i for i, pid in enumerate(in_net)}
    deg = defaultdict(int)
    for e in rel:
        deg[e["teacher"]] += 1
        deg[e["student"]] += 1
    edges = [[pos[e["teacher"]], pos[e["student"]], e["n"],
              int(all("zayıf" in x["how"] or "meşhur" in x["how"] for x in e["evidence"]))]
             for e in rel]
    years = [info[pid].get("death_h") or info[pid].get("death_est") for pid in in_net]
    xs, ys, guessed = _layout(years, edges)
    nodes = []
    for i, pid in enumerate(in_net):
        nodes.append([pid, info[pid]["name"], years[i], deg[pid], xs[i], ys[i], int(guessed[i]),
                      int(pid in salaf), TR[pid][0]])
    _dump(out / "graph.json", {"nodes": nodes, "edges": edges})
    # kitap ağı: eserler ve şerh/hâşiye/ihtisar ilişkileri
    owner = {s["key"]: p["id"] for p in persons for s in p["sources"]}
    deaths = {pid: p.get("death_h") or p.get("death_est") for pid, p in info.items()}
    books_data = build_works(root, info, entries, owner, cite, TR, deaths)
    _dump(out / "books.json", books_data)
    chains = _chains(info, rel, salaf)
    _dump(out / "chains.json", {"chains": chains,
                                "names": {pid: short_name(info[pid]["name"], pid)
                                          for pid in sorted({x for c in chains for x in c})},
                                "names_tr": {pid: TR[pid][1] for pid in sorted({x for c in chains for x in c})}})

    people_at = defaultdict(list)
    for pid, items in pp.items():
        if pid in salaf:
            continue
        for it in items:
            people_at[it["place"]].append([pid, it["kind"]])
    ptr = load_tsv(root / "review" / "tr" / "places.tsv")
    # el-Süreyyâ künyesi ve Yâkût/Himyerî/Sem‘ânî'den kısa alıntı (geo/thurayya_info.py)
    tinfo_p = data / "gazetteer" / "thurayya_info.json"
    tinfo = json.loads(tinfo_p.read_text(encoding="utf-8")) if tinfo_p.exists() else {}
    nnotes = _nisba_notes(root)
    places = [{**pl, "name_tr": ptr.get(pl["id"], ""), "n": len({x[0] for x in people_at[pl["id"]]}),
               **({"info": tinfo[pl["id"]]} if pl["id"] in tinfo else {}),
               **({"nisba": nnotes[pl["id"]]} if pl["id"] in nnotes else {}),
               "people": people_at[pl["id"]]}
              for pl in places if people_at[pl["id"]]]
    _dump(out / "places.json", places)
    roads = _roads(root, pp, {pl["id"]: pl for pl in places}, salaf)
    if roads:
        _dump(out / "roads.json", roads)
    # sözlükte bulunmayan kelimeler (Türkçe adları tamamlamak için)
    rows = [f"{cat}\t{w}\t{c}" for cat, d in sorted(namer.unknown.items())
            for w, c in sorted(d.items(), key=lambda t: -t[1])]
    (root / "review" / "tr" / "bilinmeyen.tsv").write_text(
        "# tür\tkelime\tsayı — ilgili sözlüğe (ism/nisba/laqab.tsv) eklenince adlarda görünür\n"
        + "\n".join(rows) + "\n", encoding="utf-8")
    return {"persons": len(index), "salaf": len(salaf), "shards": len(shards), "nodes": len(nodes),
            "edges": len(edges), "places": len(places), "born": sum(1 for r in index if r[11]),
            "road_pairs": len(roads["r"]) if roads else 0}

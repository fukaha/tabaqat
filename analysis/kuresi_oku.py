"""İnceleme dosyalarını okunaklı düz metne döker: python analysis/kuresi_oku.py <ilk sıra> <son sıra>"""
import glob
import json
import re
import sys
from pathlib import Path

D = Path(__file__).resolve().parents[1] / "kaynak" / "analiz" / "kuresi" / "dosya"
rows = [x for f in sorted(glob.glob(str(D / "parti_*.json"))) for x in json.load(open(f, encoding="utf-8"))]
num = {str(x["no"]): x for x in rows if x["no"] not in (None, "None")}
a, b = int(sys.argv[1]), int(sys.argv[2])
for x in rows:
    if not a <= x["sira"] <= b:
        continue
    s = x["sahis"] or {}
    print(f"\n=== {x['anahtar']} | nr {x['no']} | {x['cilt']}/{x['sayfa']} | {s.get('kimlik')} {s.get('tr')} | vefat {s.get('vefat') or ('~' + str(s.get('vefat_tahmini')) if s.get('vefat_tahmini') else '-')}")
    print("BAŞLIK:", x["baslik"])
    fn = x["dipnotlar"]
    def rep(m):
        t = fn.get(m.group(1), "")
        r = re.search(r"برقم\s*([\d٠-٩]+)", t)
        if r:
            n = r.group(1).translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
            y = num.get(n)
            return f" [→nr {n}: {y['sahis']['kimlik'] if y and y['sahis'] else '?'} {y['sahis']['tr'] if y and y['sahis'] else ''}]"
        return f" [dn: {t[:140]}]" if t else ""
    print(re.sub(r"\s*\[\^(\w+)\]", rep, x["metin"]))
    for g in x["baglar"]:
        print("  BAĞ:", f"{g.get('hoca_ad')} → {g.get('talebe_ad')} [{g['tur']}, {g.get('yol')}, «{g['metindeki']}»]" if "hoca" in g
              else f"dış {g['rol']}: {g['dis_kayit']} [{g['tur']}] «{g['metindeki']}»")
    for y in x["yerler"]:
        print(f"  YER: {y['yer']} ({y['tur']}) «{y['metindeki']}»")
    for w in x["eserler"]:
        print(f"  ESER: {w['eser']} ({w['tur']})")

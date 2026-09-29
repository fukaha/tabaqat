"""el-Süreyyâ (al-Thurayya, CC BY 4.0) yol ağı: Mukaddesî'nin menzilleri arasındaki güzergâhlar.

Kaynak: https://github.com/althurayya/althurayya.github.io deposundaki master/routes.json
(her güzergâh bir LineString; özelliklerinde başlangıç/bitiş yerinin el-Süreyyâ kimliği ve metre).

    python -m tabaqat.geo.roads /yol/althurayya.github.io
    → data/gazetteer/roads.json   sadeleştirilmiş ağ: [başlangıç, bitiş, metre, [[boylam, enlem], ...]]

Site verisi (export) bu ağ üzerinde iki şehir arasındaki en kısa yolu Dijkstra ile bulur (`route`).
"""
from __future__ import annotations

import heapq
import json
import math
import sys
from pathlib import Path

SNAP_KM = 60      # yol ağında olmayan bir şehir, bu uzaklıktaki en yakın menzile bağlanır
DETOUR = 2.6      # yol, kuş uçuşu mesafenin bu katından uzunsa düz çizgi tercih edilir


def km(a, b) -> float:
    (lo1, la1), (lo2, la2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def simplify(pts: list, tol: float = .015) -> list:
    """Douglas–Peucker (derece cinsinden tolerans)."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1e-12
    i, dmax = 0, 0.0
    for k in range(1, len(pts) - 1):
        d = abs(dy * pts[k][0] - dx * pts[k][1] + x2 * y1 - y2 * x1) / L
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)


def build(src: Path) -> list:
    feats = json.loads((src / "master" / "routes.json").read_text(encoding="utf-8"))["features"]
    out = []
    for f in feats:
        pr, co = f["properties"], f["geometry"]["coordinates"]
        if not co or pr.get("sToponym") == pr.get("eToponym"):
            continue
        pts = [[round(x, 3), round(y, 3)] for x, y in simplify([tuple(c[:2]) for c in co])]
        out.append([pr["sToponym"], pr["eToponym"], int(pr.get("Meter") or 0), pts])
    return out


class Roads:
    """Yol ağı: menzil düğümleri, kenarlar (koordinatlarıyla) ve en kısa yol."""

    def __init__(self, edges: list):
        self.edges = edges
        self.adj: dict[str, list] = {}
        self.pos: dict[str, tuple] = {}
        for i, (s, e, m, pts) in enumerate(edges):
            w = m / 1000 or sum(km(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
            self.adj.setdefault(s, []).append((e, w, i + 1))      # +i: kayıttaki yönde
            self.adj.setdefault(e, []).append((s, w, -(i + 1)))   # -i: ters yönde
            self.pos.setdefault(s, tuple(pts[0]))
            self.pos.setdefault(e, tuple(pts[-1]))

    def snap(self, pid: str, lon: float, lat: float) -> str | None:
        if pid in self.adj:
            return pid
        best, bd = None, SNAP_KM
        for n, p in self.pos.items():
            d = km((lon, lat), p)
            if d < bd:
                best, bd = n, d
        return best

    def route(self, a: str, b: str) -> tuple[list[int], float] | None:
        """a'dan b'ye en kısa yol: işaretli kenar numaraları ve km."""
        if a == b:
            return [], 0.0
        dist, prev, q = {a: 0.0}, {}, [(0.0, a)]
        while q:
            d, x = heapq.heappop(q)
            if x == b:
                break
            if d > dist.get(x, 1e18):
                continue
            for y, w, sid in self.adj.get(x, ()):
                nd = d + w
                if nd < dist.get(y, 1e18):
                    dist[y], prev[y] = nd, (x, sid)
                    heapq.heappush(q, (nd, y))
        if b not in dist:
            return None
        out, x = [], b
        while x != a:
            x, sid = prev[x][0], prev[x][1]
            out.append(sid)
        return out[::-1], dist[b]


def main() -> None:
    src = Path(sys.argv[1])
    root = Path(__file__).resolve().parents[3]
    edges = build(src)
    path = root / "data" / "gazetteer" / "roads.json"
    path.write_text(json.dumps(edges, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(edges)} güzergâh, {sum(len(e[3]) for e in edges)} nokta → {path}")


if __name__ == "__main__":
    main()

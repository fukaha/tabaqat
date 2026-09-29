"""Komut satırı: python -m tabaqat.cli parse <kitap> [--out DIR]"""
import argparse
import json
from pathlib import Path

import yaml

from .parse import turath_epub

ROOT = Path(__file__).resolve().parents[2]
PARSERS = {"turath_epub": turath_epub.parse}


def load_book(book: str) -> dict:
    return yaml.safe_load((ROOT / "books" / f"{book}.yml").read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["parse", "report"])
    ap.add_argument("book")
    ap.add_argument("--out", default=str(ROOT / "data" / "entries"))
    a = ap.parse_args()
    cfg = load_book(a.book)
    entries = PARSERS[cfg["parser"]](str(ROOT / cfg["source"]), cfg["book_id"], cfg.get("start_after_heading"))
    if a.cmd == "parse":
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{cfg['book_id']}.json").write_text(
            json.dumps([e.to_dict() for e in entries], ensure_ascii=False, indent=1), encoding="utf-8")
    nums = [e.number for e in entries]
    gaps = sorted(set(range(1, max(nums) + 1)) - set(nums))
    empty = [e.number for e in entries if len(e.text) < 30]
    print(f"{len(entries)} madde; no {min(nums)}–{max(nums)}; boşluk: {gaps[:20]}; kısa/boş: {empty[:20]}")


if __name__ == "__main__":
    main()

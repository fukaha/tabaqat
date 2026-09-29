"""Komut satırı: python -m tabaqat.cli parse <kitap> [--out DIR]"""
import argparse
import json
from pathlib import Path

import yaml

from .parse import mistral_ocr, turath_epub

ROOT = Path(__file__).resolve().parents[2]
PARSERS = {"turath_epub": turath_epub.parse}


def load_book(book: str) -> dict:
    return yaml.safe_load((ROOT / "books" / f"{book}.yml").read_text(encoding="utf-8"))


PARSE_OPTS = ("start_after_heading", "unnumbered_entry", "section_heading", "stop_at_heading",
              "entry_sections", "series", "preamble_entry", "co_entries")


def clean_ocr(cfg: dict) -> list[mistral_ocr.Page]:
    return mistral_ocr.clean_pages(ROOT / cfg["source"], cfg["first_pdf_page"], cfg["page_offset"])


def parse_book(cfg: dict):
    if cfg["parser"] == "mistral_ocr":
        return mistral_ocr.to_entries(clean_ocr(cfg), cfg["book_id"], cfg.get("vol", 1))
    opts = {k: cfg[k] for k in PARSE_OPTS if k in cfg}
    return PARSERS[cfg["parser"]](str(ROOT / cfg["source"]), cfg["book_id"], **opts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["parse", "report", "clean"])
    ap.add_argument("book")
    ap.add_argument("--out", default=str(ROOT / "data" / "entries"))
    a = ap.parse_args()
    cfg = load_book(a.book)
    if a.cmd == "clean":  # OCR kaynağından temiz metin (yalnız gövde + sayfa numaraları)
        pages = clean_ocr(cfg)
        out = ROOT / "data" / "clean"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{cfg['book_id']}.md").write_text(
            mistral_ocr.to_markdown(pages, cfg["title"]), encoding="utf-8")
        (out / f"{cfg['book_id']}.json").write_text(json.dumps(
            [{"pdf_page": p.pdf, "page": p.page, "text": p.text} for p in pages],
            ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"{len(pages)} sayfa; boş: {[p.page for p in pages if not p.blocks]}")
        return
    entries = parse_book(cfg)
    if a.cmd == "parse":
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{cfg['book_id']}.json").write_text(
            json.dumps([e.to_dict() for e in entries], ensure_ascii=False, indent=1), encoding="utf-8")
    nums = [e.number for e in entries if e.number is not None and not e.series]
    empty = [e.number or e.seq for e in entries if len(e.text) < 30]
    if not nums:  # numarasız kitap
        print(f"{len(entries)} madde (numarasız); kısa/boş (seq): {empty[:20]}")
        return
    gaps = sorted(set(range(1, max(nums) + 1)) - set(nums))
    print(f"{len(entries)} madde; no {min(nums)}–{max(nums)}; boşluk: {gaps[:20]}; kısa/boş: {empty[:20]}")


if __name__ == "__main__":
    main()

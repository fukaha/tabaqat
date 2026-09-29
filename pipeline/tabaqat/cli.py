"""Komut satırı: python -m tabaqat.cli parse <kitap> [--out DIR]"""
import argparse
import json
from pathlib import Path

import yaml

from .parse import mistral_ocr, name_index, turath_epub

ROOT = Path(__file__).resolve().parents[2]
PARSERS = {"turath_epub": turath_epub.parse}


def load_book(book: str) -> dict:
    return yaml.safe_load((ROOT / "books" / f"{book}.yml").read_text(encoding="utf-8"))


PARSE_OPTS = ("start_after_heading", "unnumbered_entry", "section_heading", "stop_at_heading",
              "entry_sections", "series", "preamble_entry", "co_entries")


def load_names(cfg: dict) -> list[name_index.IndexEntry] | None:
    return name_index.load_index(ROOT / cfg["index"]) if cfg.get("index") else None


def clean_ocr(cfg: dict, report: bool = False) -> list[mistral_ocr.Page]:
    pages = mistral_ocr.clean_pages(ROOT / cfg["source"], cfg["first_pdf_page"], cfg["page_offset"],
                                    cfg.get("first_entry", 1), cfg.get("last_pdf_page"),
                                    cfg.get("entry_title"), cfg.get("paren_marks", False))
    names = load_names(cfg)
    if names and not cfg.get("entry_title"):  # sayfalı fihrist (Guref) ile hizalama  # madde numaralarını muhakkik fihristine göre düzelt
        rep = name_index.apply_index(pages, names, cfg.get("vol", 1))
        if report:
            print(f"fihrist: {rep.matched} doğru, {len(rep.renumbered)} yeniden numaralandı, "
                  f"{len(rep.recovered)} kurtarıldı, {len(rep.unnumbered)} numarası silindi; "
                  f"metinde bulunamayan: {rep.not_found}")
    return pages


def parse_book(cfg: dict):
    if cfg["parser"] == "mistral_ocr":
        names = {e.number: e for e in load_names(cfg) or []}
        if cfg.get("entry_title"):
            return mistral_ocr.to_title_entries(clean_ocr(cfg), cfg["book_id"], cfg["entry_title"],
                                                names, cfg.get("vol", 1))
        return mistral_ocr.to_entries(clean_ocr(cfg), cfg["book_id"], cfg.get("vol", 1), names)
    opts = {k: cfg[k] for k in PARSE_OPTS if k in cfg}
    return PARSERS[cfg["parser"]](str(ROOT / cfg["source"]), cfg["book_id"], **opts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["parse", "report", "clean", "index", "match",
                                       "apply-review"])
    ap.add_argument("book", nargs="?")
    ap.add_argument("--out", default=str(ROOT / "data" / "entries"))
    a = ap.parse_args()
    if a.cmd == "apply-review":  # onay sayfasının kararları (JSON) → review/decisions.yml
        from .match.review import apply_decisions
        print("aynı: %d, farklı: %d" % apply_decisions(ROOT, Path(a.book)))
        return
    if a.cmd == "match":  # kitaplar arası şahıs birleştirme → data/persons.json + review/
        from .match.persons import run
        print(run(ROOT))
        return
    cfg = load_book(a.book)
    if a.cmd == "index":  # Word fihristinden data/index/*.json
        if cfg.get("index_pages"):  # kitabın kendi OCR'lanmış fihrist sayfaları
            entries = name_index.read_ocr_index(ROOT / cfg["source"], *cfg["index_pages"])
        else:
            entries = name_index.read_docx_index(ROOT / cfg["index_source"])
        (ROOT / cfg["index"]).parent.mkdir(parents=True, exist_ok=True)
        name_index.save_index(entries, ROOT / cfg["index"])
        print(f"{len(entries)} fihrist maddesi")
        return
    if a.cmd == "clean":  # OCR kaynağından temiz metin (yalnız gövde + sayfa numaraları)
        pages = clean_ocr(cfg, report=True)
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
    gaps = sorted(set(range(min(nums), max(nums) + 1)) - set(nums))
    print(f"{len(entries)} madde; no {min(nums)}–{max(nums)}; boşluk: {gaps[:20]}; kısa/boş: {empty[:20]}")


if __name__ == "__main__":
    main()

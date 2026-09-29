"""Türâs/Shamela EPUB okuyucusu.

Her sayfa ayrı bir xhtml'dir; sayfa altında "الجزء: N - الصفحة: M" künyesi,
dipnotlar `p.hamesh` içinde, madde başlıkları h2/h3 olarak "[N - isim]" biçimindedir.

Özel durumlar:
- Başlık "و[٥٠٣ - ...]" gibi "و" önekli olabilir.
- Aralarında metin olmayan ardışık başlıklar (ortak madde) aynı metni paylaşır (`group`).
- Başlığın hemen ardındaki "(^١)]" paragrafı, o başlığa bağlı çapraz atıf dipnotudur
  (`references`: "انظر ترجمته في الجواهر المضية ..."); gövde dipnotları `footnotes`a
  madde içinde yeniden numaralanarak ("[^1]") taşınır.
"""
from __future__ import annotations

import re
import warnings
import zipfile
from pathlib import PurePosixPath

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from ..schema import Entry

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_FOOTER = re.compile(r"الجزء:\s*(\d+)\s*-\s*الصفحة:\s*(\d+)")
_HEADING = re.compile(r"^و?\[?\s*([\d٠-٩]+)\s*-\s*(.+?)\s*\]?$")
_FN_LINE = re.compile(r"\(\^([\d٠-٩]+)\)")
_STUB = re.compile(r"^\(\^([\d٠-٩]+)\)\]?$")


def _spine_pages(z: zipfile.ZipFile) -> list[str]:
    opf_path = next(n for n in z.namelist() if n.endswith(".opf"))
    opf = BeautifulSoup(z.read(opf_path), "xml")
    base = PurePosixPath(opf_path).parent
    hrefs = {i["id"]: i["href"] for i in opf.find_all("item")}
    out = []
    for ref in opf.find_all("itemref"):
        href = hrefs[ref["idref"]]
        if href.startswith("text/"):
            out.append(str(base / href))
    return out


def _footnotes(p) -> dict[str, str]:
    """`p.hamesh` içindeki "(^١) ... <br/>(^٢) ..." dipnotlarını ayır."""
    for br in p.find_all("br"):
        br.replace_with("\n")
    result: dict[str, str] = {}
    for line in p.get_text().split("\n"):
        line = line.strip()
        m = _FN_LINE.match(line)
        if m:
            result[m.group(1).translate(_DIGITS)] = line[m.end():].strip()
    return result


def parse(path: str, book_id: str, start_after_heading: str | None = None) -> list[Entry]:
    start_re = re.compile(start_after_heading) if start_after_heading else None
    started = start_re is None
    entries: list[Entry] = []
    group: list[Entry] = []
    paras: list[str] = []
    notes: dict[str, str] = {}
    section = ""
    group_id = 0

    def close():
        nonlocal group, paras, notes, group_id
        text = "\n\n".join(paras).strip()
        if len(group) > 1:
            group_id += 1
        for e in group:
            e.text = text
            e.footnotes = dict(notes)
            e.group = group_id if len(group) > 1 else None
        entries.extend(group)
        group, paras, notes = [], [], {}

    with zipfile.ZipFile(path) as z:
        for name in _spine_pages(z):
            body = BeautifulSoup(z.read(name), "lxml").body
            vol = page = None
            page_notes: dict[str, str] = {}
            events: list[tuple[str, str]] = []
            for el in body.find_all(["h2", "h3", "p"], recursive=False):
                txt = el.get_text(" ", strip=True)
                classes = el.get("class") or []
                if el.name in ("h2", "h3"):
                    events.append(("h", txt))
                elif "hamesh" in classes:
                    page_notes.update(_footnotes(el))
                elif "text-center" in classes and _FOOTER.search(txt):
                    m = _FOOTER.search(txt)
                    vol, page = int(m.group(1)), int(m.group(2))
                elif txt:
                    events.append(("p", txt))

            for kind, txt in events:
                if kind == "h":
                    if not started:
                        started = bool(start_re.search(txt))
                        continue
                    m = _HEADING.match(txt)
                    if not m:
                        close()
                        section = txt
                        continue
                    if paras:  # metin başladıysa yeni grup; yoksa önceki başlıkla metni paylaşır
                        close()
                    group.append(Entry(book_id, len(entries) + len(group) + 1, txt, "",
                                       vol=vol, page_start=page, page_end=page,
                                       number=int(m.group(1).translate(_DIGITS)), section=section))
                elif group:
                    stub = _STUB.match(txt)
                    if stub and not paras:
                        ref = page_notes.get(stub.group(1).translate(_DIGITS))
                        if ref:
                            group[-1].references.append(ref)
                        continue

                    def sub(m):
                        n = m.group(1).translate(_DIGITS)
                        if n not in page_notes:
                            return ""
                        k = str(len(notes) + 1)
                        notes[k] = page_notes[n]
                        return f"[^{k}]"

                    paras.append(_FN_LINE.sub(sub, txt))
            for e in group:
                e.page_end = page
    close()
    return entries

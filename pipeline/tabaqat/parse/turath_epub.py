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
_FN_LINE = re.compile(r"\(\^([\d٠-٩]+|\*+)\)")


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


def parse(path: str, book_id: str, start_after_heading: str | None = None,
          unnumbered_entry: str | None = None, section_heading: str | None = None) -> list[Entry]:
    """
    unnumbered_entry: numarasız ama madde sayılacak başlık (ör. Ebû Hanîfe tercümesi).
    section_heading: verilirse yalnız buna uyan numarasız başlıklar bölüm açar; diğerleri
        (ör. "فصل فى مولده") açık maddenin içine alt başlık olarak eklenir.
    """
    start_re = re.compile(start_after_heading) if start_after_heading else None
    unnum_re = re.compile(unnumbered_entry) if unnumbered_entry else None
    section_re = re.compile(section_heading) if section_heading else None
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

    last_no = 0
    sep_seen = False

    def take_notes(txt: str, page_notes: dict[str, str], entry: Entry | None) -> str:
        """Başlıktaki/kalıntı paragraftaki dipnot işaretlerini atıf olarak maddeye aktarır."""
        for m in _FN_LINE.finditer(txt):
            ref = page_notes.get(m.group(1).translate(_DIGITS))
            if ref and entry is not None:
                entry.references.append(ref)
        return _FN_LINE.sub("", txt).strip()

    with zipfile.ZipFile(path) as z:
        for name in _spine_pages(z):
            soup = BeautifulSoup(z.read(name), "lxml")
            title = soup.title.get_text(strip=True) if soup.title else ""
            body = soup.body
            vol = page = None
            page_notes: dict[str, str] = {}
            events: list[tuple[str, str]] = []
            catchword = False
            for el in body.find_all(["h2", "h3", "h4", "p"], recursive=False):
                txt = el.get_text(" ", strip=True)
                classes = el.get("class") or []
                if el.name in ("h2", "h3", "h4"):
                    if not catchword:
                        events.append(("h", txt))
                elif "hamesh" in classes:
                    page_notes.update(_footnotes(el))
                elif "text-center" in classes and _FOOTER.search(txt):
                    m = _FOOTER.search(txt)
                    vol, page = int(m.group(1)), int(m.group(2))
                elif txt.startswith("*"):
                    if "آخر الجزء" in txt:  # cilt sonu notu + sonraki maddenin künyesi (tekrar)
                        catchword = True
                    elif not txt.strip("* ") and not catchword:
                        events.append(("sep", ""))
                elif catchword:  # sayfa altındaki künye/dipnot dışında her şey atlanır
                    continue
                elif txt:
                    events.append(("p", txt))

            for kind, raw in events:
                if kind == "sep":  # madde ayracı: sonraki başlık yeni madde açar
                    sep_seen = True
                    continue
                clean = _FN_LINE.sub("", raw).strip().rstrip("*").strip()
                m = _HEADING.match(clean)
                # Dönüştürücünün başlık etiketi vermediği maddeler: sıradaki numarayla başlayan paragraf
                if kind == "p" and started and m and int(m.group(1).translate(_DIGITS)) == last_no + 1:
                    kind = "h"
                    t = _HEADING.match(title)
                    if t and t.group(1) == m.group(1):
                        clean = title
                if kind == "h":
                    if not started:
                        started = bool(start_re.search(clean))
                        if not (started and unnum_re and unnum_re.search(clean)):
                            continue
                    if not m and unnum_re and unnum_re.search(clean):
                        close()
                        group.append(Entry(book_id, len(entries) + 1, clean, "", vol=vol,
                                           page_start=page, page_end=page, section=section))
                        continue
                    if not m:
                        if group and section_re and not section_re.search(clean):
                            paras.append(f"### {clean}")
                            continue
                        close()
                        section = clean
                        continue
                    if paras or sep_seen:  # aksi halde önceki başlıkla metni paylaşır (ortak madde)
                        close()
                    sep_seen = False
                    last_no = int(m.group(1).translate(_DIGITS))
                    e = Entry(book_id, len(entries) + len(group) + 1, clean, "",
                              vol=vol, page_start=page, page_end=page,
                              number=last_no, section=section)
                    take_notes(raw, page_notes, e)
                    group.append(e)
                elif group:
                    if not paras and not clean.strip("]* "):  # "(^١)]" / "(^*)" kalıntısı: çapraz atıf
                        take_notes(raw, page_notes, group[-1])
                        continue

                    def sub(m):
                        n = m.group(1).translate(_DIGITS)
                        if n not in page_notes:
                            return ""
                        if n.startswith("*"):  # yıldızlı dipnot = tercüme kaynakları
                            group[-1].references.append(page_notes[n])
                            return ""
                        k = str(len(notes) + 1)
                        notes[k] = page_notes[n]
                        return f"[^{k}]"

                    paras.append(_FN_LINE.sub(sub, raw).strip())
            for e in group:
                e.page_end = page
    close()
    return entries

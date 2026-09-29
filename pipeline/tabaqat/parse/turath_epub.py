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

import html
import re
import warnings
import zipfile
from pathlib import PurePosixPath

from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

from ..schema import Entry

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_FOOTER = re.compile(r"(?:الجزء:\s*(\d+)\s*-\s*)?الصفحة:\s*(\d+)")
_HEADING = re.compile(r"^و?\[?\s*([\d٠-٩]+)\s*[-.]\s*(.+?)\s*\]?$")
# Paragraftan başlığa terfi için yalnız tireli biçim (numaralı listelerle karışmasın)
_P_HEADING = re.compile(r"^و?\[?\s*([\d٠-٩]+)\s*-\s*(.+?)\s*\]?$")
_INLINE_HEADING = re.compile(r"([\d٠-٩]+)\s*-\s*\[[^\]]+\]")
_FN_LINE = re.compile(r"\(\^([\d٠-٩]+|\*+)\)")
# Başlıksız madde paragrafında künyenin bittiği yer: tercümeyi açan ilk fiil/kalıp
_BIO_START = re.compile(r"\s(?:كان|أخذ|اخذ|تفقه|قرأ|ولد|روى|سمع|درس|له|هو|نسبة|نسبته|إمام|امام|قال|اشتغل)\s")


def _split_par_heading(txt: str, max_words: int = 16) -> tuple[str, str]:
    """"[X] بن Y الشهير بكذا كان إماما ..." → ("[X] بن Y الشهير بكذا", "كان إماما ...")"""
    txt = re.sub(r"\s*\(\s*[\d٠-٩]+\s*\)", "", txt)  # dipnot işaretleri: "(١)"
    m = _BIO_START.search(txt)
    cut = m.start() if m else len(txt)
    words = txt[:cut].split()
    if len(words) > max_words:
        return " ".join(words[:max_words]), " ".join(words[max_words:]) + txt[cut:]
    return txt[:cut].strip(), txt[cut:].strip()


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


def _unescape(txt: str) -> str:
    """Kaynakta iki-üç kat kaçışlanmış varlıklar var (&amp;quot;)."""
    while True:
        out = html.unescape(txt)
        if out == txt:
            return out
        txt = out


def parse(path: str, book_id: str, start_after_heading: str | None = None,
          unnumbered_entry: str | None = None, section_heading: str | None = None,
          stop_at_heading: str | None = None, entry_sections: str | None = None,
          series: dict[str, str] | None = None, preamble_entry: dict | None = None,
          co_entries: bool = False, entry_paragraph: str | None = None) -> list[Entry]:
    """
    start_after_heading: bu başlığa kadar olan kısım (tahkik mukaddimesi vb.) atlanır.
    stop_at_heading: bu başlıktan sonrası (hâtime, fihristler) atlanır.
    unnumbered_entry: numarasız ama madde sayılacak başlık (ör. Ebû Hanîfe tercümesi).
    section_heading: her zaman bölüm açan başlıklar. Numarasız madde açıkken buna uymayan
        başlıklar (ör. "فصل فى مولده") o maddenin içine alt başlık olarak eklenir.
    entry_sections: bu bölümlerde (ör. "كتاب الكنى") her numarasız başlık ayrı bir maddedir.
    series: {başlık regex: seri adı}; numaralamanın yeniden başladığı ek bölümler (zeyl).
    preamble_entry: {vol, page, title}; başlıksız başlayan madde (ör. mukaddimeden sonra
        doğrudan başlayan Ebû Hanîfe tercümesi).
    co_entries: aralarında metin olmayan ardışık başlıklar tek metni paylaşır (Ketâib'deki
        ortak tercümeler). Kapalıyken her başlık ayrı maddedir (tercüme başlıkta bitebilir).
    entry_paragraph: `entry_sections` içinde başlık etiketi almamış, bu kalıpla başlayan
        paragraf yeni maddedir (Fevâid'de "[عبد الرحمن بن محمد] بن أميرويه ... كان ...").
    """
    start_re = re.compile(start_after_heading) if start_after_heading else None
    stop_re = re.compile(stop_at_heading) if stop_at_heading else None
    unnum_re = re.compile(unnumbered_entry) if unnumbered_entry else None
    section_re = re.compile(section_heading) if section_heading else None
    entry_sec_re = re.compile(entry_sections) if entry_sections else None
    entry_par_re = re.compile(entry_paragraph) if entry_paragraph else None
    series_res = [(re.compile(k), v) for k, v in (series or {}).items()]
    started = start_re is None and preamble_entry is None
    stopped = False
    in_entry_section = False
    cur_series = ""
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

    def new_unnumbered(title: str, raw: str, page_notes, vol, page):
        close()
        e = Entry(book_id, len(entries) + 1, title, "", vol=vol, page_start=page,
                  page_end=page, section=section, series=cur_series)
        take_notes(raw, page_notes, e)
        group.append(e)

    with zipfile.ZipFile(path) as z:
        for name in _spine_pages(z):
            if stopped:
                break
            soup = BeautifulSoup(z.read(name), "lxml")
            title = soup.title.get_text(strip=True) if soup.title else ""
            body = soup.body
            vol = page = None
            page_notes: dict[str, str] = {}
            events: list[tuple[str, str]] = []
            catchword = False
            for el in body.find_all(["h2", "h3", "h4", "h5", "p"], recursive=False):
                txt = _unescape(el.get_text(" ", strip=True))
                classes = el.get("class") or []
                if el.name in ("h2", "h3", "h4"):
                    if not catchword:
                        events.append(("h", txt))
                elif el.name == "h5":  # madde içi ara başlık (ör. "فائدة")
                    if txt and not catchword:
                        events.append(("p", f"### {txt}"))
                elif "hamesh" in classes:
                    page_notes.update(_footnotes(el))
                elif "text-center" in classes and _FOOTER.search(txt):
                    m = _FOOTER.search(txt)
                    vol, page = int(m.group(1) or 1), int(m.group(2))
                elif txt.startswith("*"):
                    if "آخر الجزء" in txt:  # cilt sonu notu + sonraki maddenin künyesi (tekrar)
                        catchword = True
                    elif not txt.strip("* ") and not catchword:
                        events.append(("sep", ""))
                elif catchword:  # sayfa altındaki künye/dipnot dışında her şey atlanır
                    continue
                elif txt:
                    events.append(("p", txt))

            if (not started and preamble_entry and vol == preamble_entry.get("vol", 1)
                    and page == preamble_entry["page"]):
                started = True
                new_unnumbered(preamble_entry["title"], "", page_notes, vol, page)

            queue = list(reversed(events))
            while queue and not stopped:
                kind, raw = queue.pop()
                if kind == "sep":  # madde ayracı: sonraki başlık yeni madde açar
                    sep_seen = True
                    continue
                clean = re.sub(r"\s+", " ", _FN_LINE.sub("", raw)).strip().rstrip("*").strip()
                if (kind == "p" and in_entry_section and entry_par_re and group
                        and entry_par_re.match(clean)):
                    head, rest = _split_par_heading(clean)
                    new_unnumbered(head, raw, page_notes, vol, page)
                    if rest:
                        paras.append(rest)
                    continue
                m = _HEADING.match(clean) if kind == "h" else _P_HEADING.match(clean)
                if kind == "p" and started and not m:
                    # Paragraf ortasına gömülmüş sıradaki madde başlığı: "... ٢١٠٦ - [النجم الملطى] صاحبنا ..."
                    for im in _INLINE_HEADING.finditer(raw):
                        if int(im.group(1).translate(_DIGITS)) == last_no + 1:
                            before, head, after = raw[:im.start()], im.group(0), raw[im.end():]
                            queue.extend([("p", after), ("h", head)] if after.strip() else [("h", head)])
                            if before.strip():
                                queue.append(("p", before))
                            break
                    else:
                        im = None
                    if im is not None:
                        continue
                # Dönüştürücünün başlık etiketi vermediği maddeler: sıradaki numarayla başlayan paragraf
                if kind == "p" and started and m and int(m.group(1).translate(_DIGITS)) == last_no + 1:
                    kind = "h"
                    t = _HEADING.match(title)
                    if t and t.group(1) == m.group(1):
                        clean = title
                if kind == "h":
                    if not started:
                        started = bool(start_re and start_re.search(clean))
                        if not started:
                            continue
                        # Başlangıç başlığı madde ya da bölüm açıyorsa aşağıda işlenir
                        if not ((unnum_re and unnum_re.search(clean)) or
                                (section_re and section_re.search(clean))):
                            continue
                    if not m:
                        if stop_re and stop_re.search(clean):
                            close()
                            stopped = True
                            break
                        ser = next((v for r, v in series_res if r.search(clean)), None)
                        if ser is not None:
                            close()
                            cur_series, last_no, section, in_entry_section = ser, 0, clean, False
                            continue
                        if unnum_re and unnum_re.search(clean):
                            new_unnumbered(clean, raw, page_notes, vol, page)
                            continue
                        if section_re and section_re.search(clean):
                            close()
                            section = clean
                            in_entry_section = bool(entry_sec_re and entry_sec_re.search(clean))
                            continue
                        if in_entry_section:
                            new_unnumbered(clean, raw, page_notes, vol, page)
                            continue
                        if group and group[-1].number is None and section_re:
                            paras.append(f"### {clean}")
                            continue
                        close()
                        section = clean
                        in_entry_section = bool(entry_sec_re and entry_sec_re.search(clean))
                        continue
                    if paras or sep_seen or not co_entries:
                        close()
                    sep_seen = False
                    last_no = int(m.group(1).translate(_DIGITS))
                    e = Entry(book_id, len(entries) + len(group) + 1, clean, "",
                              vol=vol, page_start=page, page_end=page,
                              number=last_no, section=section, series=cur_series)
                    take_notes(raw, page_notes, e)
                    group.append(e)
                elif group:
                    if not paras and clean.strip("]*: ") in ("", "."):  # "(^١)]" / "(^*)" kalıntısı: çapraz atıf
                        take_notes(raw, page_notes, group[-1])
                        if clean.strip("]*: ") == ".":  # "(^*)." cümle bitti: boş madde, ortak değil
                            sep_seen = True
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

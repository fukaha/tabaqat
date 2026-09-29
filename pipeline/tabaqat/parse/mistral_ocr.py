"""Mistral OCR sayfa çıktısını (pages/page-N/page-metadata.json) temiz metne çevirir.

Yalnız gövde metni ve basılı sayfa numarası kalır. Atılanlar:
- sayfa başlığı/altlığı (üst başlık, sayfa numarası), resimler, fihrist sayfaları
- dipnotlar: OCR'ın "references" dediği bloklar ve dipnot bölgesindeki her şey. OCR bazı
  dipnotları "text" diye etiketler, bazı gövde bloklarını "references" diye; bu yüzden
  sayfadaki ilk numaralı dipnotun dikey konumu dipnot sınırı kabul edilir.
- metin içi dipnot işaretleri (¹²³, $^{٣}$)
- yazma nüsha varak işaretleri ("/" ve "[N] /", metin içindeki "[N]")

Madde numaraları ("[٣٥] إبراهيم بن ...") korunur. Varak numaralarıyla aynı biçimde
yazıldıkları için sıradan ayırt edilirler: madde numarası bir önceki madde numarasını
izler ve blok başında bir ismin önünde durur.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..schema import Entry

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
_FN_START = re.compile(r"^[٠-٩]+\.?\s+(?!\[)")  # "٣ انظر ..." / "٣. انظر" (ama "١ [٣٥] / ذكر" gövdedir)
_STRAY_MARK = re.compile(r"^[٠-٩]+\s+(?=\[|باب|حرف|ذكر)")  # başlık başında kalmış dipnot rakamı
_SUP = re.compile(r"\$\^\{[^}]*\}\$|[¹²³⁴⁵⁶⁷⁸⁹⁰]+")
# Üst simge olarak okunmamış dipnot işareti: kelimeye/noktalamaya yapışık rakam ("الدين٧", "،٨")
_GLUED_MARK = re.compile(r"(?<=[\u0621-\u064A\u064B-\u0652»)،.:؛])[٠-٩]{1,2}(?=[\s،.:؛»)\]]|$)")
# Harekeli metinde boşlukla ayrılmış dipnot işareti ("جِنَانِيٍّ ١ بْنِ"); metindeki gerçek sayılar
# ya tarihtir (٨١٦هـ) ya da yazıyla yazılır, bir-iki haneli çıplak rakam işarettir
_PAREN_MARK = re.compile(r"\s*\([٠-٩]{1,2}\)")
_SPACED_MARK = re.compile(r"(?<=[\u0621-\u064A\u064B-\u0652»)،.:؛\]\"]) [٠-٩]{1,2}(?=[ \n،.:؛]|$)")
# Yüzlü varak işareti: "[١٧١ظ]", "[٩و]", "[١٠ ظ]", "[١ط]"
_FOLIO_SIDE = re.compile(r"\s*\[[٠-٩]+\s*[ظوط]\]|\s*\[[٠-٩]+\s*/\s*[٠-٩أبab]\]\s*/?")  # [١٧١ظ], [٦٨/ب]
_LEAD_BRACKETS = re.compile(r"^((?:\s*\[[٠-٩]+\])+)\s*(/)?\s*")
_NUM_BRACKET = re.compile(r"\s*\[[٠-٩]+\]\s*/?")
_SLASH = re.compile(r"(^|\s)/(?=\s|$)")
_MAX_ENTRY_STEP = 6
_PENDING = object()
_PENDING_MARK = "\x00"
_ENTRY_START = re.compile(r"^\[[٠-٩]+\]\s*/?\s*(\S+ ){1,3}(بن|ابن|بنت) ")
_NAME_START = re.compile(r"^(\S+ ){1,3}(بن|ابن|بنت) ")
_ENTRY_HEAD = re.compile(r"^\S+ (بن|ابن) .*\[ت\.", re.S)
_NOT_ENTRY = re.compile(r"^(ذكر|حرف|قال|وقال|بسم)")
_HARAKAT = re.compile(r"[\u064B-\u0652\u0670\u0640]")


def _strip_harakat(s: str) -> str:
    return _HARAKAT.sub("", s)  # OCR'ın düşürdüğü birkaç madde numarasına tolerans


@dataclass
class Page:
    pdf: int
    page: int
    blocks: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n\n".join(self.blocks)


def _page_dirs(root: Path) -> list[tuple[int, Path]]:
    out = []
    for d in root.glob("page-*"):
        if (d / "page-metadata.json").exists():
            out.append((int(d.name.split("-")[1]), d))
    return sorted(out)


def _body_blocks(blocks: list[dict], height: int, entry_title: re.Pattern | None = None) -> list[dict]:
    """Dipnot sınırının üstündeki gövde bloklarını döndürür.

    entry_title: madde başı kalıbı ("٢٧٧ - ترجمة:"); OCR bunu header/footer/text diye de
    etiketleyebilir, her durumda başlık olarak tutulur ve dipnot sayılmaz.
    """
    blocks = [dict(b) for b in blocks]
    if entry_title is not None:
        for b in blocks:
            if entry_title.match(b["content"].strip().lstrip("#").strip()):
                b["type"] = "title"
    # Dipnot sınırı: sayfanın üst %30'undan aşağıdaki, rakamla başlayan gerçek dipnot blokları.
    # (Sayfa başlığı şeridinden içeriğe çevrilen "١ / باب الكنى" gibi bloklar sayılmaz.)
    fn_y = [b["topLeftY"] for b in blocks
            if b["type"] in ("references", "text", "list", "header") and b["topLeftY"] > 0.3 * height
            and _FN_START.match(b["content"].strip())]
    for b in blocks:
        # Sayfa başlığı şeridinin (üst ~%10) altındaki "header" blokları içeriktir:
        # harf başlıkları ("حرف التاء") ve madde başları yanlış etiketlenmiş.
        if (b["type"] == "header" and b["topLeftY"] > 0.1 * height
                and not re.fullmatch(r"[٠-٩]+", b["content"].strip())):
            b["type"] = "text"
    ref_y = [b["topLeftY"] for b in blocks if b["type"] == "references"]
    bound = min(fn_y) if fn_y else (min(ref_y) if ref_y else float("inf"))
    body = []
    for b in blocks:
        c = b["content"].strip()
        if not c:
            continue
        if entry_title is not None and b["type"] == "title" and entry_title.match(c.lstrip("#").strip()):
            body.append(b)  # sayfa altına düşmüş madde başı ("٨٢٨ - ترجمة:" footer olarak)
            continue
        # "[٨٥٧] / يعقوب بن إدريس ...": madde başı dipnot bölgesine düşmüş ya da "references"
        # diye etiketlenmiş olabilir; dipnotlar "[" ile başlamaz
        if _ENTRY_START.match(c) and b["type"] != "header":
            body.append(b)
            continue
        if b["topLeftY"] >= bound - 3:
            continue
        if b["type"] in ("text", "title", "list"):
            body.append(b)
        elif b["type"] == "references" and c.startswith("["):  # yanlış etiketlenmiş madde başı
            body.append(b)
    return body


def _one_digit_off(a: int, b: int) -> bool:
    x, y = str(a), str(b)
    return len(x) == len(y) and sum(i != j for i, j in zip(x, y)) == 1


def _pick_entry(nums: list[int], last: int, head_like: bool = True) -> int | None:
    """Blok başındaki köşeli numaralardan madde numarasını seçer (yoksa hepsi varaktır).

    Madde numarası bir öncekini birkaç adım içinde izler (OCR bazı numaraları düşürür).
    Bu aralıkta değilse, beklenen numaradan tek hanesi farklıysa OCR okuma hatası sayılır
    (٢↔٣ gibi). Varak numarası da çoğu zaman aynı blokta durur ve bu ikisine uymaz.
    """
    steps = [n for n in nums if 0 < n - last <= _MAX_ENTRY_STEP]
    if steps:  # makul bir numara asla değiştirilmez
        return min(steps)
    if not head_like:  # "[١٥٩] / سنة سبع ...": metin devamındaki varak numarası
        return None
    for n in reversed(nums):  # ancak aralık dışındaysa OCR hanesi düzeltilir (٣٦٤ → ٢٦٤)
        for exp in range(last + 1, last + 4):
            if _one_digit_off(n, exp):
                return exp
    return None


def clean_pages(root: str | Path, first_pdf_page: int, page_offset: int,
                first_entry: int = 1, last_pdf_page: int | None = None,
                entry_title: str | None = None, paren_marks: bool = False) -> list[Page]:
    """first_entry: ciltteki ilk madde numarası (numaralama ciltler boyunca sürer).
    last_pdf_page: bundan sonrası (fihrist vb.) atlanır.
    entry_title: "N - ترجمة" gibi başlık-satırı madde başı kalıbı (Kand).
    paren_marks: "(١)" biçimli dipnot işaretlerini sil.
    """
    title_re = re.compile(entry_title) if entry_title else None
    root = Path(root)
    pages: list[Page] = []
    last_entry = first_entry - 1
    for pdf, d in _page_dirs(root):
        if pdf < first_pdf_page or (last_pdf_page and pdf > last_pdf_page):
            continue
        meta = json.loads((d / "page-metadata.json").read_text(encoding="utf-8"))
        page = Page(pdf, pdf + page_offset)
        seen: set[str] = set()
        for b in _body_blocks(meta["blocks"], meta["dimensions"]["height"], title_re):
            c = b["content"].strip()
            if c in seen:  # OCR aynı bloğu iki kez verebiliyor
                continue
            seen.add(c)
            c = _GLUED_MARK.sub("", _STRAY_MARK.sub("", _SUP.sub("", c)))
            if paren_marks:
                c = _PAREN_MARK.sub("", c)
            heading = b["type"] == "title"
            c = c.lstrip("#").strip() if heading else c
            entry = None
            m = _LEAD_BRACKETS.match(c)
            if m:
                rest = c[m.end():]
                nums = [int(x.translate(_DIGITS)) for x in re.findall(r"[٠-٩]+", m.group(1))]
                # "ذكر إسرائيل" gibi bölüm başlıkları ve alıntı devamları madde değildir
                if rest.strip() and not _NOT_ENTRY.match(_strip_harakat(rest)):
                    plain = _strip_harakat(rest[:250])
                    head_like = bool(_NAME_START.match(plain) or "[ت." in plain)
                    entry = _pick_entry(nums, last_entry, head_like)
                    # Numarası okunamamış madde başı: "[٣٦٩] صالح بن إبراهيم ... [ت. ...]";
                    # numarası sonradan, iki komşu madde numarası arasında tam bir boşluk varsa verilir
                    if entry is None and _ENTRY_HEAD.match(_strip_harakat(rest[:250])):
                        entry = _PENDING
                c = rest
            c = _NUM_BRACKET.sub(" ", c)  # metin içi varak numaraları
            c = _SPACED_MARK.sub("", _FOLIO_SIDE.sub("", c))
            c = _SLASH.sub(r"\1", c)
            c = re.sub(r"(^|\s)/(?=[\u0621-\u064A])", r"\1", c)  # "/سراب": varak geçişi kelimeye yapışık
            c = re.sub(r"[ \t]+", " ", c)
            c = "\n".join(line.strip() for line in c.split("\n")).strip()
            if not c or c in ("ظ", "و"):  # tek başına kalmış varak yüzü
                continue
            if entry is _PENDING:
                c = _PENDING_MARK + c
            elif entry is not None:
                last_entry = entry
                c = f"[{str(entry).translate(_AR)}] {c}"
            if heading:
                c = f"## {c}"
            page.blocks.append(c)
        pages.append(page)
    _resolve_pending(pages, first_entry)
    return pages


def _resolve_pending(pages: list[Page], first_entry: int = 1) -> None:
    """İki okunmuş madde numarası arasındaki numarasız madde başlarını, sayıları boşluğa
    tam uyuyorsa sırayla numaralar; uymuyorsa numarasız bırakır."""
    flat = [(p, i) for p in pages for i in range(len(p.blocks))]
    prev, pending = first_entry - 1, []

    def num(b: str) -> int | None:
        m = re.match(r"^(?:## )?\[([٠-٩]+)\]", b)
        return int(m.group(1).translate(_DIGITS)) if m else None

    def flush(nxt: int | None):
        ok = nxt is not None and nxt - prev - 1 == len(pending)
        for k, (p, i) in enumerate(pending):
            body = p.blocks[i][len(_PENDING_MARK):]
            p.blocks[i] = f"[{str(prev + 1 + k).translate(_AR)}] {body}" if ok else body

    for p, i in flat:
        b = p.blocks[i]
        if b.startswith(_PENDING_MARK):
            pending.append((p, i))
            continue
        n = num(b)
        if n is not None:
            flush(n)
            prev, pending = n, []
    flush(None)


def to_markdown(pages: list[Page], title: str) -> str:
    parts = [f"# {title}\n"]
    for p in pages:
        parts.append(f"<!-- ص {str(p.page).translate(_AR)} -->\n\n{p.text}\n")
    return "\n".join(parts)


_SECTION = re.compile(r"^(?:## )?(حرف|ذكر|باب|خاتمة)(\s|$)")


def to_entries(pages: list[Page], book_id: str, vol: int = 1, names: dict | None = None) -> list[Entry]:
    """Temiz sayfalardan madde listesi: "[N] ..." ile başlayan blok yeni madde açar.

    names: {madde no: IndexEntry}; verilirse şahıs adı ve vefat notu fihristten alınır.
    """
    entries: list[Entry] = []
    cur: Entry | None = None
    paras: list[str] = []
    section = ""

    def close():
        nonlocal cur, paras
        if cur is not None:
            cur.text = "\n\n".join(paras).strip()
            entries.append(cur)
        cur, paras = None, []

    for p in pages:
        for b in p.blocks:
            m = re.match(r"^\[([٠-٩]+)\]\s*", b)
            if m:
                close()
                cur = Entry(book_id, len(entries) + 1, b, "", vol=vol, page_start=p.page,
                            page_end=p.page, number=int(m.group(1).translate(_DIGITS)),
                            section=section)
                head_extended = False
                ie = (names or {}).get(cur.number)
                if ie is not None:
                    cur.name, cur.death = ie.name, ie.death
                continue
            plain = _strip_harakat(b)
            if _SECTION.match(plain) and len(plain.split()) <= 5 and ":" not in plain:
                close()
                section = b.removeprefix("## ").strip()
                continue
            if cur is None:
                continue
            # Başlık bir sonraki bloğa taşmışsa ("[ت." ... "١٣٤٣/١٧٤٤م]") başlığa ekle
            if (not paras and not head_extended
                    and cur.heading_raw.count("[") > cur.heading_raw.count("]")):
                cur.heading_raw += " " + b
                head_extended = True  # yalnız bir blok; OCR köşeli parantezi kapatmamış olabilir
                continue
            paras.append(b)
            cur.page_end = p.page
    close()
    return entries


def to_title_entries(pages: list[Page], book_id: str, entry_title: str,
                     names: dict | None = None, vol: int = 1) -> list[Entry]:
    """"## ١ - ترجمة:" başlıklı kitaplar (Kand): şahıs adı sonraki paragrafın ":" öncesidir.

    "أبي معاذ بن سليمان البلخي: يروى عن ..." → ad "أبي معاذ بن سليمان البلخي", gerisi metin.
    """
    title_re = re.compile(entry_title)
    entries: list[Entry] = []
    cur: Entry | None = None
    paras: list[str] = []
    section = ""
    need_name = False

    def close():
        nonlocal cur, paras
        if cur is not None:
            cur.text = "\n\n".join(paras).strip()
            entries.append(cur)
        cur, paras = None, []

    for p in pages:
        for b in p.blocks:
            bare = b.removeprefix("## ").strip()
            m = title_re.match(bare)
            if m:
                close()
                n = int(m.group(1).translate(_DIGITS))
                cur = Entry(book_id, len(entries) + 1, bare, "", vol=vol, page_start=p.page,
                            page_end=p.page, number=n, section=section)
                need_name = True
                continue
            if re.match(r"^(حرف|باب) \S+$", _strip_harakat(bare)):
                close()
                section = bare
                continue
            if cur is None:
                continue
            if need_name:
                # Ad ":" ya da "." ile biter; bitmeden paragraf biterse ad sonraki kısa
                # paragrafta sürer ("... البكري" / "السمرقندي:")
                m2 = re.search(r"[:.]", b)
                if m2 and m2.start() < 250:
                    name, b = b[:m2.start()], b[m2.end():].strip()
                    need_name = False
                elif len(b) < 250:
                    name, b = b, ""
                    need_name = True
                else:
                    name, need_name = "", False
                if name.strip():
                    sep = " " if cur.heading_raw.endswith(":") else " "
                    cur.heading_raw = f"{cur.heading_raw}{sep}{' '.join(name.split())}"
                if not b:
                    continue
            paras.append(b)
            cur.page_end = p.page
    close()
    # Şahıs adı: fihristle isim hizalaması (fihrist numaralaması metinden kayabilir);
    # eşleşmeyenlerde başlıktaki ad
    if names:
        from .name_index import align_by_name
        aligned = align_by_name([(e.number, e.heading_raw) for e in entries], list(names.values()))
    else:
        aligned = {}
    for e in entries:
        ie = aligned.get(e.number)
        if ie is not None:
            e.name, e.death = ie.name, ie.death
        else:
            name = title_re.sub("", e.heading_raw, count=1).strip()
            if len(name) > 60 and "،" in name:  # adın ardından tercüme başlamış
                name = name.split("،")[0].strip()
            e.name = name
    return entries

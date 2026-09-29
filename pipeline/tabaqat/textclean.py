"""Yayın için biyografi metni temizliği.

Kaynak metinler (epub ve OCR) tarama ve sayfa düzeninden kalma kusurlar taşır: sayfa sonunda
cümle ortasında bölünen paragraflar, OCR'dan kalma satır sonları, çift boşluklar, noktalamadan
önce boşluk. Dipnot işaretleri ve muhakkik notları (metnin ``<hr>`` sonrası) yayında gösterilmez.
"""
from __future__ import annotations

import re

_FN = re.compile(r"\s*\[\^[^\]]*\]\s*")
_HARAKA = re.compile("[ً-ْ]")
# paragrafı bitiren işaretler; bunlarla bitmeyen paragraf sonraki ile birleşir
_END = re.compile(r"[.؟?!:»\])”…]\s*$")
_HEAD = re.compile(r"^#{1,6}\s")


def _is_verse(block: str) -> bool:
    """Tek satır sonlarıyla ayrılmış kısa, harekeli satırlar: şiir; satır düzeni korunur."""
    lines = [x for x in block.split("\n") if x.strip()]
    if not lines or any(len(x) > 110 for x in lines):
        return False
    letters = sum(1 for c in block if "ء" <= c <= "ي")
    return letters > 0 and len(_HARAKA.findall(block)) / letters > 0.3


def _is_bayt(block: str) -> bool:
    return " … " in block and len(block) < 160


def _spaces(s: str) -> str:
    s = re.sub(r"[ \t ]+", " ", s)
    s = re.sub(r" +([،,.:;؛؟?!)\]»])", r"\1", s)
    s = re.sub(r"([(\[«]) +", r"\1", s)
    return s.strip()


def clean_text(text: str) -> str:
    text = (text or "").replace("\r", "")
    text = re.split(r"\n*<hr>\n*", text, maxsplit=1)[0]          # muhakkik notları
    text = _FN.sub(" ", text)                                      # dipnot işaretleri
    blocks = [b.strip() for b in re.split(r"\n{2,}", text) if b.strip()]
    out: list[str] = []
    for b in blocks:
        verse = _is_verse(b) or _is_bayt(b)
        if not verse:
            b = re.sub(r"\s*\n\s*", " ", b)                         # OCR satır sonları
        b = "\n".join(_spaces(x) for x in b.split("\n")) if verse else _spaces(b)
        if not b:
            continue
        prev = out[-1] if out else ""
        if (prev and not _HEAD.match(prev) and not _HEAD.match(b) and not verse
                and "\n" not in prev and not _is_bayt(prev) and not _is_verse(prev) and not _END.search(prev)):
            out[-1] = f"{prev} {b}"                                 # sayfa sonunda bölünen paragraf
        else:
            out.append(b)
    return "\n\n".join(out)

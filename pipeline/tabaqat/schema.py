"""Ortak veri şeması: parser çıktısı ve sonraki aşamaların modelleri."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Entry:
    """Bir kitaptaki tek biyografi maddesi."""
    book_id: str
    seq: int
    heading_raw: str
    text: str
    vol: int | None = None
    page_start: int | None = None
    page_end: int | None = None

    @property
    def source_ref(self) -> str:
        pages = f"{self.page_start}" if self.page_end in (None, self.page_start) else f"{self.page_start}-{self.page_end}"
        return f"{self.book_id}:{self.vol or 1}:{pages}"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["source_ref"] = self.source_ref
        return d


@dataclass
class Person:
    id: str
    canonical_name_ar: str
    variants: list[str] = field(default_factory=list)
    death_year_h: int | None = None
    entries: list[str] = field(default_factory=list)  # "book_id:seq"


@dataclass
class Relation:
    teacher_id: str
    student_id: str
    evidence_entry: str
    evidence_text: str


@dataclass
class Place:
    id: str
    name_ar: str
    lat: float
    lon: float
    kind: str = "city"


@dataclass
class Journey:
    person_id: str
    place_id: str
    role: str  # birth | study | residence | death | hajj
    evidence_entry: str

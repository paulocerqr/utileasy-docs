from dataclasses import dataclass
from datetime import datetime
from typing import Literal

AllowedMimeType = Literal["application/pdf", "image/jpeg", "image/png"]
DocumentKind = Literal["pdf", "image"]


@dataclass(frozen=True, slots=True)
class NewDocument:
    title: str
    description: str | None
    original_filename: str
    stored_filename: str
    mime_type: AllowedMimeType
    size_bytes: int
    sha256: str


@dataclass(frozen=True, slots=True)
class Document:
    id: int
    title: str
    description: str | None
    original_filename: str
    stored_filename: str
    mime_type: AllowedMimeType
    size_bytes: int
    sha256: str
    uploaded_at: datetime

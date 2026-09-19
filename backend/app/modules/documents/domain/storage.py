from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

from app.modules.documents.domain.entities import AllowedMimeType, Document


class InvalidUploadError(ValueError):
    """O arquivo ou seus metadados enviados pelo usuário são inválidos."""


class UploadTooLargeError(InvalidUploadError):
    """O arquivo enviado excede o limite permitido."""


class StoredFileUnavailableError(OSError):
    """O arquivo armazenado não está disponível ou está inconsistente."""


@dataclass(frozen=True, slots=True)
class StagedFile:
    path: Path
    sha256: str
    size_bytes: int
    mime_type: AllowedMimeType
    stored_filename: str


class FileStorage(Protocol):
    def stage(
        self, stream: BinaryIO, filename: str | None, content_type: str | None
    ) -> StagedFile: ...

    def publish(self, staged: StagedFile) -> bool: ...

    def discard(self, staged: StagedFile) -> None: ...

    def remove_published(self, staged: StagedFile) -> None: ...

    def resolve(self, document: Document) -> Path: ...

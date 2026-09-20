from typing import Protocol

from app.modules.documents.domain.entities import Document, DocumentKind, NewDocument


class DocumentRepository(Protocol):
    def create(self, document: NewDocument) -> Document: ...

    def get_by_hash(self, sha256: str) -> Document | None: ...

    def lock_hash(self, sha256: str) -> None: ...

    def get_by_id(self, document_id: int) -> Document | None: ...

    def count_all(self) -> int: ...

    def list_all(
        self,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
        kind: DocumentKind | None = None,
    ) -> list[Document]: ...

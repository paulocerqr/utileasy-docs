from collections.abc import Callable
from pathlib import Path

from app.modules.documents.application.unit_of_work import DocumentUnitOfWork
from app.modules.documents.domain.entities import Document, DocumentKind
from app.modules.documents.domain.storage import FileStorage


class ReadDocuments:
    def __init__(
        self, unit_of_work: Callable[[], DocumentUnitOfWork], storage: FileStorage
    ) -> None:
        self._unit_of_work = unit_of_work
        self._storage = storage

    def list(
        self, search: str | None, limit: int, offset: int, kind: DocumentKind | None = None
    ) -> list[Document]:
        with self._unit_of_work() as unit:
            return unit.documents.list_all(search=search, limit=limit, offset=offset, kind=kind)

    def get(self, document_id: int) -> Document | None:
        with self._unit_of_work() as unit:
            return unit.documents.get_by_id(document_id)

    def count(self) -> int:
        with self._unit_of_work() as unit:
            return unit.documents.count_all()

    def file_path(self, document: Document) -> Path:
        return self._storage.resolve(document)

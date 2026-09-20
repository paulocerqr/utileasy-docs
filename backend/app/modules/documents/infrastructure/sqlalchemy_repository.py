from typing import cast

from sqlalchemy import Select, select, text
from sqlalchemy.orm import Session

from app.modules.documents.domain.entities import (
    AllowedMimeType,
    Document,
    DocumentKind,
    NewDocument,
)
from app.modules.documents.infrastructure.models import DocumentModel


class SqlAlchemyDocumentRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, document: NewDocument) -> Document:
        model = DocumentModel(
            title=document.title,
            description=document.description,
            original_filename=document.original_filename,
            stored_filename=document.stored_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            sha256=document.sha256,
        )
        self._session.add(model)
        self._session.flush()
        self._session.refresh(model)
        return self._to_entity(model)

    def get_by_hash(self, sha256: str) -> Document | None:
        model = self._session.scalar(select(DocumentModel).where(DocumentModel.sha256 == sha256))
        return self._to_entity(model) if model is not None else None

    def lock_hash(self, sha256: str) -> None:
        # O mesmo conteúdo usa o mesmo bloqueio transacional do PostgreSQL.
        lock_key = int.from_bytes(bytes.fromhex(sha256)[:8], byteorder="big", signed=True)
        self._session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})

    def get_by_id(self, document_id: int) -> Document | None:
        model = self._session.get(DocumentModel, document_id)
        return self._to_entity(model) if model is not None else None

    def list_all(
        self,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
        kind: DocumentKind | None = None,
    ) -> list[Document]:
        statement: Select[tuple[DocumentModel]] = select(DocumentModel)

        if search and (normalized_search := search.strip()):
            statement = statement.where(
                DocumentModel.title.icontains(normalized_search, autoescape=True)
                | DocumentModel.description.icontains(normalized_search, autoescape=True)
            )

        if kind == "pdf":
            statement = statement.where(DocumentModel.mime_type == "application/pdf")
        elif kind == "image":
            statement = statement.where(DocumentModel.mime_type.in_(("image/png", "image/jpeg")))

        statement = (
            statement.order_by(DocumentModel.uploaded_at.desc(), DocumentModel.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return [self._to_entity(model) for model in self._session.scalars(statement)]

    @staticmethod
    def _to_entity(model: DocumentModel) -> Document:
        return Document(
            id=model.id,
            title=model.title,
            description=model.description,
            original_filename=model.original_filename,
            stored_filename=model.stored_filename,
            mime_type=cast(AllowedMimeType, model.mime_type),
            size_bytes=model.size_bytes,
            sha256=model.sha256,
            uploaded_at=model.uploaded_at,
        )

import hashlib

import pytest
from sqlalchemy.orm import Session

from app.modules.comments.domain.entities import NewComment
from app.modules.comments.infrastructure.sqlalchemy_repository import (
    SqlAlchemyCommentRepository,
)
from app.modules.documents.domain.entities import DocumentKind, NewDocument
from app.modules.documents.infrastructure.sqlalchemy_repository import (
    SqlAlchemyDocumentRepository,
)

pytestmark = pytest.mark.integration


def create_document(
    repository: SqlAlchemyDocumentRepository,
    suffix: str,
    kind: DocumentKind = "pdf",
) -> int:
    document = repository.create(
        NewDocument(
            title=f"Contrato {suffix}",
            description="Documento de teste",
            original_filename=f"contrato-{suffix}.{'pdf' if kind == 'pdf' else 'png'}",
            stored_filename=f"stored-{suffix}.{'pdf' if kind == 'pdf' else 'png'}",
            mime_type="application/pdf" if kind == "pdf" else "image/png",
            size_bytes=1024,
            sha256=hashlib.sha256(suffix.encode()).hexdigest(),
        )
    )
    return document.id


def test_document_repository_persists_and_searches_documents(
    database_session: Session,
) -> None:
    repository = SqlAlchemyDocumentRepository(database_session)

    assert repository.count_all() == 0
    first_id = create_document(repository, "primeiro")
    second_id = create_document(repository, "segundo")

    assert repository.count_all() == 2
    assert repository.get_by_id(first_id) is not None
    assert [document.id for document in repository.list_all()] == [second_id, first_id]
    assert [document.id for document in repository.list_all("SEGUNDO")] == [second_id]
    assert [document.id for document in repository.list_all(limit=1, offset=1)] == [first_id]
    assert repository.list_all("%") == []
    assert repository.get_by_id(999_999) is None


def test_document_repository_filters_kind_before_pagination(database_session: Session) -> None:
    repository = SqlAlchemyDocumentRepository(database_session)
    pdf_id = create_document(repository, "pdf")
    image_id = create_document(repository, "imagem", "image")
    jpeg = repository.create(
        NewDocument(
            title="Fotografia",
            description=None,
            original_filename="foto.jpg",
            stored_filename="foto-repositorio.jpg",
            mime_type="image/jpeg",
            size_bytes=1024,
            sha256=hashlib.sha256(b"foto-repositorio").hexdigest(),
        )
    )

    assert [item.id for item in repository.list_all(kind="pdf")] == [pdf_id]
    assert [item.id for item in repository.list_all(kind="image")] == [jpeg.id, image_id]
    assert [item.id for item in repository.list_all(search="imagem", kind="image")] == [image_id]
    assert repository.list_all(search="imagem", kind="pdf") == []
    assert [item.id for item in repository.list_all(kind="image", limit=1, offset=1)] == [image_id]


def test_comment_repository_lists_only_comments_from_requested_document(
    database_session: Session,
) -> None:
    document_repository = SqlAlchemyDocumentRepository(database_session)
    comment_repository = SqlAlchemyCommentRepository(database_session)
    first_document_id = create_document(document_repository, "comentado")
    second_document_id = create_document(document_repository, "isolado")

    first_comment = comment_repository.create(
        NewComment(
            document_id=first_document_id,
            author_name="Ana",
            content="Primeiro comentário",
        )
    )
    second_comment = comment_repository.create(
        NewComment(
            document_id=first_document_id,
            content="Segundo comentário",
        )
    )
    comment_repository.create(NewComment(document_id=second_document_id, content="Outro documento"))

    comments = comment_repository.list_for_document(first_document_id)

    assert [comment.id for comment in comments] == [first_comment.id, second_comment.id]
    assert comments[1].author_name == "Anônimo"
    paged_comments = comment_repository.list_for_document(first_document_id, 1, 1)
    assert [comment.id for comment in paged_comments] == [second_comment.id]

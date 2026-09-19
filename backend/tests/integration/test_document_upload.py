import hashlib
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session, sessionmaker

from app.infrastructure.security.upload_rate_limit import RateLimitDecision
from app.infrastructure.storage.local import LocalFileStorage
from app.main import app
from app.modules.documents.application.create_document import CreateDocument
from app.modules.documents.infrastructure.models import DocumentModel
from app.modules.documents.infrastructure.sqlalchemy_repository import SqlAlchemyDocumentRepository
from app.modules.documents.infrastructure.unit_of_work import SqlAlchemyDocumentUnitOfWork
from app.modules.documents.presentation.router import get_create_document

pytestmark = pytest.mark.integration


class AllowAllLimiter:
    def check_and_record(self, client_ip: str) -> RateLimitDecision:
        return RateLimitDecision(True)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_upload_is_idempotent_by_file_hash(postgres_engine: Engine, tmp_path) -> None:
    storage = LocalFileStorage(tmp_path / "uploads", max_size_bytes=1024)
    sessions = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    use_case = CreateDocument(lambda: SqlAlchemyDocumentUnitOfWork(sessions), storage)
    content = b"%PDF-1.7\n" + uuid4().hex.encode() + b"\n%%EOF\n"
    content_hash = hashlib.sha256(content).hexdigest()

    try:
        first = use_case.execute(
            stream=BytesIO(content),
            filename="primeiro.pdf",
            content_type="application/pdf",
            title="Primeiro título",
            description="Descrição original",
        )
        second = use_case.execute(
            stream=BytesIO(content),
            filename="segundo.pdf",
            content_type="application/pdf",
            title="Outro título",
            description="Outra descrição",
        )

        assert first.already_exists is False
        assert second.already_exists is True
        assert second.document.id == first.document.id
        assert second.document.title == "Primeiro título"
        assert second.document.description == "Descrição original"
        with sessions() as session:
            assert SqlAlchemyDocumentRepository(session).get_by_hash(first.document.sha256)
        assert len(list(storage.directory.glob("*.pdf"))) == 1
        assert list((storage.directory / ".incoming").iterdir()) == []
    finally:
        with sessions() as session:
            session.execute(delete(DocumentModel).where(DocumentModel.sha256 == content_hash))
            session.commit()


def test_failed_database_insert_removes_published_file(
    database_session: Session, tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = LocalFileStorage(tmp_path / "uploads", max_size_bytes=1024)
    sessions = sessionmaker(bind=database_session.connection(), expire_on_commit=False)
    use_case = CreateDocument(lambda: SqlAlchemyDocumentUnitOfWork(sessions), storage)

    def fail_insert(*args: object, **kwargs: object) -> None:
        raise RuntimeError("Falha simulada do banco")

    monkeypatch.setattr(SqlAlchemyDocumentRepository, "create", fail_insert)

    with pytest.raises(RuntimeError, match="Falha simulada"):
        use_case.execute(
            stream=BytesIO(b"%PDF-1.7\n%%EOF\n"),
            filename="falha.pdf",
            content_type="application/pdf",
            title="Falha",
            description=None,
        )

    assert len(list(storage.directory.glob("*.pdf"))) == 0


@pytest.mark.anyio
async def test_upload_endpoint_returns_created_then_existing(
    postgres_engine: Engine, tmp_path
) -> None:
    sessions = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    service = CreateDocument(
        lambda: SqlAlchemyDocumentUnitOfWork(sessions),
        LocalFileStorage(tmp_path / "uploads", 1024),
    )
    content = b"%PDF-1.7\n" + uuid4().hex.encode() + b"\n%%EOF\n"
    content_hash = hashlib.sha256(content).hexdigest()
    app.dependency_overrides[get_create_document] = lambda: service
    previous_limiter = app.state.upload_limiter
    app.state.upload_limiter = AllowAllLimiter()

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.post(
                "/api/documents",
                data={"title": "Documento original"},
                files={"file": ("arquivo.pdf", content, "application/pdf")},
            )
            second = await client.post(
                "/api/documents",
                data={"title": "Título ignorado"},
                files={"file": ("copia.pdf", content, "application/pdf")},
            )
            invalid = await client.post(
                "/api/documents",
                data={"title": "Arquivo falso"},
                files={"file": ("falso.pdf", b"<script>invalido</script>", "application/pdf")},
            )
            oversized = await client.post(
                "/api/documents",
                data={"title": "Arquivo grande"},
                files={
                    "file": (
                        "grande.pdf",
                        b"%PDF-1.7\n" + b"x" * 1024 + b"%%EOF",
                        "application/pdf",
                    )
                },
            )

        assert first.status_code == 201
        assert second.status_code == 200
        assert first.json()["already_exists"] is False
        assert second.json()["already_exists"] is True
        assert second.json()["id"] == first.json()["id"]
        assert second.json()["title"] == "Documento original"
        assert invalid.status_code == 422
        assert oversized.status_code == 413
    finally:
        app.dependency_overrides.clear()
        app.state.upload_limiter = previous_limiter
        with sessions() as session:
            session.execute(delete(DocumentModel).where(DocumentModel.sha256 == content_hash))
            session.commit()


def test_concurrent_uploads_create_one_document(postgres_engine: Engine, tmp_path) -> None:
    sessions = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    service = CreateDocument(
        lambda: SqlAlchemyDocumentUnitOfWork(sessions),
        LocalFileStorage(tmp_path / "uploads", 1024),
    )
    content = b"%PDF-1.7\n" + uuid4().hex.encode() + b"\n%%EOF\n"
    content_hash = hashlib.sha256(content).hexdigest()

    def upload() -> tuple[int, bool]:
        result = service.execute(
            stream=BytesIO(content),
            filename="concorrente.pdf",
            content_type="application/pdf",
            title="Mesmo arquivo",
            description=None,
        )
        return result.document.id, result.already_exists

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _index: upload(), range(4)))

        assert len({document_id for document_id, _ in results}) == 1
        assert sum(not already_exists for _, already_exists in results) == 1
        assert len(list((tmp_path / "uploads").glob("*.pdf"))) == 1
    finally:
        with sessions() as session:
            session.execute(delete(DocumentModel).where(DocumentModel.sha256 == content_hash))
            session.commit()

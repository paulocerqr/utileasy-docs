import hashlib
from dataclasses import replace
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.infrastructure.storage.local import LocalFileStorage
from app.main import app
from app.modules.documents.application.read_documents import ReadDocuments
from app.modules.documents.domain.entities import Document, DocumentKind
from app.modules.documents.presentation.read_router import get_read_documents


class FakeUnitOfWork:
    def __init__(self, documents: list[Document]) -> None:
        self.documents = FakeRepository(documents)

    def __enter__(self) -> "FakeUnitOfWork":
        return self

    def __exit__(self, *args: object) -> None:
        return None


class FakeRepository:
    def __init__(self, documents: list[Document]) -> None:
        self._documents = documents

    def list_all(
        self, search: str | None, limit: int, offset: int, kind: DocumentKind | None = None
    ) -> list[Document]:
        matches = [
            document
            for document in self._documents
            if not search or search.lower() in document.title.lower()
        ]
        if kind == "pdf":
            matches = [item for item in matches if item.mime_type == "application/pdf"]
        elif kind == "image":
            matches = [item for item in matches if item.mime_type.startswith("image/")]
        return matches[offset : offset + limit]

    def get_by_id(self, document_id: int) -> Document | None:
        return next((item for item in self._documents if item.id == document_id), None)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.anyio
async def test_list_detail_view_download_and_range(tmp_path) -> None:
    content = b"%PDF-1.7\nconteudo de teste\n%%EOF\n"
    sha256 = hashlib.sha256(content).hexdigest()
    directory = tmp_path / "uploads"
    directory.mkdir()
    (directory / f"{sha256}.pdf").write_bytes(content)
    document = Document(
        id=42,
        title="Contrato",
        description="Assinado",
        original_filename="contrato final.pdf",
        stored_filename=f"{sha256}.pdf",
        mime_type="application/pdf",
        size_bytes=len(content),
        sha256=sha256,
        uploaded_at=datetime.now(UTC),
    )
    image = replace(document, id=43, title="Foto", mime_type="image/jpeg")
    service = ReadDocuments(
        lambda: FakeUnitOfWork([document, image]), LocalFileStorage(directory, 1024)
    )
    app.dependency_overrides[get_read_documents] = lambda: service

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            listing = await client.get("/api/documents", params={"search": "CONTR", "limit": 1})
            pdf_only = await client.get("/api/documents", params={"kind": "pdf"})
            images_only = await client.get("/api/documents", params={"kind": "image"})
            combined = await client.get(
                "/api/documents", params={"kind": "image", "search": "contr"}
            )
            empty = await client.get("/api/documents", params={"offset": 2})
            detail = await client.get("/api/documents/42")
            missing = await client.get("/api/documents/99")
            invalid_limit = await client.get("/api/documents", params={"limit": 101})
            invalid_kind = await client.get("/api/documents", params={"kind": "video"})
            view = await client.get("/api/documents/42/file")
            partial = await client.get("/api/documents/42/file", headers={"Range": "bytes=0-3"})
            download = await client.get("/api/documents/42/download")

            assert listing.status_code == 200
            assert listing.json()[0]["view_url"] == "/api/documents/42/file"
            assert listing.json()[0]["download_url"] == "/api/documents/42/download"
            assert [item["id"] for item in pdf_only.json()] == [42]
            assert [item["id"] for item in images_only.json()] == [43]
            assert combined.json() == []
            assert empty.json() == []
            assert detail.json()["title"] == "Contrato"
            assert missing.status_code == 404
            assert invalid_limit.status_code == 422
            assert invalid_kind.status_code == 422
            assert view.content == content
            assert view.headers["content-disposition"].startswith("inline;")
            assert view.headers["x-content-type-options"] == "nosniff"
            assert partial.status_code == 206
            assert partial.content == content[:4]
            assert download.content == content
            assert download.headers["content-disposition"].startswith("attachment;")

            stored_file = directory / f"{sha256}.pdf"
            stored_file.unlink()
            absent = await client.get("/api/documents/42/file")
            assert absent.status_code == 503

            stored_file.write_bytes(b"corrompido")
            corrupted = await client.get("/api/documents/42/file")
            assert corrupted.status_code == 503
            assert "uploads" not in corrupted.text
    finally:
        app.dependency_overrides.clear()

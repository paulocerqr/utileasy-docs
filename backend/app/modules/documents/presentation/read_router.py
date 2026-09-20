import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool

from app.config.settings import get_settings
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.storage.local import LocalFileStorage
from app.modules.documents.application.read_documents import ReadDocuments
from app.modules.documents.domain.entities import Document, DocumentKind
from app.modules.documents.domain.storage import StoredFileUnavailableError
from app.modules.documents.infrastructure.unit_of_work import SqlAlchemyDocumentUnitOfWork
from app.modules.documents.presentation.schemas import DocumentCountResponse, DocumentResponse

router = APIRouter(prefix="/documents", tags=["documents"])
logger = logging.getLogger(__name__)


def get_read_documents() -> ReadDocuments:
    settings = get_settings()
    storage = LocalFileStorage(
        settings.upload_directory,
        max_size_bytes=settings.max_upload_size_mb * 1024 * 1024,
    )
    return ReadDocuments(lambda: SqlAlchemyDocumentUnitOfWork(SessionFactory), storage)


def require_document(document_id: int, service: ReadDocuments) -> Document:
    document = service.get(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    return document


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    service: Annotated[ReadDocuments, Depends(get_read_documents)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    kind: DocumentKind | None = None,
) -> list[DocumentResponse]:
    documents = await run_in_threadpool(service.list, search, limit, offset, kind)
    return [DocumentResponse.from_document(document) for document in documents]


@router.get("/count", response_model=DocumentCountResponse)
async def count_documents(
    service: Annotated[ReadDocuments, Depends(get_read_documents)],
) -> DocumentCountResponse:
    total = await run_in_threadpool(service.count)
    return DocumentCountResponse(total=total)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: Annotated[int, Path(gt=0)],
    service: Annotated[ReadDocuments, Depends(get_read_documents)],
) -> DocumentResponse:
    document = await run_in_threadpool(require_document, document_id, service)
    return DocumentResponse.from_document(document)


async def respond_with_file(
    document_id: int, service: ReadDocuments, disposition: str
) -> FileResponse:
    document = await run_in_threadpool(require_document, document_id, service)
    try:
        file_path = await run_in_threadpool(service.file_path, document)
    except StoredFileUnavailableError as error:
        logger.error("Arquivo indisponível para o documento %s: %s", document_id, error)
        raise HTTPException(
            status_code=503, detail="Arquivo temporariamente indisponível."
        ) from error

    return FileResponse(
        file_path,
        media_type=document.mime_type,
        filename=document.original_filename,
        content_disposition_type=disposition,
        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"},
    )


@router.get("/{document_id}/file", response_class=FileResponse)
async def view_document(
    document_id: Annotated[int, Path(gt=0)],
    service: Annotated[ReadDocuments, Depends(get_read_documents)],
) -> FileResponse:
    return await respond_with_file(document_id, service, "inline")


@router.get("/{document_id}/download", response_class=FileResponse)
async def download_document(
    document_id: Annotated[int, Path(gt=0)],
    service: Annotated[ReadDocuments, Depends(get_read_documents)],
) -> FileResponse:
    return await respond_with_file(document_id, service, "attachment")

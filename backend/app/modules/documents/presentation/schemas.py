from datetime import datetime

from pydantic import BaseModel

from app.modules.documents.domain.entities import AllowedMimeType, Document


class DocumentResponse(BaseModel):
    id: int
    title: str
    description: str | None
    original_filename: str
    mime_type: AllowedMimeType
    size_bytes: int
    sha256: str
    uploaded_at: datetime
    view_url: str
    download_url: str

    @classmethod
    def from_document(cls, document: Document) -> "DocumentResponse":
        return cls(
            id=document.id,
            title=document.title,
            description=document.description,
            original_filename=document.original_filename,
            mime_type=document.mime_type,
            size_bytes=document.size_bytes,
            sha256=document.sha256,
            uploaded_at=document.uploaded_at,
            view_url=f"/api/documents/{document.id}/file",
            download_url=f"/api/documents/{document.id}/download",
        )


class UploadDocumentResponse(DocumentResponse):
    already_exists: bool


class DocumentCountResponse(BaseModel):
    total: int

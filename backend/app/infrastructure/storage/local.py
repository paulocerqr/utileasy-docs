import hashlib
import os
import tempfile
import warnings
from pathlib import Path
from typing import BinaryIO

from PIL import Image, UnidentifiedImageError

from app.modules.documents.domain.entities import AllowedMimeType, Document
from app.modules.documents.domain.storage import (
    InvalidUploadError,
    StagedFile,
    StoredFileUnavailableError,
    UploadTooLargeError,
)

CHUNK_SIZE = 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
PNG_END = b"\x00\x00\x00\x00IEND\xaeB`\x82"
FILE_TYPES: dict[str, tuple[AllowedMimeType, str]] = {
    ".pdf": ("application/pdf", ".pdf"),
    ".png": ("image/png", ".png"),
    ".jpg": ("image/jpeg", ".jpg"),
    ".jpeg": ("image/jpeg", ".jpg"),
}


class LocalFileStorage:
    def __init__(self, directory: Path, max_size_bytes: int) -> None:
        self.directory = directory
        self.max_size_bytes = max_size_bytes

    def stage(self, stream: BinaryIO, filename: str | None, content_type: str | None) -> StagedFile:
        if not filename or len(filename) > 255 or filename in {".", ".."}:
            raise InvalidUploadError("Nome do arquivo inválido.")
        if "/" in filename or "\\" in filename or any(ord(char) < 32 for char in filename):
            raise InvalidUploadError("Nome do arquivo inválido.")

        file_type = FILE_TYPES.get(Path(filename).suffix.lower())
        if file_type is None or content_type != file_type[0]:
            raise InvalidUploadError("Arquivo deve ser PDF, PNG ou JPEG com tipo correspondente.")

        self.directory.mkdir(parents=True, exist_ok=True)
        pending_directory = self.directory / ".incoming"
        pending_directory.mkdir(exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(prefix="upload-", dir=pending_directory)
        temporary_path = Path(temporary_name)

        try:
            digest = hashlib.sha256()
            first_bytes = b""
            last_bytes = b""
            size_bytes = 0

            with os.fdopen(descriptor, "wb") as output:
                while chunk := stream.read(CHUNK_SIZE):
                    size_bytes += len(chunk)
                    if size_bytes > self.max_size_bytes:
                        raise UploadTooLargeError("Arquivo excede o limite de tamanho permitido.")
                    if not first_bytes:
                        first_bytes = chunk[:16]
                    last_bytes = (last_bytes + chunk)[-2048:]
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())

            if size_bytes == 0:
                raise InvalidUploadError("Arquivo vazio não é permitido.")
            if not self._matches_signature(file_type[0], first_bytes, last_bytes):
                raise InvalidUploadError(
                    "Conteúdo do arquivo não corresponde ao formato informado."
                )
            if file_type[0] != "application/pdf":
                self._verify_image(temporary_path, file_type[0])

            sha256 = digest.hexdigest()
            return StagedFile(
                path=temporary_path,
                sha256=sha256,
                size_bytes=size_bytes,
                mime_type=file_type[0],
                stored_filename=f"{sha256}{file_type[1]}",
            )
        except BaseException:
            temporary_path.unlink(missing_ok=True)
            raise

    def publish(self, staged: StagedFile) -> bool:
        destination = self.directory / staged.stored_filename
        try:
            os.link(staged.path, destination)
            return True
        except FileExistsError:
            # Um arquivo órfão pode restar após uma falha. O nome, sozinho, não é confiável.
            if not destination.is_file() or self._sha256(destination) != staged.sha256:
                raise OSError("Arquivo armazenado com hash inconsistente.") from None
            return False

    def discard(self, staged: StagedFile) -> None:
        staged.path.unlink(missing_ok=True)

    def remove_published(self, staged: StagedFile) -> None:
        (self.directory / staged.stored_filename).unlink(missing_ok=True)

    def resolve(self, document: Document) -> Path:
        extension = next(
            (
                suffix
                for mime_type, suffix in FILE_TYPES.values()
                if mime_type == document.mime_type
            ),
            None,
        )
        expected_name = f"{document.sha256}{extension}"
        if (
            extension is None
            or len(document.sha256) != 64
            or any(char not in "0123456789abcdef" for char in document.sha256)
            or document.stored_filename != expected_name
        ):
            raise StoredFileUnavailableError("Metadados do arquivo inconsistentes.")

        path = self.directory / expected_name
        try:
            if (
                path.is_symlink()
                or not path.is_file()
                or path.stat().st_size != document.size_bytes
            ):
                raise StoredFileUnavailableError("Arquivo ausente ou inconsistente.")
            if self._sha256(path) != document.sha256:
                raise StoredFileUnavailableError("Hash do arquivo inconsistente.")
        except OSError as error:
            raise StoredFileUnavailableError("Arquivo indisponível.") from error
        return path

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(CHUNK_SIZE):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _verify_image(path: Path, mime_type: AllowedMimeType) -> None:
        expected_format = "PNG" if mime_type == "image/png" else "JPEG"
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(path) as image:
                    if image.format != expected_format or image.width * image.height > 20_000_000:
                        raise InvalidUploadError("Imagem inválida ou com dimensões excessivas.")
                    image.verify()
        except (OSError, UnidentifiedImageError, Image.DecompressionBombWarning) as error:
            raise InvalidUploadError("Imagem inválida ou danificada.") from error

    @staticmethod
    def _matches_signature(mime_type: AllowedMimeType, first: bytes, last: bytes) -> bool:
        if mime_type == "application/pdf":
            return first.startswith(b"%PDF-") and b"%%EOF" in last
        if mime_type == "image/png":
            return first.startswith(PNG_SIGNATURE) and last.endswith(PNG_END)
        return first.startswith(b"\xff\xd8\xff") and last.endswith(b"\xff\xd9")

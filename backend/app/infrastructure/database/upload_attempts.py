from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Identity, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database.base import Base


class UploadAttemptModel(Base):
    __tablename__ = "upload_attempts"
    __table_args__ = (
        Index("ix_upload_attempts_ip_created_at", "client_ip", "created_at"),
        Index("ix_upload_attempts_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    client_ip: Mapped[str] = mapped_column(String(45), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

"""Registra tentativas de upload para limitar abuso por IP."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260919_03"
down_revision: str | None = "20260919_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "upload_attempts",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("client_ip", sa.String(length=45), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_upload_attempts_ip_created_at", "upload_attempts", ["client_ip", "created_at"]
    )
    op.create_index("ix_upload_attempts_created_at", "upload_attempts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_upload_attempts_created_at", table_name="upload_attempts")
    op.drop_index("ix_upload_attempts_ip_created_at", table_name="upload_attempts")
    op.drop_table("upload_attempts")

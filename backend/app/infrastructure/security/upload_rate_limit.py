import hashlib
import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.infrastructure.database.upload_attempts import UploadAttemptModel

SHORT_WINDOW = timedelta(minutes=10)
DAILY_WINDOW = timedelta(days=1)


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int = 0
    window: str | None = None


class UploadRateLimiter(Protocol):
    def check_and_record(self, client_ip: str) -> RateLimitDecision: ...


class SqlUploadRateLimiter:
    def __init__(
        self, sessions: sessionmaker[Session], short_limit: int = 5, daily_limit: int = 20
    ) -> None:
        self._sessions = sessions
        self._short_limit = short_limit
        self._daily_limit = daily_limit

    def check_and_record(self, client_ip: str) -> RateLimitDecision:
        lock_key = int.from_bytes(
            hashlib.sha256(client_ip.encode()).digest()[:8], byteorder="big", signed=True
        )

        with self._sessions.begin() as session:
            session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": lock_key})
            now = datetime.now(UTC)
            daily_cutoff = now - DAILY_WINDOW
            short_cutoff = now - SHORT_WINDOW
            session.execute(
                delete(UploadAttemptModel).where(UploadAttemptModel.created_at < daily_cutoff)
            )
            attempts = list(
                session.scalars(
                    select(UploadAttemptModel.created_at)
                    .where(
                        UploadAttemptModel.client_ip == client_ip,
                        UploadAttemptModel.created_at >= daily_cutoff,
                    )
                    .order_by(UploadAttemptModel.created_at)
                )
            )
            recent = [created_at for created_at in attempts if created_at >= short_cutoff]

            if len(recent) >= self._short_limit:
                retry = math.ceil((recent[0] + SHORT_WINDOW - now).total_seconds())
                return RateLimitDecision(False, max(1, retry), "10_minutos")
            if len(attempts) >= self._daily_limit:
                retry = math.ceil((attempts[0] + DAILY_WINDOW - now).total_seconds())
                return RateLimitDecision(False, max(1, retry), "24_horas")

            session.add(UploadAttemptModel(client_ip=client_ip, created_at=now))
            return RateLimitDecision(True)

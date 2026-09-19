from concurrent.futures import ThreadPoolExecutor
from ipaddress import IPv6Address
from uuid import uuid4

import pytest
from sqlalchemy import Engine, delete
from sqlalchemy.orm import Session, sessionmaker

from app.infrastructure.database.upload_attempts import UploadAttemptModel
from app.infrastructure.security.upload_rate_limit import SqlUploadRateLimiter

pytestmark = pytest.mark.integration


def test_short_and_daily_windows_persist_between_instances(postgres_engine: Engine) -> None:
    sessions = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    short_ip = str(IPv6Address(uuid4().int))
    daily_ip = str(IPv6Address(uuid4().int))
    short_limiter = SqlUploadRateLimiter(sessions)
    daily_limiter = SqlUploadRateLimiter(sessions, short_limit=100)

    try:
        assert all(short_limiter.check_and_record(short_ip).allowed for _ in range(5))
        short_denied = SqlUploadRateLimiter(sessions).check_and_record(short_ip)
        assert short_denied.allowed is False
        assert short_denied.window == "10_minutos"
        assert 1 <= short_denied.retry_after_seconds <= 600

        assert all(daily_limiter.check_and_record(daily_ip).allowed for _ in range(20))
        daily_denied = SqlUploadRateLimiter(sessions, short_limit=100).check_and_record(daily_ip)
        assert daily_denied.allowed is False
        assert daily_denied.window == "24_horas"
        assert 1 <= daily_denied.retry_after_seconds <= 86400
    finally:
        with Session(postgres_engine) as session:
            session.execute(
                delete(UploadAttemptModel).where(
                    UploadAttemptModel.client_ip.in_([short_ip, daily_ip])
                )
            )
            session.commit()


def test_simultaneous_attempts_do_not_exceed_limit(postgres_engine: Engine) -> None:
    sessions = sessionmaker(bind=postgres_engine, expire_on_commit=False)
    client_ip = str(IPv6Address(uuid4().int))
    limiter = SqlUploadRateLimiter(sessions)

    try:
        with ThreadPoolExecutor(max_workers=10) as executor:
            decisions = list(executor.map(limiter.check_and_record, [client_ip] * 10))
        assert sum(decision.allowed for decision in decisions) == 5
    finally:
        with Session(postgres_engine) as session:
            session.execute(
                delete(UploadAttemptModel).where(UploadAttemptModel.client_ip == client_ip)
            )
            session.commit()

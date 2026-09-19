import pytest
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.config.settings import Settings
from app.infrastructure.security.upload_rate_limit import RateLimitDecision
from app.main import create_app
from app.presentation.upload_guard import UploadGuardMiddleware


class FakeLimiter:
    def __init__(self, decision: RateLimitDecision) -> None:
        self.decision = decision
        self.seen_ips: list[str] = []

    def check_and_record(self, client_ip: str) -> RateLimitDecision:
        self.seen_ips.append(client_ip)
        return self.decision


class FailingLimiter:
    def check_and_record(self, client_ip: str) -> RateLimitDecision:
        raise RuntimeError("banco indisponível")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_only_trusted_proxy_can_supply_client_ip() -> None:
    async def unused_app(scope, receive, send) -> None:
        return None

    guard = UploadGuardMiddleware(
        app=unused_app,
        settings=Settings(trusted_proxy_cidrs="172.16.0.0/12"),
    )
    header = [(b"x-utileasy-client-ip", b"203.0.113.9")]
    assert guard._client_ip({"client": ("172.20.0.3", 1234), "headers": header}) == "203.0.113.9"
    assert guard._client_ip({"client": ("198.51.100.3", 1234), "headers": header}) == "198.51.100.3"
    assert guard._client_ip({"client": ("172.20.0.3", 1234), "headers": header * 2}) == "172.20.0.3"
    assert (
        guard._client_ip({"client": ("172.20.0.3", 1234), "headers": [(header[0][0], b"invalido")]})
        == "172.20.0.3"
    )


@pytest.mark.anyio
async def test_rate_limit_returns_429_before_reading_body() -> None:
    limiter = FakeLimiter(RateLimitDecision(False, 37, "10_minutos"))
    app = create_app(limiter)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/documents", content=b"irrelevante")

    assert response.status_code == 429
    assert response.headers["retry-after"] == "37"
    assert response.json()["detail"]
    assert limiter.seen_ips == ["127.0.0.1"]


@pytest.mark.anyio
async def test_rate_limiter_failure_blocks_upload_without_exposing_details() -> None:
    app = create_app(FailingLimiter())
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/documents", content=b"irrelevante")

    assert response.status_code == 503
    assert response.json() == {"detail": "Upload temporariamente indisponível."}
    assert "banco indisponível" not in response.text


@pytest.mark.anyio
async def test_request_body_limit_returns_413_without_database() -> None:
    limiter = FakeLimiter(RateLimitDecision(True))
    app = create_app(limiter)
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            content=b"x" * (12 * 1024 * 1024 + 1),
            headers={"Content-Type": "application/octet-stream"},
        )

    assert response.status_code == 413
    assert response.json()["detail"] == "Arquivo excede o limite permitido."


@pytest.mark.anyio
async def test_chunked_request_without_content_length_is_limited() -> None:
    async def chunks():
        yield b"x" * (7 * 1024 * 1024)
        yield b"x" * (7 * 1024 * 1024)

    app = FastAPI()
    app.state.upload_limiter = FakeLimiter(RateLimitDecision(True))
    app.add_middleware(UploadGuardMiddleware, settings=Settings())

    @app.post("/api/documents")
    async def consume_body(request: Request) -> dict[str, bool]:
        await request.body()
        return {"ok": True}

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/documents",
            content=chunks(),
            headers={"Content-Type": "application/octet-stream"},
        )

    assert response.status_code == 413


@pytest.mark.anyio
async def test_unexpected_error_does_not_expose_internal_details() -> None:
    app = create_app(FakeLimiter(RateLimitDecision(True)))

    @app.get("/api/failure")
    async def fail() -> None:
        raise RuntimeError("segredo interno")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/failure")

    assert response.status_code == 500
    assert response.json() == {"detail": "Erro interno. Tente novamente mais tarde."}
    assert "segredo" not in response.text

import hashlib
import ipaddress
import logging

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config.settings import Settings
from app.infrastructure.security.upload_rate_limit import UploadRateLimiter

logger = logging.getLogger(__name__)


class RequestBodyTooLargeError(Exception):
    """O corpo da requisição ultrapassou o limite antes do processamento."""


class UploadGuardMiddleware:
    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.max_request_bytes = (settings.max_upload_size_mb + 2) * 1024 * 1024
        self.header_name = settings.client_ip_header.lower().encode("ascii")
        self.trusted_proxies = tuple(
            ipaddress.ip_network(value.strip())
            for value in settings.trusted_proxy_cidrs.split(",")
            if value.strip()
        )

    def _client_ip(self, scope: Scope) -> str:
        peer = scope.get("client")
        peer_value = peer[0] if peer else ""
        try:
            peer_ip = ipaddress.ip_address(peer_value)
        except ValueError:
            return "unknown"

        if any(peer_ip in network for network in self.trusted_proxies):
            header_values = [
                value
                for name, value in scope.get("headers", [])
                if name.lower() == self.header_name
            ]
            if len(header_values) == 1:
                try:
                    forwarded_ip = ipaddress.ip_address(header_values[0].decode("ascii"))
                    return forwarded_ip.compressed
                except (UnicodeDecodeError, ValueError):
                    logger.warning("Cabeçalho de IP do cliente inválido; usando IP do proxy.")
        return peer_ip.compressed

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        if scope.get("path") != "/api/documents":
            await self.app(scope, receive, send)
            return

        client_ip = self._client_ip(scope)
        limiter: UploadRateLimiter = scope["app"].state.upload_limiter
        try:
            decision = await run_in_threadpool(limiter.check_and_record, client_ip)
        except Exception:
            logger.exception("Falha ao verificar limite de uploads.")
            await self._respond(scope, receive, send, 503, "Upload temporariamente indisponível.")
            return

        if not decision.allowed:
            fingerprint = hashlib.sha256(client_ip.encode()).hexdigest()[:12]
            logger.warning("Upload limitado: cliente=%s janela=%s", fingerprint, decision.window)
            await self._respond(
                scope,
                receive,
                send,
                429,
                "Limite de uploads atingido. Tente novamente mais tarde.",
                {"Retry-After": str(decision.retry_after_seconds)},
            )
            return

        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    if int(value) > self.max_request_bytes:
                        await self._too_large(scope, receive, send)
                        return
                except ValueError:
                    pass

        received_bytes = 0
        response_started = False

        async def limited_receive() -> Message:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_request_bytes:
                    raise RequestBodyTooLargeError
            return message

        async def tracked_send(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracked_send)
        except RequestBodyTooLargeError:
            if response_started:
                raise
            await self._too_large(scope, receive, send)

    async def _too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        logger.warning("Requisição de upload excedeu o limite de corpo.")
        await self._respond(scope, receive, send, 413, "Arquivo excede o limite permitido.")

    @staticmethod
    async def _respond(
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        response = JSONResponse({"detail": detail}, status_code=status_code, headers=headers)
        await response(scope, receive, send)

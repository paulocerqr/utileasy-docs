import logging

from fastapi import FastAPI
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.config.settings import get_settings
from app.infrastructure.database.session import SessionFactory
from app.infrastructure.security.upload_rate_limit import SqlUploadRateLimiter, UploadRateLimiter
from app.presentation.router import api_router
from app.presentation.upload_guard import UploadGuardMiddleware


def configure_logging(level: str) -> None:
    logger = logging.getLogger("app")
    logger.setLevel(level.upper())
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        logger.addHandler(handler)
    logger.propagate = False


def create_app(limiter: UploadRateLimiter | None = None) -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    application = FastAPI(
        title="UtileasyDoc API",
        description="API for document storage and comment history.",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    application.state.upload_limiter = limiter or SqlUploadRateLimiter(
        SessionFactory,
        short_limit=settings.upload_rate_limit_short,
        daily_limit=settings.upload_rate_limit_daily,
    )
    application.add_middleware(UploadGuardMiddleware, settings=settings)

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, error: Exception) -> JSONResponse:
        logging.getLogger(__name__).error(
            "Erro inesperado em %s %s",
            request.method,
            request.url.path,
            exc_info=(type(error), error, error.__traceback__),
        )
        return JSONResponse(
            status_code=500, content={"detail": "Erro interno. Tente novamente mais tarde."}
        )

    application.include_router(api_router, prefix="/api")
    return application


app = create_app()

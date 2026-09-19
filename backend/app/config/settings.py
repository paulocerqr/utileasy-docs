from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://utileasydoc:change-me@localhost:5432/utileasydoc"
    upload_directory: Path = Path("uploads")
    max_upload_size_mb: PositiveInt = Field(default=10)
    trusted_proxy_cidrs: str = ""
    client_ip_header: str = "X-Utileasy-Client-IP"
    upload_rate_limit_short: PositiveInt = 5
    upload_rate_limit_daily: PositiveInt = 20


@lru_cache
def get_settings() -> Settings:
    return Settings()

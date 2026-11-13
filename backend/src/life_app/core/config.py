"""Validated runtime configuration; environment variables use the LIFE_ prefix."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LIFE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    public_base_url: AnyHttpUrl = AnyHttpUrl("http://localhost:8100")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    frontend_dir: Path = PROJECT_ROOT / "frontend" / "dist"
    documentation_dir: Path = PROJECT_ROOT / "site"

    @field_validator("frontend_dir", "documentation_dir", mode="after")
    @classmethod
    def resolve_directory(cls, value: Path) -> Path:
        value = value.expanduser()
        if not value.is_absolute():
            value = PROJECT_ROOT / value
        return value.resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()

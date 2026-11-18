"""Shared provider configuration contracts, independent of Life AI activation."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from life_app.platform.assistant.messages import tr


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SettingsInput(Input):
    provider: Literal["openai", "anthropic", "gemini"] | None = None
    model: str | None = Field(default=None, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")
    api_token: SecretStr | None = None

    @field_validator("api_token")
    @classmethod
    def token_length(cls, token):
        if token is not None and not 10 <= len(token.get_secret_value()) <= 4096:
            raise ValueError(tr("invalid_token"))
        return token


class SettingsOutput(BaseModel):
    provider: str
    model: str
    configured: bool
    token_hint: str | None


class CheckOutput(BaseModel):
    ok: bool


class Snippet(BaseModel):
    id: UUID
    application_id: str
    kind: str
    schema_version: Literal[1] = 1
    phase: Literal["preview", "result"]
    operation_id: UUID | None = None
    data: dict

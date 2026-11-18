"""Versioned assistant HTTP contracts. Secrets are write-only."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from life_app.platform.assistant.messages import tr
from life_app.platform.assistant.source_schemas import SourceOutput


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SettingsInput(Input):
    provider: Literal["openai", "anthropic", "gemini"] | None = None
    model: str | None = Field(default=None, max_length=120, pattern=r"^[a-zA-Z0-9._:-]+$")
    api_token: SecretStr | None = None
    memory_enabled: bool | None = None

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
    memory_enabled: bool


class ConversationInput(Input):
    title: str = Field(default="", max_length=160)


class ConversationUpdate(Input):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    archived: bool | None = None


class ConversationOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    archived: bool
    created_at: datetime
    updated_at: datetime


class ConversationPage(BaseModel):
    items: list[ConversationOutput]
    total: int


class Snippet(BaseModel):
    id: UUID
    application_id: str
    kind: str
    schema_version: Literal[1] = 1
    phase: Literal["preview", "result"]
    operation_id: UUID | None = None
    data: dict


class MessageOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "running", "interrupted", "failed"]
    snippets: list[Snippet]
    sources: list[SourceOutput] = Field(default_factory=list)
    run_id: UUID | None
    created_at: datetime


class ConversationDetail(BaseModel):
    conversation: ConversationOutput
    messages: list[MessageOutput]
    has_more: bool = False


class SendMessage(Input):
    content: str = Field(default="", max_length=12000)
    source_ids: list[UUID] = Field(default_factory=list, max_length=4)
    request_id: UUID

    @model_validator(mode="after")
    def nonempty_message(self):
        if not self.content and not self.source_ids:
            raise ValueError(tr("empty_message"))
        if len(set(self.source_ids)) != len(self.source_ids):
            raise ValueError(tr("source_context_limit"))
        return self


class MemoryInput(Input):
    content: str = Field(min_length=1, max_length=1000)
    category: str = Field(default="personal", min_length=1, max_length=40)


class MemoryOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    content: str
    category: str
    source_conversation_id: UUID | None
    source_message_id: UUID | None
    source_excerpt: str | None
    created_at: datetime
    updated_at: datetime


class MemoryPage(BaseModel):
    items: list[MemoryOutput]
    total: int


class OperationOutput(BaseModel):
    operation_id: UUID
    status: str
    result: dict | list | None
    snippet: Snippet


class CheckOutput(BaseModel):
    ok: bool


class CapabilityOutput(BaseModel):
    application_id: str
    name: str
    label: str
    description: str
    input_schema: dict
    mutating: bool
    confirmation: bool
    method: str
    path: str

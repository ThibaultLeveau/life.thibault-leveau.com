"""Private assistant state, separate from the business objects it can operate on."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class AssistantSettings(Base):
    __tablename__ = "assistant_settings"
    __table_args__ = (
        CheckConstraint("provider IN ('openai', 'anthropic', 'gemini')"),
        CheckConstraint("memory_version > 0"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(20), default="openai")
    model: Mapped[str] = mapped_column(String(120), default="")
    ciphertext: Mapped[str | None] = mapped_column(Text)
    token_hint: Mapped[str | None] = mapped_column(String(12))
    memory_enabled: Mapped[bool] = mapped_column(default=True)
    memory_version: Mapped[int] = mapped_column(default=1)
    memory_cutoff: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Conversation(Base):
    __tablename__ = "assistant_conversations"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    archived: Mapped[bool] = mapped_column(default=False)
    summary: Mapped[str] = mapped_column(Text, default="")
    summary_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Message(Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')"),
        CheckConstraint("status IN ('complete', 'running', 'interrupted', 'failed')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="complete")
    snippets: Mapped[list] = mapped_column(JSONB, default=list)
    run_id: Mapped[UUID | None] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class Run(Base):
    __tablename__ = "assistant_runs"
    __table_args__ = (
        UniqueConstraint("user_id", "request_id"),
        CheckConstraint("status IN ('running', 'complete', 'interrupted', 'failed')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[UUID] = mapped_column(
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[UUID] = mapped_column(
        ForeignKey("assistant_messages.id", ondelete="CASCADE")
    )
    request_id: Mapped[UUID] = mapped_column()
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="running")
    cancelled: Mapped[bool] = mapped_column(default=False)
    memory_version: Mapped[int] = mapped_column()
    session_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RunEvent(Base):
    __tablename__ = "assistant_run_events"
    __table_args__ = (UniqueConstraint("run_id", "sequence"),)
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("assistant_runs.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column()
    data: Mapped[dict] = mapped_column(JSONB)


class Operation(Base):
    __tablename__ = "assistant_operations"
    __table_args__ = (
        UniqueConstraint("run_id", "step"),
        CheckConstraint("status IN ('preview', 'complete', 'failed')"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[UUID] = mapped_column(
        ForeignKey("assistant_runs.id", ondelete="CASCADE"), index=True
    )
    step: Mapped[int] = mapped_column()
    application_id: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(100))
    arguments: Mapped[dict] = mapped_column(JSONB)
    argument_hash: Mapped[str] = mapped_column(String(64))
    precondition: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    result: Mapped[dict | list | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Memory(Base):
    __tablename__ = "assistant_memories"
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(String(1000))
    category: Mapped[str] = mapped_column(String(40), default="personal")
    source_conversation_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assistant_conversations.id", ondelete="SET NULL")
    )
    source_message_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assistant_messages.id", ondelete="SET NULL")
    )
    source_excerpt: Mapped[str | None] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

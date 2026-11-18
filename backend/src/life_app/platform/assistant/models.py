"""Shared provider credentials; legacy memory flags retain their existing columns."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base


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

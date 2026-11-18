"""Private transcription configuration and short-lived admission bookkeeping."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base


class TranscriptionSettings(Base):
    __tablename__ = "assistant_transcription_settings"
    __table_args__ = (
        CheckConstraint("provider IN ('openai', 'gemini')"),
        CheckConstraint("requests >= 0"),
    )
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(20), default="openai")
    model: Mapped[str] = mapped_column(String(120), default="gpt-transcribe")
    use_chat_provider: Mapped[bool] = mapped_column(default=True)
    ciphertext: Mapped[str | None] = mapped_column(Text)
    token_hint: Mapped[str | None] = mapped_column(String(12))
    lease_id: Mapped[UUID | None] = mapped_column()
    lease_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    requests: Mapped[int] = mapped_column(default=0)

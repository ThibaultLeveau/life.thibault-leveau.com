from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class ActivityRecord(Base):
    __tablename__ = "progression_activity"
    __table_args__ = (
        UniqueConstraint("owner_id", "application_id", "source_key"),
        CheckConstraint("xp > 0"),
        CheckConstraint(
            "jsonb_typeof(counters) = 'object' AND jsonb_typeof(dimensions) = 'object'"
        ),
        Index("ix_progression_activity_day", "owner_id", "application_id", "day"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    application_id: Mapped[str] = mapped_column(String(50))
    source_key: Mapped[str] = mapped_column(String(160))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    day: Mapped[date] = mapped_column(Date)
    xp: Mapped[int]
    counters: Mapped[dict] = mapped_column(JSONB)
    dimensions: Mapped[dict] = mapped_column(JSONB)
    imported: Mapped[bool] = mapped_column(default=False)


class Reward(Base):
    __tablename__ = "progression_rewards"
    __table_args__ = (
        UniqueConstraint("owner_id", "application_id", "source_key"),
        CheckConstraint("xp > 0 AND kind IN ('activity', 'quest')"),
        Index("ix_progression_rewards_time", "owner_id", "application_id", "occurred_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    application_id: Mapped[str] = mapped_column(String(50))
    source_key: Mapped[str] = mapped_column(String(180))
    kind: Mapped[str] = mapped_column(String(12))
    xp: Mapped[int]
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    imported: Mapped[bool] = mapped_column(default=False)


class Preferences(Base):
    __tablename__ = "progression_settings"
    __table_args__ = (CheckConstraint("version > 0 AND jsonb_typeof(settings) = 'object'"),)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    version: Mapped[int] = mapped_column(default=1)
    settings: Mapped[dict] = mapped_column(JSONB)


class ImportState(Base):
    __tablename__ = "progression_imports"
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    application_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

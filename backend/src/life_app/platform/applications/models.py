from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class ApplicationPreference(Base):
    __tablename__ = "application_preferences"
    __table_args__ = (
        CheckConstraint("application_id ~ '^[a-z][a-z0-9_]{0,49}$'", name="ck_application_id"),
    )

    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    application_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    enabled: Mapped[bool] = mapped_column()
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

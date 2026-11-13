from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)


class Preferences(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    theme: Literal["system", "light", "dark"] = "system"


class SessionOutput(BaseModel):
    user_id: UUID
    username: str
    csrf_token: str
    expires_at: datetime
    theme: Literal["system", "light", "dark"]

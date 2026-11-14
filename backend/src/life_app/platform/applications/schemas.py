from datetime import datetime

from pydantic import BaseModel, ConfigDict, StrictBool


class ActivationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: StrictBool


class ApplicationOutput(BaseModel):
    id: str
    name: str
    description: str
    path: str
    icon: str
    enabled: bool
    updated_at: datetime | None

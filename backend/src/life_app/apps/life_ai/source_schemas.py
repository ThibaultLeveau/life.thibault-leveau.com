"""Public metadata for private assistant sources; never expose inline binary data."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from life_app.apps.life_ai import documents


class SourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    url: str = Field(min_length=1, max_length=2048)


class SourceOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    kind: Literal["file", "web"]
    name: str
    media_type: str
    size_bytes: int
    sha256: str
    url: str | None
    page_count: int | None
    created_at: datetime
    removed_at: datetime | None


class SourceLimits(BaseModel):
    max_sources: int = documents.MAX_SOURCES
    max_file_bytes: int = documents.MAX_FILE_BYTES
    max_image_bytes: int = documents.MAX_IMAGE_BYTES
    max_total_bytes: int = documents.MAX_TOTAL_BYTES
    max_pdf_pages: int = documents.MAX_PDF_PAGES
    max_text_chars: int = documents.MAX_TEXT_CHARS
    max_image_dimension: int = documents.MAX_IMAGE_DIMENSION
    max_image_pixels: int = documents.MAX_IMAGE_PIXELS
    pending_ttl_hours: int = 24
    storage_quota_bytes: int
    accepted_extensions: list[str] = list(documents.FORMATS)
    accepted_media_types: list[str] = sorted(set(documents.FORMATS.values()))

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from life_app.core.database import Base, utcnow


class Ingredient(Base):
    __tablename__ = "recipes_ingredients"
    __table_args__ = (
        CheckConstraint("unit IN ('g','mg','l','ml','tsp','tbsp','u')"),
        CheckConstraint("length(trim(name_fr)) > 0 AND length(trim(name_en)) > 0"),
        CheckConstraint("(owner_id IS NULL) = (builtin_key IS NOT NULL)"),
        UniqueConstraint("owner_id", "normalized_name"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    builtin_key: Mapped[str | None] = mapped_column(String(80), unique=True)
    name_fr: Mapped[str] = mapped_column(String(120))
    name_en: Mapped[str] = mapped_column(String(120))
    normalized_name: Mapped[str] = mapped_column(String(240))
    search_text: Mapped[str] = mapped_column(String(500))
    unit: Mapped[str] = mapped_column(String(4))
    category: Mapped[str] = mapped_column(String(30), default="other")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Recipe(Base):
    __tablename__ = "recipes_recipes"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        CheckConstraint("version > 0 AND servings BETWEEN 1 AND 1000"),
        CheckConstraint("length(trim(title)) > 0"),
        Index("ix_recipes_owner", "owner_id", "archived_at", "updated_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(160))
    servings: Mapped[int]
    instructions: Mapped[str] = mapped_column(String(20000), default="")
    source_url: Mapped[str | None] = mapped_column(String(2048))
    source_title: Mapped[str | None] = mapped_column(String(300))
    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecipeItem(Base):
    __tablename__ = "recipes_recipe_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["recipe_id", "owner_id"], ["recipes_recipes.id", "recipes_recipes.owner_id"]
        ),
        UniqueConstraint("recipe_id", "ingredient_id", "unit"),
        CheckConstraint("quantity > 0 AND quantity <= 1000000000"),
        CheckConstraint("unit IN ('g','mg','l','ml','tsp','tbsp','u') AND position >= 0"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    recipe_id: Mapped[UUID]
    ingredient_id: Mapped[UUID] = mapped_column(ForeignKey("recipes_ingredients.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    unit: Mapped[str] = mapped_column(String(4))
    position: Mapped[int]


class ShoppingList(Base):
    __tablename__ = "recipes_lists"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        CheckConstraint("version > 0 AND length(trim(title)) > 0"),
        CheckConstraint("kind IN ('list','template')"),
        CheckConstraint("kind = 'list' OR completed_at IS NULL"),
        Index("ix_recipes_lists_owner", "owner_id", "kind", "archived_at", "updated_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(10), default="list")
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ShoppingItem(Base):
    __tablename__ = "recipes_list_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["list_id", "owner_id"], ["recipes_lists.id", "recipes_lists.owner_id"]
        ),
        UniqueConstraint("list_id", "ingredient_id", "unit"),
        UniqueConstraint("list_id", "normalized_name", "unit", name="uq_recipes_free_item"),
        CheckConstraint(
            "(ingredient_id IS NOT NULL AND name IS NULL AND normalized_name IS NULL) OR "
            "(ingredient_id IS NULL AND name IS NOT NULL AND normalized_name IS NOT NULL "
            "AND length(trim(name)) > 0 AND length(trim(normalized_name)) > 0)",
            name="ck_recipes_item_identity",
        ),
        CheckConstraint("quantity > 0 AND quantity <= 1000000000"),
        CheckConstraint("purchased_quantity >= 0 AND purchased_quantity <= quantity"),
        CheckConstraint("unit IN ('g','mg','l','ml','tsp','tbsp','u') AND position >= 0"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    list_id: Mapped[UUID]
    ingredient_id: Mapped[UUID | None] = mapped_column(ForeignKey("recipes_ingredients.id"))
    name: Mapped[str | None] = mapped_column(String(120))
    normalized_name: Mapped[str | None] = mapped_column(String(240))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    purchased_quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6), default=Decimal(0))
    unit: Mapped[str] = mapped_column(String(4))
    position: Mapped[int]


class Event(Base):
    __tablename__ = "recipes_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["recipe_id", "owner_id"], ["recipes_recipes.id", "recipes_recipes.owner_id"]
        ),
        ForeignKeyConstraint(
            ["list_id", "owner_id"], ["recipes_lists.id", "recipes_lists.owner_id"]
        ),
        UniqueConstraint("owner_id", "reward_key"),
        CheckConstraint("(recipe_id IS NOT NULL) <> (list_id IS NOT NULL)"),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'"),
        CheckConstraint(
            "kind IN ('recipe_created','recipe_updated','list_created','list_updated',"
            "'item_added','item_updated','item_removed','recipe_imported','checked',"
            "'completed','reopened','archived','restored','template_ready')"
        ),
        Index("ix_recipes_events_owner", "owner_id", "occurred_at"),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    recipe_id: Mapped[UUID | None]
    list_id: Mapped[UUID | None]
    kind: Mapped[str] = mapped_column(String(24))
    reward_key: Mapped[str | None] = mapped_column(String(100))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    snapshot: Mapped[dict] = mapped_column(JSONB)


class WebImportReceipt(Base):
    __tablename__ = "recipes_web_import_receipts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["recipe_id", "owner_id"], ["recipes_recipes.id", "recipes_recipes.owner_id"]
        ),
    )
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    import_id: Mapped[UUID] = mapped_column(primary_key=True)
    recipe_id: Mapped[UUID]
    fingerprint: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

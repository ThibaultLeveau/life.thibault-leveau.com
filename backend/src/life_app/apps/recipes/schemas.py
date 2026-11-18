from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator

from life_app.apps.recipes.messages import tr

Unit = Literal["g", "mg", "l", "ml", "tsp", "tbsp", "u"]
Kind = Literal["list", "template"]
Quantity = Annotated[Decimal, Field(gt=0, le=1000000000, decimal_places=6, allow_inf_nan=False)]
Servings = Annotated[int, Field(ge=1, le=1000, strict=True)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True, str_strip_whitespace=True)


class Version(Contract):
    expected_version: int = Field(ge=1, strict=True)


class Archive(Version):
    archived: StrictBool


class IngredientInput(Contract):
    name: str = Field(min_length=1, max_length=120)
    unit: Unit


class IngredientOutput(Contract):
    id: UUID
    name: str
    name_fr: str
    name_en: str
    unit: Unit
    category: str
    builtin: bool


class IngredientPage(Contract):
    items: list[IngredientOutput]
    total: int
    offset: int
    limit: int


class ItemInput(Contract):
    ingredient_id: UUID
    quantity: Quantity
    unit: Unit


class ItemOutput(ItemInput):
    id: UUID
    name: str
    category: str
    position: int
    purchased_quantity: Decimal = Decimal(0)
    checked: bool = False


class ShoppingItemInput(Contract):
    """Exactly one of ingredient_id (catalogue) or name (free item), with optional amount/unit."""

    ingredient_id: UUID | None = Field(
        None, description="Catalogue reference. Supply either ingredient_id or name, never both."
    )
    name: str | None = Field(
        None,
        min_length=1,
        max_length=120,
        description="Free item stored only in the list, without creating a catalogue ingredient.",
    )
    quantity: Quantity = Decimal(1)
    unit: Unit = "u"

    @model_validator(mode="after")
    def item_identity(self):
        if (self.ingredient_id is None) == (self.name is None):
            raise ValueError(tr("item_identity"))
        return self


class ShoppingItemOutput(ItemOutput):
    ingredient_id: UUID | None


class PreparationSection(Contract):
    title: str = Field(min_length=1, max_length=160)
    text: str = Field(min_length=1, max_length=20000)


class Preparation(Contract):
    instructions: str = Field("", max_length=20000)
    sections: list[PreparationSection] = Field(
        default_factory=list,
        max_length=50,
        description=(
            "Ordered titled preparation sections. Omit on update to preserve existing "
            "sections; [] clears them."
        ),
    )

    @model_validator(mode="after")
    def preparation_size(self):
        if len(self.instructions) + sum(len(s.text) for s in self.sections) > 20000:
            raise ValueError(tr("preparation_too_long"))
        return self


class RecipeInput(Preparation):
    title: str = Field(min_length=1, max_length=160)
    servings: Servings = 2
    items: list[ItemInput] = Field(min_length=1, max_length=200)


class RecipeUpdate(RecipeInput, Version):
    pass


class RecipeOutput(Contract):
    source_url: str | None = None
    source_title: str | None = None
    imported_at: datetime | None = None
    id: UUID
    title: str
    servings: int
    base_servings: int
    instructions: str
    sections: list[PreparationSection]
    version: int
    items: list[ItemOutput]
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class RecipePage(Contract):
    items: list[RecipeOutput]
    total: int
    offset: int
    limit: int


class ListInput(Contract):
    title: str = Field(min_length=1, max_length=160)
    kind: Kind = "list"
    items: list[ShoppingItemInput] = Field(default_factory=list, max_length=300)


class ListUpdate(Version):
    title: str = Field(min_length=1, max_length=160)


class ListCopy(Version):
    title: str = Field(min_length=1, max_length=160)
    kind: Kind = "list"


class ListOutput(Contract):
    id: UUID
    title: str
    kind: Kind
    version: int
    items: list[ShoppingItemOutput]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class ListPage(Contract):
    items: list[ListOutput]
    total: int
    offset: int
    limit: int


class AddItem(ShoppingItemInput, Version):
    pass


class EditItem(Version):
    quantity: Quantity


class CheckItem(Version):
    checked: StrictBool


class ImportRecipe(Version):
    recipe_id: UUID
    recipe_version: int = Field(ge=1, strict=True)
    servings: Servings


class CompleteList(Version):
    completed: StrictBool


class EventOutput(Contract):
    id: UUID
    recipe_id: UUID | None
    list_id: UUID | None
    kind: str
    occurred_at: datetime
    snapshot: dict

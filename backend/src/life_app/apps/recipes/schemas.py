from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool

Unit = Literal["g", "l", "u"]
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


class RecipeInput(Contract):
    title: str = Field(min_length=1, max_length=160)
    servings: Servings = 2
    instructions: str = Field("", max_length=20000)
    items: list[ItemInput] = Field(min_length=1, max_length=200)


class RecipeUpdate(RecipeInput, Version):
    pass


class RecipeOutput(Contract):
    id: UUID
    title: str
    servings: int
    base_servings: int
    instructions: str
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
    items: list[ItemInput] = Field(default_factory=list, max_length=300)


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
    items: list[ItemOutput]
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    archived_at: datetime | None


class ListPage(Contract):
    items: list[ListOutput]
    total: int
    offset: int
    limit: int


class AddItem(ItemInput, Version):
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

from uuid import UUID

from fastapi import APIRouter, Query

from life_app.apps.recipes import models as m
from life_app.apps.recipes import schemas as s
from life_app.apps.recipes import service as svc
from life_app.core.database import Database
from life_app.platform.auth.service import CurrentUser

router = APIRouter(prefix="/recipes", tags=["Recipes & shopping"])


def saved(db, item):
    result = svc.output(db, item)
    db.commit()
    return result


@router.get("/ingredients", response_model=s.IngredientPage)
def ingredients(
    user: CurrentUser,
    db: Database,
    q: str = Query("", max_length=120),
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return svc.ingredients(db, user, q, offset, limit)


@router.post("/ingredients", response_model=s.IngredientOutput, status_code=201)
def create_ingredient(payload: s.IngredientInput, user: CurrentUser, db: Database):
    result = svc.ingredient_output(svc.create_ingredient(db, user, payload))
    db.commit()
    return result


@router.get("/recipes", response_model=s.RecipePage)
def recipes(
    user: CurrentUser,
    db: Database,
    archived: bool = False,
    q: str = Query("", max_length=160),
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
):
    return svc.page(db, user, m.Recipe, archived, q, offset, limit)


@router.get("/lists", response_model=s.ListPage)
def lists(
    user: CurrentUser,
    db: Database,
    kind: s.Kind = "list",
    archived: bool = False,
    q: str = Query("", max_length=160),
    offset: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=100),
):
    return svc.page(db, user, m.ShoppingList, archived, q, offset, limit, kind)


@router.post("/recipes", response_model=s.RecipeOutput, status_code=201)
def create_recipe(payload: s.RecipeInput, user: CurrentUser, db: Database):
    return saved(db, svc.create_recipe(db, user, payload))


@router.get("/recipes/{id}", response_model=s.RecipeOutput)
def recipe(
    id: UUID, user: CurrentUser, db: Database, servings: int | None = Query(None, ge=1, le=1000)
):
    return svc.output(db, svc.owned(db, user, m.Recipe, id), servings)


@router.put("/recipes/{id}", response_model=s.RecipeOutput)
def update_recipe(id: UUID, payload: s.RecipeUpdate, user: CurrentUser, db: Database):
    return saved(db, svc.update_recipe(db, user, svc.owned(db, user, m.Recipe, id), payload))


@router.put("/recipes/{id}/archive", response_model=s.RecipeOutput)
def archive_recipe(id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return saved(db, svc.archive(db, user, svc.owned(db, user, m.Recipe, id), payload))


@router.get("/recipes/{id}/history", response_model=list[s.EventOutput])
def recipe_history(
    id: UUID,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return svc.history(db, user, svc.owned(db, user, m.Recipe, id), offset, limit)


@router.post("/lists", response_model=s.ListOutput, status_code=201)
def create_list(payload: s.ListInput, user: CurrentUser, db: Database):
    return saved(db, svc.create_list(db, user, payload))


@router.get("/lists/{id}", response_model=s.ListOutput)
def shopping_list(id: UUID, user: CurrentUser, db: Database):
    return svc.output(db, svc.owned(db, user, m.ShoppingList, id))


@router.put("/lists/{id}", response_model=s.ListOutput)
def update_list(id: UUID, payload: s.ListUpdate, user: CurrentUser, db: Database):
    return saved(db, svc.update_list(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.put("/lists/{id}/archive", response_model=s.ListOutput)
def archive_list(id: UUID, payload: s.Archive, user: CurrentUser, db: Database):
    return saved(db, svc.archive(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.get("/lists/{id}/history", response_model=list[s.EventOutput])
def list_history(
    id: UUID,
    user: CurrentUser,
    db: Database,
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
):
    return svc.history(db, user, svc.owned(db, user, m.ShoppingList, id), offset, limit)


@router.post("/lists/{id}/copy", response_model=s.ListOutput, status_code=201)
def copy_list(id: UUID, payload: s.ListCopy, user: CurrentUser, db: Database):
    return saved(db, svc.copy_list(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.post("/lists/{id}/items", response_model=s.ListOutput, status_code=200)
def add_item(id: UUID, payload: s.AddItem, user: CurrentUser, db: Database):
    return saved(db, svc.add_item(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.post("/lists/{id}/import", response_model=s.ListOutput, status_code=200)
def import_recipe(id: UUID, payload: s.ImportRecipe, user: CurrentUser, db: Database):
    return saved(db, svc.import_recipe(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.put("/lists/{id}/complete", response_model=s.ListOutput, status_code=200)
def complete(id: UUID, payload: s.CompleteList, user: CurrentUser, db: Database):
    return saved(db, svc.complete(db, user, svc.owned(db, user, m.ShoppingList, id), payload))


@router.put("/lists/{id}/items/{item_id}", response_model=s.ListOutput)
def edit_item(id: UUID, item_id: UUID, payload: s.EditItem, user: CurrentUser, db: Database):
    return saved(
        db,
        svc.change_item(
            db, user, svc.owned(db, user, m.ShoppingList, id), item_id, payload, "item_updated"
        ),
    )


@router.delete("/lists/{id}/items/{item_id}", response_model=s.ListOutput)
def remove_item(id: UUID, item_id: UUID, payload: s.Version, user: CurrentUser, db: Database):
    return saved(
        db,
        svc.change_item(
            db, user, svc.owned(db, user, m.ShoppingList, id), item_id, payload, "item_removed"
        ),
    )


@router.put("/lists/{id}/items/{item_id}/check", response_model=s.ListOutput)
def check_item(id: UUID, item_id: UUID, payload: s.CheckItem, user: CurrentUser, db: Database):
    return saved(
        db,
        svc.change_item(
            db, user, svc.owned(db, user, m.ShoppingList, id), item_id, payload, "checked"
        ),
    )

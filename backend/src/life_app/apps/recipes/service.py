"""Owner-serialized mutations, decimal arithmetic and immutable shopping facts."""

import unicodedata
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import delete, func, or_, select

from life_app.apps.recipes import models as m
from life_app.apps.recipes import schemas as s
from life_app.apps.recipes.messages import tr
from life_app.apps.recipes.progression import provider
from life_app.core.database import utcnow
from life_app.core.i18n import locale
from life_app.platform.progression.service import record


def normalize(value):
    value = value.casefold().replace("œ", "oe").replace("æ", "ae")
    return " ".join(
        "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))
        .replace("’", "'")
        .split()
    )


def visible(user):
    return or_(m.Ingredient.owner_id.is_(None), m.Ingredient.owner_id == user.id)


def ingredient_output(item):
    return s.IngredientOutput(
        id=item.id,
        name=item.name_en if locale() == "en" else item.name_fr,
        name_fr=item.name_fr,
        name_en=item.name_en,
        unit=item.unit,
        category=item.category,
        builtin=item.owner_id is None,
    )


def ingredients(db, user, q, offset, limit):
    query = select(m.Ingredient).where(visible(user))
    if q.strip():
        query = query.where(m.Ingredient.search_text.contains(normalize(q), autoescape=True))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    name = m.Ingredient.name_en if locale() == "en" else m.Ingredient.name_fr
    rows = db.scalars(
        query.order_by((m.Ingredient.normalized_name == normalize(q)).desc(), name, m.Ingredient.id)
        .offset(offset)
        .limit(limit)
    )
    return s.IngredientPage(
        items=[ingredient_output(row) for row in rows], total=total, offset=offset, limit=limit
    )


def create_ingredient(db, user, payload):
    key = normalize(payload.name)
    if not key or len(key) > 240:
        raise HTTPException(422, tr("invalid_name"))
    # Reuse exact bilingual identities even when called directly, or after a retry.
    candidates = db.scalars(select(m.Ingredient).where(visible(user)))
    for item in candidates:
        if key in {normalize(item.name_fr), normalize(item.name_en)}:
            return item
    enforce_limit(db, user, m.Ingredient, 3000)
    item = m.Ingredient(
        owner_id=user.id,
        name_fr=payload.name,
        name_en=payload.name,
        normalized_name=key,
        search_text=key,
        unit=payload.unit,
    )
    db.add(item)
    db.flush()
    return item


def owned(db, user, model, id):
    item = db.scalar(select(model).where(model.id == id, model.owner_id == user.id))
    if item is None:
        raise HTTPException(404, tr("not_found"))
    return item


def enforce_limit(db, user, model, limit=2000):
    count = db.scalar(select(func.count()).select_from(model).where(model.owner_id == user.id))
    if count >= limit:
        raise HTTPException(422, tr("limit"))


def check(item, version, *, editable=True):
    if item.version != version:
        raise HTTPException(409, tr("conflict"))
    if editable and (item.archived_at or getattr(item, "completed_at", None)):
        raise HTTPException(409, tr("read_only"))


def quantity(value):
    result = value.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    if not Decimal(0) < result <= Decimal(1000000000):
        raise HTTPException(422, tr("quantity_range"))
    return result


def grouped(db, user, items):
    ids = {line.ingredient_id for line in items}
    allowed = set(
        db.scalars(select(m.Ingredient.id).where(visible(user), m.Ingredient.id.in_(ids)))
    )
    if allowed != ids:
        raise HTTPException(404, tr("ingredient_not_found"))
    result = {}
    for line in items:
        key = (line.ingredient_id, line.unit)
        result[key] = quantity(result.get(key, Decimal(0)) + line.quantity)
    return result


def rows(db, item):
    model, column = (
        (m.RecipeItem, m.RecipeItem.recipe_id)
        if isinstance(item, m.Recipe)
        else (m.ShoppingItem, m.ShoppingItem.list_id)
    )
    return db.scalars(
        select(model)
        .where(column == item.id, model.owner_id == item.owner_id)
        .order_by(model.position, model.id)
    ).all()


def output(db, item, servings=None):
    lines = rows(db, item)
    catalogue = {
        ingredient.id: ingredient
        for ingredient in db.scalars(
            select(m.Ingredient).where(m.Ingredient.id.in_([line.ingredient_id for line in lines]))
        )
    }
    factor = Decimal(servings) / item.servings if servings else Decimal(1)
    items = []
    for line in lines:
        ingredient = catalogue[line.ingredient_id]
        purchased = getattr(line, "purchased_quantity", Decimal(0))
        items.append(
            s.ItemOutput(
                id=line.id,
                ingredient_id=line.ingredient_id,
                name=ingredient.name_en if locale() == "en" else ingredient.name_fr,
                category=ingredient.category,
                quantity=quantity(line.quantity * factor),
                unit=line.unit,
                position=line.position,
                purchased_quantity=purchased,
                checked=purchased == line.quantity,
            )
        )
    common = dict(
        id=item.id,
        title=item.title,
        version=item.version,
        items=items,
        created_at=item.created_at,
        updated_at=item.updated_at,
        archived_at=item.archived_at,
    )
    if isinstance(item, m.Recipe):
        return s.RecipeOutput(
            **common,
            instructions=item.instructions,
            servings=servings or item.servings,
            base_servings=item.servings,
        )
    return s.ListOutput(**common, kind=item.kind, completed_at=item.completed_at)


def page(db, user, model, archived, q, offset, limit, kind=None):
    query = select(model).where(
        model.owner_id == user.id,
        model.archived_at.is_not(None) if archived else model.archived_at.is_(None),
        model.title.ilike(
            "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        ),
    )
    if kind:
        query = query.where(model.kind == kind)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    entries = db.scalars(
        query.order_by(model.updated_at.desc(), model.id).offset(offset).limit(limit)
    )
    page_type = s.RecipePage if model is m.Recipe else s.ListPage
    return page_type(
        items=[output(db, item) for item in entries], total=total, offset=offset, limit=limit
    )


def event(db, user, item, kind, reward_key=None):
    if reward_key and db.scalar(
        select(m.Event.id).where(m.Event.owner_id == user.id, m.Event.reward_key == reward_key)
    ):
        reward_key = None
    row = m.Event(
        owner_id=user.id,
        recipe_id=item.id if isinstance(item, m.Recipe) else None,
        list_id=item.id if isinstance(item, m.ShoppingList) else None,
        kind=kind,
        reward_key=reward_key,
        snapshot=output(db, item).model_dump(mode="json"),
    )
    db.add(row)
    db.flush()
    activity = provider.activity(row)
    if activity:
        record(db, user, "recipes", provider, activity)


def touch(item):
    item.version += 1
    item.updated_at = utcnow()


def create_recipe(db, user, payload):
    enforce_limit(db, user, m.Recipe)
    groups = grouped(db, user, payload.items)
    item = m.Recipe(
        owner_id=user.id,
        title=payload.title,
        servings=payload.servings,
        instructions=payload.instructions,
    )
    db.add(item)
    db.flush()
    replace_recipe_items(db, user, item, groups)
    event(db, user, item, "recipe_created", f"recipe:{item.id}")
    return item


def replace_recipe_items(db, user, item, groups):
    db.execute(delete(m.RecipeItem).where(m.RecipeItem.recipe_id == item.id))
    for position, ((ingredient_id, unit), amount) in enumerate(groups.items()):
        db.add(
            m.RecipeItem(
                owner_id=user.id,
                recipe_id=item.id,
                ingredient_id=ingredient_id,
                quantity=amount,
                unit=unit,
                position=position,
            )
        )
    db.flush()


def update_recipe(db, user, item, payload):
    check(item, payload.expected_version)
    groups = grouped(db, user, payload.items)
    item.title, item.servings, item.instructions = (
        payload.title,
        payload.servings,
        payload.instructions,
    )
    touch(item)
    replace_recipe_items(db, user, item, groups)
    event(db, user, item, "recipe_updated")
    return item


def template_ready(db, user, item):
    if item.kind == "template" and rows(db, item):
        key = f"template:{item.id}"
        if not db.scalar(
            select(m.Event.id).where(m.Event.owner_id == user.id, m.Event.reward_key == key)
        ):
            event(db, user, item, "template_ready", key)


def merge_items(db, user, item, groups):
    current = rows(db, item)
    indexed = {(line.ingredient_id, line.unit): line for line in current}
    if len(indexed.keys() | groups.keys()) > 300:
        raise HTTPException(422, tr("items_limit"))
    position = max((line.position for line in current), default=-1) + 1
    for key, amount in groups.items():
        line = indexed.get(key)
        if line:
            line.quantity = quantity(line.quantity + amount)
        else:
            db.add(
                m.ShoppingItem(
                    owner_id=user.id,
                    list_id=item.id,
                    ingredient_id=key[0],
                    unit=key[1],
                    quantity=amount,
                    position=position,
                )
            )
            position += 1
    db.flush()


def create_list(db, user, payload):
    enforce_limit(db, user, m.ShoppingList)
    groups = grouped(db, user, payload.items)
    item = m.ShoppingList(owner_id=user.id, title=payload.title, kind=payload.kind)
    db.add(item)
    db.flush()
    merge_items(db, user, item, groups)
    event(db, user, item, "list_created")
    template_ready(db, user, item)
    return item


def copy_list(db, user, source, payload):
    check(source, payload.expected_version, editable=False)
    return create_list(
        db,
        user,
        s.ListInput(
            title=payload.title,
            kind=payload.kind,
            items=[
                s.ItemInput(
                    ingredient_id=line.ingredient_id, quantity=line.quantity, unit=line.unit
                )
                for line in rows(db, source)
            ],
        ),
    )


def update_list(db, user, item, payload):
    check(item, payload.expected_version)
    item.title = payload.title
    touch(item)
    db.flush()
    event(db, user, item, "list_updated")
    return item


def add_item(db, user, item, payload):
    check(item, payload.expected_version)
    merge_items(db, user, item, grouped(db, user, [payload]))
    touch(item)
    db.flush()
    event(db, user, item, "item_added")
    template_ready(db, user, item)
    return item


def change_item(db, user, item, item_id, payload, operation):
    check(item, payload.expected_version)
    line = owned(db, user, m.ShoppingItem, item_id)
    if line.list_id != item.id:
        raise HTTPException(404, tr("not_found"))
    if operation == "checked":
        if item.kind != "list":
            raise HTTPException(422, tr("template_check"))
        line.purchased_quantity = line.quantity if payload.checked else Decimal(0)
    elif operation == "item_updated":
        line.quantity = payload.quantity
        line.purchased_quantity = min(line.purchased_quantity, line.quantity)
    else:
        db.delete(line)
    touch(item)
    db.flush()
    event(db, user, item, operation)
    return item


def import_recipe(db, user, item, payload):
    check(item, payload.expected_version)
    recipe = owned(db, user, m.Recipe, payload.recipe_id)
    check(recipe, payload.recipe_version)
    scaled = output(db, recipe, payload.servings)
    groups = {(line.ingredient_id, line.unit): line.quantity for line in scaled.items}
    merge_items(db, user, item, groups)
    touch(item)
    db.flush()
    event(
        db,
        user,
        item,
        "recipe_imported",
        f"import:{item.id}:{recipe.id}" if item.kind == "list" else None,
    )
    template_ready(db, user, item)
    return item


def complete(db, user, item, payload):
    check(item, payload.expected_version, editable=False)
    if item.kind != "list" or item.archived_at:
        raise HTTPException(409, tr("read_only"))
    if bool(item.completed_at) == payload.completed:
        return item
    lines = rows(db, item)
    if payload.completed and (
        not lines or any(line.quantity != line.purchased_quantity for line in lines)
    ):
        raise HTTPException(422, tr("incomplete"))
    item.completed_at = utcnow() if payload.completed else None
    touch(item)
    db.flush()
    event(
        db,
        user,
        item,
        "completed" if payload.completed else "reopened",
        f"completed:{item.id}" if payload.completed else None,
    )
    return item


def archive(db, user, item, payload):
    check(item, payload.expected_version, editable=False)
    if bool(item.archived_at) == payload.archived:
        return item
    item.archived_at = utcnow() if payload.archived else None
    touch(item)
    db.flush()
    event(db, user, item, "archived" if payload.archived else "restored")
    return item


def history(db, user, item, offset, limit):
    column = m.Event.recipe_id if isinstance(item, m.Recipe) else m.Event.list_id
    return db.scalars(
        select(m.Event)
        .where(m.Event.owner_id == user.id, column == item.id)
        .order_by(m.Event.occurred_at.desc(), m.Event.id)
        .offset(offset)
        .limit(limit)
    ).all()

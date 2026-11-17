"""Add recipes, a bilingual ingredient catalogue and shopping lists."""

import json
from pathlib import Path
from uuid import UUID

import sqlalchemy as sa
from alembic import op

revision = "0012_recipes"
down_revision = "0011_okr"
branch_labels = None
depends_on = None


def seed_catalogue(connection):
    catalogue = json.loads(
        (Path(__file__).parent.parent / "data/0012_ingredients.json").read_text()
    )
    statement = sa.text("""INSERT INTO recipes_ingredients
        (id, owner_id, builtin_key, name_fr, name_en, normalized_name,
        search_text, unit, category, created_at)
        VALUES (:id, NULL, :builtin_key, :name_fr, :name_en, :normalized_name,
        :search_text, :unit, :category, now())""")
    connection.execute(statement, [{**row, "id": UUID(row["id"])} for row in catalogue])


def upgrade():
    op.execute("""CREATE TABLE recipes_ingredients (
    id UUID NOT NULL,
    owner_id UUID,
    builtin_key VARCHAR(80),
    name_fr VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(240) NOT NULL,
    search_text VARCHAR(500) NOT NULL,
    unit VARCHAR(1) NOT NULL,
    category VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (id),
    CHECK (unit IN ('g', 'l', 'u')),
    CHECK (length(trim(name_fr)) > 0 AND length(trim(name_en)) > 0),
    CHECK ((owner_id IS NULL) = (builtin_key IS NOT NULL)),
    UNIQUE (owner_id, normalized_name),
    FOREIGN KEY(owner_id) REFERENCES users (id),
    UNIQUE (builtin_key)
)""")
    op.execute("""CREATE TABLE recipes_lists (
    id UUID NOT NULL,
    owner_id UUID NOT NULL,
    title VARCHAR(160) NOT NULL,
    kind VARCHAR(10) NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    UNIQUE (id, owner_id),
    CHECK (version > 0 AND length(trim(title)) > 0),
    CHECK (kind IN ('list', 'template')),
    CHECK (kind = 'list' OR completed_at IS NULL),
    FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute(
        """CREATE INDEX ix_recipes_lists_owner
ON recipes_lists (owner_id, kind, archived_at, updated_at)"""
    )
    op.execute("""CREATE TABLE recipes_recipes (
    id UUID NOT NULL,
    owner_id UUID NOT NULL,
    title VARCHAR(160) NOT NULL,
    servings INTEGER NOT NULL,
    instructions VARCHAR(20000) NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id),
    UNIQUE (id, owner_id),
    CHECK (version > 0 AND servings BETWEEN 1 AND 1000),
    CHECK (length(trim(title)) > 0),
    FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute(
        """CREATE INDEX ix_recipes_owner ON recipes_recipes (owner_id, archived_at, updated_at)"""
    )
    op.execute("""CREATE TABLE recipes_events (
    id UUID NOT NULL,
    owner_id UUID NOT NULL,
    recipe_id UUID,
    list_id UUID,
    kind VARCHAR(24) NOT NULL,
    reward_key VARCHAR(100),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    snapshot JSONB NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(recipe_id, owner_id) REFERENCES recipes_recipes (id, owner_id),
    FOREIGN KEY(list_id, owner_id) REFERENCES recipes_lists (id, owner_id),
    UNIQUE (owner_id, reward_key),
    CHECK ((recipe_id IS NOT NULL) <> (list_id IS NOT NULL)),
    CHECK (jsonb_typeof(snapshot) = 'object'),
    CHECK (kind IN ('recipe_created', 'recipe_updated', 'list_created', 'list_updated',
'item_added', 'item_updated', 'item_removed', 'recipe_imported', 'checked', 'completed',
'reopened', 'archived', 'restored', 'template_ready')),
    FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_recipes_events_owner ON recipes_events (owner_id, occurred_at)""")
    op.execute("""CREATE TABLE recipes_list_items (
    id UUID NOT NULL,
    owner_id UUID NOT NULL,
    list_id UUID NOT NULL,
    ingredient_id UUID NOT NULL,
    quantity NUMERIC(18, 6) NOT NULL,
    purchased_quantity NUMERIC(18, 6) NOT NULL,
    unit VARCHAR(1) NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(list_id, owner_id) REFERENCES recipes_lists (id, owner_id),
    UNIQUE (list_id, ingredient_id, unit),
    CHECK (quantity > 0 AND quantity <= 1000000000),
    CHECK (purchased_quantity >= 0 AND purchased_quantity <= quantity),
    CHECK (unit IN ('g', 'l', 'u') AND position >= 0),
    FOREIGN KEY(owner_id) REFERENCES users (id),
    FOREIGN KEY(ingredient_id) REFERENCES recipes_ingredients (id)
)""")
    op.execute("""CREATE TABLE recipes_recipe_items (
    id UUID NOT NULL,
    owner_id UUID NOT NULL,
    recipe_id UUID NOT NULL,
    ingredient_id UUID NOT NULL,
    quantity NUMERIC(18, 6) NOT NULL,
    unit VARCHAR(1) NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(recipe_id, owner_id) REFERENCES recipes_recipes (id, owner_id),
    UNIQUE (recipe_id, ingredient_id, unit),
    CHECK (quantity > 0 AND quantity <= 1000000000),
    CHECK (unit IN ('g', 'l', 'u') AND position >= 0),
    FOREIGN KEY(owner_id) REFERENCES users (id),
    FOREIGN KEY(ingredient_id) REFERENCES recipes_ingredients (id)
)""")
    op.execute("""CREATE FUNCTION life_recipes_ingredient_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM recipes_ingredients
                   WHERE id = NEW.ingredient_id AND (owner_id IS NULL OR owner_id =
NEW.owner_id)) THEN
        RAISE EXCEPTION 'Ingredient belongs to another owner' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END; $$""")
    for table in ("recipes_recipe_items", "recipes_list_items"):
        op.execute(f"""CREATE TRIGGER recipes_ingredient_owner BEFORE INSERT OR UPDATE ON {table}
FOR EACH ROW EXECUTE FUNCTION life_recipes_ingredient_owner()""")
    op.execute("""CREATE FUNCTION life_recipes_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recipe history is immutable'; END; $$""")
    op.execute("""CREATE TRIGGER recipes_immutable BEFORE UPDATE OR DELETE ON recipes_events
FOR EACH ROW EXECUTE FUNCTION life_recipes_immutable()""")
    seed_catalogue(op.get_bind())


def downgrade():
    for table in (
        "recipes_events",
        "recipes_recipe_items",
        "recipes_list_items",
        "recipes_lists",
        "recipes_recipes",
    ):
        if op.get_bind().scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")):
            raise RuntimeError("Recipe data exists: restore a compatible backup instead.")
    if op.get_bind().scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM recipes_ingredients WHERE owner_id IS NOT NULL)")
    ):
        raise RuntimeError("Personal ingredients exist: restore a compatible backup instead.")
    for table in (
        "recipes_events",
        "recipes_recipe_items",
        "recipes_list_items",
        "recipes_lists",
        "recipes_recipes",
        "recipes_ingredients",
    ):
        op.drop_table(table)
    op.execute("""DROP FUNCTION life_recipes_ingredient_owner()""")
    op.execute("""DROP FUNCTION life_recipes_immutable()""")

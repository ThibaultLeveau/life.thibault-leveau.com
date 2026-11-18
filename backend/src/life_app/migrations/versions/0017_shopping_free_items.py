"""Allow shopping items without a catalogue ingredient; preserve recipes and history."""

import sqlalchemy as sa
from alembic import op

revision = "0017_shopping_free_items"
down_revision = "0016_assistant_sources"
branch_labels = None
depends_on = None


def ingredient_owner_function(*, allow_free):
    guard = "NEW.ingredient_id IS NOT NULL AND " if allow_free else ""
    op.execute(f"""CREATE OR REPLACE FUNCTION life_recipes_ingredient_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF {guard}NOT EXISTS (SELECT 1 FROM recipes_ingredients
        WHERE id = NEW.ingredient_id AND (owner_id IS NULL OR owner_id = NEW.owner_id)) THEN
        RAISE EXCEPTION 'Ingredient belongs to another owner' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END; $$""")


def upgrade():
    op.add_column("recipes_list_items", sa.Column("name", sa.String(120), nullable=True))
    op.add_column("recipes_list_items", sa.Column("normalized_name", sa.String(240), nullable=True))
    op.alter_column("recipes_list_items", "ingredient_id", nullable=True)
    op.create_check_constraint(
        "ck_recipes_item_identity",
        "recipes_list_items",
        "(ingredient_id IS NOT NULL AND name IS NULL AND normalized_name IS NULL) OR "
        "(ingredient_id IS NULL AND name IS NOT NULL AND normalized_name IS NOT NULL "
        "AND length(trim(name)) > 0 AND length(trim(normalized_name)) > 0)",
    )
    op.create_unique_constraint(
        "uq_recipes_free_item", "recipes_list_items", ["list_id", "normalized_name", "unit"]
    )
    ingredient_owner_function(allow_free=True)


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text("""SELECT
        EXISTS(SELECT 1 FROM recipes_list_items WHERE ingredient_id IS NULL) OR
        EXISTS(SELECT 1 FROM recipes_events,
            LATERAL jsonb_array_elements(snapshot->'items') AS item
            WHERE item->>'ingredient_id' IS NULL)
    """)
    ):
        raise RuntimeError("Free shopping items exist: restore a compatible backup instead.")
    ingredient_owner_function(allow_free=False)
    op.drop_constraint("uq_recipes_free_item", "recipes_list_items", type_="unique")
    op.drop_constraint("ck_recipes_item_identity", "recipes_list_items", type_="check")
    op.alter_column("recipes_list_items", "ingredient_id", nullable=False)
    op.drop_column("recipes_list_items", "normalized_name")
    op.drop_column("recipes_list_items", "name")

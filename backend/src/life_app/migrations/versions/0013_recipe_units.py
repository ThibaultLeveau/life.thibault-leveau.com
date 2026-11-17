"""Extend recipe units without rewriting quantities or immutable history."""

import sqlalchemy as sa
from alembic import op

revision = "0013_recipe_units"
down_revision = "0012_recipes"
branch_labels = None
depends_on = None

TABLES = ("recipes_ingredients", "recipes_recipe_items", "recipes_list_items")
OLD_UNITS = "'g','l','u'"
NEW_UNITS = "'g','mg','l','ml','tsp','tbsp','u'"


def change_units(units, length):
    for table in TABLES:
        constraints = sa.inspect(op.get_bind()).get_check_constraints(table)
        constraint = next(c for c in constraints if "unit" in c["sqltext"])
        op.drop_constraint(constraint["name"], table, type_="check")
        op.alter_column(table, "unit", type_=sa.String(length), existing_nullable=False)
        condition = f"unit IN ({units})"
        if table != "recipes_ingredients":
            condition += " AND position >= 0"
        op.create_check_constraint(constraint["name"], table, condition)


def upgrade():
    change_units(NEW_UNITS, 4)


def downgrade():
    connection = op.get_bind()
    for table in TABLES:
        if connection.scalar(
            sa.text(f"SELECT EXISTS(SELECT 1 FROM {table} WHERE unit NOT IN ({OLD_UNITS}))")
        ):
            raise RuntimeError("New recipe units exist: restore a compatible backup instead.")
    if connection.scalar(
        sa.text(f"""SELECT EXISTS(
            SELECT 1 FROM recipes_events,
            LATERAL jsonb_array_elements(snapshot->'items') AS item
            WHERE item->>'unit' NOT IN ({OLD_UNITS})
        )""")
    ):
        raise RuntimeError("New recipe units in history: restore a compatible backup instead.")
    change_units(OLD_UNITS, 1)

"""Ordered preparation sections; existing recipes and events remain untouched."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0019_recipe_sections"
down_revision = "0018_recipe_web_import"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "recipes_recipes",
        sa.Column("sections", JSONB(), nullable=False, server_default="[]"),
    )
    op.create_check_constraint(
        "ck_recipes_sections",
        "recipes_recipes",
        "jsonb_typeof(sections) = 'array' AND jsonb_array_length(sections) <= 50",
    )


def downgrade():
    if op.get_bind().scalar(
        sa.text("SELECT EXISTS (SELECT 1 FROM recipes_recipes WHERE sections <> '[]'::jsonb)")
    ):
        raise RuntimeError("Cannot discard recipe preparation sections")
    op.drop_constraint("ck_recipes_sections", "recipes_recipes")
    op.drop_column("recipes_recipes", "sections")

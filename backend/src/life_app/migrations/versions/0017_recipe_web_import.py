"""Recipe source attribution and atomic import receipts (ADR 010)."""

import sqlalchemy as sa
from alembic import op

revision = "0017_recipe_web_import"
down_revision = "0016_assistant_sources"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("recipes_recipes", sa.Column("source_url", sa.String(2048), nullable=True))
    op.add_column("recipes_recipes", sa.Column("source_title", sa.String(300), nullable=True))
    op.add_column(
        "recipes_recipes", sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_table(
        "recipes_web_import_receipts",
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("import_id", sa.Uuid(), primary_key=True),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["recipe_id", "owner_id"], ["recipes_recipes.id", "recipes_recipes.owner_id"]
        ),
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(sa.text("SELECT EXISTS (SELECT 1 FROM recipes_web_import_receipts)")):
        raise RuntimeError("Cannot discard web import provenance and receipts")
    op.drop_table("recipes_web_import_receipts")
    for name in ("imported_at", "source_title", "source_url"):
        op.drop_column("recipes_recipes", name)

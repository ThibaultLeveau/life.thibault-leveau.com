"""Per-account activation; absent preferences use the manifest default."""

import sqlalchemy as sa
from alembic import op

revision = "0005_applications"
down_revision = "0004_recurrence"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "application_preferences",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("application_id", sa.String(50), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("application_id ~ '^[a-z][a-z0-9_]{0,49}$'", name="ck_application_id"),
    )


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT EXISTS(SELECT 1 FROM application_preferences)")):
        raise RuntimeError(
            "Activations présentes : restaurer une sauvegarde compatible plutôt que les perdre."
        )
    op.drop_table("application_preferences")

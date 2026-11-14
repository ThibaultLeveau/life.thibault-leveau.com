"""Per-account agenda settings; no changes to tasks or their history."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_agenda"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "agenda_preferences",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("settings", postgresql.JSONB(), nullable=False),
    )


def downgrade():
    op.drop_table("agenda_preferences")

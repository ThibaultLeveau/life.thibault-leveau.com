"""Preserve assistant access for existing accounts; new accounts opt in (ADR 011)."""

import sqlalchemy as sa
from alembic import op

revision = "0020_life_ai"
down_revision = "0019_recipe_sections"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text("""
        INSERT INTO application_preferences (user_id, application_id, enabled, updated_at)
        SELECT id, 'life_ai', true, now() FROM users
        ON CONFLICT (user_id, application_id) DO NOTHING
    """)
    )


def downgrade():
    # Old images expose the assistant without an activation guard. Never silently
    # undo a personal deactivation. Keep enabled preferences for a later upgrade.
    if op.get_bind().scalar(
        sa.text("""
        SELECT EXISTS (SELECT 1 FROM application_preferences
                       WHERE application_id = 'life_ai' AND NOT enabled)
    """)
    ):
        raise RuntimeError("Cannot restore an unguarded assistant with Life AI disabled")

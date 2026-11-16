"""Account language; keep French for existing accounts and older writers."""

import sqlalchemy as sa
from alembic import op

revision = "0008_locale"
down_revision = "0007_hyrox"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("locale", sa.String(2), nullable=False, server_default="fr"))
    op.create_check_constraint("ck_user_locale", "users", "locale IN ('fr', 'en')")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT EXISTS(SELECT 1 FROM users WHERE locale <> 'fr')")):
        raise RuntimeError("Language preferences exist: restore a compatible backup instead.")
    op.drop_constraint("ck_user_locale", "users", type_="check")
    op.drop_column("users", "locale")

"""Sport view preferences and immutable preparation context, without rewriting history."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014_sport_ux"
down_revision = "0013_recipe_units"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "sport_settings", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )
    op.add_column(
        "sport_settings",
        sa.Column(
            "views", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")
        ),
    )
    op.create_check_constraint("ck_sport_settings_ux_version", "sport_settings", "version > 0")
    op.create_check_constraint(
        "ck_sport_settings_ux_views", "sport_settings", "jsonb_typeof(views) = 'object'"
    )
    for table in ("sport_workouts", "sport_sessions"):
        op.add_column(
            table, sa.Column("context", sa.String(8), nullable=False, server_default="auto")
        )
        op.create_check_constraint(
            f"ck_{table}_ux_context", table, "context IN ('auto', 'standard', 'hyrox')"
        )
    # Previous preparation notes cannot be recovered from today's mutable programs.
    op.add_column(
        "sport_sessions",
        sa.Column("preparation_notes", sa.Text(), nullable=False, server_default=""),
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM sport_settings WHERE views <> '{}'::jsonb)")
    ):
        raise RuntimeError("Sport view preferences exist: restore a compatible backup instead.")
    for table in ("sport_workouts", "sport_sessions"):
        if connection.scalar(
            sa.text(f"SELECT EXISTS(SELECT 1 FROM {table} WHERE context <> 'auto')")
        ):
            raise RuntimeError(
                "Explicit Sport context exists: restore a compatible backup instead."
            )
    if connection.scalar(
        sa.text("SELECT EXISTS(SELECT 1 FROM sport_sessions WHERE preparation_notes <> '')")
    ):
        raise RuntimeError(
            "Sport preparation snapshots exist: restore a compatible backup instead."
        )
    op.drop_column("sport_sessions", "preparation_notes")
    for table in ("sport_sessions", "sport_workouts"):
        op.drop_constraint(f"ck_{table}_ux_context", table, type_="check")
        op.drop_column(table, "context")
    op.drop_constraint("ck_sport_settings_ux_views", "sport_settings", type_="check")
    op.drop_constraint("ck_sport_settings_ux_version", "sport_settings", type_="check")
    op.drop_column("sport_settings", "views")
    op.drop_column("sport_settings", "version")

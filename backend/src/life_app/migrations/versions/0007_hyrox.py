"""Optional competition dates on Sport programs and training snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0007_hyrox"
down_revision = "0006_sport"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("sport_workouts", sa.Column("competition_date", sa.Date(), nullable=True))
    op.add_column("sport_sessions", sa.Column("competition_date", sa.Date(), nullable=True))


def downgrade():
    connection = op.get_bind()
    for table in ("sport_workouts", "sport_sessions"):
        if connection.scalar(
            sa.text(f"SELECT EXISTS (SELECT 1 FROM {table} WHERE competition_date IS NOT NULL)")
        ):
            raise RuntimeError("Des dates de compétition existent ; refus de les supprimer.")
    op.drop_column("sport_sessions", "competition_date")
    op.drop_column("sport_workouts", "competition_date")

"""Sport: additive owner-scoped training and measurement storage."""

import sqlalchemy as sa
from alembic import op

revision = "0006_sport"
down_revision = "0005_applications"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
CREATE TABLE sport_exercises (
	name VARCHAR(160) NOT NULL,
	kind VARCHAR(30) NOT NULL,
	muscle_group VARCHAR(80) NOT NULL,
	equipment VARCHAR(80) NOT NULL,
	notes TEXT NOT NULL,
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	version INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	archived_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CHECK (version > 0),
	CHECK (length(trim(name)) > 0),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""CREATE INDEX ix_sport_exercises_owner_id ON sport_exercises (owner_id)""")
    op.execute("""
CREATE TABLE sport_workouts (
	name VARCHAR(160) NOT NULL,
	notes TEXT NOT NULL,
	entries JSONB NOT NULL,
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	version INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	archived_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	UNIQUE (id, owner_id),
	CHECK (version > 0),
	CHECK (length(trim(name)) > 0),
	CHECK (jsonb_typeof(entries) = 'array' AND jsonb_array_length(entries) BETWEEN 1 AND 50),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""CREATE INDEX ix_sport_workouts_owner_id ON sport_workouts (owner_id)""")
    op.execute("""
CREATE TABLE sport_settings (
	owner_id UUID NOT NULL,
	rest_seconds INTEGER NOT NULL,
	PRIMARY KEY (owner_id),
	CHECK (rest_seconds BETWEEN 0 AND 3600),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""
CREATE TABLE sport_measurements (
	measured_on DATE NOT NULL,
	values JSONB NOT NULL,
	notes TEXT NOT NULL,
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	version INTEGER NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
	archived_at TIMESTAMP WITH TIME ZONE,
	PRIMARY KEY (id),
	CHECK (version > 0),
	CHECK (jsonb_typeof(values) = 'object'),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""CREATE INDEX ix_sport_measurements_owner_id ON sport_measurements (owner_id)""")
    op.execute(
        """CREATE UNIQUE INDEX uq_sport_measurement_day
ON sport_measurements (owner_id, measured_on) WHERE archived_at IS NULL"""
    )
    op.execute("""
CREATE TABLE sport_sessions (
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	workout_id UUID NOT NULL,
	name VARCHAR(160) NOT NULL,
	entries JSONB NOT NULL,
	sets JSONB NOT NULL,
	status VARCHAR(12) NOT NULL,
	version INTEGER NOT NULL,
	started_at TIMESTAMP WITH TIME ZONE NOT NULL,
	finished_at TIMESTAMP WITH TIME ZONE,
	rest_until TIMESTAMP WITH TIME ZONE,
	notes TEXT NOT NULL,
	signature VARCHAR(64) NOT NULL,
	score DOUBLE PRECISION,
	baseline_id UUID,
	metrics JSONB NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(workout_id, owner_id) REFERENCES sport_workouts (id, owner_id),
	CHECK (status IN ('active', 'completed', 'cancelled')),
	CHECK (version > 0),
	CHECK ((status = 'active' AND finished_at IS NULL)
        OR (status <> 'active' AND finished_at IS NOT NULL
        AND finished_at >= started_at AND rest_until IS NULL)),
	CHECK (score IS NULL OR (score >= 0 AND status = 'completed')),
	CHECK (jsonb_typeof(entries) = 'array' AND jsonb_typeof(sets) = 'array'),
	FOREIGN KEY(owner_id) REFERENCES users (id),
	FOREIGN KEY(baseline_id) REFERENCES sport_sessions (id)
)
""")
    op.execute("""CREATE INDEX ix_sport_session_history ON sport_sessions (owner_id, started_at)""")
    op.execute("""CREATE INDEX ix_sport_sessions_signature ON sport_sessions (signature)""")
    op.execute(
        """CREATE UNIQUE INDEX uq_sport_active_session
ON sport_sessions (owner_id) WHERE status = 'active'"""
    )


def downgrade():
    tables = [
        "sport_exercises",
        "sport_workouts",
        "sport_settings",
        "sport_measurements",
        "sport_sessions",
    ]
    for table in tables:
        if op.get_bind().scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")):
            raise RuntimeError("Données Sport présentes : restaurer une sauvegarde compatible.")
    for table in reversed(tables):
        op.drop_table(table)

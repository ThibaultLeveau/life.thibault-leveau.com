"""Immutable progression ledger, earned activities and calendar preferences (ADR 006)."""

import sqlalchemy as sa
from alembic import op

revision = "0010_progression"
down_revision = "0009_tracking"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """CREATE TABLE progression_settings (
	owner_id UUID NOT NULL,
	version INTEGER NOT NULL,
	settings JSONB NOT NULL,
	PRIMARY KEY (owner_id),
	CHECK (version > 0 AND jsonb_typeof(settings) = 'object'),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)"""
    )
    op.execute(
        """CREATE TABLE progression_activity (
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	application_id VARCHAR(50) NOT NULL,
	source_key VARCHAR(160) NOT NULL,
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	day DATE NOT NULL,
	xp INTEGER NOT NULL,
	counters JSONB NOT NULL,
	dimensions JSONB NOT NULL,
	imported BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (owner_id, application_id, source_key),
	CHECK (xp > 0),
	CHECK (jsonb_typeof(counters) = 'object' AND jsonb_typeof(dimensions) = 'object'),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)"""
    )
    op.execute(
        """CREATE INDEX ix_progression_activity_day ON progression_activity
(owner_id, application_id, day)"""
    )
    op.execute(
        """CREATE TABLE progression_rewards (
	id UUID NOT NULL,
	owner_id UUID NOT NULL,
	application_id VARCHAR(50) NOT NULL,
	source_key VARCHAR(180) NOT NULL,
	kind VARCHAR(12) NOT NULL,
	xp INTEGER NOT NULL,
	occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
	imported BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	UNIQUE (owner_id, application_id, source_key),
	CHECK (xp > 0 AND kind IN ('activity', 'quest')),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)"""
    )
    op.execute(
        """CREATE INDEX ix_progression_rewards_time ON progression_rewards
(owner_id, application_id, occurred_at)"""
    )
    op.execute(
        """CREATE TABLE progression_imports (
	owner_id UUID NOT NULL,
	application_id VARCHAR(50) NOT NULL,
	completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (owner_id, application_id),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)"""
    )
    op.execute("""CREATE FUNCTION life_progression_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Progression history is immutable'; END; $$""")
    for table in ("progression_activity", "progression_rewards", "progression_imports"):
        op.execute(
            f"CREATE TRIGGER progression_immutable BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION life_progression_immutable()"
        )


def downgrade():
    tables = (
        "progression_imports",
        "progression_rewards",
        "progression_activity",
        "progression_settings",
    )
    for table in tables:
        if op.get_bind().scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")):
            raise RuntimeError("Progression data exists: restore a compatible backup instead.")
    for table in tables:
        op.drop_table(table)
    op.execute("DROP FUNCTION life_progression_immutable()")

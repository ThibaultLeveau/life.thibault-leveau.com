"""Tracking: additive definitions, entries, immutable history and settings."""

import sqlalchemy as sa
from alembic import op

revision = "0009_tracking"
down_revision = "0008_locale"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
CREATE TABLE tracking_settings (
	owner_id UUID NOT NULL, 
	timezone VARCHAR(100) NOT NULL, 
	PRIMARY KEY (owner_id), 
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""
CREATE TABLE tracking_trackers (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	version INTEGER NOT NULL, 
	position INTEGER NOT NULL, 
	definition JSONB NOT NULL, 
	effective_from DATE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	archived_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (id, owner_id), 
	CHECK (version > 0 AND position >= 0), 
	CHECK (jsonb_typeof(definition) = 'object'), 
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""
CREATE INDEX ix_tracking_trackers_owner_id ON tracking_trackers (owner_id)
""")
    op.execute("""
CREATE TABLE tracking_definitions (
	tracker_id UUID NOT NULL, 
	revision INTEGER NOT NULL, 
	effective_from DATE NOT NULL, 
	enabled BOOLEAN NOT NULL, 
	definition JSONB NOT NULL, 
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (tracker_id, revision), 
	CHECK (revision > 0), 
	CHECK (jsonb_typeof(definition) = 'object'), 
	FOREIGN KEY(tracker_id) REFERENCES tracking_trackers (id)
)
""")
    op.execute("""
CREATE INDEX ix_tracking_definition_date ON tracking_definitions (tracker_id, effective_from)
""")
    op.execute("""
CREATE TABLE tracking_entries (
	id UUID NOT NULL, 
	owner_id UUID NOT NULL, 
	tracker_id UUID NOT NULL, 
	period_start DATE NOT NULL, 
	period_end DATE NOT NULL, 
	definition JSONB NOT NULL, 
	values JSONB NOT NULL, 
	sources JSONB NOT NULL, 
	version INTEGER NOT NULL, 
	status VARCHAR(10) NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (id, owner_id), 
	UNIQUE (tracker_id, period_start), 
	FOREIGN KEY(tracker_id, owner_id) REFERENCES tracking_trackers (id, owner_id), 
	CHECK (version > 0 AND period_end >= period_start), 
	CHECK (status IN ('draft','complete')), 
	CHECK ((status = 'complete') = (completed_at IS NOT NULL)), 
	CHECK (jsonb_typeof(definition) = 'object' AND jsonb_typeof(values) = 'object'
           AND jsonb_typeof(sources) = 'object'),
	FOREIGN KEY(owner_id) REFERENCES users (id)
)
""")
    op.execute("""
CREATE INDEX ix_tracking_entries_owner_period ON tracking_entries (owner_id, period_start)
""")
    op.execute("""
CREATE TABLE tracking_entry_revisions (
	entry_id UUID NOT NULL, 
	version INTEGER NOT NULL, 
	snapshot JSONB NOT NULL, 
	recorded_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (entry_id, version), 
	CHECK (version > 0), 
	CHECK (jsonb_typeof(snapshot) = 'object'), 
	FOREIGN KEY(entry_id) REFERENCES tracking_entries (id)
)
""")
    op.execute("""
CREATE FUNCTION life_tracking_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tracking history is immutable'; END; $$
""")
    for table in ("tracking_definitions", "tracking_entry_revisions"):
        op.execute(
            f"CREATE TRIGGER tracking_immutable BEFORE UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION life_tracking_history_immutable()"
        )


def downgrade():
    tables = [
        "tracking_settings",
        "tracking_trackers",
        "tracking_definitions",
        "tracking_entries",
        "tracking_entry_revisions",
    ]
    for table in tables:
        if op.get_bind().scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")):
            raise RuntimeError("Tracking data exists: restore a compatible backup instead.")
    for table in reversed(tables):
        op.drop_table(table)
    op.execute("DROP FUNCTION life_tracking_history_immutable()")

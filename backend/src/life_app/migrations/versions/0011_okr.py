"""Add the isolated OKR application and immutable achievement snapshots."""

import sqlalchemy as sa
from alembic import op

revision = "0011_okr"
down_revision = "0010_progression"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""CREATE TABLE okr_objectives (
        id UUID NOT NULL,
        owner_id UUID NOT NULL,
        parent_id UUID,
        version INTEGER NOT NULL,
        title VARCHAR(200) NOT NULL,
        domain VARCHAR(20) NOT NULL,
        horizon VARCHAR(20) NOT NULL,
        why VARCHAR(2000) NOT NULL,
        outcome VARCHAR(2000) NOT NULL,
        first_action VARCHAR(1000) NOT NULL,
        start_date DATE,
        due_date DATE,
        key_results JSONB NOT NULL,
        status VARCHAR(20) NOT NULL,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        completed_at TIMESTAMP WITH TIME ZONE,
        completed_quarter VARCHAR(7),
        archived_at TIMESTAMP WITH TIME ZONE,
        PRIMARY KEY (id),
        UNIQUE (id, owner_id),
        FOREIGN KEY(parent_id, owner_id) REFERENCES okr_objectives (id, owner_id),
        CHECK (version > 0 AND position >= 0),
        CHECK (length(trim(title)) > 0),
        CHECK (domain IN ('personal','professional')),
        CHECK (horizon IN ('ten_year','three_year','annual','quarterly')),
        CHECK (status IN ('backlog','in_progress','done')),
        CHECK ((status = 'done') = (completed_at IS NOT NULL) AND (completed_at IS NULL) =
        (completed_quarter IS NULL)),
        CHECK ((start_date IS NULL AND due_date IS NULL) OR (start_date IS NOT NULL AND
        due_date IS NOT NULL AND start_date <= due_date)),
        CHECK (horizon = 'ten_year' OR length(trim(why)) > 0),
        CHECK (horizon NOT IN ('annual','quarterly') OR length(trim(outcome)) > 0),
        CHECK (horizon <> 'quarterly' OR (start_date IS NOT NULL AND due_date < start_date +
        INTERVAL '1 month' AND length(trim(first_action)) > 0 AND
        jsonb_array_length(key_results) > 0)),
        CHECK (jsonb_typeof(key_results) = 'array' AND jsonb_array_length(key_results) <= 12),
        FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_okr_objectives_owner
ON okr_objectives (owner_id, archived_at, horizon, position)""")
    op.execute("""CREATE TABLE okr_events (
        id UUID NOT NULL,
        owner_id UUID NOT NULL,
        objective_id UUID NOT NULL,
        kind VARCHAR(24) NOT NULL,
        occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
        quarter VARCHAR(7) NOT NULL,
        snapshot JSONB NOT NULL,
        detail JSONB NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(objective_id, owner_id) REFERENCES okr_objectives (id, owner_id),
        CHECK (kind IN ('created','updated','check_in','key_result_reached',
        'moved','completed','reopened','archived','restored')),
        CHECK (jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(detail) = 'object'),
        FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute("""CREATE INDEX ix_okr_events_objective ON okr_events (objective_id, occurred_at)""")
    op.execute(
        """CREATE INDEX ix_okr_events_owner_quarter
ON okr_events (owner_id, quarter, occurred_at)"""
    )
    op.execute("""CREATE TABLE okr_settings (
        owner_id UUID NOT NULL,
        timezone VARCHAR(100) NOT NULL,
        version INTEGER NOT NULL,
        PRIMARY KEY (owner_id),
        CHECK (version > 0),
        FOREIGN KEY(owner_id) REFERENCES users (id)
)""")
    op.execute("""CREATE FUNCTION life_okr_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'OKR history is immutable'; END; $$""")
    op.execute("""CREATE TRIGGER okr_immutable BEFORE UPDATE OR DELETE ON okr_events
FOR EACH ROW EXECUTE FUNCTION life_okr_immutable()""")


def downgrade():
    for table in ("okr_events", "okr_objectives", "okr_settings"):
        if op.get_bind().scalar(sa.text(f"SELECT EXISTS(SELECT 1 FROM {table})")):
            raise RuntimeError("OKR data exists: restore a compatible backup instead.")
    for table in ("okr_events", "okr_objectives", "okr_settings"):
        op.drop_table(table)
    op.execute("DROP FUNCTION life_okr_immutable()")

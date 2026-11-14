"""Add calendar recurrence without changing any existing due date or event."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_recurrence"
down_revision = "0003_agenda"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("tasks", sa.Column("recurrence", postgresql.JSONB(none_as_null=True)))
    op.add_column(
        "tasks", sa.Column("recurrence_completed", sa.Integer(), nullable=False, server_default="0")
    )
    op.create_check_constraint(
        "ck_tasks_recurrence_completed", "tasks", "recurrence_completed >= 0"
    )
    op.create_check_constraint(
        "ck_tasks_recurrence_due",
        "tasks",
        "recurrence IS NULL OR (jsonb_typeof(recurrence) = 'object' AND due_date IS NOT NULL)",
    )
    # The original migration let PostgreSQL name this constraint.
    op.drop_constraint("task_events_kind_check", "task_events", type_="check")
    op.create_check_constraint(
        "ck_task_events_kind",
        "task_events",
        "kind IN ('created','updated','moved','completed','reopened','archived','restored',"
        "'rescheduled','completion_undone')",
    )


def downgrade():
    # Refuse irreversible loss of recurrence definitions or immutable audit events.
    connection = op.get_bind()
    used = connection.scalar(
        sa.text(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE recurrence IS NOT NULL) "
            "OR EXISTS(SELECT 1 FROM task_events WHERE kind IN ('rescheduled','completion_undone'))"
        )
    )
    if used:
        raise RuntimeError(
            "Récurrences présentes : restaurer une sauvegarde compatible "
            "plutôt que perdre les données."
        )
    op.drop_constraint("ck_task_events_kind", "task_events", type_="check")
    op.create_check_constraint(
        "task_events_kind_check",
        "task_events",
        "kind IN ('created','updated','moved','completed','reopened','archived','restored')",
    )
    op.drop_constraint("ck_tasks_recurrence_due", "tasks", type_="check")
    op.drop_constraint("ck_tasks_recurrence_completed", "tasks", type_="check")
    op.drop_column("tasks", "recurrence_completed")
    op.drop_column("tasks", "recurrence")

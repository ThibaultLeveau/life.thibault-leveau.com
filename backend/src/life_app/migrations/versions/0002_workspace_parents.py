"""Optional workspace parents, without changing existing task data.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workspaces", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_workspaces_id_owner", "workspaces", ["id", "owner_id"])
    op.create_foreign_key(
        "fk_workspaces_parent_owner",
        "workspaces",
        "workspaces",
        ["parent_id", "owner_id"],
        ["id", "owner_id"],
    )
    op.create_check_constraint("ck_workspaces_not_self_parent", "workspaces", "parent_id <> id")
    op.create_index("ix_workspaces_parent_id", "workspaces", ["parent_id"])


def downgrade():
    op.drop_index("ix_workspaces_parent_id", table_name="workspaces")
    op.drop_constraint("ck_workspaces_not_self_parent", "workspaces", type_="check")
    op.drop_constraint("fk_workspaces_parent_owner", "workspaces", type_="foreignkey")
    op.drop_constraint("uq_workspaces_id_owner", "workspaces", type_="unique")
    op.drop_column("workspaces", "parent_id")

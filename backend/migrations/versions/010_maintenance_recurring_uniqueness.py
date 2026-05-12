"""Prevent duplicate recurring maintenance tasks for the same parent + due date.

If the scheduler fires twice in quick succession (e.g. dual-worker race),
both invocations can pass the "existing_next" check and each insert a
separate instance of the same monthly maintenance. The unique index below
makes that impossible at the database level; the service layer catches the
IntegrityError and logs a no-op.

Revision ID: 010_recurring_unique
Revises: 009_missing_indexes
Create Date: 2026-04-21

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "010_recurring_unique"
down_revision: Union[str, None] = "009_missing_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Unique across (parent_task_id, rok). parent_task_id is nullable for
    # one-off tasks — those are excluded from the uniqueness constraint by
    # virtue of multiple NULLs being allowed in a unique index on MariaDB.
    # (SQLite behaves the same.) This only constrains RECURRING children.
    op.create_index(
        "uq_maintenance_recurrence_slot",
        "maintenance_tasks",
        ["parent_task_id", "rok"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_maintenance_recurrence_slot", table_name="maintenance_tasks"
    )

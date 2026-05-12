"""Multi-unit per maintenance task: introduce maintenance_task_units junction.

Same pattern as ugovor_units (migration 011). The legacy
`maintenance_tasks.property_unit_id` column stays as the "primary unit"
pointer so all existing reads keep working. Source of truth for the
full unit set is this junction table — multi-unit tasks (e.g. "paint
hallway covering A2 + A3") populate it; existing rows are backfilled.

Revision ID: 016_maintenance_units
Revises: 015_parking_unique_internal
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "016_maintenance_units"
down_revision: Union[str, None] = "015_parking_unique_internal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "maintenance_task_units",
        sa.Column(
            "maintenance_task_id",
            sa.String(36),
            sa.ForeignKey("maintenance_tasks.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "property_unit_id",
            sa.String(36),
            sa.ForeignKey("property_units.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_maintenance_task_units_unit",
        "maintenance_task_units",
        ["property_unit_id"],
    )

    # Backfill: every existing task with a primary unit gets a row, so the
    # junction is the single source of truth from day one.
    op.execute(
        """
        INSERT INTO maintenance_task_units (
            maintenance_task_id, property_unit_id, created_at
        )
        SELECT id, property_unit_id, COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM maintenance_tasks
        WHERE property_unit_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_maintenance_task_units_unit", table_name="maintenance_task_units"
    )
    op.drop_table("maintenance_task_units")

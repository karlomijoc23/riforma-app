"""Add missing indexes on dokumenti and racuni FK columns.

- dokumenti.property_unit_id — filtered by document-by-unit endpoint
- dokumenti.maintenance_task_id — filtered by document-by-task lookups
- racuni(tenant_id, zakupnik_id) — composite for ledger queries

Revision ID: 009_missing_indexes
Revises: 008_fks_indexes
Create Date: 2026-03-15

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009_missing_indexes"
down_revision: Union[str, None] = "008_fks_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_dokumenti_property_unit_id", "dokumenti", ["property_unit_id"]
    )
    op.create_index(
        "ix_dokumenti_maintenance_task_id", "dokumenti", ["maintenance_task_id"]
    )
    op.create_index(
        "ix_racuni_tenant_zakupnik", "racuni", ["tenant_id", "zakupnik_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_racuni_tenant_zakupnik", "racuni")
    op.drop_index("ix_dokumenti_maintenance_task_id", "dokumenti")
    op.drop_index("ix_dokumenti_property_unit_id", "dokumenti")

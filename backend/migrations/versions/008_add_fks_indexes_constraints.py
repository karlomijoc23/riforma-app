"""Add missing FK constraints, composite indexes, and unique constraints.

Fixes:
- dokumenti.property_unit_id → FK to property_units.id
- dokumenti.maintenance_task_id → FK to maintenance_tasks.id
- Composite indexes: racuni(tenant_id, status_placanja),
  maintenance_tasks(tenant_id, status), notifications(user_id, read),
  ugovori(tenant_id, status)
- Unique constraints: ugovori(tenant_id, interna_oznaka),
  property_units(nekretnina_id, oznaka)

Revision ID: 008_fks_indexes
Revises: 007_parking_zakupnik
Create Date: 2026-03-15

"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = "008_fks_indexes"
down_revision: Union[str, None] = "007_parking_zakupnik"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Clean orphaned FK references before adding constraints
    # ------------------------------------------------------------------
    op.execute(
        "UPDATE dokumenti SET property_unit_id = NULL "
        "WHERE property_unit_id IS NOT NULL "
        "AND property_unit_id NOT IN (SELECT id FROM property_units)"
    )
    op.execute(
        "UPDATE dokumenti SET maintenance_task_id = NULL "
        "WHERE maintenance_task_id IS NOT NULL "
        "AND maintenance_task_id NOT IN (SELECT id FROM maintenance_tasks)"
    )

    # ------------------------------------------------------------------
    # 2. Add FK constraints on dokumenti
    # ------------------------------------------------------------------
    op.create_foreign_key(
        "fk_dokumenti_property_unit_id",
        "dokumenti",
        "property_units",
        ["property_unit_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_dokumenti_maintenance_task_id",
        "dokumenti",
        "maintenance_tasks",
        ["maintenance_task_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ------------------------------------------------------------------
    # 3. Composite indexes for common query patterns
    # ------------------------------------------------------------------
    op.create_index(
        "ix_racuni_tenant_status", "racuni", ["tenant_id", "status_placanja"]
    )
    op.create_index(
        "ix_maintenance_tenant_status",
        "maintenance_tasks",
        ["tenant_id", "status"],
    )
    op.create_index(
        "ix_notifications_user_read", "notifications", ["user_id", "read"]
    )
    op.create_index(
        "ix_ugovori_tenant_status", "ugovori", ["tenant_id", "status"]
    )

    # ------------------------------------------------------------------
    # 4. Unique constraints (with duplicate pre-check)
    # ------------------------------------------------------------------
    # Check for duplicate ugovori(tenant_id, interna_oznaka) before adding UQ
    conn = op.get_bind()
    dupes_ugovori = conn.execute(
        sa.text(
            "SELECT tenant_id, interna_oznaka, COUNT(*) as cnt "
            "FROM ugovori GROUP BY tenant_id, interna_oznaka HAVING cnt > 1"
        )
    ).fetchall()
    if dupes_ugovori:
        for row in dupes_ugovori:
            logger.warning(
                "Duplicate ugovori: tenant_id=%s, interna_oznaka=%s, count=%s",
                row[0], row[1], row[2],
            )
        logger.warning(
            "Skipping uq_ugovori_tenant_oznaka due to %d duplicate groups",
            len(dupes_ugovori),
        )
    else:
        op.create_unique_constraint(
            "uq_ugovori_tenant_oznaka", "ugovori", ["tenant_id", "interna_oznaka"]
        )

    # Check for duplicate property_units(nekretnina_id, oznaka) before adding UQ
    dupes_units = conn.execute(
        sa.text(
            "SELECT nekretnina_id, oznaka, COUNT(*) as cnt "
            "FROM property_units GROUP BY nekretnina_id, oznaka HAVING cnt > 1"
        )
    ).fetchall()
    if dupes_units:
        for row in dupes_units:
            logger.warning(
                "Duplicate property_units: nekretnina_id=%s, oznaka=%s, count=%s",
                row[0], row[1], row[2],
            )
        logger.warning(
            "Skipping uq_units_nekretnina_oznaka due to %d duplicate groups",
            len(dupes_units),
        )
    else:
        op.create_unique_constraint(
            "uq_units_nekretnina_oznaka",
            "property_units",
            ["nekretnina_id", "oznaka"],
        )


def downgrade() -> None:
    # Unique constraints (may not exist if skipped)
    try:
        op.drop_constraint("uq_units_nekretnina_oznaka", "property_units", type_="unique")
    except Exception:
        pass
    try:
        op.drop_constraint("uq_ugovori_tenant_oznaka", "ugovori", type_="unique")
    except Exception:
        pass

    # Indexes
    op.drop_index("ix_ugovori_tenant_status", "ugovori")
    op.drop_index("ix_notifications_user_read", "notifications")
    op.drop_index("ix_maintenance_tenant_status", "maintenance_tasks")
    op.drop_index("ix_racuni_tenant_status", "racuni")

    # FK constraints
    op.drop_constraint("fk_dokumenti_maintenance_task_id", "dokumenti", type_="foreignkey")
    op.drop_constraint("fk_dokumenti_property_unit_id", "dokumenti", type_="foreignkey")

"""Multi-unit per contract: introduce ugovor_units junction.

A single contract can now cover several rentable units. We keep
`ugovori.property_unit_id` as the legacy "primary unit" pointer for
backward compatibility — every new write also populates the junction
table, and existing rows are backfilled so reads against `units` always
return the full set.

Revision ID: 011_ugovor_units
Revises: 010_recurring_unique
Create Date: 2026-04-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "011_ugovor_units"
down_revision: Union[str, None] = "010_recurring_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ugovor_units",
        sa.Column(
            "ugovor_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id", ondelete="CASCADE"),
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
        "ix_ugovor_units_unit", "ugovor_units", ["property_unit_id"]
    )

    # Backfill: every existing contract with a primary unit gets a row.
    # Using server-side INSERT … SELECT so the migration scales without
    # streaming rows through Python.
    op.execute(
        """
        INSERT INTO ugovor_units (ugovor_id, property_unit_id, created_at)
        SELECT id, property_unit_id, COALESCE(created_at, CURRENT_TIMESTAMP)
        FROM ugovori
        WHERE property_unit_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_ugovor_units_unit", table_name="ugovor_units")
    op.drop_table("ugovor_units")

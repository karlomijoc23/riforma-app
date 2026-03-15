"""Add zakupnik_id column to parking_spaces table.

The frontend was incorrectly using tenant_id (SaaS multi-tenancy) to store
the assigned zakupnik.  This adds a proper zakupnik_id FK column.

Revision ID: 007_parking_zakupnik
Revises: 006_racuni_dates
Create Date: 2026-03-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "007_parking_zakupnik"
down_revision: Union[str, None] = "006_racuni_dates"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "parking_spaces",
        sa.Column(
            "zakupnik_id",
            sa.String(36),
            sa.ForeignKey("zakupnici.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("parking_spaces", "zakupnik_id")

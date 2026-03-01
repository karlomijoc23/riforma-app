"""Convert racuni date columns from VARCHAR(20) to DATE.

MariaDB auto-converts valid YYYY-MM-DD strings to DATE.

Revision ID: 006_racuni_dates
Revises: 005_cascade_fks
Create Date: 2026-03-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "006_racuni_dates"
down_revision: Union[str, None] = "005_cascade_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "racuni", "datum_racuna",
        existing_type=sa.String(20),
        type_=sa.Date(),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "datum_dospijeca",
        existing_type=sa.String(20),
        type_=sa.Date(),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "period_od",
        existing_type=sa.String(20),
        type_=sa.Date(),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "period_do",
        existing_type=sa.String(20),
        type_=sa.Date(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "racuni", "datum_racuna",
        existing_type=sa.Date(),
        type_=sa.String(20),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "datum_dospijeca",
        existing_type=sa.Date(),
        type_=sa.String(20),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "period_od",
        existing_type=sa.Date(),
        type_=sa.String(20),
        existing_nullable=True,
    )
    op.alter_column(
        "racuni", "period_do",
        existing_type=sa.Date(),
        type_=sa.String(20),
        existing_nullable=True,
    )

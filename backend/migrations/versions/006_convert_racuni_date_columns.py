"""Convert racuni date columns from VARCHAR(20) to DATE.

MariaDB auto-converts valid YYYY-MM-DD strings to DATE.
Pre-validation NULLs out any unparseable strings before the type change.

Revision ID: 006_racuni_dates
Revises: 005_cascade_fks
Create Date: 2026-03-01

"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = "006_racuni_dates"
down_revision: Union[str, None] = "005_cascade_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DATE_COLUMNS = ["datum_racuna", "datum_dospijeca", "period_od", "period_do"]


def upgrade() -> None:
    # Pre-validation: NULL out values that can't be parsed as YYYY-MM-DD
    # so MariaDB's type conversion doesn't silently produce 0000-00-00.
    conn = op.get_bind()
    for col in DATE_COLUMNS:
        # Find rows with non-NULL values that don't match YYYY-MM-DD
        bad = conn.execute(
            sa.text(
                f"SELECT COUNT(*) FROM racuni "
                f"WHERE {col} IS NOT NULL "
                f"AND {col} NOT REGEXP '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$'"
            )
        ).scalar()
        if bad:
            logger.warning(
                "racuni.%s: %d rows with unparseable date values — setting to NULL",
                col, bad,
            )
            conn.execute(
                sa.text(
                    f"UPDATE racuni SET {col} = NULL "
                    f"WHERE {col} IS NOT NULL "
                    f"AND {col} NOT REGEXP '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$'"
                )
            )

    for col in DATE_COLUMNS:
        op.alter_column(
            "racuni", col,
            existing_type=sa.String(20),
            type_=sa.Date(),
            existing_nullable=True,
        )


def downgrade() -> None:
    for col in DATE_COLUMNS:
        op.alter_column(
            "racuni", col,
            existing_type=sa.Date(),
            type_=sa.String(20),
            existing_nullable=True,
        )

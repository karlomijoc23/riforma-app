"""Annual indexation anniversary day/month on contracts.

Adds `indeksacija_dan` (1–31) and `indeksacija_mjesec` (1–12) so a
contract with indexation can flag *when* in the year the increase is
applied. The pair repeats annually for the life of the contract.

Nullable — only meaningful when `indeksacija = True`.

Revision ID: 020_contract_indexation_anniversary
Revises: 019_property_area_split
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "020_contract_indexation_anniversary"
down_revision: Union[str, None] = "019_property_area_split"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ugovori") as batch_op:
        batch_op.add_column(
            sa.Column("indeksacija_dan", sa.SmallInteger(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("indeksacija_mjesec", sa.SmallInteger(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("ugovori") as batch_op:
        batch_op.drop_column("indeksacija_mjesec")
        batch_op.drop_column("indeksacija_dan")

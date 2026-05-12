"""Split `povrsina` into building footprint and land area.

Adds `povrsina_objekta` (površina objekta — sgrade) and
`povrsina_zemljista` (površina zemljišta — okućnice / parcele). The
legacy `povrsina` column stays so existing rows are not lost; new entries
can fill one or both of the new fields depending on property type.

Revision ID: 019_property_area_split
Revises: 018_password_change_tracking
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "019_property_area_split"
down_revision: Union[str, None] = "018_password_change_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("nekretnine") as batch_op:
        batch_op.add_column(
            sa.Column("povrsina_objekta", sa.Float(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("povrsina_zemljista", sa.Float(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("nekretnine") as batch_op:
        batch_op.drop_column("povrsina_zemljista")
        batch_op.drop_column("povrsina_objekta")

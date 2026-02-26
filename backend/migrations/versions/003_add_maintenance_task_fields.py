"""Add prijavio, dodijeljeno, procijenjeni_trosak, stvarni_trosak to maintenance_tasks.

Revision ID: 003_maint_fields
Revises: 002_fields
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "003_maint_fields"
down_revision: Union[str, None] = "002_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "maintenance_tasks",
        sa.Column("prijavio", sa.String(200), nullable=True),
    )
    op.add_column(
        "maintenance_tasks",
        sa.Column("dodijeljeno", sa.String(200), nullable=True),
    )
    op.add_column(
        "maintenance_tasks",
        sa.Column("procijenjeni_trosak", sa.Float(), nullable=True),
    )
    op.add_column(
        "maintenance_tasks",
        sa.Column("stvarni_trosak", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("maintenance_tasks", "stvarni_trosak")
    op.drop_column("maintenance_tasks", "procijenjeni_trosak")
    op.drop_column("maintenance_tasks", "dodijeljeno")
    op.drop_column("maintenance_tasks", "prijavio")

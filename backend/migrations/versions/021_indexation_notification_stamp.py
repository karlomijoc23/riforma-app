"""Cooldown timestamp for upcoming-indexation notifications.

Adds `last_indexation_notified_at` (nullable DATETIME) on `ugovori` so
the scheduler can stamp it after sending a "indeksacija dolazi za 30
dana" email and avoid duplicates inside the cooldown window.

Revision ID: 021_indexation_notification_stamp
Revises: 020_contract_indexation_anniversary
Create Date: 2026-05-12
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "021_indexation_notification_stamp"
down_revision: Union[str, None] = "020_contract_indexation_anniversary"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("ugovori") as batch_op:
        batch_op.add_column(
            sa.Column(
                "last_indexation_notified_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("ugovori") as batch_op:
        batch_op.drop_column("last_indexation_notified_at")

"""Per-row notification timestamps so the scheduler stops spamming.

Before this migration, `notify_expiring_contracts` and `notify_overdue_bills`
re-sent the same email every 24h until the underlying condition cleared.
A contract 25 days from expiry would generate ~25 identical emails.

We add a nullable timestamp to each affected table; the service updates it
after a successful send and refuses to re-notify within 7 days.

Revision ID: 012_notif_idempotent
Revises: 011_ugovor_units
Create Date: 2026-04-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "012_notif_idempotent"
down_revision: Union[str, None] = "011_ugovor_units"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ugovori",
        sa.Column(
            "last_expiry_notified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "racuni",
        sa.Column(
            "last_overdue_notified_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("racuni", "last_overdue_notified_at")
    op.drop_column("ugovori", "last_expiry_notified_at")

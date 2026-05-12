"""Bill splitting — master/child relationship on RacuniRow.

A single supplier invoice (e.g. building's electricity bill) lands as a
"master bill". The split engine generates one child bill per
tenant/unit using a chosen allocation method (m², equal share, custom %,
manual amount). Children carry their own approval & payment lifecycle
but link back to the master via `master_bill_id` for traceability.

Revision ID: 013_bill_split
Revises: 012_notif_idempotent
Create Date: 2026-04-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "013_bill_split"
down_revision: Union[str, None] = "012_notif_idempotent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "racuni",
        sa.Column(
            "is_master_bill",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "racuni",
        sa.Column(
            "master_bill_id",
            sa.String(36),
            sa.ForeignKey("racuni.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_racuni_master_bill_id", "racuni", ["master_bill_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_racuni_master_bill_id", table_name="racuni")
    op.drop_column("racuni", "master_bill_id")
    op.drop_column("racuni", "is_master_bill")

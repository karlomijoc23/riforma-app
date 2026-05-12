"""Add UNIQUE(nekretnina_id, internal_id) on parking_spaces.

Without this two parking spaces could share the same `internal_id` on
the same property, which corrupts pickers (UI uses internal_id as the
human-readable identifier).

Revision ID: 015_parking_unique_internal
Revises: 014_parking_contracts
Create Date: 2026-05-08

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015_parking_unique_internal"
down_revision: Union[str, None] = "014_parking_contracts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("parking_spaces") as batch_op:
        batch_op.create_unique_constraint(
            "uq_parking_nekretnina_internal",
            ["nekretnina_id", "internal_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("parking_spaces") as batch_op:
        batch_op.drop_constraint(
            "uq_parking_nekretnina_internal", type_="unique"
        )

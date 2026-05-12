"""Link User → Zakupnik so the `tenant` role can self-serve.

A tenant-role user must resolve to exactly one zakupnik record. We add
`zakupnici.user_id` as a nullable FK + UNIQUE: a user account belongs to
at most one zakupnik, and a zakupnik record is owned by at most one user
account. Admins create the link via the new "Invite tenant user" admin
flow; before that, no `self:*` endpoint can succeed for the user.

Revision ID: 017_zakupnik_user_link
Revises: 016_maintenance_units
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "017_zakupnik_user_link"
down_revision: Union[str, None] = "016_maintenance_units"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("zakupnici") as batch_op:
        batch_op.add_column(sa.Column("user_id", sa.String(36), nullable=True))
        batch_op.create_foreign_key(
            "fk_zakupnici_user_id",
            "users",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_unique_constraint(
            "uq_zakupnici_user_id", ["user_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("zakupnici") as batch_op:
        batch_op.drop_constraint("uq_zakupnici_user_id", type_="unique")
        batch_op.drop_constraint("fk_zakupnici_user_id", type_="foreignkey")
        batch_op.drop_column("user_id")

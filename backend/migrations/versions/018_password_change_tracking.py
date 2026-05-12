"""Track password rotation so admin-issued temp passwords get rotated.

Adds `password_changed_at` (last self-set timestamp) and
`must_change_password` (force-rotate flag). When an admin issues a temp
password via `/users` or `/zakupnici/{id}/invite-user`, the flag is set
to True; the user's next login is intercepted until they call
`PUT /users/me/password`.

Revision ID: 018_password_change_tracking
Revises: 017_zakupnik_user_link
Create Date: 2026-05-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "018_password_change_tracking"
down_revision: Union[str, None] = "017_zakupnik_user_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "password_changed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "must_change_password",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("must_change_password")
        batch_op.drop_column("password_changed_at")

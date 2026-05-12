"""Parking spaces become contract-aware (M2M with ugovori).

Mirrors the podprostor (PropertyUnitRow) lifecycle:
  - `parking_spaces.zakupnik_id` is removed. The zakupnik is now derived
    through the contract; a parking space without a contract has no
    direct lessee link. This is a clean break — existing rows have no
    business data yet, so no backfill is required.
  - Adds `status` (dostupno / rezervirano / iznajmljeno / u_odrzavanju),
    `osnovna_zakupnina` (per-space monthly rent for reference/billing),
    and an optional `naziv` description column.
  - Creates the `ugovor_parkings` junction so a single contract can
    cover any combination of property units AND parking spaces.

Uses batch_alter_table so SQLite (dev) and MariaDB (prod) both work.

Revision ID: 014_parking_contracts
Revises: 013_bill_split
Create Date: 2026-05-06

"""
from typing import Optional, Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "014_parking_contracts"
down_revision: Union[str, None] = "013_bill_split"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing_zakupnik_fk_name(inspector) -> Optional[str]:
    """Return the auto-generated FK name pointing zakupnik_id → zakupnici."""
    for fk in inspector.get_foreign_keys("parking_spaces"):
        if fk.get("referred_table") == "zakupnici" and "zakupnik_id" in (
            fk.get("constrained_columns") or []
        ):
            return fk.get("name")
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    fk_name = _existing_zakupnik_fk_name(inspector)

    existing_index_names = {
        ix["name"]
        for ix in inspector.get_indexes("parking_spaces")
        if ix.get("column_names") == ["zakupnik_id"]
    }

    # Use batch mode so SQLite recreates the table; MariaDB will run real
    # ALTERs. All structural changes to parking_spaces happen here.
    with op.batch_alter_table("parking_spaces") as batch_op:
        for ix_name in existing_index_names:
            batch_op.drop_index(ix_name)
        if fk_name:
            batch_op.drop_constraint(fk_name, type_="foreignkey")
        batch_op.drop_column("zakupnik_id")
        batch_op.add_column(
            sa.Column(
                "status",
                sa.String(50),
                nullable=False,
                server_default="dostupno",
            )
        )
        batch_op.add_column(
            sa.Column("osnovna_zakupnina", sa.Float(), nullable=True)
        )
        batch_op.add_column(sa.Column("naziv", sa.String(200), nullable=True))

    # --- ugovor_parkings: M2M junction ---
    op.create_table(
        "ugovor_parkings",
        sa.Column(
            "ugovor_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "parking_id",
            sa.String(36),
            sa.ForeignKey("parking_spaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_ugovor_parkings_parking", "ugovor_parkings", ["parking_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_ugovor_parkings_parking", table_name="ugovor_parkings")
    op.drop_table("ugovor_parkings")

    with op.batch_alter_table("parking_spaces") as batch_op:
        batch_op.drop_column("naziv")
        batch_op.drop_column("osnovna_zakupnina")
        batch_op.drop_column("status")
        batch_op.add_column(
            sa.Column("zakupnik_id", sa.String(36), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_parking_spaces_zakupnik",
            "zakupnici",
            ["zakupnik_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_parking_spaces_zakupnik_id", ["zakupnik_id"]
        )

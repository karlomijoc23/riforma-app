"""Add missing zakupnici fields and nekretnine.grad column.

Revision ID: 002_fields
Revises: 001_initial
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "002_fields"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # nekretnine: add grad column
    # ------------------------------------------------------------------
    op.add_column(
        "nekretnine",
        sa.Column("grad", sa.String(200), nullable=True),
    )

    # ------------------------------------------------------------------
    # zakupnici: make oib nullable (was NOT NULL)
    # ------------------------------------------------------------------
    op.alter_column(
        "zakupnici",
        "oib",
        existing_type=sa.String(20),
        nullable=True,
    )

    # ------------------------------------------------------------------
    # zakupnici: add address breakdown fields
    # ------------------------------------------------------------------
    op.add_column(
        "zakupnici",
        sa.Column("adresa_ulica", sa.String(300), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("adresa_kucni_broj", sa.String(50), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("adresa_postanski_broj", sa.String(20), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("adresa_grad", sa.String(200), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("adresa_drzava", sa.String(100), nullable=True),
    )

    # ------------------------------------------------------------------
    # zakupnici: add tax / registration fields
    # ------------------------------------------------------------------
    op.add_column(
        "zakupnici",
        sa.Column(
            "pdv_obveznik",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "zakupnici",
        sa.Column("pdv_id", sa.String(50), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("maticni_broj", sa.String(50), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("registracijski_broj", sa.String(100), nullable=True),
    )

    # ------------------------------------------------------------------
    # zakupnici: add e-invoice fields
    # ------------------------------------------------------------------
    op.add_column(
        "zakupnici",
        sa.Column("eracun_dostava_kanal", sa.String(100), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("eracun_identifikator", sa.String(200), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("eracun_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("eracun_posrednik", sa.String(200), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("fiskalizacija_napomena", sa.Text(), nullable=True),
    )

    # ------------------------------------------------------------------
    # zakupnici: add additional info fields
    # ------------------------------------------------------------------
    op.add_column(
        "zakupnici",
        sa.Column("odgovorna_osoba", sa.String(200), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("oznake", sa.JSON(), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("opis_usluge", sa.Text(), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("radno_vrijeme", sa.String(200), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("biljeske", sa.Text(), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("hitnost_odziva_sati", sa.Integer(), nullable=True),
    )
    op.add_column(
        "zakupnici",
        sa.Column("kontakt_osobe", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    # zakupnici: remove added columns (reverse order)
    op.drop_column("zakupnici", "kontakt_osobe")
    op.drop_column("zakupnici", "hitnost_odziva_sati")
    op.drop_column("zakupnici", "biljeske")
    op.drop_column("zakupnici", "radno_vrijeme")
    op.drop_column("zakupnici", "opis_usluge")
    op.drop_column("zakupnici", "oznake")
    op.drop_column("zakupnici", "odgovorna_osoba")
    op.drop_column("zakupnici", "fiskalizacija_napomena")
    op.drop_column("zakupnici", "eracun_posrednik")
    op.drop_column("zakupnici", "eracun_email")
    op.drop_column("zakupnici", "eracun_identifikator")
    op.drop_column("zakupnici", "eracun_dostava_kanal")
    op.drop_column("zakupnici", "registracijski_broj")
    op.drop_column("zakupnici", "maticni_broj")
    op.drop_column("zakupnici", "pdv_id")
    op.drop_column("zakupnici", "pdv_obveznik")
    op.drop_column("zakupnici", "adresa_drzava")
    op.drop_column("zakupnici", "adresa_grad")
    op.drop_column("zakupnici", "adresa_postanski_broj")
    op.drop_column("zakupnici", "adresa_kucni_broj")
    op.drop_column("zakupnici", "adresa_ulica")

    # zakupnici: restore oib to NOT NULL
    op.alter_column(
        "zakupnici",
        "oib",
        existing_type=sa.String(20),
        nullable=False,
    )

    # nekretnine: remove grad
    op.drop_column("nekretnine", "grad")

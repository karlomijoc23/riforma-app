"""Add cascade/restrict/set-null FK actions and revoked_tokens table.

Revision ID: 005_cascade_fks
Revises: 004_ai_agent
Create Date: 2026-02-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "005_cascade_fks"
down_revision: Union[str, None] = "004_ai_agent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, fk_constraint_name, column, referenced_table, on_delete)
FK_CHANGES = [
    # CASCADE — structural children
    ("property_units", "property_units_ibfk_2", "nekretnina_id", "nekretnine", "CASCADE"),
    ("parking_spaces", "parking_spaces_ibfk_2", "nekretnina_id", "nekretnine", "CASCADE"),
    ("handover_protocols", "handover_protocols_ibfk_2", "contract_id", "ugovori", "CASCADE"),
    # RESTRICT — required parent refs
    ("ugovori", "ugovori_ibfk_2", "nekretnina_id", "nekretnine", "RESTRICT"),
    ("ugovori", "ugovori_ibfk_3", "zakupnik_id", "zakupnici", "RESTRICT"),
    # SET NULL — optional refs
    ("ugovori", "ugovori_ibfk_4", "property_unit_id", "property_units", "SET NULL"),
    ("dokumenti", "dokumenti_ibfk_2", "nekretnina_id", "nekretnine", "SET NULL"),
    ("dokumenti", "dokumenti_ibfk_3", "zakupnik_id", "zakupnici", "SET NULL"),
    ("dokumenti", "dokumenti_ibfk_4", "ugovor_id", "ugovori", "SET NULL"),
    ("maintenance_tasks", "maintenance_tasks_ibfk_2", "nekretnina_id", "nekretnine", "SET NULL"),
    ("maintenance_tasks", "maintenance_tasks_ibfk_3", "property_unit_id", "property_units", "SET NULL"),
    ("maintenance_tasks", "maintenance_tasks_ibfk_4", "ugovor_id", "ugovori", "SET NULL"),
    ("racuni", "racuni_ibfk_2", "nekretnina_id", "nekretnine", "SET NULL"),
    ("racuni", "racuni_ibfk_3", "zakupnik_id", "zakupnici", "SET NULL"),
    ("racuni", "racuni_ibfk_4", "property_unit_id", "property_units", "SET NULL"),
    ("racuni", "racuni_ibfk_5", "ugovor_id", "ugovori", "SET NULL"),
    ("oglasi", "oglasi_ibfk_2", "nekretnina_id", "nekretnine", "SET NULL"),
    ("oglasi", "oglasi_ibfk_3", "property_unit_id", "property_units", "SET NULL"),
    ("projekti", "projekti_ibfk_2", "linked_property_id", "nekretnine", "SET NULL"),
]


def upgrade() -> None:
    # Create revoked_tokens table
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("jti", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("revoked_at", sa.DateTime, nullable=False),
    )

    # Update FK constraints with on_delete actions.
    # MariaDB requires dropping and recreating FKs to change the action.
    # The actual constraint names may vary — use naming_convention or
    # inspect the DB. The names below follow MariaDB's auto-naming pattern.
    # If a constraint name doesn't match, the migration will fail safely
    # and you can adjust the name.
    for table, fk_name, column, ref_table, on_delete in FK_CHANGES:
        # Drop existing FK
        op.drop_constraint(fk_name, table, type_="foreignkey")
        # Recreate with on_delete action
        op.create_foreign_key(
            fk_name,
            table,
            ref_table,
            [column],
            ["id"],
            ondelete=on_delete,
        )


def downgrade() -> None:
    # Drop revoked_tokens table
    op.drop_table("revoked_tokens")

    # Revert FK constraints to no action
    for table, fk_name, column, ref_table, _ in FK_CHANGES:
        op.drop_constraint(fk_name, table, type_="foreignkey")
        op.create_foreign_key(
            fk_name,
            table,
            ref_table,
            [column],
            ["id"],
        )

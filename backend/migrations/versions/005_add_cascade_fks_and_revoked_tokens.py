"""Add cascade/restrict/set-null FK actions and revoked_tokens table.

Revision ID: 005_cascade_fks
Revises: 004_ai_agent
Create Date: 2026-02-27

"""
import logging
from typing import Optional, Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

logger = logging.getLogger("alembic.runtime.migration")

# revision identifiers, used by Alembic.
revision: str = "005_cascade_fks"
down_revision: Union[str, None] = "004_ai_agent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, referenced_table, on_delete)
# FK constraint names are discovered via introspection instead of hardcoded.
FK_CHANGES = [
    # CASCADE — structural children
    ("property_units", "nekretnina_id", "nekretnine", "CASCADE"),
    ("parking_spaces", "nekretnina_id", "nekretnine", "CASCADE"),
    ("handover_protocols", "contract_id", "ugovori", "CASCADE"),
    # RESTRICT — required parent refs
    ("ugovori", "nekretnina_id", "nekretnine", "RESTRICT"),
    ("ugovori", "zakupnik_id", "zakupnici", "RESTRICT"),
    # SET NULL — optional refs
    ("ugovori", "property_unit_id", "property_units", "SET NULL"),
    ("dokumenti", "nekretnina_id", "nekretnine", "SET NULL"),
    ("dokumenti", "zakupnik_id", "zakupnici", "SET NULL"),
    ("dokumenti", "ugovor_id", "ugovori", "SET NULL"),
    ("maintenance_tasks", "nekretnina_id", "nekretnine", "SET NULL"),
    ("maintenance_tasks", "property_unit_id", "property_units", "SET NULL"),
    ("maintenance_tasks", "ugovor_id", "ugovori", "SET NULL"),
    ("racuni", "nekretnina_id", "nekretnine", "SET NULL"),
    ("racuni", "zakupnik_id", "zakupnici", "SET NULL"),
    ("racuni", "property_unit_id", "property_units", "SET NULL"),
    ("racuni", "ugovor_id", "ugovori", "SET NULL"),
    ("oglasi", "nekretnina_id", "nekretnine", "SET NULL"),
    ("oglasi", "property_unit_id", "property_units", "SET NULL"),
    ("projekti", "linked_property_id", "nekretnine", "SET NULL"),
]


def _find_fk_name(inspector, table: str, column: str, ref_table: str) -> Optional[str]:
    """Find the FK constraint name by inspecting the actual DB schema."""
    try:
        fks = inspector.get_foreign_keys(table)
    except Exception:
        return None
    for fk in fks:
        if (
            column in fk.get("constrained_columns", [])
            and fk.get("referred_table") == ref_table
        ):
            return fk.get("name")
    return None


def upgrade() -> None:
    # Create revoked_tokens table
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("jti", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Update FK constraints with on_delete actions.
    # Constraint names are discovered by introspection to avoid
    # failures when MariaDB uses non-standard naming.
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    for table, column, ref_table, on_delete in FK_CHANGES:
        fk_name = _find_fk_name(inspector, table, column, ref_table)
        if not fk_name:
            logger.warning(
                "FK not found: %s.%s → %s — skipping",
                table, column, ref_table,
            )
            continue
        # Drop existing FK
        op.drop_constraint(fk_name, table, type_="foreignkey")
        # Recreate with on_delete action
        new_name = f"fk_{table}_{column}"
        op.create_foreign_key(
            new_name,
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
    conn = op.get_bind()
    inspector = sa_inspect(conn)

    for table, column, ref_table, _ in FK_CHANGES:
        fk_name = _find_fk_name(inspector, table, column, ref_table)
        if not fk_name:
            logger.warning(
                "FK not found for rollback: %s.%s → %s — skipping",
                table, column, ref_table,
            )
            continue
        op.drop_constraint(fk_name, table, type_="foreignkey")
        op.create_foreign_key(
            f"fk_{table}_{column}",
            table,
            ref_table,
            [column],
            ["id"],
        )

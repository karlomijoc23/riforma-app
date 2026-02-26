"""Initial schema — all ORM tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-02-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. users (global — no tenant FK)
    # ------------------------------------------------------------------
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "email", sa.String(255), unique=True, nullable=False, index=True
        ),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("role", sa.String(50), nullable=False, server_default="viewer"),
        sa.Column("scopes", sa.JSON(), nullable=True),
        sa.Column(
            "active", sa.Boolean(), nullable=False, server_default=sa.text("1")
        ),
        sa.Column(
            "failed_login_attempts",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("locked_until", sa.DateTime(), nullable=True),
        sa.Column("reset_token", sa.String(100), nullable=True),
        sa.Column("reset_token_expires", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 2. saas_tenants (global — FK to users)
    # ------------------------------------------------------------------
    op.create_table(
        "saas_tenants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("naziv", sa.String(200), nullable=False),
        sa.Column("tip", sa.String(50), nullable=False, server_default="company"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("oib", sa.String(20), nullable=True),
        sa.Column("iban", sa.String(50), nullable=True),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 3. tenant_memberships (FK → users, saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "tenant_memberships",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(50), nullable=False, server_default="member"),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("invited_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_tenant"),
    )

    # ------------------------------------------------------------------
    # 4. nekretnine (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "nekretnine",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("naziv", sa.String(200), nullable=False),
        sa.Column("adresa", sa.String(500), nullable=False),
        sa.Column("grad", sa.String(200), nullable=True),
        sa.Column("katastarska_opcina", sa.String(200), nullable=True),
        sa.Column("broj_kat_cestice", sa.String(100), nullable=True),
        sa.Column("vrsta", sa.String(50), nullable=False, server_default="ostalo"),
        sa.Column(
            "povrsina", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column("godina_izgradnje", sa.Integer(), nullable=True),
        sa.Column("vlasnik", sa.String(200), nullable=True),
        sa.Column("udio_vlasnistva", sa.String(100), nullable=True),
        sa.Column("nabavna_cijena", sa.Float(), nullable=True),
        sa.Column("trzisna_vrijednost", sa.Float(), nullable=True),
        sa.Column("prosllogodisnji_prihodi", sa.Float(), nullable=True),
        sa.Column("prosllogodisnji_rashodi", sa.Float(), nullable=True),
        sa.Column("amortizacija", sa.Float(), nullable=True),
        sa.Column("neto_prihod", sa.Float(), nullable=True),
        sa.Column("zadnja_obnova", sa.String(100), nullable=True),
        sa.Column("potrebna_ulaganja", sa.Text(), nullable=True),
        sa.Column("troskovi_odrzavanja", sa.Float(), nullable=True),
        sa.Column("osiguranje", sa.String(500), nullable=True),
        sa.Column("sudski_sporovi", sa.Text(), nullable=True),
        sa.Column("hipoteke", sa.Text(), nullable=True),
        sa.Column("napomene", sa.Text(), nullable=True),
        sa.Column("slika", sa.String(500), nullable=True),
        sa.Column("financijska_povijest", sa.JSON(), nullable=True),
        sa.Column(
            "has_parking",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 5. property_units (FK → nekretnine, saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "property_units",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("oznaka", sa.String(100), nullable=False),
        sa.Column("naziv", sa.String(200), nullable=False),
        sa.Column("kat", sa.String(100), nullable=True),
        sa.Column(
            "povrsina_m2", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="dostupno"
        ),
        sa.Column("osnovna_zakupnina", sa.Float(), nullable=True),
        sa.Column("napomena", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 6. zakupnici (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "zakupnici",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("naziv_firme", sa.String(200), nullable=True),
        sa.Column("ime_prezime", sa.String(200), nullable=True),
        sa.Column("oib", sa.String(20), nullable=True),
        sa.Column("adresa", sa.String(500), nullable=True),
        sa.Column("adresa_ulica", sa.String(300), nullable=True),
        sa.Column("adresa_kucni_broj", sa.String(50), nullable=True),
        sa.Column("adresa_postanski_broj", sa.String(20), nullable=True),
        sa.Column("adresa_grad", sa.String(200), nullable=True),
        sa.Column("adresa_drzava", sa.String(100), nullable=True),
        sa.Column("sjediste", sa.String(200), nullable=True),
        sa.Column("kontakt_ime", sa.String(200), nullable=True),
        sa.Column("kontakt_email", sa.String(255), nullable=True),
        sa.Column("kontakt_telefon", sa.String(100), nullable=True),
        sa.Column("iban", sa.String(50), nullable=True),
        sa.Column("pdv_obveznik", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("pdv_id", sa.String(50), nullable=True),
        sa.Column("maticni_broj", sa.String(50), nullable=True),
        sa.Column("registracijski_broj", sa.String(100), nullable=True),
        sa.Column("eracun_dostava_kanal", sa.String(100), nullable=True),
        sa.Column("eracun_identifikator", sa.String(200), nullable=True),
        sa.Column("eracun_email", sa.String(255), nullable=True),
        sa.Column("eracun_posrednik", sa.String(200), nullable=True),
        sa.Column("fiskalizacija_napomena", sa.Text(), nullable=True),
        sa.Column("odgovorna_osoba", sa.String(200), nullable=True),
        sa.Column("oznake", sa.JSON(), nullable=True),
        sa.Column("opis_usluge", sa.Text(), nullable=True),
        sa.Column("radno_vrijeme", sa.String(200), nullable=True),
        sa.Column("biljeske", sa.Text(), nullable=True),
        sa.Column("hitnost_odziva_sati", sa.Integer(), nullable=True),
        sa.Column("kontakt_osobe", sa.JSON(), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="aktivan"
        ),
        sa.Column("tip", sa.String(50), nullable=False, server_default="zakupnik"),
        sa.Column("napomena", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 7. ugovori (FK → nekretnine, property_units, zakupnici, saas_tenants,
    #             self-referential → ugovori)
    # ------------------------------------------------------------------
    op.create_table(
        "ugovori",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "zakupnik_id",
            sa.String(36),
            sa.ForeignKey("zakupnici.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "property_unit_id",
            sa.String(36),
            sa.ForeignKey("property_units.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("interna_oznaka", sa.String(100), nullable=False),
        sa.Column("datum_potpisivanja", sa.Date(), nullable=True),
        sa.Column("datum_pocetka", sa.Date(), nullable=False),
        sa.Column("datum_zavrsetka", sa.Date(), nullable=False),
        sa.Column(
            "trajanje_mjeseci",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "opcija_produljenja",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("uvjeti_produljenja", sa.Text(), nullable=True),
        sa.Column("rok_otkaza_dani", sa.Integer(), nullable=True),
        sa.Column(
            "osnovna_zakupnina",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("zakupnina_po_m2", sa.Float(), nullable=True),
        sa.Column("cam_troskovi", sa.Float(), nullable=True),
        sa.Column("polog_depozit", sa.Float(), nullable=True),
        sa.Column("garancija", sa.Float(), nullable=True),
        sa.Column(
            "indeksacija",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("indeks", sa.String(200), nullable=True),
        sa.Column("formula_indeksacije", sa.String(500), nullable=True),
        sa.Column("obveze_odrzavanja", sa.Text(), nullable=True),
        sa.Column("namjena_prostora", sa.String(500), nullable=True),
        sa.Column("rezije_brojila", sa.String(500), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="aktivno"
        ),
        sa.Column("napomena", sa.Text(), nullable=True),
        # Approval workflow
        sa.Column("approval_status", sa.String(50), nullable=True),
        sa.Column("approved_by", sa.String(36), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=True),
        sa.Column("submitted_for_approval_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_by", sa.String(36), nullable=True),
        # Self-referential FK
        sa.Column(
            "parent_contract_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id"),
            nullable=True,
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # Composite indexes for ugovori
    op.create_index(
        "ix_ugovori_unit_status",
        "ugovori",
        ["property_unit_id", "status"],
    )
    op.create_index(
        "ix_ugovori_nekretnina_oznaka_status",
        "ugovori",
        ["nekretnina_id", "interna_oznaka", "status"],
    )

    # ------------------------------------------------------------------
    # 8. dokumenti (FK → saas_tenants, nekretnine, zakupnici, ugovori)
    # ------------------------------------------------------------------
    op.create_table(
        "dokumenti",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("naziv", sa.String(500), nullable=False),
        sa.Column("tip", sa.String(100), nullable=False, server_default="ostalo"),
        sa.Column("opis", sa.Text(), nullable=True),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "zakupnik_id",
            sa.String(36),
            sa.ForeignKey("zakupnici.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "ugovor_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("property_unit_id", sa.String(36), nullable=True),
        sa.Column("maintenance_task_id", sa.String(36), nullable=True),
        sa.Column("datum_isteka", sa.String(20), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("file_path", sa.String(1000), nullable=True),
        sa.Column("original_filename", sa.String(500), nullable=True),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("putanja_datoteke", sa.String(1000), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 9. maintenance_tasks (FK → nekretnine, property_units, ugovori,
    #                        saas_tenants, self-ref → maintenance_tasks)
    # ------------------------------------------------------------------
    op.create_table(
        "maintenance_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("naziv", sa.String(200), nullable=False),
        sa.Column("opis", sa.Text(), nullable=True),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "property_unit_id",
            sa.String(36),
            sa.ForeignKey("property_units.id"),
            nullable=True,
        ),
        sa.Column(
            "ugovor_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id"),
            nullable=True,
        ),
        sa.Column("zakupnik_id", sa.String(36), nullable=True),
        sa.Column("prijavio_user_id", sa.String(36), nullable=True),
        sa.Column("dodijeljeno_user_id", sa.String(36), nullable=True),
        sa.Column("prijavio", sa.String(200), nullable=True),
        sa.Column("dodijeljeno", sa.String(200), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="novi"),
        sa.Column(
            "prioritet", sa.String(50), nullable=False, server_default="srednje"
        ),
        sa.Column("datum_prijave", sa.Date(), nullable=True),
        sa.Column("rok", sa.Date(), nullable=True),
        sa.Column("trosak_materijal", sa.Float(), nullable=True),
        sa.Column("trosak_rad", sa.Float(), nullable=True),
        sa.Column("procijenjeni_trosak", sa.Float(), nullable=True),
        sa.Column("stvarni_trosak", sa.Float(), nullable=True),
        sa.Column("napomena", sa.Text(), nullable=True),
        sa.Column("oznake", sa.JSON(), nullable=True),
        sa.Column("aktivnosti", sa.JSON(), nullable=True),
        sa.Column("dobavljac_naziv", sa.String(200), nullable=True),
        sa.Column("dobavljac_kontakt", sa.String(200), nullable=True),
        sa.Column("dobavljac_telefon", sa.String(100), nullable=True),
        sa.Column("ponavljanje", sa.String(100), nullable=True),
        sa.Column("ponavljanje_do", sa.Date(), nullable=True),
        # Self-referential FK
        sa.Column(
            "parent_task_id",
            sa.String(36),
            sa.ForeignKey("maintenance_tasks.id"),
            nullable=True,
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 10. activity_logs (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("user", sa.String(200), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("method", sa.String(10), nullable=False),
        sa.Column("path", sa.String(500), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=True),
        sa.Column("query_params", sa.JSON(), nullable=True),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("request_id", sa.String(36), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", sa.String(36), nullable=True),
        sa.Column("entity_parent_id", sa.String(36), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("duration_ms", sa.Float(), nullable=True),
    )

    # Composite index for activity_logs
    op.create_index(
        "ix_activity_logs_tenant_timestamp",
        "activity_logs",
        ["tenant_id", "timestamp"],
    )

    # ------------------------------------------------------------------
    # 11. parking_spaces (FK → nekretnine, saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "parking_spaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("floor", sa.String(20), nullable=False),
        sa.Column("internal_id", sa.String(100), nullable=False),
        sa.Column("vehicle_plates", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 12. handover_protocols (FK → ugovori, saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "handover_protocols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "contract_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meter_readings", sa.JSON(), nullable=True),
        sa.Column("keys_handed_over", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.String(36), nullable=True),
    )

    # ------------------------------------------------------------------
    # 13. projekti (FK → saas_tenants, nekretnine)
    # ------------------------------------------------------------------
    op.create_table(
        "projekti",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="planning"
        ),
        sa.Column("budget", sa.Float(), nullable=True),
        sa.Column(
            "spent", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("budget_breakdown", sa.JSON(), nullable=True),
        sa.Column("projected_revenue", sa.Float(), nullable=True),
        sa.Column(
            "linked_property_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=True,
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 14. project_phases (FK → projekti)
    # ------------------------------------------------------------------
    op.create_table(
        "project_phases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projekti.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="pending"
        ),
        sa.Column(
            "order", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )

    # ------------------------------------------------------------------
    # 15. project_stakeholders (FK → projekti)
    # ------------------------------------------------------------------
    op.create_table(
        "project_stakeholders",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projekti.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("role", sa.String(200), nullable=False),
        sa.Column("contact_info", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 16. project_transactions (FK → projekti)
    # ------------------------------------------------------------------
    op.create_table(
        "project_transactions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projekti.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "type", sa.String(50), nullable=False, server_default="expense"
        ),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("paid_to", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 17. project_documents (FK → projekti, project_phases)
    # ------------------------------------------------------------------
    op.create_table(
        "project_documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projekti.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column(
            "phase_id",
            sa.String(36),
            sa.ForeignKey("project_phases.id"),
            nullable=True,
        ),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="pending"
        ),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("file_url", sa.String(1000), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 18. tenant_settings (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "tenant_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            unique=True,
        ),
        # Company branding
        sa.Column("naziv_tvrtke", sa.String(300), nullable=True),
        sa.Column("adresa", sa.String(500), nullable=True),
        sa.Column("grad", sa.String(200), nullable=True),
        sa.Column("postanski_broj", sa.String(20), nullable=True),
        sa.Column("oib", sa.String(20), nullable=True),
        sa.Column("iban", sa.String(50), nullable=True),
        sa.Column("telefon", sa.String(100), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("web", sa.String(500), nullable=True),
        sa.Column("logo_url", sa.String(1000), nullable=True),
        # Defaults
        sa.Column(
            "default_valuta", sa.String(10), nullable=False, server_default="EUR"
        ),
        sa.Column(
            "default_pdv_stopa",
            sa.Float(),
            nullable=False,
            server_default=sa.text("25.0"),
        ),
        sa.Column(
            "default_rok_placanja_dani",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("15"),
        ),
        sa.Column(
            "default_jezik", sa.String(10), nullable=False, server_default="hr"
        ),
        # Notifications
        sa.Column(
            "email_obavijesti",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "obavijest_istek_ugovora_dani",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("30"),
        ),
        sa.Column(
            "obavijest_rok_odrzavanja",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        # Report
        sa.Column("report_header_text", sa.Text(), nullable=True),
        sa.Column("report_footer_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 19. racuni (FK → nekretnine, property_units, zakupnici, ugovori,
    #             saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "racuni",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("tip_utroska", sa.String(50), nullable=False),
        sa.Column("dobavljac", sa.String(200), nullable=False, server_default=""),
        sa.Column(
            "broj_racuna", sa.String(100), nullable=False, server_default=""
        ),
        sa.Column("datum_racuna", sa.String(20), nullable=True),
        sa.Column("datum_dospijeca", sa.String(20), nullable=True),
        sa.Column(
            "iznos", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column("valuta", sa.String(10), nullable=False, server_default="EUR"),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "zakupnik_id",
            sa.String(36),
            sa.ForeignKey("zakupnici.id"),
            nullable=True,
        ),
        sa.Column(
            "property_unit_id",
            sa.String(36),
            sa.ForeignKey("property_units.id"),
            nullable=True,
        ),
        sa.Column(
            "ugovor_id",
            sa.String(36),
            sa.ForeignKey("ugovori.id"),
            nullable=True,
        ),
        sa.Column(
            "status_placanja",
            sa.String(50),
            nullable=False,
            server_default="ceka_placanje",
        ),
        sa.Column(
            "preknjizavanje_status",
            sa.String(50),
            nullable=False,
            server_default="nije_primjenjivo",
        ),
        sa.Column("preknjizavanje_napomena", sa.Text(), nullable=True),
        sa.Column("napomena", sa.Text(), nullable=True),
        sa.Column("period_od", sa.String(20), nullable=True),
        sa.Column("period_do", sa.String(20), nullable=True),
        sa.Column("potrosnja_kwh", sa.Float(), nullable=True),
        sa.Column("potrosnja_m3", sa.Float(), nullable=True),
        sa.Column("file_path", sa.String(1000), nullable=True),
        sa.Column("original_filename", sa.String(500), nullable=True),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("putanja_datoteke", sa.String(1000), nullable=True),
        sa.Column(
            "total_paid",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
        sa.Column("payments", sa.JSON(), nullable=True),
        # Approval workflow
        sa.Column("approval_status", sa.String(50), nullable=True),
        sa.Column("approved_by", sa.String(36), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approval_comment", sa.Text(), nullable=True),
        sa.Column("submitted_for_approval_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_by", sa.String(36), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 20. oglasi (FK → nekretnine, property_units, saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "oglasi",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "nekretnina_id",
            sa.String(36),
            sa.ForeignKey("nekretnine.id"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "property_unit_id",
            sa.String(36),
            sa.ForeignKey("property_units.id"),
            nullable=True,
        ),
        sa.Column("tip_ponude", sa.String(50), nullable=False),
        sa.Column("vrsta", sa.String(50), nullable=False),
        sa.Column("naslov", sa.String(300), nullable=False),
        sa.Column("opis", sa.Text(), nullable=True),
        sa.Column(
            "cijena", sa.Float(), nullable=False, server_default=sa.text("0.0")
        ),
        sa.Column(
            "cijena_valuta", sa.String(10), nullable=False, server_default="EUR"
        ),
        sa.Column("cijena_po_m2", sa.Float(), nullable=True),
        sa.Column("povrsina_m2", sa.Float(), nullable=True),
        sa.Column("broj_soba", sa.Float(), nullable=True),
        sa.Column("kat", sa.String(50), nullable=True),
        sa.Column("adresa", sa.String(500), nullable=True),
        sa.Column("grad", sa.String(200), nullable=True),
        sa.Column("opcina", sa.String(200), nullable=True),
        sa.Column("zip_code", sa.String(20), nullable=True),
        sa.Column("drzava", sa.String(10), nullable=False, server_default="HR"),
        sa.Column("namjesteno", sa.Boolean(), nullable=True),
        sa.Column("parking_ukljucen", sa.Boolean(), nullable=True),
        sa.Column("dostupno_od", sa.Date(), nullable=True),
        sa.Column("kontakt_ime", sa.String(200), nullable=True),
        sa.Column("kontakt_telefon", sa.String(100), nullable=True),
        sa.Column("kontakt_email", sa.String(255), nullable=True),
        sa.Column("slike", sa.JSON(), nullable=True),
        sa.Column("objavi_na", sa.JSON(), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="nacrt"
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 21. notifications (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("user_id", sa.String(36), nullable=False, index=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(500), nullable=True),
        sa.Column("tip", sa.String(50), nullable=False, server_default="info"),
        sa.Column(
            "read", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 22. dobavljaci (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "dobavljaci",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("naziv", sa.String(200), nullable=False),
        sa.Column("tip", sa.String(100), nullable=True),
        sa.Column("kontakt_ime", sa.String(200), nullable=True),
        sa.Column("kontakt_email", sa.String(255), nullable=True),
        sa.Column("kontakt_telefon", sa.String(100), nullable=True),
        sa.Column("oib", sa.String(20), nullable=True),
        sa.Column("adresa", sa.String(500), nullable=True),
        sa.Column("napomena", sa.Text(), nullable=True),
        sa.Column("ocjena", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    # ------------------------------------------------------------------
    # 23. webhook_events (FK → saas_tenants)
    # ------------------------------------------------------------------
    op.create_table(
        "webhook_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.String(36),
            sa.ForeignKey("saas_tenants.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("source", sa.String(100), nullable=False),
        sa.Column("reference_id", sa.String(200), nullable=True),
        sa.Column("data", sa.JSON(), nullable=True),
        sa.Column(
            "status", sa.String(50), nullable=False, server_default="received"
        ),
        sa.Column(
            "processed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("created_by", sa.String(36), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    # Drop in reverse dependency order (children first, parents last).
    op.drop_table("webhook_events")
    op.drop_table("dobavljaci")
    op.drop_table("notifications")
    op.drop_table("oglasi")
    op.drop_table("racuni")
    op.drop_table("tenant_settings")
    op.drop_table("project_documents")
    op.drop_table("project_transactions")
    op.drop_table("project_stakeholders")
    op.drop_table("project_phases")
    op.drop_table("projekti")
    op.drop_table("handover_protocols")
    op.drop_table("parking_spaces")
    op.drop_table("activity_logs")
    op.drop_table("maintenance_tasks")
    op.drop_table("dokumenti")
    op.drop_index("ix_ugovori_nekretnina_oznaka_status", table_name="ugovori")
    op.drop_index("ix_ugovori_unit_status", table_name="ugovori")
    op.drop_table("ugovori")
    op.drop_table("zakupnici")
    op.drop_table("property_units")
    op.drop_table("nekretnine")
    op.drop_table("tenant_memberships")
    op.drop_table("saas_tenants")
    op.drop_table("users")

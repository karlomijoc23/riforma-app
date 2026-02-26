"""
SQLAlchemy ORM models for the Riforma application.

Replaces the document_store single-JSON-column pattern with proper relational
tables. Uses SQLAlchemy 2.0 Mapped/mapped_column syntax with UUID string PKs.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any, List, Optional

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _utcnow() -> datetime:
    """Return current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    """Generate a new UUID4 string suitable for use as a PK."""
    return str(uuid.uuid4())


# =========================================================================
# GLOBAL TABLES (not tenant-scoped)
# =========================================================================


class UserRow(Base):
    """Application user accounts."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="viewer")
    scopes: Mapped[Any] = mapped_column(sa.JSON, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    reset_token: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    memberships: Mapped[List["TenantMembershipRow"]] = relationship(
        back_populates="user", lazy="selectin"
    )
    created_tenants: Mapped[List["SaasTenantRow"]] = relationship(
        back_populates="creator", lazy="noload"
    )


class SaasTenantRow(Base):
    """
    SaaS tenant / portfolio entity.

    NOT to be confused with zakupnici (business lessees). This represents the
    organisation or individual who owns a Riforma subscription.
    """

    __tablename__ = "saas_tenants"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    naziv: Mapped[str] = mapped_column(String(200), nullable=False)
    tip: Mapped[str] = mapped_column(String(50), default="company")
    status: Mapped[str] = mapped_column(String(50), default="active")
    oib: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    iban: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    creator: Mapped[Optional["UserRow"]] = relationship(
        back_populates="created_tenants", lazy="noload"
    )
    memberships: Mapped[List["TenantMembershipRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    nekretnine: Mapped[List["NekretnineRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    property_units: Mapped[List["PropertyUnitRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    zakupnici: Mapped[List["ZakupniciRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    ugovori: Mapped[List["UgovoriRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    dokumenti: Mapped[List["DokumentiRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    maintenance_tasks: Mapped[List["MaintenanceTaskRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    activity_logs: Mapped[List["ActivityLogRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    parking_spaces: Mapped[List["ParkingSpaceRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    handover_protocols: Mapped[List["HandoverProtocolRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    projekti: Mapped[List["ProjektiRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    racuni: Mapped[List["RacuniRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    oglasi: Mapped[List["OglasiRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    notifications: Mapped[List["NotificationRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    dobavljaci: Mapped[List["DobavljaciRow"]] = relationship(
        back_populates="tenant", lazy="noload"
    )
    settings: Mapped[Optional["TenantSettingsRow"]] = relationship(
        back_populates="tenant", uselist=False, lazy="noload"
    )


class TenantMembershipRow(Base):
    """Links users to SaaS tenants with role information."""

    __tablename__ = "tenant_memberships"

    __table_args__ = (
        UniqueConstraint("user_id", "tenant_id", name="uq_membership_user_tenant"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(50), default="member")
    status: Mapped[str] = mapped_column(String(50), default="active")
    invited_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    user: Mapped["UserRow"] = relationship(
        back_populates="memberships", lazy="joined"
    )
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="memberships", lazy="joined"
    )


# =========================================================================
# TENANT-SCOPED TABLES
# =========================================================================


class NekretnineRow(Base):
    """Properties (nekretnine)."""

    __tablename__ = "nekretnine"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    naziv: Mapped[str] = mapped_column(String(200), nullable=False)
    adresa: Mapped[str] = mapped_column(String(500), nullable=False)
    grad: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    katastarska_opcina: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    broj_kat_cestice: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    vrsta: Mapped[str] = mapped_column(String(50), default="ostalo")
    povrsina: Mapped[float] = mapped_column(Float, default=0.0)
    godina_izgradnje: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    vlasnik: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    udio_vlasnistva: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    nabavna_cijena: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    trzisna_vrijednost: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    prosllogodisnji_prihodi: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    prosllogodisnji_rashodi: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    amortizacija: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    neto_prihod: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    zadnja_obnova: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    potrebna_ulaganja: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    troskovi_odrzavanja: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    osiguranje: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sudski_sporovi: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hipoteke: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    napomene: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    slika: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    financijska_povijest: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )
    has_parking: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="nekretnine", lazy="noload"
    )
    property_units: Mapped[List["PropertyUnitRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    ugovori: Mapped[List["UgovoriRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    dokumenti: Mapped[List["DokumentiRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    maintenance_tasks: Mapped[List["MaintenanceTaskRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    parking_spaces: Mapped[List["ParkingSpaceRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    racuni: Mapped[List["RacuniRow"]] = relationship(
        back_populates="nekretnina", lazy="noload"
    )
    linked_projekti: Mapped[List["ProjektiRow"]] = relationship(
        back_populates="linked_property", lazy="noload"
    )


class PropertyUnitRow(Base):
    """Individual rentable units within a property."""

    __tablename__ = "property_units"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    nekretnina_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=False, index=True
    )
    oznaka: Mapped[str] = mapped_column(String(100), nullable=False)
    naziv: Mapped[str] = mapped_column(String(200), nullable=False)
    kat: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    povrsina_m2: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="dostupno")
    osnovna_zakupnina: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="property_units", lazy="noload"
    )
    nekretnina: Mapped["NekretnineRow"] = relationship(
        back_populates="property_units", lazy="joined"
    )
    ugovori: Mapped[List["UgovoriRow"]] = relationship(
        back_populates="property_unit", lazy="noload"
    )
    racuni: Mapped[List["RacuniRow"]] = relationship(
        back_populates="property_unit", lazy="noload"
    )


class ZakupniciRow(Base):
    """Lessees / business tenants (zakupnici)."""

    __tablename__ = "zakupnici"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    naziv_firme: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    ime_prezime: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    oib: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    adresa: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    adresa_ulica: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    adresa_kucni_broj: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    adresa_postanski_broj: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    adresa_grad: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    adresa_drzava: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    sjediste: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    kontakt_ime: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    kontakt_email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    kontakt_telefon: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    iban: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Tax / registration
    pdv_obveznik: Mapped[bool] = mapped_column(Boolean, default=False)
    pdv_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    maticni_broj: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    registracijski_broj: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    # E-invoice
    eracun_dostava_kanal: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    eracun_identifikator: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    eracun_email: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    eracun_posrednik: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    fiskalizacija_napomena: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    # Additional info
    odgovorna_osoba: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    oznake: Mapped[Optional[Any]] = mapped_column(sa.JSON, nullable=True)
    opis_usluge: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    radno_vrijeme: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    biljeske: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hitnost_odziva_sati: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    kontakt_osobe: Mapped[Optional[Any]] = mapped_column(sa.JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="aktivan")
    tip: Mapped[str] = mapped_column(String(50), default="zakupnik")
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="zakupnici", lazy="noload"
    )
    ugovori: Mapped[List["UgovoriRow"]] = relationship(
        back_populates="zakupnik", lazy="noload"
    )
    dokumenti: Mapped[List["DokumentiRow"]] = relationship(
        back_populates="zakupnik", lazy="noload"
    )
    racuni: Mapped[List["RacuniRow"]] = relationship(
        back_populates="zakupnik", lazy="noload"
    )


class UgovoriRow(Base):
    """Contracts (ugovori)."""

    __tablename__ = "ugovori"

    __table_args__ = (
        Index(
            "ix_ugovori_unit_status",
            "property_unit_id",
            "status",
        ),
        Index(
            "ix_ugovori_nekretnina_oznaka_status",
            "nekretnina_id",
            "interna_oznaka",
            "status",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    nekretnina_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=False, index=True
    )
    zakupnik_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("zakupnici.id"), nullable=False, index=True
    )
    property_unit_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("property_units.id"), nullable=True, index=True
    )
    interna_oznaka: Mapped[str] = mapped_column(String(100), nullable=False)
    datum_potpisivanja: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True
    )
    datum_pocetka: Mapped[date] = mapped_column(Date, nullable=False)
    datum_zavrsetka: Mapped[date] = mapped_column(Date, nullable=False)
    trajanje_mjeseci: Mapped[int] = mapped_column(Integer, default=0)
    opcija_produljenja: Mapped[bool] = mapped_column(Boolean, default=False)
    uvjeti_produljenja: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    rok_otkaza_dani: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    osnovna_zakupnina: Mapped[float] = mapped_column(Float, default=0)
    zakupnina_po_m2: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    cam_troskovi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    polog_depozit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    garancija: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    indeksacija: Mapped[bool] = mapped_column(Boolean, default=False)
    indeks: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    formula_indeksacije: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    obveze_odrzavanja: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    namjena_prostora: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    rezije_brojila: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="aktivno")
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Approval workflow
    approval_status: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    approved_by: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    approval_comment: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    submitted_for_approval_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    submitted_by: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )

    # Self-referential FK for contract renewals / amendments
    parent_contract_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ugovori.id"), nullable=True
    )

    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="ugovori", lazy="noload"
    )
    nekretnina: Mapped["NekretnineRow"] = relationship(
        back_populates="ugovori", lazy="joined"
    )
    zakupnik: Mapped["ZakupniciRow"] = relationship(
        back_populates="ugovori", lazy="joined"
    )
    property_unit: Mapped[Optional["PropertyUnitRow"]] = relationship(
        back_populates="ugovori", lazy="joined"
    )
    parent_contract: Mapped[Optional["UgovoriRow"]] = relationship(
        remote_side="UgovoriRow.id", lazy="noload"
    )
    dokumenti: Mapped[List["DokumentiRow"]] = relationship(
        back_populates="ugovor", lazy="noload"
    )
    maintenance_tasks: Mapped[List["MaintenanceTaskRow"]] = relationship(
        back_populates="ugovor", lazy="noload"
    )
    handover_protocols: Mapped[List["HandoverProtocolRow"]] = relationship(
        back_populates="contract", lazy="noload"
    )
    racuni: Mapped[List["RacuniRow"]] = relationship(
        back_populates="ugovor", lazy="noload",
        foreign_keys="RacuniRow.ugovor_id",
    )


class DokumentiRow(Base):
    """Documents (dokumenti)."""

    __tablename__ = "dokumenti"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    naziv: Mapped[str] = mapped_column(String(500), nullable=False)
    tip: Mapped[str] = mapped_column(String(100), default="ostalo")
    opis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nekretnina_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=True, index=True
    )
    zakupnik_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("zakupnici.id"), nullable=True, index=True
    )
    ugovor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ugovori.id"), nullable=True, index=True
    )
    property_unit_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    maintenance_task_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    datum_isteka: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    metadata_json: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )
    file_path: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    original_filename: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    content_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    putanja_datoteke: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="dokumenti", lazy="noload"
    )
    nekretnina: Mapped[Optional["NekretnineRow"]] = relationship(
        back_populates="dokumenti", lazy="noload"
    )
    zakupnik: Mapped[Optional["ZakupniciRow"]] = relationship(
        back_populates="dokumenti", lazy="noload"
    )
    ugovor: Mapped[Optional["UgovoriRow"]] = relationship(
        back_populates="dokumenti", lazy="noload"
    )


class MaintenanceTaskRow(Base):
    """Maintenance tasks."""

    __tablename__ = "maintenance_tasks"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    naziv: Mapped[str] = mapped_column(String(200), nullable=False)
    opis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nekretnina_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=True, index=True
    )
    property_unit_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("property_units.id"), nullable=True
    )
    ugovor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ugovori.id"), nullable=True
    )
    zakupnik_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    prijavio_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    dodijeljeno_user_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="novi")
    prioritet: Mapped[str] = mapped_column(String(50), default="srednje")
    datum_prijave: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    rok: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    prijavio: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    dodijeljeno: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    trosak_materijal: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    trosak_rad: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    procijenjeni_trosak: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    stvarni_trosak: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    oznake: Mapped[Any] = mapped_column(sa.JSON, default=list)
    aktivnosti: Mapped[Any] = mapped_column(sa.JSON, default=list)
    dobavljac_naziv: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    dobavljac_kontakt: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    dobavljac_telefon: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    ponavljanje: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    ponavljanje_do: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Self-referential FK for recurring task instances
    parent_task_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("maintenance_tasks.id"), nullable=True
    )

    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="maintenance_tasks", lazy="noload"
    )
    nekretnina: Mapped[Optional["NekretnineRow"]] = relationship(
        back_populates="maintenance_tasks", lazy="noload"
    )
    property_unit: Mapped[Optional["PropertyUnitRow"]] = relationship(
        lazy="noload"
    )
    ugovor: Mapped[Optional["UgovoriRow"]] = relationship(
        back_populates="maintenance_tasks", lazy="noload"
    )
    parent_task: Mapped[Optional["MaintenanceTaskRow"]] = relationship(
        remote_side="MaintenanceTaskRow.id", lazy="noload"
    )


class ActivityLogRow(Base):
    """Audit / activity logs."""

    __tablename__ = "activity_logs"

    __table_args__ = (
        Index("ix_activity_logs_tenant_timestamp", "tenant_id", "timestamp"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=True, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    user: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    actor_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    scopes: Mapped[Any] = mapped_column(sa.JSON, default=list)
    query_params: Mapped[Any] = mapped_column(sa.JSON, default=dict)
    request_payload: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entity_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    entity_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    entity_parent_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    changes: Mapped[Optional[Any]] = mapped_column(sa.JSON, nullable=True)
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Relationships
    tenant: Mapped[Optional["SaasTenantRow"]] = relationship(
        back_populates="activity_logs", lazy="noload"
    )


class ParkingSpaceRow(Base):
    """Parking spaces linked to a property."""

    __tablename__ = "parking_spaces"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    nekretnina_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=False, index=True
    )
    floor: Mapped[str] = mapped_column(String(20), nullable=False)
    internal_id: Mapped[str] = mapped_column(String(100), nullable=False)
    vehicle_plates: Mapped[Any] = mapped_column(sa.JSON, default=list)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="parking_spaces", lazy="noload"
    )
    nekretnina: Mapped["NekretnineRow"] = relationship(
        back_populates="parking_spaces", lazy="noload"
    )


class HandoverProtocolRow(Base):
    """Entry/exit handover protocols linked to contracts."""

    __tablename__ = "handover_protocols"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    contract_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("ugovori.id"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    meter_readings: Mapped[Any] = mapped_column(sa.JSON, default=dict)
    keys_handed_over: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="handover_protocols", lazy="noload"
    )
    contract: Mapped["UgovoriRow"] = relationship(
        back_populates="handover_protocols", lazy="joined"
    )


class ProjektiRow(Base):
    """Development / renovation projects."""

    __tablename__ = "projekti"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="planning")
    budget: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spent: Mapped[float] = mapped_column(Float, default=0.0)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    budget_breakdown: Mapped[Any] = mapped_column(sa.JSON, default=dict)
    projected_revenue: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    linked_property_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=True
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="projekti", lazy="noload"
    )
    linked_property: Mapped[Optional["NekretnineRow"]] = relationship(
        back_populates="linked_projekti", lazy="noload"
    )
    phases: Mapped[List["ProjectPhaseRow"]] = relationship(
        back_populates="project",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="ProjectPhaseRow.order",
    )
    stakeholders: Mapped[List["ProjectStakeholderRow"]] = relationship(
        back_populates="project",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    transactions: Mapped[List["ProjectTransactionRow"]] = relationship(
        back_populates="project",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    documents: Mapped[List["ProjectDocumentRow"]] = relationship(
        back_populates="project",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class ProjectPhaseRow(Base):
    """Phases within a project (extracted from nested JSON)."""

    __tablename__ = "project_phases"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projekti.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    order: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    project: Mapped["ProjektiRow"] = relationship(
        back_populates="phases", lazy="noload"
    )
    documents: Mapped[List["ProjectDocumentRow"]] = relationship(
        back_populates="phase", lazy="noload"
    )


class ProjectStakeholderRow(Base):
    """Stakeholders linked to a project (extracted from nested JSON)."""

    __tablename__ = "project_stakeholders"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projekti.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    contact_info: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    project: Mapped["ProjektiRow"] = relationship(
        back_populates="stakeholders", lazy="noload"
    )


class ProjectTransactionRow(Base):
    """Financial transactions within a project (extracted from nested JSON)."""

    __tablename__ = "project_transactions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projekti.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="expense")
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    paid_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    project: Mapped["ProjektiRow"] = relationship(
        back_populates="transactions", lazy="noload"
    )


class ProjectDocumentRow(Base):
    """Documents linked to a project (extracted from nested JSON)."""

    __tablename__ = "project_documents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projekti.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    phase_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("project_phases.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="pending")
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    file_url: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    project: Mapped["ProjektiRow"] = relationship(
        back_populates="documents", lazy="noload"
    )
    phase: Mapped[Optional["ProjectPhaseRow"]] = relationship(
        back_populates="documents", lazy="noload"
    )


class TenantSettingsRow(Base):
    """Per-tenant configuration / settings."""

    __tablename__ = "tenant_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("saas_tenants.id"),
        nullable=False,
        unique=True,
    )

    # Company branding
    naziv_tvrtke: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    adresa: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    grad: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    postanski_broj: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    oib: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    iban: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    telefon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    web: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)

    # Defaults
    default_valuta: Mapped[str] = mapped_column(String(10), default="EUR")
    default_pdv_stopa: Mapped[float] = mapped_column(Float, default=25.0)
    default_rok_placanja_dani: Mapped[int] = mapped_column(Integer, default=15)
    default_jezik: Mapped[str] = mapped_column(String(10), default="hr")

    # Notifications
    email_obavijesti: Mapped[bool] = mapped_column(Boolean, default=True)
    obavijest_istek_ugovora_dani: Mapped[int] = mapped_column(Integer, default=30)
    obavijest_rok_odrzavanja: Mapped[bool] = mapped_column(Boolean, default=True)

    # Report
    report_header_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    report_footer_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="settings", lazy="noload"
    )


class RacuniRow(Base):
    """Bills / invoices (racuni)."""

    __tablename__ = "racuni"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    tip_utroska: Mapped[str] = mapped_column(String(50), nullable=False)
    dobavljac: Mapped[str] = mapped_column(String(200), default="")
    broj_racuna: Mapped[str] = mapped_column(String(100), default="")
    datum_racuna: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    datum_dospijeca: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    iznos: Mapped[float] = mapped_column(Float, default=0.0)
    valuta: Mapped[str] = mapped_column(String(10), default="EUR")
    nekretnina_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=True, index=True
    )
    zakupnik_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("zakupnici.id"), nullable=True
    )
    property_unit_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("property_units.id"), nullable=True
    )
    ugovor_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("ugovori.id"), nullable=True
    )
    status_placanja: Mapped[str] = mapped_column(
        String(50), default="ceka_placanje"
    )
    preknjizavanje_status: Mapped[str] = mapped_column(
        String(50), default="nije_primjenjivo"
    )
    preknjizavanje_napomena: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    period_od: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    period_do: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    potrosnja_kwh: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    potrosnja_m3: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True
    )
    file_path: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    original_filename: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )
    content_type: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    putanja_datoteke: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    total_paid: Mapped[float] = mapped_column(Float, default=0.0)
    payments: Mapped[Any] = mapped_column(sa.JSON, default=list)

    # Approval workflow
    approval_status: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )
    approved_by: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    approval_comment: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    submitted_for_approval_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    submitted_by: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )

    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="racuni", lazy="noload"
    )
    nekretnina: Mapped[Optional["NekretnineRow"]] = relationship(
        back_populates="racuni", lazy="noload"
    )
    zakupnik: Mapped[Optional["ZakupniciRow"]] = relationship(
        back_populates="racuni", lazy="noload"
    )
    property_unit: Mapped[Optional["PropertyUnitRow"]] = relationship(
        back_populates="racuni", lazy="noload"
    )
    ugovor: Mapped[Optional["UgovoriRow"]] = relationship(
        back_populates="racuni",
        lazy="noload",
        foreign_keys=[ugovor_id],
    )


class OglasiRow(Base):
    """Listings (oglasi) — property advertisements."""

    __tablename__ = "oglasi"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    nekretnina_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("nekretnine.id"), nullable=True, index=True
    )
    property_unit_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("property_units.id"), nullable=True
    )
    tip_ponude: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # iznajmljivanje, prodaja
    vrsta: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # stan, kuca, poslovni_prostor, garaza, parking, zemljiste, ostalo
    naslov: Mapped[str] = mapped_column(String(300), nullable=False)
    opis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cijena: Mapped[float] = mapped_column(Float, default=0.0)
    cijena_valuta: Mapped[str] = mapped_column(String(10), default="EUR")
    cijena_po_m2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    povrsina_m2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    broj_soba: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    kat: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    adresa: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    grad: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    opcina: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    drzava: Mapped[str] = mapped_column(String(10), default="HR")
    namjesteno: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    parking_ukljucen: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    dostupno_od: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    kontakt_ime: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    kontakt_telefon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    kontakt_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    slike: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )  # list of image URLs
    objavi_na: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )  # list of portal names
    status: Mapped[str] = mapped_column(
        String(50), default="nacrt"
    )  # nacrt, aktivan, pauziran, arhiviran
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="oglasi", lazy="noload"
    )


class NotificationRow(Base):
    """In-app notifications."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    tip: Mapped[str] = mapped_column(
        String(50), default="info"
    )  # info, warning, success, error
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="notifications", lazy="noload"
    )


class WebhookEventRow(Base):
    """Incoming webhook events."""

    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    reference_id: Mapped[Optional[str]] = mapped_column(
        String(200), nullable=True
    )
    data: Mapped[Optional[Any]] = mapped_column(sa.JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="received")
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(lazy="noload")


class AiConversationRow(Base):
    """AI agent chat conversations."""

    __tablename__ = "ai_conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(lazy="noload")
    user: Mapped["UserRow"] = relationship(lazy="noload")
    messages: Mapped[List["AiMessageRow"]] = relationship(
        back_populates="conversation",
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="AiMessageRow.created_at",
    )


class AiMessageRow(Base):
    """Individual messages within an AI conversation."""

    __tablename__ = "ai_messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    pending_action: Mapped[Optional[Any]] = mapped_column(
        sa.JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # Relationships
    conversation: Mapped["AiConversationRow"] = relationship(
        back_populates="messages", lazy="noload"
    )


class DobavljaciRow(Base):
    """Vendors / suppliers (dobavljaci)."""

    __tablename__ = "dobavljaci"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=_new_uuid
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("saas_tenants.id"), nullable=False, index=True
    )
    naziv: Mapped[str] = mapped_column(String(200), nullable=False)
    tip: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    kontakt_ime: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    kontakt_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    kontakt_telefon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    oib: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    adresa: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    napomena: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ocjena: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow
    )

    # Relationships
    tenant: Mapped["SaasTenantRow"] = relationship(
        back_populates="dobavljaci", lazy="noload"
    )


# ---------------------------------------------------------------------------
# Convenience: collect all model classes for Alembic / create_all
# ---------------------------------------------------------------------------

ALL_MODELS = [
    UserRow,
    SaasTenantRow,
    TenantMembershipRow,
    NekretnineRow,
    PropertyUnitRow,
    ZakupniciRow,
    UgovoriRow,
    DokumentiRow,
    MaintenanceTaskRow,
    ActivityLogRow,
    ParkingSpaceRow,
    HandoverProtocolRow,
    ProjektiRow,
    ProjectPhaseRow,
    ProjectStakeholderRow,
    ProjectTransactionRow,
    ProjectDocumentRow,
    TenantSettingsRow,
    RacuniRow,
    OglasiRow,
    NotificationRow,
    DobavljaciRow,
    WebhookEventRow,
    AiConversationRow,
    AiMessageRow,
]

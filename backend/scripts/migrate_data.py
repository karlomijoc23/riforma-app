"""
Data migration: document_store -> relational tables.

Usage:
    cd backend
    python scripts/migrate_data.py

Reads DATABASE_URL from environment or .env file.
Safe to re-run (uses INSERT IGNORE to skip existing records).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# ---------------------------------------------------------------------------
# Load .env from backend root (one level up from scripts/)
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv

    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(env_path)
except ImportError:
    pass  # python-dotenv not installed; rely on env vars

from sqlalchemy import create_engine, text, inspect
from sqlalchemy.engine import Engine


# ---------------------------------------------------------------------------
# Database URL
# ---------------------------------------------------------------------------

def _build_sync_url() -> str:
    """
    Build a synchronous pymysql connection URL.

    Reads DATABASE_URL from the environment and replaces the async driver
    (+asyncmy / +aiomysql) with +pymysql.  Falls back to composing from
    individual DB_* env vars.
    """
    url = os.getenv("DATABASE_URL", "")
    if url:
        # Normalise async drivers to pymysql
        url = url.replace("+asyncmy", "+pymysql")
        url = url.replace("+aiomysql", "+pymysql")
        url = url.replace("mysql://", "mariadb+pymysql://")
        if url.startswith("mariadb://"):
            url = url.replace("mariadb://", "mariadb+pymysql://", 1)
        if "+pymysql" not in url:
            # e.g. "mariadb://user:pass@host/db"
            url = url.replace("mariadb://", "mariadb+pymysql://", 1)
        return url

    # Compose from individual env vars
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = os.getenv("DB_PORT", "3306")
    user = os.getenv("DB_USER", "root")
    password = os.getenv("DB_PASSWORD", "")
    db_name = os.getenv("DB_NAME", "riforma")
    return f"mariadb+pymysql://{user}:{password}@{host}:{port}/{db_name}"


# ---------------------------------------------------------------------------
# Column definitions per target table  (name -> set of column names)
# ---------------------------------------------------------------------------
# These are derived from the ORM models in app/models/tables.py.
# Relationship attributes are excluded; only actual DB columns are listed.

TABLE_COLUMNS: Dict[str, List[str]] = {
    "users": [
        "id", "email", "password_hash", "full_name", "role", "scopes",
        "active", "failed_login_attempts", "locked_until", "reset_token",
        "reset_token_expires", "created_at", "updated_at",
    ],
    "saas_tenants": [
        "id", "naziv", "tip", "status", "oib", "iban", "created_by",
        "created_at", "updated_at",
    ],
    "tenant_memberships": [
        "id", "user_id", "tenant_id", "role", "status", "invited_by",
        "created_at", "updated_at",
    ],
    "nekretnine": [
        "id", "tenant_id", "naziv", "adresa", "grad", "katastarska_opcina",
        "broj_kat_cestice", "vrsta", "povrsina", "godina_izgradnje",
        "vlasnik", "udio_vlasnistva", "nabavna_cijena", "trzisna_vrijednost",
        "prosllogodisnji_prihodi", "prosllogodisnji_rashodi", "amortizacija",
        "neto_prihod", "zadnja_obnova", "potrebna_ulaganja",
        "troskovi_odrzavanja", "osiguranje", "sudski_sporovi", "hipoteke",
        "napomene", "slika", "financijska_povijest", "has_parking",
        "created_by", "created_at", "updated_at",
    ],
    "property_units": [
        "id", "tenant_id", "nekretnina_id", "oznaka", "naziv", "kat",
        "povrsina_m2", "status", "osnovna_zakupnina", "napomena",
        "created_by", "created_at", "updated_at",
    ],
    "zakupnici": [
        "id", "tenant_id", "naziv_firme", "ime_prezime", "oib", "adresa",
        "adresa_ulica", "adresa_kucni_broj", "adresa_postanski_broj",
        "adresa_grad", "adresa_drzava", "sjediste",
        "kontakt_ime", "kontakt_email", "kontakt_telefon", "iban",
        "pdv_obveznik", "pdv_id", "maticni_broj", "registracijski_broj",
        "eracun_dostava_kanal", "eracun_identifikator", "eracun_email",
        "eracun_posrednik", "fiskalizacija_napomena",
        "odgovorna_osoba", "oznake", "opis_usluge", "radno_vrijeme",
        "biljeske", "hitnost_odziva_sati", "kontakt_osobe",
        "status", "tip", "napomena", "created_by",
        "created_at", "updated_at",
    ],
    "ugovori": [
        "id", "tenant_id", "nekretnina_id", "zakupnik_id",
        "property_unit_id", "interna_oznaka", "datum_potpisivanja",
        "datum_pocetka", "datum_zavrsetka", "trajanje_mjeseci",
        "opcija_produljenja", "uvjeti_produljenja", "rok_otkaza_dani",
        "osnovna_zakupnina", "zakupnina_po_m2", "cam_troskovi",
        "polog_depozit", "garancija", "indeksacija", "indeks",
        "formula_indeksacije", "obveze_odrzavanja", "namjena_prostora",
        "rezije_brojila", "status", "napomena",
        "approval_status", "approved_by", "approved_at", "approval_comment",
        "submitted_for_approval_at", "submitted_by",
        "parent_contract_id", "created_by", "created_at", "updated_at",
    ],
    "dokumenti": [
        "id", "tenant_id", "naziv", "tip", "opis", "nekretnina_id",
        "zakupnik_id", "ugovor_id", "property_unit_id",
        "maintenance_task_id", "datum_isteka", "metadata_json",
        "file_path", "original_filename", "content_type",
        "putanja_datoteke", "created_by", "created_at", "updated_at",
    ],
    "maintenance_tasks": [
        "id", "tenant_id", "naziv", "opis", "nekretnina_id",
        "property_unit_id", "ugovor_id", "zakupnik_id",
        "prijavio_user_id", "dodijeljeno_user_id",
        "prijavio", "dodijeljeno",
        "status", "prioritet",
        "datum_prijave", "rok", "trosak_materijal", "trosak_rad",
        "procijenjeni_trosak", "stvarni_trosak",
        "napomena", "oznake", "aktivnosti", "dobavljac_naziv",
        "dobavljac_kontakt", "dobavljac_telefon", "ponavljanje",
        "ponavljanje_do", "parent_task_id", "created_by",
        "created_at", "updated_at",
    ],
    "activity_logs": [
        "id", "tenant_id", "timestamp", "user", "role", "actor_id",
        "method", "path", "status_code", "scopes", "query_params",
        "request_payload", "ip_address", "request_id", "message",
        "entity_type", "entity_id", "entity_parent_id", "changes",
        "duration_ms",
    ],
    "parking_spaces": [
        "id", "tenant_id", "nekretnina_id", "floor", "internal_id",
        "vehicle_plates", "notes", "created_by", "created_at", "updated_at",
    ],
    "handover_protocols": [
        "id", "tenant_id", "contract_id", "type", "date",
        "meter_readings", "keys_handed_over", "notes",
        "created_at", "created_by",
    ],
    "projekti": [
        "id", "tenant_id", "name", "description", "status", "budget",
        "spent", "start_date", "end_date", "budget_breakdown",
        "projected_revenue", "linked_property_id", "created_by",
        "created_at", "updated_at",
    ],
    "project_phases": [
        "id", "project_id", "name", "description", "start_date",
        "end_date", "status", "order",
    ],
    "project_stakeholders": [
        "id", "project_id", "name", "role", "contact_info", "notes",
        "created_at",
    ],
    "project_transactions": [
        "id", "project_id", "date", "type", "category", "amount",
        "description", "paid_to", "created_at",
    ],
    "project_documents": [
        "id", "project_id", "name", "type", "phase_id", "status",
        "expiry_date", "file_url", "notes", "created_at",
    ],
    "tenant_settings": [
        "id", "tenant_id", "naziv_tvrtke", "adresa", "grad",
        "postanski_broj", "oib", "iban", "telefon", "email", "web",
        "logo_url", "default_valuta", "default_pdv_stopa",
        "default_rok_placanja_dani", "default_jezik", "email_obavijesti",
        "obavijest_istek_ugovora_dani", "obavijest_rok_odrzavanja",
        "report_header_text", "report_footer_text",
        "created_at", "updated_at",
    ],
    "racuni": [
        "id", "tenant_id", "tip_utroska", "dobavljac", "broj_racuna",
        "datum_racuna", "datum_dospijeca", "iznos", "valuta",
        "nekretnina_id", "zakupnik_id", "property_unit_id", "ugovor_id",
        "status_placanja", "preknjizavanje_status",
        "preknjizavanje_napomena", "napomena", "period_od", "period_do",
        "potrosnja_kwh", "potrosnja_m3", "file_path", "original_filename",
        "content_type", "putanja_datoteke", "total_paid", "payments",
        "approval_status", "approved_by", "approved_at", "approval_comment",
        "submitted_for_approval_at", "submitted_by",
        "created_by", "created_at", "updated_at",
    ],
    "oglasi": [
        "id", "tenant_id", "nekretnina_id", "property_unit_id",
        "tip_ponude", "vrsta", "naslov", "opis", "cijena", "cijena_valuta",
        "cijena_po_m2", "povrsina_m2", "broj_soba", "kat", "adresa",
        "grad", "opcina", "zip_code", "drzava", "namjesteno",
        "parking_ukljucen", "dostupno_od", "kontakt_ime",
        "kontakt_telefon", "kontakt_email", "slike", "objavi_na",
        "status", "created_by", "created_at", "updated_at",
    ],
    "notifications": [
        "id", "tenant_id", "user_id", "title", "message", "link",
        "tip", "read", "created_at",
    ],
    "dobavljaci": [
        "id", "tenant_id", "naziv", "tip", "kontakt_ime",
        "kontakt_email", "kontakt_telefon", "oib", "adresa", "napomena",
        "ocjena", "created_by", "created_at", "updated_at",
    ],
    "webhook_events": [
        "id", "tenant_id", "event_type", "source", "reference_id",
        "data", "status", "processed", "created_by", "created_at",
    ],
}


# Columns that store JSON and should be serialised for the INSERT
JSON_COLUMNS: Set[str] = {
    "scopes", "financijska_povijest", "oznake", "aktivnosti",
    "metadata_json", "query_params", "request_payload", "changes",
    "vehicle_plates", "meter_readings", "budget_breakdown",
    "slike", "objavi_na", "payments", "data", "kontakt_osobe",
}


# Collection name in document_store -> target relational table name
COLLECTION_MAP: Dict[str, str] = {
    "users": "users",
    "tenants": "saas_tenants",
    "tenant_memberships": "tenant_memberships",
    "nekretnine": "nekretnine",
    "property_units": "property_units",
    "zakupnici": "zakupnici",
    "ugovori": "ugovori",
    "dokumenti": "dokumenti",
    "maintenance_tasks": "maintenance_tasks",
    "activity_logs": "activity_logs",
    "parking_spaces": "parking_spaces",
    "handover_protocols": "handover_protocols",
    "projekti": "projekti",
    "tenant_settings": "tenant_settings",
    "racuni": "racuni",
    "oglasi": "oglasi",
    "notifications": "notifications",
    "dobavljaci": "dobavljaci",
    "webhook_events": "webhook_events",
}


# Tables where the child rows are embedded in the projekti JSON
PROJEKTI_CHILD_KEYS: Dict[str, str] = {
    "phases": "project_phases",
    "stakeholders": "project_stakeholders",
    "transactions": "project_transactions",
    "documents": "project_documents",
}


# Field name aliases: old document-store key -> new column name.
# Only applied when the old key does NOT already match a column name.
FIELD_ALIASES: Dict[str, Dict[str, str]] = {
    "zakupnici": {
        "naziv": "naziv_firme",        # old single name → company name
        "email": "kontakt_email",
        "telefon": "kontakt_telefon",
    },
    "maintenance_tasks": {
        "naslov": "naziv",              # old 'naslov' (title) → 'naziv'
        "title": "naziv",              # English variant
        "recurrence_pattern": "ponavljanje",
        "recurrence_end_date": "ponavljanje_do",
        "due_date": "rok",
        "assigned_to": "dodijeljeno_user_id",
        "reported_by": "prijavio_user_id",
    },
    "ugovori": {
        "zakupnik_naziv": None,         # drop — not a column in the new schema
    },
}


# Tables that only have created_at (no updated_at)
CREATED_AT_ONLY_TABLES: Set[str] = {
    "activity_logs",  # has neither created_at nor updated_at; uses timestamp
    "handover_protocols",
    "notifications",
    "project_phases",
    "project_stakeholders",
    "project_transactions",
    "project_documents",
    "webhook_events",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_row(
    data: Dict[str, Any],
    columns: List[str],
    *,
    doc_created_at: Optional[str] = None,
    doc_updated_at: Optional[str] = None,
    table_name: str = "",
) -> Dict[str, Any]:
    """
    Given a JSON data blob and the target column list, extract matching
    key-value pairs.  Handles _id -> id renaming, field aliases, and
    timestamp fallbacks.
    """
    # Apply field aliases: remap old keys → new column names in a working copy
    aliases = FIELD_ALIASES.get(table_name, {})
    if aliases:
        aliased_data: Dict[str, Any] = {}
        for k, v in data.items():
            if k in aliases:
                new_key = aliases[k]
                if new_key is not None:  # None means "drop this key"
                    aliased_data.setdefault(new_key, v)
            else:
                aliased_data[k] = v
        data = aliased_data

    row: Dict[str, Any] = {}

    for col in columns:
        val: Any = None

        if col == "id":
            # Try 'id' first, then '_id'
            val = data.get("id", data.get("_id"))
        else:
            val = data.get(col)

        # Fallback for created_at / updated_at from the document_store row
        if val is None and col == "created_at" and doc_created_at is not None:
            val = doc_created_at
        if val is None and col == "updated_at" and doc_updated_at is not None:
            val = doc_updated_at

        # Type normalisation
        if val is not None:
            # JSON columns: ensure they are serialised as JSON strings
            if col in JSON_COLUMNS:
                if isinstance(val, (dict, list)):
                    val = json.dumps(val, ensure_ascii=False)

        row[col] = val

    return row


def _batch_insert_ignore(
    engine: Engine,
    table_name: str,
    columns: List[str],
    rows: List[Dict[str, Any]],
    batch_size: int = 500,
) -> int:
    """
    Insert rows into *table_name* using INSERT IGNORE in batches.
    Returns the total number of rows actually inserted (affected).
    """
    if not rows:
        return 0

    # Build the INSERT IGNORE statement with named parameters
    col_names = ", ".join(f"`{c}`" for c in columns)
    placeholders = ", ".join(f":{c}" for c in columns)
    stmt = text(
        f"INSERT IGNORE INTO `{table_name}` ({col_names}) VALUES ({placeholders})"
    )

    total_affected = 0

    with engine.begin() as conn:
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            result = conn.execute(stmt, batch)
            total_affected += result.rowcount

    return total_affected


# ---------------------------------------------------------------------------
# Per-collection migration functions
# ---------------------------------------------------------------------------

def migrate_simple_collection(
    engine: Engine,
    collection: str,
    table_name: str,
    docs: List[Tuple[Dict[str, Any], Optional[str], Optional[str]]],
) -> int:
    """
    Migrate a simple (non-nested) collection.

    *docs* is a list of (data_dict, doc_created_at, doc_updated_at).
    Returns number of rows inserted.
    """
    columns = TABLE_COLUMNS[table_name]
    rows: List[Dict[str, Any]] = []

    for data, doc_created_at, doc_updated_at in docs:
        row = _extract_row(
            data,
            columns,
            doc_created_at=doc_created_at,
            doc_updated_at=doc_updated_at,
            table_name=table_name,
        )
        rows.append(row)

    inserted = _batch_insert_ignore(engine, table_name, columns, rows)
    return inserted


def migrate_projekti(
    engine: Engine,
    docs: List[Tuple[Dict[str, Any], Optional[str], Optional[str]]],
) -> Dict[str, int]:
    """
    Migrate projekti collection including embedded child arrays.
    Returns dict of {table_name: rows_inserted}.
    """
    results: Dict[str, int] = {}

    # 1. Migrate the main projekti rows
    parent_columns = TABLE_COLUMNS["projekti"]
    parent_rows: List[Dict[str, Any]] = []

    # Collect child rows
    child_rows: Dict[str, List[Dict[str, Any]]] = {
        tbl: [] for tbl in PROJEKTI_CHILD_KEYS.values()
    }

    for data, doc_created_at, doc_updated_at in docs:
        parent_row = _extract_row(
            data,
            parent_columns,
            doc_created_at=doc_created_at,
            doc_updated_at=doc_updated_at,
            table_name="projekti",
        )
        parent_rows.append(parent_row)

        project_id = parent_row.get("id")
        if not project_id:
            continue

        # Extract embedded child arrays
        for json_key, child_table in PROJEKTI_CHILD_KEYS.items():
            items = data.get(json_key) or []
            if not isinstance(items, list):
                continue
            child_columns = TABLE_COLUMNS[child_table]
            for item in items:
                if not isinstance(item, dict):
                    continue
                child_row = _extract_row(
                    item,
                    child_columns,
                    doc_created_at=doc_created_at,
                    doc_updated_at=None,  # child tables have created_at only
                    table_name=child_table,
                )
                # Always set the project_id FK
                child_row["project_id"] = project_id
                child_rows[child_table].append(child_row)

    # Insert parent rows
    results["projekti"] = _batch_insert_ignore(
        engine, "projekti", parent_columns, parent_rows
    )

    # Insert child rows
    for child_table, rows in child_rows.items():
        child_columns = TABLE_COLUMNS[child_table]
        results[child_table] = _batch_insert_ignore(
            engine, child_table, child_columns, rows
        )

    return results


# ---------------------------------------------------------------------------
# Main migration
# ---------------------------------------------------------------------------

def fetch_document_store(engine: Engine) -> Dict[str, List[Tuple[Dict, Optional[str], Optional[str]]]]:
    """
    Read all rows from document_store grouped by collection.

    Returns {collection_name: [(data_dict, created_at_str, updated_at_str), ...]}.
    """
    grouped: Dict[str, List[Tuple[Dict, Optional[str], Optional[str]]]] = {}

    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT collection, document_id, data, created_at, updated_at FROM document_store")
        )
        for row in result:
            collection = row[0]
            # document_id = row[1]  # available if needed; data.id should match
            raw_data = row[2]
            created_at = str(row[3]) if row[3] else None
            updated_at = str(row[4]) if row[4] else None

            # Parse JSON data
            if isinstance(raw_data, str):
                data = json.loads(raw_data)
            elif isinstance(raw_data, dict):
                data = raw_data
            else:
                # Fallback: try to parse
                data = json.loads(str(raw_data)) if raw_data else {}

            if collection not in grouped:
                grouped[collection] = []
            grouped[collection].append((data, created_at, updated_at))

    return grouped


def run_migration(engine: Engine) -> None:
    """Execute the full migration."""
    print("=" * 70)
    print("  RIFORMA DATA MIGRATION: document_store -> relational tables")
    print("=" * 70)
    print()

    # Verify document_store exists
    insp = inspect(engine)
    if not insp.has_table("document_store"):
        print("ERROR: Table 'document_store' does not exist. Nothing to migrate.")
        sys.exit(1)

    # Read all documents
    print("[1/3] Reading document_store ...")
    grouped = fetch_document_store(engine)
    total_docs = sum(len(v) for v in grouped.values())
    print(f"       Found {total_docs} documents across {len(grouped)} collections:")
    for coll, docs in sorted(grouped.items()):
        print(f"         - {coll}: {len(docs)} documents")
    print()

    # Report any collections without a mapping
    unmapped = set(grouped.keys()) - set(COLLECTION_MAP.keys())
    if unmapped:
        print(f"  WARNING: Unmapped collections (skipped): {sorted(unmapped)}")
        print()

    # Migrate each collection
    print("[2/3] Migrating collections ...")
    print()
    grand_total = 0

    for collection, table_name in COLLECTION_MAP.items():
        docs = grouped.get(collection, [])
        if not docs:
            print(f"  {collection} -> {table_name}: 0 documents (skipped)")
            continue

        if collection == "projekti":
            results = migrate_projekti(engine, docs)
            for tbl, count in results.items():
                print(f"  {collection} -> {tbl}: {count} / {len(docs) if tbl == 'projekti' else '?'} inserted")
                grand_total += count
        else:
            inserted = migrate_simple_collection(engine, collection, table_name, docs)
            print(f"  {collection} -> {table_name}: {inserted} / {len(docs)} inserted")
            grand_total += inserted

    # Summary
    print()
    print("[3/3] Migration complete!")
    print(f"       Total rows inserted: {grand_total}")
    print("=" * 70)


def main() -> None:
    url = _build_sync_url()
    # Mask password in output
    display_url = url
    if "@" in url:
        pre, post = url.split("@", 1)
        if ":" in pre:
            scheme_user = pre.rsplit(":", 1)[0]
            display_url = f"{scheme_user}:****@{post}"
    print(f"Connecting to: {display_url}")
    print()

    engine = create_engine(url, echo=False, pool_pre_ping=True)

    # Quick connectivity check
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        print(f"ERROR: Cannot connect to database: {exc}")
        sys.exit(1)

    run_migration(engine)


if __name__ == "__main__":
    main()

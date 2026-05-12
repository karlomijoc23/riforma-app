"""Reproduce the user-reported bug: contract is created but the attached
PDF document is not saved. The frontend flow is a two-step dance:

    1. POST /api/ugovori        → contract row
    2. POST /api/dokumenti      → multipart with file + ugovor_id

These tests confirm the end-to-end backend behaviour of that flow and
verify that the resulting document is linked to the contract correctly.
"""
import io
import os
import uuid

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


def _create_property(client, headers, naziv="Zgrada"):
    resp = client.post(
        "/api/nekretnine",
        json={
            "naziv": naziv,
            "adresa": "Primorska 1",
            "katastarska_opcina": "Zagreb",
            "broj_kat_cestice": "123/1",
            "vrsta": "poslovna_zgrada",
            "povrsina": 1500.0,
            "godina_izgradnje": 2010,
            "vlasnik": "Riforma d.o.o.",
            "udio_vlasnistva": "1/1",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_unit(client, headers, nekretnina_id):
    resp = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": "A1",
            "naziv": "Unit A1",
            "status": "dostupno",
            "povrsina_m2": 120.0,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_zakupnik(client, headers):
    resp = client.post(
        "/api/zakupnici",
        json={
            "naziv_firme": "Testni zakupnik d.o.o.",
            "ime_prezime": None,
            "oib": str(uuid.uuid4().int)[:11],
            "sjediste": "Zagreb",
            "kontakt_ime": "Ana",
            "kontakt_email": "ana@example.com",
            "kontakt_telefon": "+385123456",
            "iban": "HR1210010051863000160",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


def _create_contract(client, headers, nekretnina_id, zakupnik_id, unit_id=None):
    resp = client.post(
        "/api/ugovori",
        json={
            "interna_oznaka": f"UG-{uuid.uuid4().hex[:6].upper()}",
            "nekretnina_id": nekretnina_id,
            "zakupnik_id": zakupnik_id,
            "property_unit_id": unit_id,
            "datum_potpisivanja": "2026-01-01",
            "datum_pocetka": "2026-02-01",
            "datum_zavrsetka": "2027-01-31",
            "trajanje_mjeseci": 12,
            "osnovna_zakupnina": 1500.0,
            "zakupnina_po_m2": None,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _upload_document(client, headers, *, file_bytes, filename, contract_id, nekretnina_id, zakupnik_id, naziv="Ugovor PDF"):
    files = {"file": (filename, io.BytesIO(file_bytes), "application/pdf")}
    data = {
        "naziv": naziv,
        "tip": "ugovor",
        "ugovor_id": contract_id,
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
    }
    return client.post(
        "/api/dokumenti", files=files, data=data, headers=headers
    )


# ---------------------------------------------------------------------------


def test_contract_creation_then_pdf_upload_happy_path(client, pm_headers):
    """Replays the UgovorForm flow: create contract, then attach PDF."""
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"]
    )

    pdf_bytes = b"%PDF-1.4\n%EOF\n"
    resp = _upload_document(
        client, pm_headers,
        file_bytes=pdf_bytes,
        filename="Ugovor 2026.pdf",
        contract_id=contract["id"],
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
        naziv=f"Ugovor - {contract['interna_oznaka']}",
    )

    assert resp.status_code == 201, resp.text
    doc = resp.json()
    assert doc["ugovor_id"] == contract["id"]
    assert doc["nekretnina_id"] == nekretnina_id
    assert doc["zakupnik_id"] == tenant["id"]
    assert doc["tip"] == "ugovor"
    assert doc["file_path"], "file_path must be set after upload"
    assert doc["original_filename"] == "Ugovor 2026.pdf"


def test_document_filterable_by_contract_after_upload(client, pm_headers):
    """The document must appear when listing documents for a contract."""
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(client, pm_headers, nekretnina_id, tenant["id"])

    _upload_document(
        client, pm_headers,
        file_bytes=b"%PDF-1.4\nbody\n%EOF\n",
        filename="attached.pdf",
        contract_id=contract["id"],
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )

    resp = client.get(
        f"/api/dokumenti/ugovor/{contract['id']}", headers=pm_headers
    )
    assert resp.status_code == 200
    docs = resp.json()
    assert len(docs) == 1
    assert docs[0]["original_filename"] == "attached.pdf"


def test_upload_propagates_property_unit_id_when_provided(client, pm_headers):
    """Regression: UgovorForm passes property_unit_id through — it must
    land on the dokumenti row so the document shows up on the unit too."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"], unit_id=unit_id
    )

    files = {"file": ("unit-doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    data = {
        "naziv": "Unit-scoped document",
        "tip": "ugovor",
        "ugovor_id": contract["id"],
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": tenant["id"],
        "property_unit_id": unit_id,
    }
    resp = client.post(
        "/api/dokumenti", files=files, data=data, headers=pm_headers
    )
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["id"]

    # The document must be reachable via the unit-scoped listing.
    listing = client.get(
        f"/api/dokumenti/property-unit/{unit_id}", headers=pm_headers
    )
    assert listing.status_code == 200
    assert any(d["id"] == doc_id for d in listing.json()), (
        "Document linked to a unit must be visible via /dokumenti/property-unit/{id}"
    )

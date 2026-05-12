import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers — mirror patterns from test_maintenance_tasks.py
# ---------------------------------------------------------------------------


def _create_property(client, headers, naziv="Zgrada A"):
    response = client.post(
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
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_unit(client, headers, nekretnina_id, oznaka="A1"):
    response = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": oznaka,
            "naziv": f"Unit {oznaka}",
            "status": "dostupno",
            "povrsina_m2": 120.0,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_zakupnik(client, headers, naziv="Tenant d.o.o."):
    payload = {
        "naziv_firme": naziv,
        "ime_prezime": None,
        "oib": str(uuid.uuid4().int)[:11],
        "sjediste": "Zagreb",
        "kontakt_ime": "Ana",
        "kontakt_email": "ana@example.com",
        "kontakt_telefon": "+385123456",
        "iban": "HR1210010051863000160",
    }
    response = client.post("/api/zakupnici", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _contract_payload(
    nekretnina_id,
    zakupnik_id,
    property_unit_id=None,
    start_offset_days=0,
    duration_days=30,
    oznaka=None,
):
    today = date.today()
    start = today + timedelta(days=start_offset_days)
    end = start + timedelta(days=duration_days)
    return {
        "interna_oznaka": oznaka or f"UG-{uuid.uuid4().hex[:6].upper()}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": property_unit_id,
        "datum_potpisivanja": today.isoformat(),
        "datum_pocetka": start.isoformat(),
        "datum_zavrsetka": end.isoformat(),
        "trajanje_mjeseci": 1,
        "osnovna_zakupnina": 500.0,
        "zakupnina_po_m2": None,
        "cam_troskovi": 50.0,
        "polog_depozit": 100.0,
        "garancija": 0.0,
        "indeksacija": False,
        "rok_otkaza_dani": 30,
    }


def _create_contract(client, headers, **kwargs):
    payload = _contract_payload(**kwargs)
    response = client.post("/api/ugovori", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_new_contract_starts_pending_approval(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant = _create_zakupnik(client, pm_headers)

    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
    )

    assert contract["approval_status"] == "pending_approval"
    assert contract["submitted_by"] is not None
    assert contract["approved_by"] is None
    assert contract["approved_at"] is None


def test_approve_transitions_pending_to_approved(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
    )

    response = client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "All good"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["approval_status"] == "approved"
    assert body["approved_by"] is not None
    assert body["approved_at"] is not None


def test_approve_marks_unit_as_iznajmljeno(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant = _create_zakupnik(client, pm_headers)
    # Duration > 30 days so computed status is AKTIVNO (not NA_ISTEKU).
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
        duration_days=365,
    )

    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    unit = client.get(f"/api/units/{unit_id}", headers=admin_headers)
    assert unit.status_code == 200, unit.text
    assert unit.json()["status"] == "iznajmljeno"


def test_reject_requires_comment(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
    )

    # Empty comment → 422
    response = client.post(
        f"/api/ugovori/{contract['id']}/reject",
        json={"komentar": "   "},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert "komentar" in response.json()["detail"].lower()

    # Valid comment → 200
    response = client.post(
        f"/api/ugovori/{contract['id']}/reject",
        json={"komentar": "Nedostaje depozit"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["approval_status"] == "rejected"
    assert body["approval_comment"] == "Nedostaje depozit"


def test_cannot_approve_already_approved_contract(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Second approve must fail
    response = client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "again"},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_cannot_reject_approved_contract(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    response = client.post(
        f"/api/ugovori/{contract['id']}/reject",
        json={"komentar": "nope"},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_withdraw_returns_to_draft(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )

    response = client.post(
        f"/api/ugovori/{contract['id']}/withdraw",
        headers=pm_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["approval_status"] == "draft"


def test_resubmit_after_rejection(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )
    # Reject
    client.post(
        f"/api/ugovori/{contract['id']}/reject",
        json={"komentar": "Revidiraj"},
        headers=admin_headers,
    )

    # Creator resubmits
    response = client.post(
        f"/api/ugovori/{contract['id']}/submit-for-approval",
        headers=pm_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["approval_status"] == "pending_approval"


def test_overlap_check_blocks_second_contract_on_same_unit(client, admin_headers, pm_headers):
    """Second approved contract must not be able to overlap an approved contract
    on the same unit."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant_a = _create_zakupnik(client, pm_headers, "Alpha")
    tenant_b = _create_zakupnik(client, pm_headers, "Beta")

    # First contract created + approved → unit rented
    first = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant_a["id"],
        property_unit_id=unit_id,
        oznaka="UG-FIRST",
    )
    client.post(
        f"/api/ugovori/{first['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Second contract with overlapping period → must be rejected
    payload = _contract_payload(
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant_b["id"],
        property_unit_id=unit_id,
        start_offset_days=5,
        duration_days=30,
        oznaka="UG-OVERLAP",
    )
    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 400
    assert "preklapanje" in response.json()["detail"].lower()


def test_overlap_allows_non_overlapping_sequential_contracts(client, admin_headers, pm_headers):
    """Two sequential (non-overlapping) contracts on the same unit are fine."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant_a = _create_zakupnik(client, pm_headers, "Alpha")
    tenant_b = _create_zakupnik(client, pm_headers, "Beta")

    first = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant_a["id"],
        property_unit_id=unit_id,
        start_offset_days=0,
        duration_days=30,
        oznaka="UG-SEQ-1",
    )
    client.post(
        f"/api/ugovori/{first['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Second starts day after first ends
    payload = _contract_payload(
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant_b["id"],
        property_unit_id=unit_id,
        start_offset_days=31,
        duration_days=30,
        oznaka="UG-SEQ-2",
    )
    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text


def test_approval_endpoint_requires_authentication(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client,
        pm_headers,
        nekretnina_id=nekretnina_id,
        zakupnik_id=tenant["id"],
    )

    # No auth headers at all
    response = client.post(f"/api/ugovori/{contract['id']}/approve", json={})
    assert response.status_code in (401, 403)


def test_approve_nonexistent_contract_returns_404(client, admin_headers):
    response = client.post(
        "/api/ugovori/does-not-exist/approve",
        json={"komentar": "x"},
        headers=admin_headers,
    )
    assert response.status_code == 404

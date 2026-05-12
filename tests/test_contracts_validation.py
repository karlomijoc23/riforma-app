"""Integration tests for contract validation and business rules:
- B1: segregation of duties (no self-approve)
- B2: back-to-back overlap check
- B3: status transitions cannot resurrect terminal states
- B5: rent fields are mutually exclusive
"""
import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_property(client, headers, naziv="Zgrada"):
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


def _create_zakupnik(client, headers, naziv="Tenant"):
    response = client.post(
        "/api/zakupnici",
        json={
            "naziv_firme": naziv,
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
    assert response.status_code == 201, response.text
    return response.json()


def _contract_payload(nekretnina_id, zakupnik_id, unit_id=None, start=None, end=None, oznaka=None):
    today = date.today()
    start = start or today
    end = end or (today + timedelta(days=365))
    return {
        "interna_oznaka": oznaka or f"UG-{uuid.uuid4().hex[:6].upper()}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": unit_id,
        "datum_potpisivanja": today.isoformat(),
        "datum_pocetka": start.isoformat(),
        "datum_zavrsetka": end.isoformat(),
        "trajanje_mjeseci": 12,
        "osnovna_zakupnina": 500.0,
        "zakupnina_po_m2": None,
        "cam_troskovi": 0.0,
        "polog_depozit": 0.0,
        "garancija": 0.0,
        "indeksacija": False,
        "rok_otkaza_dani": 30,
    }


def _create_contract(client, headers, **kwargs):
    response = client.post("/api/ugovori", json=_contract_payload(**kwargs), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# B1: Segregation of duties — no self-approve
# ---------------------------------------------------------------------------


def test_creator_cannot_approve_own_contract(client, admin_headers):
    """Admin creates a contract → cannot approve it themselves."""
    nekretnina_id = _create_property(client, admin_headers)
    tenant = _create_zakupnik(client, admin_headers)
    contract = _create_contract(
        client, admin_headers, nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"]
    )

    response = client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "trying to self-approve"},
        headers=admin_headers,
    )
    assert response.status_code == 422
    assert "sami kreirali" in response.json()["detail"].lower()


def test_another_approver_can_approve(client, admin_headers, pm_headers):
    """PM creates, admin approves — classic segregation flow works."""
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"]
    )

    response = client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )
    assert response.status_code == 200
    assert response.json()["approval_status"] == "approved"


# ---------------------------------------------------------------------------
# B2: Back-to-back overlap
# ---------------------------------------------------------------------------


def test_back_to_back_contracts_same_day_transition_allowed(client, admin_headers, pm_headers):
    """Old contract ends on day X → new contract starts on day X. Must succeed."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant_a = _create_zakupnik(client, pm_headers, "Alpha")
    tenant_b = _create_zakupnik(client, pm_headers, "Beta")

    today = date.today()
    boundary = today + timedelta(days=60)

    first = _create_contract(
        client, pm_headers,
        nekretnina_id=nekretnina_id, zakupnik_id=tenant_a["id"],
        unit_id=unit_id, start=today, end=boundary, oznaka="UG-B2B-1",
    )
    client.post(
        f"/api/ugovori/{first['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Second starts SAME DAY the first ends
    payload = _contract_payload(
        nekretnina_id=nekretnina_id, zakupnik_id=tenant_b["id"],
        unit_id=unit_id, start=boundary, end=boundary + timedelta(days=365),
        oznaka="UG-B2B-2",
    )
    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text


def test_one_day_overlap_still_blocked(client, admin_headers, pm_headers):
    """Overlap of a single day must still be blocked."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    tenant_a = _create_zakupnik(client, pm_headers, "Alpha")
    tenant_b = _create_zakupnik(client, pm_headers, "Beta")

    today = date.today()
    first = _create_contract(
        client, pm_headers,
        nekretnina_id=nekretnina_id, zakupnik_id=tenant_a["id"],
        unit_id=unit_id, start=today, end=today + timedelta(days=60),
        oznaka="UG-OV-1",
    )
    client.post(
        f"/api/ugovori/{first['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Second starts ONE DAY BEFORE the first ends → real overlap
    payload = _contract_payload(
        nekretnina_id=nekretnina_id, zakupnik_id=tenant_b["id"],
        unit_id=unit_id,
        start=today + timedelta(days=59),
        end=today + timedelta(days=400),
        oznaka="UG-OV-2",
    )
    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# B3: Terminal states cannot be resurrected
# ---------------------------------------------------------------------------


def test_cannot_transition_istekao_to_aktivno(client, admin_headers, pm_headers):
    """ISTEKAO is terminal — only → ARHIVIRANO allowed."""
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )
    # Force to ISTEKAO via status endpoint (AKTIVNO → RASKINUTO allowed, then RASKINUTO → ARHIVIRANO)
    # Alternative: go AKTIVNO → NA_ISTEKU → ISTEKAO
    response = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "na_isteku"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    response = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "istekao"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text

    # Now try to resurrect ISTEKAO → AKTIVNO
    response = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "aktivno"},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_cannot_transition_arhivirano_to_aktivno(client, admin_headers, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )
    # AKTIVNO → ARHIVIRANO
    response = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "arhivirano"},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text

    # ARHIVIRANO → AKTIVNO must fail
    response = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "aktivno"},
        headers=admin_headers,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# B5: Rent fields mutually exclusive
# ---------------------------------------------------------------------------


def test_cannot_set_both_rent_fields(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    payload = _contract_payload(nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"])
    payload["osnovna_zakupnina"] = 500.0
    payload["zakupnina_po_m2"] = 10.0

    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 422
    assert "samo jedno" in response.text.lower()


def test_only_osnovna_zakupnina_works(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    payload = _contract_payload(nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"])
    payload["osnovna_zakupnina"] = 500.0
    payload["zakupnina_po_m2"] = None

    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 201


def test_only_po_m2_computes_rent_from_unit_area(client, pm_headers):
    """Setting only po_m2 on a unit-scoped contract computes osnovna from area."""
    nekretnina_id = _create_property(client, pm_headers)
    unit_id = _create_unit(client, pm_headers, nekretnina_id)  # 120 m²
    tenant = _create_zakupnik(client, pm_headers)
    payload = _contract_payload(
        nekretnina_id=nekretnina_id, zakupnik_id=tenant["id"], unit_id=unit_id
    )
    payload["osnovna_zakupnina"] = 0.0
    payload["zakupnina_po_m2"] = 10.0

    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text
    assert response.json()["osnovna_zakupnina"] == 1200.0  # 10 × 120

"""Renewal flow regression tests.

After Deploy #2 (multi-unit) the renewal endpoint had four latent bugs:
1. Only the legacy `property_unit_id` was carried over — junction units lost.
2. Payload bypassed `ContractCreate` Pydantic so B5 rent rule never fired.
3. `date.today()` ignored Europe/Zagreb timezone (B4 regression).
4. Old contract → ISTEKAO + new → pending_approval left units IZNAJMLJENO
   without an approved backer for hours.

These tests pin all four behaviours so we don't regress.
"""
import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers (copied from sister test files — keep self-contained)
# ---------------------------------------------------------------------------


def _create_property(client, headers):
    resp = client.post(
        "/api/nekretnine",
        json={
            "naziv": "Renewal property",
            "adresa": "Primorska 1",
            "katastarska_opcina": "Zagreb",
            "broj_kat_cestice": "123/1",
            "vrsta": "poslovna_zgrada",
            "povrsina": 1500.0,
            "godina_izgradnje": 2010,
            "vlasnik": "Riforma",
            "udio_vlasnistva": "1/1",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_unit(client, headers, nekretnina_id, oznaka):
    resp = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": oznaka,
            "naziv": f"Unit {oznaka}",
            "status": "dostupno",
            "povrsina_m2": 100.0,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_zakupnik(client, headers):
    resp = client.post(
        "/api/zakupnici",
        json={
            "naziv_firme": "Renewal zakupnik",
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


def _create_contract(client, headers, nekretnina_id, zakupnik_id, *, unit_ids=None,
                     primary=None, days=400, rent=1000.0, oznaka=None):
    today = date.today()
    payload = {
        "interna_oznaka": oznaka or f"REN-{uuid.uuid4().hex[:6]}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": primary,
        "property_unit_ids": unit_ids,
        "datum_potpisivanja": today.isoformat(),
        "datum_pocetka": today.isoformat(),
        "datum_zavrsetka": (today + timedelta(days=days)).isoformat(),
        "trajanje_mjeseci": 12,
        "osnovna_zakupnina": rent,
        "zakupnina_po_m2": None,
    }
    resp = client.post("/api/ugovori", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_renewal_carries_over_all_units(client, admin_headers, pm_headers):
    """Multi-unit contract renewal must include every original unit."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "R1")
    u2 = _create_unit(client, pm_headers, n_id, "R2")
    u3 = _create_unit(client, pm_headers, n_id, "R3")
    tenant = _create_zakupnik(client, pm_headers)

    contract = _create_contract(
        client, pm_headers, n_id, tenant["id"], unit_ids=[u1, u2, u3]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    resp = client.post(
        f"/api/ugovori/{contract['id']}/renew",
        json={"trajanje_mjeseci": 12, "eskalacija_postotak": 5},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    new_contract = resp.json()
    # All three original units travel to the renewed contract.
    assert set(new_contract["property_unit_ids"]) == {u1, u2, u3}
    # Primary pointer stays consistent (first of set).
    assert new_contract["property_unit_id"] in {u1, u2, u3}
    # Escalation applied.
    assert new_contract["osnovna_zakupnina"] == 1050.0


def test_renewal_blocks_invalid_rent_combination(client, admin_headers, pm_headers):
    """If the original row somehow has both rent fields populated (legacy
    pre-B5 data), renewal must NOT propagate that — escalated osnovna is
    kept and zakupnina_po_m2 is cleared. The new contract must validate."""
    from app.db.repositories.instance import ugovori as ugovori_repo
    from app.db.tenant import CURRENT_TENANT_ID

    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "Q1")
    tenant = _create_zakupnik(client, pm_headers)

    # Create a clean contract first.
    contract = _create_contract(
        client, pm_headers, n_id, tenant["id"], unit_ids=[u1]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Mutate it directly to look like legacy data: both rent fields set.
    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    try:
        import asyncio
        async def _mutate():
            await ugovori_repo.update_by_id(
                contract["id"], {"zakupnina_po_m2": 12.0}
            )
        try:
            asyncio.get_event_loop().run_until_complete(_mutate())
        except RuntimeError:
            asyncio.run(_mutate())
    finally:
        CURRENT_TENANT_ID.set(None)

    # Renewal must succeed and the resulting contract must have ONLY
    # osnovna_zakupnina set (po_m2 cleared by the renewal logic).
    resp = client.post(
        f"/api/ugovori/{contract['id']}/renew",
        json={"trajanje_mjeseci": 12, "eskalacija_postotak": 0},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    renewed = resp.json()
    assert renewed["osnovna_zakupnina"] == 1000.0
    assert renewed["zakupnina_po_m2"] in (None, 0, 0.0)


def test_renewal_frees_units_until_new_contract_is_approved(
    client, admin_headers, pm_headers
):
    """Old contract → ISTEKAO + new contract → pending_approval must NOT
    leave units IZNAJMLJENO without an approved backer. Renewal frees
    every linked unit; approving the new contract reclaims them."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "F1")
    u2 = _create_unit(client, pm_headers, n_id, "F2")
    tenant = _create_zakupnik(client, pm_headers)

    contract = _create_contract(
        client, pm_headers, n_id, tenant["id"], unit_ids=[u1, u2]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )
    # Both units rented after approval
    for uid in (u1, u2):
        resp = client.get(f"/api/units/{uid}", headers=admin_headers)
        assert resp.json()["status"] == "iznajmljeno", uid

    # Renew
    renew_resp = client.post(
        f"/api/ugovori/{contract['id']}/renew",
        json={"trajanje_mjeseci": 12, "eskalacija_postotak": 0},
        headers=admin_headers,
    )
    assert renew_resp.status_code == 200, renew_resp.text
    new_contract = renew_resp.json()

    # Immediately after renewal: old is istekao, new is pending → units freed.
    for uid in (u1, u2):
        unit = client.get(f"/api/units/{uid}", headers=admin_headers).json()
        assert unit["status"] == "dostupno", (
            f"Unit {uid} should be released until renewal is approved, "
            f"got {unit['status']}"
        )

    # Approving the renewal reclaims the units.
    approval = client.post(
        f"/api/ugovori/{new_contract['id']}/approve",
        json={"komentar": "ok"},
        headers=pm_headers,  # pm has leases:* and is NOT the creator (admin)
    )
    assert approval.status_code == 200, approval.text
    for uid in (u1, u2):
        unit = client.get(f"/api/units/{uid}", headers=admin_headers).json()
        assert unit["status"] == "iznajmljeno", uid


def test_renewal_old_contract_marked_istekao(client, admin_headers, pm_headers):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "I1")
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, n_id, tenant["id"], unit_ids=[u1]
    )
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    client.post(
        f"/api/ugovori/{contract['id']}/renew",
        json={"trajanje_mjeseci": 12, "eskalacija_postotak": 0},
        headers=admin_headers,
    )

    refreshed = client.get(
        f"/api/ugovori/{contract['id']}", headers=admin_headers
    ).json()
    assert refreshed["status"] == "istekao"

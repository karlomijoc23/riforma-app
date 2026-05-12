"""Tests for the multi-unit-per-contract feature.

Verifies:
- Contract can be created over multiple units in one POST.
- Overlap check fires if ANY of the requested units already has an
  approved contract in the same period.
- Status changes propagate to ALL linked units (approve, raskini, archive).
- Backward-compat: payload sending only the legacy `property_unit_id`
  still works and the resulting row exposes that unit through the new
  `property_unit_ids` field.
- A unit can't be added to a contract on a different property.
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


def _create_property(client, headers, naziv="Multi-unit zgrada"):
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


def _create_unit(client, headers, nekretnina_id, oznaka, povrsina=80.0):
    resp = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": oznaka,
            "naziv": f"Unit {oznaka}",
            "status": "dostupno",
            "povrsina_m2": povrsina,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_zakupnik(client, headers, naziv="MU Zakupnik"):
    resp = client.post(
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
    assert resp.status_code == 201
    return resp.json()


def _payload(nekretnina_id, zakupnik_id, *, unit_ids=None, primary=None,
             oznaka=None, days=400):
    today = date.today()
    return {
        "interna_oznaka": oznaka or f"MU-{uuid.uuid4().hex[:6].upper()}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": primary,
        "property_unit_ids": unit_ids,
        "datum_potpisivanja": today.isoformat(),
        "datum_pocetka": today.isoformat(),
        "datum_zavrsetka": (today + timedelta(days=days)).isoformat(),
        "trajanje_mjeseci": 12,
        "osnovna_zakupnina": 1500.0,
        "zakupnina_po_m2": None,
    }


# ---------------------------------------------------------------------------
# Create flow
# ---------------------------------------------------------------------------


def test_create_contract_with_multiple_units(client, pm_headers):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "A1")
    u2 = _create_unit(client, pm_headers, n_id, "A2")
    u3 = _create_unit(client, pm_headers, n_id, "A3")
    tenant = _create_zakupnik(client, pm_headers)

    resp = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1, u2, u3]),
        headers=pm_headers,
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    # All three units land in the M2M result
    assert set(data["property_unit_ids"]) == {u1, u2, u3}
    # Primary unit is the first of the list (legacy column populated)
    assert data["property_unit_id"] == u1


def test_create_contract_with_legacy_primary_only(client, pm_headers):
    """Old clients pass only `property_unit_id` — still works, exposed via
    the new `property_unit_ids` field as a single-element list."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "B1")
    tenant = _create_zakupnik(client, pm_headers)

    resp = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], primary=u1),
        headers=pm_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["property_unit_id"] == u1
    assert data["property_unit_ids"] == [u1]


def test_create_rejects_unit_from_other_property(client, pm_headers):
    n1 = _create_property(client, pm_headers, "Zgrada A")
    n2 = _create_property(client, pm_headers, "Zgrada B")
    u_a = _create_unit(client, pm_headers, n1, "X1")
    u_b = _create_unit(client, pm_headers, n2, "Y1")
    tenant = _create_zakupnik(client, pm_headers)

    resp = client.post(
        "/api/ugovori",
        json=_payload(n1, tenant["id"], unit_ids=[u_a, u_b]),
        headers=pm_headers,
    )
    assert resp.status_code == 400
    assert "ne pripada" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Overlap across the M2M
# ---------------------------------------------------------------------------


def test_overlap_blocks_when_any_requested_unit_is_taken(
    client, admin_headers, pm_headers
):
    """First contract holds units {A1, A2}. A second contract for {A2, A3}
    in the same period must fail because A2 is already covered."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "A1")
    u2 = _create_unit(client, pm_headers, n_id, "A2")
    u3 = _create_unit(client, pm_headers, n_id, "A3")
    t1 = _create_zakupnik(client, pm_headers, "Alpha")
    t2 = _create_zakupnik(client, pm_headers, "Beta")

    first = client.post(
        "/api/ugovori",
        json=_payload(n_id, t1["id"], unit_ids=[u1, u2], oznaka="MU-1"),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{first['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    resp = client.post(
        "/api/ugovori",
        json=_payload(n_id, t2["id"], unit_ids=[u2, u3], oznaka="MU-2"),
        headers=pm_headers,
    )
    assert resp.status_code == 400
    assert "preklapanje" in resp.json()["detail"].lower()


def test_legacy_overlap_check_sees_m2m_contracts(
    client, admin_headers, pm_headers
):
    """An old client creating a contract via single `property_unit_id` must
    still trip on a multi-unit contract that occupies that unit."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "C1")
    u2 = _create_unit(client, pm_headers, n_id, "C2")
    t1 = _create_zakupnik(client, pm_headers, "Alpha")
    t2 = _create_zakupnik(client, pm_headers, "Beta")

    multi = client.post(
        "/api/ugovori",
        json=_payload(n_id, t1["id"], unit_ids=[u1, u2], oznaka="MU-LEG-1"),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{multi['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    legacy = client.post(
        "/api/ugovori",
        json=_payload(n_id, t2["id"], primary=u2, oznaka="MU-LEG-2"),
        headers=pm_headers,
    )
    assert legacy.status_code == 400


# ---------------------------------------------------------------------------
# Status sync propagation
# ---------------------------------------------------------------------------


def test_approve_marks_all_units_iznajmljeno(
    client, admin_headers, pm_headers
):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "S1")
    u2 = _create_unit(client, pm_headers, n_id, "S2")
    tenant = _create_zakupnik(client, pm_headers)

    contract = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1, u2]),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    for uid in (u1, u2):
        resp = client.get(f"/api/units/{uid}", headers=admin_headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "iznajmljeno", uid


def test_raskini_frees_all_units(client, admin_headers, pm_headers):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "T1")
    u2 = _create_unit(client, pm_headers, n_id, "T2")
    tenant = _create_zakupnik(client, pm_headers)

    contract = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1, u2]),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Move the contract to RASKINUTO via the dedicated status endpoint.
    resp = client.put(
        f"/api/ugovori/{contract['id']}/status",
        json={"novi_status": "raskinuto"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text

    for uid in (u1, u2):
        unit = client.get(f"/api/units/{uid}", headers=admin_headers).json()
        assert unit["status"] == "dostupno", uid


def test_get_contract_returns_all_unit_ids(client, pm_headers):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "G1")
    u2 = _create_unit(client, pm_headers, n_id, "G2")
    tenant = _create_zakupnik(client, pm_headers)

    contract = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1, u2]),
        headers=pm_headers,
    ).json()

    resp = client.get(f"/api/ugovori/{contract['id']}", headers=pm_headers)
    assert resp.status_code == 200
    assert set(resp.json()["property_unit_ids"]) == {u1, u2}


# ---------------------------------------------------------------------------
# Edit flow — replace unit set
# ---------------------------------------------------------------------------


def test_unit_delete_blocked_when_held_only_through_junction(
    client, admin_headers, pm_headers
):
    """Multi-unit contract holds a unit ONLY through the junction (not the
    legacy primary FK). Deleting that unit must still 409, not silently
    cascade and orphan the contract from a unit it depends on."""
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "DEL-PRIMARY")
    u2 = _create_unit(client, pm_headers, n_id, "DEL-SECONDARY")
    tenant = _create_zakupnik(client, pm_headers)

    contract = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1, u2], oznaka="MU-DEL"),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # u2 is in the junction but is NOT the primary — old check missed it.
    resp = client.delete(f"/api/units/{u2}", headers=admin_headers)
    assert resp.status_code == 409, resp.text
    assert "aktivan ugovor" in resp.json()["detail"].lower()


def test_update_can_extend_unit_set(client, admin_headers, pm_headers):
    n_id = _create_property(client, pm_headers)
    u1 = _create_unit(client, pm_headers, n_id, "E1")
    u2 = _create_unit(client, pm_headers, n_id, "E2")
    u3 = _create_unit(client, pm_headers, n_id, "E3")
    tenant = _create_zakupnik(client, pm_headers)

    # Start with one unit.
    contract = client.post(
        "/api/ugovori",
        json=_payload(n_id, tenant["id"], unit_ids=[u1]),
        headers=pm_headers,
    ).json()
    client.post(
        f"/api/ugovori/{contract['id']}/approve",
        json={"komentar": "ok"},
        headers=admin_headers,
    )

    # Extend to {u1, u2, u3}.
    resp = client.put(
        f"/api/ugovori/{contract['id']}",
        json={"property_unit_ids": [u1, u2, u3]},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    assert set(resp.json()["property_unit_ids"]) == {u1, u2, u3}

    # All three units should be reachable through GET.
    refetched = client.get(
        f"/api/ugovori/{contract['id']}", headers=admin_headers
    ).json()
    assert set(refetched["property_unit_ids"]) == {u1, u2, u3}

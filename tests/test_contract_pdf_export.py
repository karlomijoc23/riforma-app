"""Smoke tests for the contract PDF export endpoint.

Goals:
- Endpoint exists, is auth-scoped, and returns 404 for missing contracts.
- When WeasyPrint is installed → returns application/pdf with a PDF magic header.
- When WeasyPrint is not installed → returns 503 with a clear Croatian message.
- The Jinja-like placeholder substitution produces no raw `{{...}}` leftovers.
"""
import io
import os
import uuid

import pytest

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402
from app.services import contract_pdf_service  # noqa: E402

settings = get_settings()


# ---------------------------------------------------------------------------
# Helpers (duplicated minimally — keeps this file self-contained)
# ---------------------------------------------------------------------------


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


def _create_contract(client, headers, nekretnina_id, zakupnik_id, oznaka="UG-PDF-01"):
    resp = client.post(
        "/api/ugovori",
        json={
            "interna_oznaka": oznaka,
            "nekretnina_id": nekretnina_id,
            "zakupnik_id": zakupnik_id,
            "datum_potpisivanja": "2026-01-01",
            "datum_pocetka": "2026-02-01",
            "datum_zavrsetka": "2027-01-31",
            "trajanje_mjeseci": 12,
            "osnovna_zakupnina": 1234.56,
            "zakupnina_po_m2": None,
            "napomena": "Test napomena sa hrvatskim znakovima: čćžšđ.",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_pdf_endpoint_404_for_missing_contract(client, admin_headers):
    resp = client.get("/api/ugovori/does-not-exist/export-pdf", headers=admin_headers)
    assert resp.status_code == 404


def test_pdf_endpoint_requires_auth(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"], oznaka="UG-AUTH"
    )
    resp = client.get(f"/api/ugovori/{contract['id']}/export-pdf")
    assert resp.status_code in (401, 403)


def test_pdf_endpoint_returns_pdf_or_503(client, pm_headers):
    """If WeasyPrint is installed, must return a valid PDF. Otherwise 503."""
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"], oznaka="UG-SMOKE"
    )

    resp = client.get(
        f"/api/ugovori/{contract['id']}/export-pdf", headers=pm_headers
    )

    try:
        import weasyprint  # noqa: F401
        weasyprint_available = True
    except Exception:
        weasyprint_available = False

    if weasyprint_available:
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF-"), "response is not a valid PDF"
        assert "attachment" in resp.headers.get("content-disposition", "")
    else:
        assert resp.status_code == 503
        detail = resp.json().get("detail", "")
        assert "PDF" in detail or "WeasyPrint" in detail


# ---------------------------------------------------------------------------
# Unit tests on the PDF service (no WeasyPrint required)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_contract_context_substitutes_all_placeholders(
    client, pm_headers
):
    """No template placeholder should be left un-substituted."""
    from app.db.repositories.instance import ugovori as ugovori_repo
    from app.db.tenant import CURRENT_TENANT_ID

    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"], oznaka="UG-PH"
    )

    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    try:
        row = await ugovori_repo.get_by_id(contract["id"])
        context = await contract_pdf_service.build_contract_context(row)
        html = contract_pdf_service._render_placeholder_template(
            "ugovor-template.html", context
        )
    finally:
        CURRENT_TENANT_ID.set(None)

    # No raw {{...}} left over
    assert "{{" not in html, "unresolved template placeholder in rendered HTML"
    # Croatian characters preserved
    assert "čćžšđ" in html
    # Contract reference populated
    assert "UG-PH" in html
    # Currency formatted hr-HR style with non-breaking space
    assert "1.234,56\u00a0€" in html

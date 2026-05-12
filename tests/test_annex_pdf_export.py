"""Smoke tests for the annex (aneks) PDF export endpoint.

Same shape as test_contract_pdf_export.py — verifies endpoint auth,
missing-contract handling, placeholder substitution, and WeasyPrint
availability fallback.
"""
import os
import uuid

import pytest

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.core.config import get_settings  # noqa: E402
from app.services import contract_pdf_service  # noqa: E402

settings = get_settings()


def _create_property(client, headers):
    resp = client.post(
        "/api/nekretnine",
        json={
            "naziv": "Aneks zgrada",
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
            "naziv_firme": "Aneks zakupnik d.o.o.",
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


def _create_contract(client, headers, nekretnina_id, zakupnik_id, oznaka="UG-AN-01"):
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
            "osnovna_zakupnina": 1000.0,
            "zakupnina_po_m2": None,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------


def test_annex_pdf_404_for_missing_contract(client, admin_headers):
    resp = client.post(
        "/api/ugovori/does-not-exist/export-aneks-pdf",
        json={"nova_zakupnina": 1200},
        headers=admin_headers,
    )
    assert resp.status_code == 404


def test_annex_pdf_requires_auth(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(client, pm_headers, nekretnina_id, tenant["id"])
    resp = client.post(
        f"/api/ugovori/{contract['id']}/export-aneks-pdf",
        json={},
    )
    assert resp.status_code in (401, 403)


def test_annex_pdf_returns_pdf_or_503(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(client, pm_headers, nekretnina_id, tenant["id"])

    resp = client.post(
        f"/api/ugovori/{contract['id']}/export-aneks-pdf",
        json={
            "nova_zakupnina": 1500.0,
            "novi_datum_zavrsetka": "2028-01-31",
            "dodatne_promjene": "Novi rok otkaza 45 dana.",
        },
        headers=pm_headers,
    )

    try:
        import weasyprint  # noqa: F401
        available = True
    except Exception:
        available = False

    if available:
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content.startswith(b"%PDF-")
        assert "aneks" in resp.headers.get("content-disposition", "").lower()
    else:
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_annex_template_substitutes_all_placeholders(client, pm_headers):
    from app.db.repositories.instance import ugovori as ugovori_repo
    from app.db.tenant import CURRENT_TENANT_ID

    nekretnina_id = _create_property(client, pm_headers)
    tenant = _create_zakupnik(client, pm_headers)
    contract = _create_contract(
        client, pm_headers, nekretnina_id, tenant["id"], oznaka="UG-AN-PH"
    )

    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    try:
        row = await ugovori_repo.get_by_id(contract["id"])
        ctx = await contract_pdf_service.build_annex_context(
            row,
            nova_zakupnina=1234.56,
            novi_datum_zavrsetka="2028-03-31",
            dodatne_promjene="Izmjene u režijama s hrvatskim znakovima: čćžšđ.",
        )
        html = contract_pdf_service._render_placeholder_template(
            "aneks-template.html", ctx
        )
    finally:
        CURRENT_TENANT_ID.set(None)

    assert "{{" not in html
    assert "UG-AN-PH" in html
    assert "1.234,56\u00a0€" in html  # new rent formatted hr-HR
    assert "čćžšđ" in html
    assert "2028" in html  # new end date rendered

import os
from types import SimpleNamespace

import pytest

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")
os.environ.setdefault("OPENAI_API_KEY", "test")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


@pytest.fixture(autouse=True)
def mock_openai(monkeypatch):
    class StubChat:
        def __init__(self):
            self.completions = SimpleNamespace(create=self._create)

        @staticmethod
        def _create(**kwargs):
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content="""ANEKS UGOVORA\n\n1. Predmet izmjene ...\n2. Nova zakupnina ...\n3. Ostale odredbe ostaju na snazi."""
                        )
                    )
                ]
            )

    class StubOpenAI:
        def __init__(self, *args, **kwargs):
            self.chat = StubChat()

    monkeypatch.setattr("app.api.v1.endpoints.ai.OpenAI", StubOpenAI)
    yield


def _create_property(client, pm_headers):
    response = client.post(
        "/api/nekretnine",
        json={
            "naziv": "Poslovni prostor A",
            "adresa": "Ilica 1, Zagreb",
            "katastarska_opcina": "Zagreb",
            "broj_kat_cestice": "123/45",
            "vrsta": "poslovna_zgrada",
            "povrsina": 250.0,
            "vlasnik": "Riforma d.o.o.",
            "udio_vlasnistva": "1/1",
        },
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_unit(client, pm_headers, nekretnina_id, oznaka="UG-A1"):
    response = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": oznaka,
            "naziv": f"Unit {oznaka}",
            "status": "dostupno",
        },
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_tenant(client, pm_headers):
    response = client.post(
        "/api/zakupnici",
        json={
            "naziv_firme": "Alpha d.o.o.",
            "ime_prezime": None,
            "oib": "12345678901",
            "sjediste": "Zagreb",
            "kontakt_ime": "Ana",
            "kontakt_email": "ana@example.com",
            "kontakt_telefon": "+385123456",
            "iban": "HR1210010051863000160",
        },
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_contract(client, pm_headers, nekretnina_id, zakupnik_id):
    unit_id = _create_unit(client, pm_headers, nekretnina_id)
    response = client.post(
        "/api/ugovori",
        json={
            "interna_oznaka": "UG-001",
            "nekretnina_id": nekretnina_id,
            "zakupnik_id": zakupnik_id,
            "property_unit_id": unit_id,
            "datum_potpisivanja": "2024-01-01",
            "datum_pocetka": "2024-02-01",
            "datum_zavrsetka": "2025-01-31",
            "trajanje_mjeseci": 12,
            "opcija_produljenja": True,
            "uvjeti_produljenja": "Dodatni dogovor 60 dana prije isteka",
            "rok_otkaza_dani": 60,
            "osnovna_zakupnina": 2500.0,
        },
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_generate_contract_annex_success(client, pm_headers):
    nekretnina_id = _create_property(client, pm_headers)
    zakupnik_id = _create_tenant(client, pm_headers)
    ugovor_id = _create_contract(client, pm_headers, nekretnina_id, zakupnik_id)

    response = client.post(
        "/api/ai/generate-contract-annex",
        json={
            "ugovor_id": ugovor_id,
            "nova_zakupnina": 2750.0,
            "novi_datum_zavrsetka": "2025-12-31",
            "dodatne_promjene": "Indeksacija prema HICP od iduće godine.",
        },
        headers=pm_headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert "Aneks ugovora" in payload["title"]
    assert "ANEKS UGOVORA" in payload["content"]
    assert payload["metadata"]["nova_zakupnina"] == 2750.0
    assert payload["metadata"]["novi_datum_zavrsetka"] == "2025-12-31"
    assert payload["metadata"].get("source") == "openai"


def test_generate_contract_annex_without_key(client, pm_headers, monkeypatch):
    # Patch settings in ai module
    from app.core.config import Settings

    # Create a new settings instance with empty key
    # We need to preserve other settings if possible, or just rely on defaults
    # Since we only care about OPENAI_API_KEY for this test...
    # But Settings loads from env, so we should set env var first then instantiate
    monkeypatch.setenv("OPENAI_API_KEY", "")
    new_settings = Settings()
    new_settings.OPENAI_API_KEY = ""
    monkeypatch.setattr("app.api.v1.endpoints.ai.settings", new_settings)

    nekretnina_id = _create_property(client, pm_headers)
    zakupnik_id = _create_tenant(client, pm_headers)
    ugovor_id = _create_contract(client, pm_headers, nekretnina_id, zakupnik_id)

    response = client.post(
        "/api/ai/generate-contract-annex",
        json={
            "ugovor_id": ugovor_id,
            "nova_zakupnina": None,
            "novi_datum_zavrsetka": None,
            "dodatne_promjene": None,
        },
        headers=pm_headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["success"] is True
    assert payload["metadata"].get("source") == "fallback"
    assert "ANEKS UGOVORA" in payload["content"]

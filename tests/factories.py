from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict

DEFAULT_PROPERTY_PAYLOAD = {
    "naziv": "Poslovna zgrada",
    "adresa": "Primorska 1",
    "katastarska_opcina": "Zagreb",
    "broj_kat_cestice": "123/1",
    "vrsta": "poslovna_zgrada",
    "povrsina": 1500.0,
    "godina_izgradnje": 2010,
    "vlasnik": "Riforma d.o.o.",
    "udio_vlasnistva": "1/1",
}


def create_property(client, headers, **overrides) -> Dict[str, Any]:
    payload = {**DEFAULT_PROPERTY_PAYLOAD, **overrides}
    response = client.post("/api/nekretnine", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_unit(client, headers, nekretnina_id: str, **overrides) -> Dict[str, Any]:
    payload = {
        "oznaka": overrides.pop("oznaka", "A1"),
        "naziv": overrides.pop("naziv", "Unit A1"),
        "status": overrides.pop("status", "dostupno"),
        "povrsina_m2": overrides.pop("povrsina_m2", 120.0),
        **overrides,
    }
    response = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json=payload,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_zakupnik(client, headers, **overrides) -> Dict[str, Any]:
    payload = {
        "naziv_firme": overrides.pop("naziv_firme", "Tenant d.o.o."),
        "ime_prezime": overrides.pop("ime_prezime", None),
        "oib": overrides.pop("oib", "12345678901"),
        "sjediste": overrides.pop("sjediste", "Zagreb"),
        "kontakt_ime": overrides.pop("kontakt_ime", "Ana"),
        "kontakt_email": overrides.pop("kontakt_email", "ana@example.com"),
        "kontakt_telefon": overrides.pop("kontakt_telefon", "+385123456"),
        "iban": overrides.pop("iban", "HR1210010051863000160"),
        **overrides,
    }
    response = client.post("/api/zakupnici", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_contract(
    client,
    headers,
    *,
    nekretnina_id: str,
    zakupnik_id: str,
    property_unit_id: str | None = None,
    **overrides,
) -> Dict[str, Any]:
    today = date.today()
    payload = {
        "interna_oznaka": overrides.pop("interna_oznaka", "UG-TEST"),
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": property_unit_id,
        "datum_potpisivanja": overrides.pop("datum_potpisivanja", today.isoformat()),
        "datum_pocetka": overrides.pop("datum_pocetka", today.isoformat()),
        "datum_zavrsetka": overrides.pop(
            "datum_zavrsetka", (today + timedelta(days=30)).isoformat()
        ),
        "trajanje_mjeseci": overrides.pop("trajanje_mjeseci", 1),
        "osnovna_zakupnina": overrides.pop("osnovna_zakupnina", 500.0),
        "zakupnina_po_m2": overrides.pop("zakupnina_po_m2", 10.0),
        "cam_troskovi": overrides.pop("cam_troskovi", 50.0),
        "polog_depozit": overrides.pop("polog_depozit", 100.0),
        "garancija": overrides.pop("garancija", 0.0),
        "indeksacija": overrides.pop("indeksacija", False),
        "rok_otkaza_dani": overrides.pop("rok_otkaza_dani", 30),
        **overrides,
    }
    response = client.post("/api/ugovori", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def create_maintenance_task(
    client, headers, assignee_id: str, **overrides
) -> Dict[str, Any]:
    payload = {
        "naziv": overrides.pop("naziv", "Održavanje"),
        "nekretnina_id": overrides.get("nekretnina_id"),
        **overrides,
    }
    payload.setdefault("dodijeljeno_user_id", assignee_id)
    response = client.post("/api/maintenance-tasks", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def register_user(
    client, admin_headers, *, email: str, password: str, role: str, full_name: str = ""
) -> Dict[str, Any]:
    payload = {
        "email": email,
        "password": password,
        "full_name": full_name or email.split("@")[0].title(),
        "role": role,
    }
    response = client.post("/api/auth/register", json=payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    return response.json()

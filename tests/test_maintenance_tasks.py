import os
import uuid
from datetime import date, timedelta

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")
os.environ.setdefault("OPENAI_API_KEY", "test")

from app.core.config import get_settings  # noqa: E402

settings = get_settings()


def _create_property(client, pm_headers, naziv="Poslovna zgrada"):  # helper
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
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_unit(client, pm_headers, nekretnina_id, oznaka="A1"):
    response = client.post(
        f"/api/nekretnine/{nekretnina_id}/units",
        json={
            "oznaka": oznaka,
            "naziv": f"Unit {oznaka}",
            "status": "dostupno",
            "povrsina_m2": 120.0,
        },
        headers=pm_headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_zakupnik(client, pm_headers, naziv="Tenant d.o.o."):
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
    response = client.post("/api/zakupnici", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_contract(
    client, pm_headers, nekretnina_id, zakupnik_id, property_unit_id=None
):
    today = date.today()
    payload = {
        "interna_oznaka": f"UG-{uuid.uuid4().hex[:6].upper()}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": property_unit_id,
        "datum_potpisivanja": today.isoformat(),
        "datum_pocetka": today.isoformat(),
        "datum_zavrsetka": (today + timedelta(days=30)).isoformat(),
        "trajanje_mjeseci": 1,
        "osnovna_zakupnina": 500.0,
        "zakupnina_po_m2": 10.0,
        "cam_troskovi": 50.0,
        "polog_depozit": 100.0,
        "garancija": 0.0,
        "indeksacija": False,
        "rok_otkaza_dani": 30,
    }
    response = client.post("/api/ugovori", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_task(client, pm_headers, pm_user_id, payload):
    assert pm_user_id is not None
    payload = dict(payload)
    payload.setdefault("dodijeljeno_user_id", pm_user_id)
    response = client.post("/api/maintenance-tasks", json=payload, headers=pm_headers)
    assert response.status_code == 201, response.text
    return response.json()


def _register_user(
    client, admin_headers, email: str, password: str, role: str, full_name: str = ""
):
    payload = {
        "email": email,
        "password": password,
        "full_name": full_name or email.split("@")[0].title(),
        "role": role,
    }
    response = client.post("/api/auth/register", json=payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_create_maintenance_task_records_initial_activity(
    client, pm_headers, pm_user_id
):
    property_id = _create_property(client, pm_headers)
    task = _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Servis lifta",
            "nekretnina_id": property_id,
            "prioritet": "visoko",
            "rok": "2024-12-01",
        },
    )

    assert task["naziv"] == "Servis lifta"
    assert task["dodijeljeno_user_id"] == pm_user_id
    activities = task.get("aktivnosti", [])
    assert len(activities) == 1
    assert activities[0]["tip"] == "kreiran"


def test_create_task_with_mismatched_unit_and_property(client, pm_headers, pm_user_id):
    property_a = _create_property(client, pm_headers, "Objekt A")
    property_b = _create_property(client, pm_headers, "Objekt B")
    unit_id = _create_unit(client, pm_headers, property_a)

    response = client.post(
        "/api/maintenance-tasks",
        json={
            "naziv": "Popravak instalacija",
            "nekretnina_id": property_b,
            "property_unit_id": unit_id,
            "dodijeljeno_user_id": pm_user_id,
        },
        headers=pm_headers,
    )
    assert response.status_code == 400
    assert "podprostor" in response.json()["detail"].lower()


def test_create_task_with_contract_from_other_property_is_rejected(
    client, pm_headers, pm_user_id
):
    property_a = _create_property(client, pm_headers, "Objekt A")
    property_b = _create_property(client, pm_headers, "Objekt B")
    unit_id = _create_unit(client, pm_headers, property_a)
    tenant = _create_zakupnik(client, pm_headers)
    contract_id = _create_contract(
        client,
        pm_headers,
        nekretnina_id=property_a,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
    )

    response = client.post(
        "/api/maintenance-tasks",
        json={
            "naziv": "Koordinacija izvođača",
            "nekretnina_id": property_b,
            "ugovor_id": contract_id,
            "dodijeljeno_user_id": pm_user_id,
        },
        headers=pm_headers,
    )
    assert response.status_code == 400
    assert "ugovor" in response.json()["detail"].lower()


def test_create_task_infers_relations_from_contract(client, pm_headers, pm_user_id):
    property_id = _create_property(client, pm_headers, "Glavni objekt")
    unit_id = _create_unit(client, pm_headers, property_id, oznaka="C1")
    tenant = _create_zakupnik(client, pm_headers, "Zakupnik d.o.o.")
    contract_id = _create_contract(
        client,
        pm_headers,
        nekretnina_id=property_id,
        zakupnik_id=tenant["id"],
        property_unit_id=unit_id,
    )

    task = _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Revizija opreme",
            "ugovor_id": contract_id,
            "opis": "Provjera opreme prema ugovoru",
        },
    )

    assert task["nekretnina_id"] == property_id
    assert task["property_unit_id"] == unit_id
    assert task["dodijeljeno_user_id"] == pm_user_id


def test_assignment_requires_manager_role(client, admin_headers, pm_headers):
    property_id = _create_property(client, pm_headers, "Upravna zgrada")
    unauthorized_user = _register_user(
        client,
        admin_headers,
        email="user@example.com",
        password="UserPass123!",
        role="tenant",
        full_name="Regular User",
    )

    response = client.post(
        "/api/maintenance-tasks",
        json={
            "naziv": "Servis kotla",
            "nekretnina_id": property_id,
            "dodijeljeno_user_id": unauthorized_user["id"],
        },
        headers=pm_headers,
    )
    assert response.status_code == 400
    assert "Voditelj naloga" in response.json()["detail"]


def test_status_update_adds_activity(client, pm_headers, pm_user_id):
    property_id = _create_property(client, pm_headers)
    task = _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Zamjena rasvjete",
            "nekretnina_id": property_id,
        },
    )

    response = client.patch(
        f"/api/maintenance-tasks/{task['id']}",
        json={"status": "u_tijeku"},
        headers=pm_headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "u_tijeku"
    activities = payload["aktivnosti"]
    assert len(activities) == 2
    assert activities[-1]["tip"] == "promjena_statusa"


def test_comment_endpoint_adds_activity(client, pm_headers, pm_user_id):
    property_id = _create_property(client, pm_headers)
    task = _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Provjera protupožarnog sustava",
            "nekretnina_id": property_id,
        },
    )

    response = client.post(
        f"/api/maintenance-tasks/{task['id']}/comments",
        json={"poruka": "Kontaktiran izvođač", "autor": "Voditelj"},
        headers=pm_headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    activities = payload["aktivnosti"]
    assert len(activities) == 2
    assert activities[-1]["tip"] == "komentar"
    assert activities[-1]["opis"] == "Kontaktiran izvođač"
    assert activities[-1]["autor"] == "Voditelj"


def test_list_filters_by_priority_property_and_due_date(client, pm_headers, pm_user_id):
    property_a = _create_property(client, pm_headers, "Objekt A")
    property_b = _create_property(client, pm_headers, "Objekt B")

    _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Hitna intervencija",
            "nekretnina_id": property_a,
            "prioritet": "kriticno",
            "rok": "2024-05-01",
            "oznake": ["elektrika"],
        },
    )
    _create_task(
        client,
        pm_headers,
        pm_user_id,
        {
            "naziv": "Plin godišnji servis",
            "nekretnina_id": property_b,
            "prioritet": "srednje",
            "rok": "2024-08-15",
            "oznake": ["plin"],
        },
    )

    response = client.get(
        "/api/maintenance-tasks",
        params={
            "prioritet": "kriticno",
            "nekretnina_id": property_a,
            "rok_do": "2024-06-01",
            "oznaka": "elektrika",
        },
        headers=pm_headers,
    )
    assert response.status_code == 200, response.text
    results = response.json()
    assert len(results) == 1
    assert results[0]["naziv"] == "Hitna intervencija"
    assert results[0]["prioritet"] == "kriticno"

    response = client.get(
        "/api/maintenance-tasks",
        params={"q": "servis"},
        headers=pm_headers,
    )
    assert response.status_code == 200
    results = response.json()
    assert {item["naziv"] for item in results} == {"Plin godišnji servis"}

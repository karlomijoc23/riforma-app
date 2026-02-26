import sys
from datetime import datetime, timedelta

import requests

BASE_URL = "http://localhost:8000/api"
EMAIL = "karlo.mijoc@pm.me"
PASSWORD = "admin"


def test_api_create_contract():
    # 1. Login
    print("Logging in...")
    resp = requests.post(
        f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )

    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        sys.exit(1)

    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # Get user info to get tenant_id
    print("Getting user info...")
    resp = requests.get(f"{BASE_URL}/users/me", headers=headers)
    if resp.status_code != 200:
        print(f"Me failed: {resp.text}")
        sys.exit(1)

    user_info = resp.json()
    tenant_id = user_info.get("tenant_id")
    print(f"User Tenant ID: {tenant_id}")

    if tenant_id:
        headers["X-Tenant-Id"] = tenant_id

    # 2. Get a property and tenant
    print("Fetching properties...")
    resp = requests.get(f"{BASE_URL}/nekretnine", headers=headers)
    if resp.status_code != 200:
        print(f"Get properties failed: {resp.text}")
        sys.exit(1)
    props = resp.json()
    if not props:
        print("No properties found.")
        sys.exit(1)
    prop_id = props[0]["id"]

    print("Fetching tenants...")
    resp = requests.get(f"{BASE_URL}/zakupnici", headers=headers)
    if resp.status_code != 200:
        print(f"Get tenants failed: {resp.text}")
        sys.exit(1)
    tenants = resp.json()
    if not tenants:
        print("No tenants found.")
        sys.exit(1)
    tenant_id_zakupnik = tenants[0]["id"]

    # 3. Create Contract
    print("Creating contract...")
    start_date = datetime.now().date()
    end_date = start_date + timedelta(days=365)

    payload = {
        "nekretnina_id": prop_id,
        "zakupnik_id": tenant_id_zakupnik,
        "interna_oznaka": "TEST-CONTRACT-EMPTY-STRINGS",
        "datum_pocetka": start_date.isoformat(),
        "datum_zavrsetka": end_date.isoformat(),
        "osnovna_zakupnina": 1000.0,
        "status": "aktivno",
        "trajanje_mjeseci": 12,
        "napomena": "Created by API test script",
        # Simulate frontend empty strings for optional fields
        "uvjeti_produljenja": "",
        "indeks": "",
        "formula_indeksacije": "",
        "obveze_odrzavanja": "",
        "namjena_prostora": "",
        "rezije_brojila": "",
    }

    resp = requests.post(f"{BASE_URL}/ugovori", headers=headers, json=payload)
    if resp.status_code != 201:
        print(f"Create contract failed: {resp.status_code} {resp.text}")
        return

    print("Contract created successfully.")
    contract = resp.json()
    contract_id = contract["id"]
    print(f"Contract ID: {contract_id}")

    # 4. Update Contract
    print("Updating contract...")
    update_payload = {
        "osnovna_zakupnina": 1200.0,
        "napomena": "Updated by API test script",
    }

    resp = requests.put(
        f"{BASE_URL}/ugovori/{contract_id}", headers=headers, json=update_payload
    )
    if resp.status_code != 200:
        print(f"Update contract failed: {resp.status_code} {resp.text}")
    else:
        print("Contract updated successfully.")
        print(resp.json())


if __name__ == "__main__":
    test_api_create_contract()

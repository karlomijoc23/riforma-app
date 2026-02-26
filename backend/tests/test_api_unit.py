import sys

import requests

BASE_URL = "http://localhost:8000/api"
EMAIL = "karlo.mijoc@pm.me"
PASSWORD = "admin"


def test_api_create_unit():
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

    # 2. Get a property
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
    print(f"Using Property: {prop_id}")

    # 3. Create Unit
    print("Creating unit...")
    payload = {
        "oznaka": "API-TEST-UNIT",
        "naziv": "API Test Unit",
        "kat": "1",
        "povrsina_m2": 50.0,
        "status": "dostupno",
        "osnovna_zakupnina": 500.0,
        "napomena": "Created by API test script",
    }

    resp = requests.post(
        f"{BASE_URL}/nekretnine/{prop_id}/units", headers=headers, json=payload
    )
    if resp.status_code != 201:
        print(f"Create unit failed: {resp.status_code} {resp.text}")
    else:
        print("Unit created successfully.")
        print(resp.json())

    # 4. Fetch Units
    print("Fetching units...")
    resp = requests.get(f"{BASE_URL}/units", headers=headers)
    if resp.status_code != 200:
        print(f"Get units failed: {resp.text}")
        sys.exit(1)

    units = resp.json()
    found = False
    for unit in units:
        if unit.get("oznaka") == "API-TEST-UNIT":
            found = True
            print("Found created unit in list.")
            break

    if not found:
        print("Unit NOT found in list!")


if __name__ == "__main__":
    test_api_create_unit()

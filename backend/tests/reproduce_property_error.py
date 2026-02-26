import sys

import requests

BASE_URL = "http://localhost:8000/api/v1"  # Need to be sure about v1
# main.py: app.include_router(api_router, prefix=settings.API_V1_STR) -> /api
# api_router in api.py -> /nekretnine
# So http://localhost:8000/api/nekretnine

BASE_URL = "http://localhost:8000/api"
EMAIL = "karlo.mijoc@pm.me"
PASSWORD = "admin"


def test_properties():
    # 1. Login
    print("Logging in...")
    resp = requests.post(
        f"{BASE_URL}/auth/login", json={"email": EMAIL, "password": PASSWORD}
    )
    if resp.status_code != 200:
        print(f"Login failed: {resp.text}")
        sys.exit(1)

    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get Properties (Dashboard usually calls this)
    print("Fetching properties...")
    resp = requests.get(f"{BASE_URL}/nekretnine/", headers=headers)
    print(f"GET /nekretnine status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Error: {resp.text}")
    else:
        print("Success fetching properties.")
        # Check first item structure
        data = resp.json()
        if data:
            print(f"First property keys: {data[0].keys()}")
            print(f"First property has_parking: {data[0].get('has_parking')}")

    # 3. Get Project Details (to check 'empty' issue context, though user said it's empty visually)
    # This script is mainly for the error.


if __name__ == "__main__":
    test_properties()

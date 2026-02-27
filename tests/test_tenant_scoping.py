from .factories import create_contract, create_property, create_unit, create_zakupnik


def test_cross_tenant_data_isolation(client, admin_headers, pm_headers):
    """Verify that data created in one tenant is not visible to another.

    deps.py intentionally falls back to the user's first active membership
    when X-Tenant-Id is invalid/stale, so we don't expect 403.  Instead we
    verify that the PM — scoped to the default tenant — cannot see properties
    created under a separate tenant by the admin.
    """
    # Create a second tenant and link admin to it
    response = client.post(
        "/api/tenants",
        json={"naziv": "Drugi profil"},
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    other_tenant = response.json()["id"]

    # Create a property under the OTHER tenant (as admin)
    other_headers = {**admin_headers, "X-Tenant-Id": other_tenant}
    prop_resp = client.post(
        "/api/nekretnine",
        json={
            "naziv": "Skrivena nekretnina",
            "adresa": "Tajna 1",
            "katastarska_opcina": "Split",
            "broj_kat_cestice": "999/1",
            "vrsta": "poslovna_zgrada",
            "povrsina": 100.0,
            "godina_izgradnje": 2020,
            "vlasnik": "Drugi d.o.o.",
            "udio_vlasnistva": "1/1",
        },
        headers=other_headers,
    )
    assert prop_resp.status_code == 201, prop_resp.text

    # PM lists properties in their own (default) tenant — should NOT see the other tenant's property
    pm_response = client.get("/api/nekretnine", headers=pm_headers)
    assert pm_response.status_code == 200
    pm_properties = pm_response.json()
    names = [p["naziv"] for p in pm_properties]
    assert "Skrivena nekretnina" not in names


def test_document_metadata_validation(client, pm_headers):
    property_doc = create_property(client, pm_headers, naziv="Toranj X")
    unit = create_unit(client, pm_headers, property_doc["id"], oznaka="X-1")
    tenant = create_zakupnik(
        client,
        pm_headers,
        naziv_firme="Tenant X",
        oib="98765432109",
        kontakt_email="kontakt@tenantx.hr",
    )
    contract = create_contract(
        client,
        pm_headers,
        nekretnina_id=property_doc["id"],
        zakupnik_id=tenant["id"],
        property_unit_id=unit["id"],
    )

    response = client.post(
        "/api/dokumenti",
        data={
            "naziv": "Mjesečni račun",
            "tip": "racun",
            "nekretnina_id": property_doc["id"],
            "zakupnik_id": tenant["id"],
            "ugovor_id": contract["id"],
            "metadata": "invalid-json",
        },
        headers=pm_headers,
    )
    assert response.status_code == 422
    detail = response.json().get("detail")
    if isinstance(detail, list):
        assert any("metadata" in str(d).lower() for d in detail)
    else:
        assert "metadata" in str(detail).lower()


def test_update_active_tenant_profile(client, admin_headers):
    tenants_response = client.get("/api/tenants", headers=admin_headers)
    assert tenants_response.status_code == 200
    tenant_list = tenants_response.json()
    assert tenant_list
    tenant_id = tenant_list[0]["id"]

    detail_response = client.get(f"/api/tenants/{tenant_id}", headers=admin_headers)
    assert detail_response.status_code == 200

    update_payload = {"naziv": "Novi naziv profila", "status": "active"}
    update_response = client.put(
        f"/api/tenants/{tenant_id}", json=update_payload, headers=admin_headers
    )
    assert update_response.status_code == 200, update_response.text
    updated = update_response.json()
    assert updated["naziv"] == "Novi naziv profila"


def test_tenant_update_requires_elevated_role(client, pm_headers, admin_headers):
    # Create viewer user and attempt update
    viewer_payload = {
        "email": "viewer@example.com",
        "password": "ViewerPass123!",
        "full_name": "Viewer User",
        "role": "tenant",
    }
    response = client.post(
        "/api/auth/register", json=viewer_payload, headers=admin_headers
    )
    assert response.status_code == 200, response.text
    login = client.post(
        "/api/auth/login",
        json={
            "email": viewer_payload["email"],
            "password": viewer_payload["password"],
        },
    )
    assert login.status_code == 200
    token = login.cookies.get("access_token")
    viewer_headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": pm_headers["X-Tenant-Id"],
    }

    viewer_user_id = login.json()["user"]["id"]

    # Add membership for viewer
    import asyncio

    from app.db.repositories.instance import tenant_memberships

    async def add_member():
        await tenant_memberships.create({
            "tenant_id": pm_headers["X-Tenant-Id"],
            "user_id": viewer_user_id,
            "role": "viewer",
            "status": "active",
        })

    try:
        asyncio.run(add_member())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(add_member())

    forbidden = client.put(
        f"/api/tenants/{pm_headers['X-Tenant-Id']}",
        json={"naziv": "Ne bi smio"},
        headers=viewer_headers,
    )
    assert forbidden.status_code == 403
    assert "ovlasti" in forbidden.json()["detail"].lower()

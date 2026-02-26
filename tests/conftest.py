import asyncio
import os
from typing import AsyncGenerator, Dict, Iterable

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")
os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("AUTO_RUN_MIGRATIONS", "false")
os.environ.setdefault("SEED_ADMIN_ON_STARTUP", "false")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")

from app.core.config import get_settings  # noqa: E402
from app.db.instance import db  # noqa: E402
from app.main import app  # noqa: E402

settings = get_settings()


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    import asyncio

    from app.db.base import Base

    # Ensure models are loaded
    from app.db.session import get_engine

    async def _init():
        engine = get_engine()
        print(f"DEBUG: DB URL is {settings.DB_SETTINGS.sqlalchemy_url()}")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def _teardown():
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    try:
        asyncio.run(_init())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(_init())

    yield

    try:
        asyncio.run(_teardown())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(_teardown())


RESET_COLLECTIONS = (
    "nekretnine",
    "property_units",
    "zakupnici",
    "ugovori",
    "dokumenti",
    "activity_logs",
    "maintenance_tasks",
    "tenants",
    "tenant_memberships",
    "users",
)


def _clear_collections(collection_names: Iterable[str] = RESET_COLLECTIONS) -> None:
    import asyncio

    async def clear():
        for name in collection_names:
            collection = getattr(db, name, None)
            if collection is None:
                continue
            await collection.delete_many({})

    try:
        asyncio.run(clear())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(clear())


def _bootstrap_users(client: TestClient) -> Dict[str, Dict[str, str]]:
    admin_payload = {
        "email": "admin@example.com",
        "password": "AdminPass123!",
        "full_name": "Admin User",
        "role": "admin",
        "scopes": ["users:create", "users:read"],
    }
    response = client.post("/api/auth/register", json=admin_payload)
    assert response.status_code == 200, response.text

    # Force update role in DB since register endpoint ignores it
    async def set_admin_role():
        await db.users.update_one(
            {"email": admin_payload["email"]},
            {"$set": {"role": "admin", "scopes": admin_payload["scopes"]}},
        )

    try:
        asyncio.run(set_admin_role())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(set_admin_role())

    login_resp = client.post(
        "/api/auth/login",
        json={"email": admin_payload["email"], "password": admin_payload["password"]},
    )
    assert login_resp.status_code == 200, login_resp.text
    admin_token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    pm_payload = {
        "email": "pm@example.com",
        "password": "PmPass123!",
        "full_name": "Property Manager",
        "role": "property_manager",
    }
    response = client.post("/api/auth/register", json=pm_payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    pm_user = response.json()

    # Force update role in DB
    async def set_pm_role():
        await db.users.update_one(
            {"email": pm_payload["email"]}, {"$set": {"role": "property_manager"}}
        )

    try:
        asyncio.run(set_pm_role())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(set_pm_role())

    pm_login = client.post(
        "/api/auth/login",
        json={"email": pm_payload["email"], "password": pm_payload["password"]},
    )
    assert pm_login.status_code == 200, pm_login.text
    pm_token = pm_login.json()["access_token"]

    # Create tenant membership for PM
    async def create_membership():
        await db.tenant_memberships.insert_one(
            {
                "tenant_id": settings.DEFAULT_TENANT_ID,
                "user_id": pm_user["id"],
                "role": "property_manager",
                "status": "active",
            }
        )

    try:
        asyncio.run(create_membership())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(create_membership())

    tenant_header = {"X-Tenant-Id": settings.DEFAULT_TENANT_ID}

    # Ensure default tenant exists in DB
    async def create_default_tenant():
        tenant = await db.tenants.find_one({"id": settings.DEFAULT_TENANT_ID})
        if not tenant:
            await db.tenants.insert_one(
                {
                    "id": settings.DEFAULT_TENANT_ID,
                    "naziv": "Default Tenant",
                    "status": "active",
                }
            )

    try:
        asyncio.run(create_default_tenant())
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(create_default_tenant())

    return {
        "admin_headers": {**admin_headers, **tenant_header},
        "pm_headers": {
            "Authorization": f"Bearer {pm_token}",
            "X-Tenant-Id": settings.DEFAULT_TENANT_ID,
        },
        "pm_user": pm_user,
    }


@pytest.fixture()
def client() -> TestClient:
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()


@pytest.fixture()
def app_context(client: TestClient) -> Dict[str, Dict[str, str]]:
    _clear_collections()
    context = _bootstrap_users(client)
    yield context
    _clear_collections()


@pytest.fixture()
def admin_headers(app_context: Dict[str, Dict[str, str]]) -> Dict[str, str]:
    return app_context["admin_headers"]


@pytest.fixture()
def pm_headers(app_context: Dict[str, Dict[str, str]]) -> Dict[str, str]:
    return app_context["pm_headers"]


@pytest.fixture()
def pm_user_id(app_context: Dict[str, Dict[str, str]]) -> str:
    return app_context["pm_user"]["id"]


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

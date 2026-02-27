import asyncio
import os
from typing import AsyncGenerator, Dict

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
from app.core.roles import resolve_role_scopes  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.repositories.instance import (  # noqa: E402
    activity_logs,
    dokumenti,
    maintenance_tasks,
    nekretnine,
    property_units,
    saas_tenants,
    tenant_memberships,
    users,
    ugovori,
    zakupnici,
)
from app.core.limiter import limiter  # noqa: E402
from app.main import app  # noqa: E402

settings = get_settings()

# Disable rate limiting for tests
limiter.enabled = False


def _run_async(coro):
    """Run an async coroutine from sync test code."""
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.get_event_loop()
        return loop.run_until_complete(coro)


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    from app.db.base import Base
    from app.db.session import get_engine

    async def _init():
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def _teardown():
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    _run_async(_init())

    yield

    _run_async(_teardown())


# Repos to clear between tests (children before parents for FK safety)
_REPOS_TO_CLEAR = [
    activity_logs,
    dokumenti,
    maintenance_tasks,
    ugovori,
    property_units,
    zakupnici,
    nekretnine,
    tenant_memberships,
    saas_tenants,
    users,
]


def _clear_tables() -> None:
    """Delete all rows from test tables using raw SQL to bypass tenant scoping."""

    async def clear():
        from sqlalchemy import text

        from app.db.session import get_async_session_factory

        sf = get_async_session_factory()
        async with sf() as session:
            # Disable FK checks for SQLite
            await session.execute(text("PRAGMA foreign_keys = OFF"))
            for repo in _REPOS_TO_CLEAR:
                table_name = repo.model.__tablename__
                await session.execute(text(f"DELETE FROM {table_name}"))
            await session.execute(text("PRAGMA foreign_keys = ON"))
            await session.commit()

    _run_async(clear())


def _bootstrap_users(client: TestClient) -> Dict[str, Dict[str, str]]:
    """Create admin + PM users and return auth headers for each."""

    # Seed admin directly via ORM (register endpoint requires users:create scope)
    async def seed_admin():
        admin = await users.create({
            "email": "admin@example.com",
            "password_hash": hash_password("AdminPass123!"),
            "full_name": "Admin User",
            "role": "admin",
            "scopes": resolve_role_scopes("admin", []),
        })
        # Create default tenant
        existing = await saas_tenants.find_one(id=settings.DEFAULT_TENANT_ID)
        if not existing:
            await saas_tenants.create({
                "id": settings.DEFAULT_TENANT_ID,
                "naziv": "Default Tenant",
                "status": "active",
            })
        # Link admin to default tenant
        await tenant_memberships.create({
            "user_id": admin.id,
            "tenant_id": settings.DEFAULT_TENANT_ID,
            "role": "owner",
            "status": "active",
        })
        return admin.id

    _run_async(seed_admin())

    # Login as admin (token is in httpOnly cookie, not response body)
    login_resp = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "AdminPass123!"},
    )
    assert login_resp.status_code == 200, login_resp.text
    admin_token = login_resp.cookies.get("access_token")
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-Tenant-Id": settings.DEFAULT_TENANT_ID,
    }

    # Register PM via API (admin has users:create scope)
    pm_payload = {
        "email": "pm@example.com",
        "password": "PmPass123!",
        "full_name": "Property Manager",
        "create_tenant": False,  # We create the membership manually in setup_pm
    }
    response = client.post("/api/auth/register", json=pm_payload, headers=admin_headers)
    assert response.status_code == 200, response.text
    pm_user = response.json()

    # Update PM role and create membership
    async def setup_pm():
        user = await users.find_one(email="pm@example.com")
        if user:
            await users.update_by_id(user.id, {
                "role": "property_manager",
                "scopes": resolve_role_scopes("property_manager", []),
            })
        await tenant_memberships.create({
            "user_id": pm_user["id"],
            "tenant_id": settings.DEFAULT_TENANT_ID,
            "role": "property_manager",
            "status": "active",
        })

    _run_async(setup_pm())

    # Login as PM
    pm_login = client.post(
        "/api/auth/login",
        json={"email": "pm@example.com", "password": "PmPass123!"},
    )
    assert pm_login.status_code == 200, pm_login.text
    pm_token = pm_login.cookies.get("access_token")

    # Clear cookies from the client so that subsequent requests only use
    # the explicit Authorization headers (Bearer tokens), not stale cookies.
    # deps.py checks cookies before Bearer headers, so leftover cookies
    # from the PM login would override admin Bearer tokens.
    client.cookies.clear()

    return {
        "admin_headers": admin_headers,
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
    _clear_tables()
    context = _bootstrap_users(client)
    yield context
    _clear_tables()


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

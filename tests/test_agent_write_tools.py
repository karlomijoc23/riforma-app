"""Guardrail tests for the AI Agent write tools.

The agentic loop goes through a human confirmation step, but that
confirmation message is composed by the LLM and is not a substitute for
real input validation. These tests confirm that `_execute_write` applies
the same gates as the REST API (OIB, e-mail, status transitions, etc.),
so a hallucinated or adversarial tool_input cannot corrupt data.
"""
import os
import uuid
from datetime import date

import pytest

os.environ.setdefault("AUTH_SECRET", "test-secret")
os.environ.setdefault("USE_IN_MEMORY_DB", "true")

from app.services import agent_service  # noqa: E402
from app.db.repositories.instance import (  # noqa: E402
    nekretnine as nekretnine_repo,
    ugovori as ugovori_repo,
    zakupnici as zakupnici_repo,
)
from app.db.tenant import CURRENT_TENANT_ID  # noqa: E402
from app.models.domain import ApprovalStatus, StatusUgovora  # noqa: E402
from app.core.config import get_settings  # noqa: E402

settings = get_settings()


@pytest.fixture
def tenant_ctx(app_context):
    """Set CURRENT_TENANT_ID for direct repo use inside tests."""
    CURRENT_TENANT_ID.set(settings.DEFAULT_TENANT_ID)
    yield
    CURRENT_TENANT_ID.set(None)


# ---------------------------------------------------------------------------
# Zakupnik validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_zakupnik_rejects_invalid_email(tenant_ctx):
    result = await agent_service._execute_write(
        "create_zakupnik",
        {
            "ime_prezime": "Marko Marić",
            "kontakt_email": "marko@invalid",  # no TLD
            "oib": None,
        },
        user_id="agent-test",
    )
    assert "error" in result
    assert "mail" in result["error"].lower()


@pytest.mark.asyncio
async def test_create_zakupnik_rejects_bad_oib(tenant_ctx):
    result = await agent_service._execute_write(
        "create_zakupnik",
        {
            "ime_prezime": "Netko",
            "kontakt_email": "netko@example.com",
            "oib": "12345678900",  # fails MOD 11,10 checksum
        },
        user_id="agent-test",
    )
    assert "error" in result
    assert "oib" in result["error"].lower()


@pytest.mark.asyncio
async def test_create_zakupnik_accepts_valid_input(tenant_ctx):
    result = await agent_service._execute_write(
        "create_zakupnik",
        {
            "ime_prezime": "Valid User",
            "kontakt_email": "valid@example.com",
        },
        user_id="agent-test",
    )
    assert result.get("success") is True
    assert "id" in result


# ---------------------------------------------------------------------------
# Maintenance task validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_maintenance_rejects_unknown_priority(tenant_ctx):
    result = await agent_service._execute_write(
        "create_maintenance_task",
        {"naziv": "Bad", "prioritet": "super-hitno"},
        user_id="agent-test",
    )
    assert "error" in result
    assert "prioritet" in result["error"].lower()


@pytest.mark.asyncio
async def test_create_maintenance_rejects_unknown_status(tenant_ctx):
    result = await agent_service._execute_write(
        "create_maintenance_task",
        {"naziv": "Bad", "status": "random_status"},
        user_id="agent-test",
    )
    assert "error" in result
    assert "status" in result["error"].lower()


# ---------------------------------------------------------------------------
# Ugovor status transitions (B3 guard)
# ---------------------------------------------------------------------------


async def _seed_contract(nekretnina_id, zakupnik_id, status="aktivno", approval="approved"):
    return await ugovori_repo.create({
        "interna_oznaka": f"AGENT-{uuid.uuid4().hex[:6]}",
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "datum_pocetka": date(2026, 1, 1),
        "datum_zavrsetka": date(2027, 1, 1),
        "trajanje_mjeseci": 12,
        "osnovna_zakupnina": 500.0,
        "status": status,
        "approval_status": approval,
    })


async def _seed_nekretnina_and_zakupnik():
    n = await nekretnine_repo.create({
        "naziv": "Agent Test Property",
        "adresa": "Test 1",
        "katastarska_opcina": "Zagreb",
        "broj_kat_cestice": "1/1",
        "vrsta": "poslovna_zgrada",
        "povrsina": 100.0,
        "godina_izgradnje": 2020,
        "vlasnik": "Riforma",
        "udio_vlasnistva": "1/1",
    })
    z = await zakupnici_repo.create({
        "naziv_firme": "Agent Zakupnik",
        "oib": None,
        "sjediste": "Zagreb",
        "kontakt_email": "a@example.com",
    })
    return n.id, z.id


@pytest.mark.asyncio
async def test_update_ugovor_status_blocks_arhivirano_to_aktivno(tenant_ctx):
    n_id, z_id = await _seed_nekretnina_and_zakupnik()
    contract = await _seed_contract(n_id, z_id, status="arhivirano")

    result = await agent_service._execute_write(
        "update_ugovor_status",
        {"ugovor_id": contract.id, "novi_status": "aktivno"},
        user_id="agent-test",
    )
    assert "error" in result
    assert "nije moguća promjena" in result["error"].lower()


@pytest.mark.asyncio
async def test_update_ugovor_status_blocks_unknown_status(tenant_ctx):
    n_id, z_id = await _seed_nekretnina_and_zakupnik()
    contract = await _seed_contract(n_id, z_id)
    result = await agent_service._execute_write(
        "update_ugovor_status",
        {"ugovor_id": contract.id, "novi_status": "supermagic"},
        user_id="agent-test",
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_update_ugovor_status_blocks_pending_approval_contracts(tenant_ctx):
    n_id, z_id = await _seed_nekretnina_and_zakupnik()
    contract = await _seed_contract(
        n_id, z_id, status="aktivno", approval=ApprovalStatus.PENDING_APPROVAL.value
    )
    result = await agent_service._execute_write(
        "update_ugovor_status",
        {"ugovor_id": contract.id, "novi_status": "raskinuto"},
        user_id="agent-test",
    )
    assert "error" in result
    assert "odobren" in result["error"].lower()


@pytest.mark.asyncio
async def test_update_ugovor_status_allows_valid_transition(tenant_ctx):
    n_id, z_id = await _seed_nekretnina_and_zakupnik()
    contract = await _seed_contract(n_id, z_id, status="aktivno")
    result = await agent_service._execute_write(
        "update_ugovor_status",
        {"ugovor_id": contract.id, "novi_status": "raskinuto"},
        user_id="agent-test",
    )
    assert result.get("success") is True
    refreshed = await ugovori_repo.get_by_id(contract.id)
    assert refreshed.status == "raskinuto"


# ---------------------------------------------------------------------------
# Scope gating: agent cannot be used to bypass REST permission model
# ---------------------------------------------------------------------------


def test_tools_for_user_filters_write_tools_by_scope():
    viewer = ["properties:read", "tenants:read", "leases:read"]
    pm = ["tenants:*", "maintenance:*", "leases:*"]
    owner = ["*"]

    viewer_tools = {t["name"] for t in agent_service.tools_for_user(viewer)}
    pm_tools = {t["name"] for t in agent_service.tools_for_user(pm)}
    owner_tools = {t["name"] for t in agent_service.tools_for_user(owner)}

    # Viewer gets NO write tools
    assert agent_service.WRITE_TOOL_NAMES.isdisjoint(viewer_tools)

    # PM gets every write tool in their domain
    assert {"create_zakupnik", "update_zakupnik", "create_maintenance_task",
            "update_maintenance_task", "update_ugovor_status"}.issubset(pm_tools)

    # Owner wildcard gets everything
    assert agent_service.WRITE_TOOL_NAMES.issubset(owner_tools)


@pytest.mark.asyncio
async def test_execute_write_tool_refuses_without_scope(tenant_ctx):
    """Even if a stored pending_action references a write tool, re-check
    scopes at execution time — a role downgrade must take effect immediately."""
    viewer_scopes = ["tenants:read"]
    result_str = await agent_service.execute_write_tool(
        "create_zakupnik",
        {"ime_prezime": "Should not be created", "kontakt_email": "x@example.com"},
        user_id="agent-test",
        user_scopes=viewer_scopes,
    )
    import json
    result = json.loads(result_str)
    assert "error" in result
    assert "ovlasti" in result["error"].lower()

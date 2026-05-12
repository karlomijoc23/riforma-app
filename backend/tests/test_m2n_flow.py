"""Unit tests for the M:N junction logic (contracts ↔ units / parkings,
maintenance ↔ units, cron release / orphan cleanup).

Pattern follows `test_logic.py` — mocks the repositories so we exercise
the helper logic in isolation. Critical because the M:N rewrite touched
many code paths and 0% of it was covered by existing tests.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_unit(unit_id: str, nekretnina_id: str, oznaka: str = "A",
               povrsina_m2: float = 100.0):
    """A duck-typed ORM unit for repository mocks."""
    return MagicMock(
        id=unit_id,
        nekretnina_id=nekretnina_id,
        oznaka=oznaka,
        povrsina_m2=povrsina_m2,
    )


def _mock_parking(parking_id: str, nekretnina_id: str, internal_id: str = "PM-1"):
    return MagicMock(
        id=parking_id,
        nekretnina_id=nekretnina_id,
        internal_id=internal_id,
    )


# ---------------------------------------------------------------------------
# _resolve_contract_unit_ids — legacy + M2M merge, validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resolve_unit_ids_merges_and_dedupes():
    """Legacy `property_unit_id` first, then payload `property_unit_ids`,
    deduplicated. Order preserved (first → primary)."""
    from app.api.v1.endpoints import contracts

    nekretnina_id = "prop1"
    item_data = {
        "nekretnina_id": nekretnina_id,
        "property_unit_id": "u-primary",
        "property_unit_ids": ["u-primary", "u-second", "u-third"],
    }

    async def fake_get_by_id(uid):
        return _mock_unit(uid, nekretnina_id, oznaka=uid)

    with patch.object(contracts, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock(side_effect=fake_get_by_id)
        result = await contracts._resolve_contract_unit_ids(item_data)

    assert result == ["u-primary", "u-second", "u-third"]


@pytest.mark.asyncio
async def test_resolve_unit_ids_rejects_wrong_nekretnina():
    """A unit from a different property must 400, not silently slip in."""
    from app.api.v1.endpoints import contracts

    item_data = {
        "nekretnina_id": "prop1",
        "property_unit_id": None,
        "property_unit_ids": ["unit-from-prop2"],
    }

    async def fake_get_by_id(uid):
        return _mock_unit(uid, "prop2", oznaka="X1")

    with patch.object(contracts, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock(side_effect=fake_get_by_id)
        with pytest.raises(HTTPException) as exc:
            await contracts._resolve_contract_unit_ids(item_data)

    assert exc.value.status_code == 400
    assert "ne pripada" in exc.value.detail


@pytest.mark.asyncio
async def test_resolve_parking_ids_validates_nekretnina():
    """Same rule for parking — must belong to the contract's property."""
    from app.api.v1.endpoints import contracts

    item_data = {
        "nekretnina_id": "prop1",
        "parking_ids": ["pking-from-prop2"],
    }

    async def fake_get_by_id(pid):
        return _mock_parking(pid, "prop2", internal_id="PM-1")

    with patch.object(contracts, "parking_spaces") as mock_repo:
        mock_repo.get_by_id = AsyncMock(side_effect=fake_get_by_id)
        with pytest.raises(HTTPException) as exc:
            await contracts._resolve_contract_parking_ids(item_data)

    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# _free_removed_units — does the orphan check use legacy FK + junction?
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_free_removed_units_releases_when_no_other_contract():
    """No other active contract holds the unit → status flips to DOSTUPNO."""
    from app.api.v1.endpoints import contracts

    update_calls = []

    async def fake_update_by_id(uid, payload):
        update_calls.append((uid, payload))
        return None

    with patch.object(contracts, "ugovori") as mock_ugovori, patch.object(
        contracts, "property_units"
    ) as mock_units:
        mock_ugovori.find_one = AsyncMock(return_value=None)  # nobody else
        mock_units.update_by_id = AsyncMock(side_effect=fake_update_by_id)
        await contracts._free_removed_units(
            ["unit-A"], excluded_contract_id="contract-X"
        )

    assert len(update_calls) == 1
    assert update_calls[0][0] == "unit-A"
    assert update_calls[0][1]["status"] == "dostupno"


@pytest.mark.asyncio
async def test_free_removed_units_keeps_status_when_other_holds():
    """Another active contract claims the unit → status stays IZNAJMLJENO."""
    from app.api.v1.endpoints import contracts

    update_calls = []

    async def fake_update_by_id(uid, payload):
        update_calls.append((uid, payload))

    other_contract = MagicMock(id="contract-Y")

    with patch.object(contracts, "ugovori") as mock_ugovori, patch.object(
        contracts, "property_units"
    ) as mock_units:
        mock_ugovori.find_one = AsyncMock(return_value=other_contract)
        mock_units.update_by_id = AsyncMock(side_effect=fake_update_by_id)
        await contracts._free_removed_units(
            ["unit-A"], excluded_contract_id="contract-X"
        )

    assert update_calls == []  # no release


# ---------------------------------------------------------------------------
# calculate_rent_if_needed — multi-unit area sum
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_calculate_rent_sums_all_units():
    """For a 2-unit contract with rate=10 €/m² and areas 50 + 70,
    expected osnovna_zakupnina = 1200."""
    from app.api.v1.endpoints import contracts

    units_by_id = {
        "u1": _mock_unit("u1", "prop", povrsina_m2=50),
        "u2": _mock_unit("u2", "prop", povrsina_m2=70),
    }

    async def fake_get_by_id(uid):
        return units_by_id[uid]

    item_data = {
        "zakupnina_po_m2": 10,
        "osnovna_zakupnina": 0,
        "property_unit_id": "u1",
    }

    with patch.object(contracts, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock(side_effect=fake_get_by_id)
        result = await contracts.calculate_rent_if_needed(
            item_data, unit_ids=["u1", "u2"]
        )

    assert result["osnovna_zakupnina"] == 1200.0


@pytest.mark.asyncio
async def test_calculate_rent_skips_when_osnovna_already_set():
    """If `osnovna_zakupnina` is already > 0, leave it alone."""
    from app.api.v1.endpoints import contracts

    item_data = {
        "zakupnina_po_m2": 10,
        "osnovna_zakupnina": 999,
        "property_unit_id": "u1",
    }

    result = await contracts.calculate_rent_if_needed(
        item_data, unit_ids=["u1"]
    )
    assert result["osnovna_zakupnina"] == 999  # unchanged


# ---------------------------------------------------------------------------
# Maintenance — _resolve_task_unit_ids mirrors contract behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_maintenance_resolve_unit_ids_validates_property():
    """Multi-unit task: every unit must belong to the task's nekretnina."""
    from app.api.v1.endpoints import maintenance

    item_data = {
        "nekretnina_id": "prop1",
        "property_unit_id": "u-prop1",
        "property_unit_ids": ["u-prop2"],
    }

    async def fake_get_by_id(uid):
        if uid == "u-prop1":
            return _mock_unit("u-prop1", "prop1")
        return _mock_unit("u-prop2", "prop2")

    with patch.object(maintenance, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock(side_effect=fake_get_by_id)
        with pytest.raises(HTTPException) as exc:
            await maintenance._resolve_task_unit_ids(item_data)

    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Cron release_contract_units — covers BOTH legacy primary + junction
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cron_release_includes_legacy_and_junction():
    """Expiring contract A holds U1 via legacy FK + U2 via junction.
    Both must be released when no other active contract claims them."""
    from app.services import contract_status_service as svc

    # Junction query returns U2; legacy primary param is U1.
    fake_junction_result = MagicMock()
    fake_junction_result.all = MagicMock(return_value=[("U2",)])

    fake_session = MagicMock()
    fake_session.execute = AsyncMock(return_value=fake_junction_result)
    fake_session.__aenter__ = AsyncMock(return_value=fake_session)
    fake_session.__aexit__ = AsyncMock(return_value=None)

    update_calls = []

    async def fake_update_by_id(uid, payload):
        update_calls.append((uid, payload))

    with patch.object(svc, "get_async_session_factory") as mock_factory, patch.object(
        svc, "ugovori"
    ) as mock_ugovori, patch.object(svc, "property_units") as mock_units:
        mock_factory.return_value = lambda: fake_session
        mock_ugovori.find_one = AsyncMock(return_value=None)
        mock_units.update_by_id = AsyncMock(side_effect=fake_update_by_id)

        await svc._release_contract_units(
            "contract-A", legacy_primary_unit_id="U1"
        )

    released = {uid for uid, _ in update_calls}
    assert released == {"U1", "U2"}

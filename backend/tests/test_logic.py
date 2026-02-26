import os
import sys
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

# Add path to sys to find app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.v1.endpoints import contracts  # noqa: E402
from app.models.domain import StatusUgovora  # noqa: E402


def _make_orm_obj(**kwargs):
    """Create a simple namespace that behaves like an ORM instance."""
    return MagicMock(**kwargs)


@pytest.mark.asyncio
async def test_check_contract_overlap_raises():
    """Overlap found → should raise HTTPException 400."""
    unit_id = "unit1"
    start = date(2024, 1, 1)
    end = date(2024, 12, 31)

    # Mock ORM object returned by ugovori.find_one
    mock_contract = _make_orm_obj(
        id="existing_contract",
        interna_oznaka="EXISTING-001",
        datum_pocetka=date(2024, 6, 1),
        datum_zavrsetka=date(2025, 6, 1),
    )

    with patch.object(contracts, "ugovori") as mock_repo:
        mock_repo.find_one = AsyncMock(return_value=mock_contract)

        with pytest.raises(HTTPException) as excinfo:
            await contracts.check_contract_overlap(unit_id, start, end)

        assert excinfo.value.status_code == 400
        assert "Postoji preklapanje" in excinfo.value.detail


@pytest.mark.asyncio
async def test_check_contract_overlap_passes():
    """No overlap → should not raise."""
    unit_id = "unit1"
    start = date(2024, 1, 1)
    end = date(2024, 12, 31)

    with patch.object(contracts, "ugovori") as mock_repo:
        mock_repo.find_one = AsyncMock(return_value=None)

        # Should not raise
        await contracts.check_contract_overlap(unit_id, start, end)


@pytest.mark.asyncio
async def test_calculate_rent_if_needed():
    """Rent per m2 provided, no base rent → should calculate from unit area."""
    item_data = {
        "property_unit_id": "unit_100m2",
        "zakupnina_po_m2": 10.0,
        "osnovna_zakupnina": 0,
    }

    mock_unit = _make_orm_obj(id="unit_100m2", povrsina_m2=100.0, oznaka="U1")

    with patch.object(contracts, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock(return_value=mock_unit)

        result = await contracts.calculate_rent_if_needed(item_data)

        assert result["osnovna_zakupnina"] == 1000.0  # 10 * 100


@pytest.mark.asyncio
async def test_calculate_rent_not_needed():
    """Base rent already set → should NOT call get_by_id."""
    item_data = {
        "property_unit_id": "unit_100m2",
        "zakupnina_po_m2": 10.0,
        "osnovna_zakupnina": 500.0,  # Already set
    }

    with patch.object(contracts, "property_units") as mock_repo:
        mock_repo.get_by_id = AsyncMock()

        result = await contracts.calculate_rent_if_needed(item_data)

        assert result["osnovna_zakupnina"] == 500.0
        mock_repo.get_by_id.assert_not_called()


@pytest.mark.asyncio
async def test_check_contract_overlap_skips_empty_unit():
    """Empty unit_id → should return without checking."""
    with patch.object(contracts, "ugovori") as mock_repo:
        mock_repo.find_one = AsyncMock()

        # Should return without raising
        await contracts.check_contract_overlap("", date(2024, 1, 1), date(2024, 12, 31))

        mock_repo.find_one.assert_not_called()


@pytest.mark.asyncio
async def test_check_contract_overlap_excludes_self():
    """When exclude_contract_id is provided, should pass it to query."""
    with patch.object(contracts, "ugovori") as mock_repo:
        mock_repo.find_one = AsyncMock(return_value=None)

        await contracts.check_contract_overlap(
            "unit1", date(2024, 1, 1), date(2024, 12, 31),
            exclude_contract_id="self_id"
        )

        # Verify find_one was called (with extra_conditions that include the exclusion)
        mock_repo.find_one.assert_called_once()

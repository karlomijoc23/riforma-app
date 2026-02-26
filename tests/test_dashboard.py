import pytest
from httpx import AsyncClient


@pytest.mark.asyncio(loop_scope="session")
async def test_dashboard_stats(async_client: AsyncClient, pm_headers: dict):
    response = await async_client.get("/api/dashboard/", headers=pm_headers)
    assert response.status_code == 200
    data = response.json()
    assert "odrzavanje_novo" in data
    assert "odrzavanje_ceka_dobavljaca" in data
    assert "odrzavanje_u_tijeku" in data
    assert isinstance(data["odrzavanje_novo"], int)

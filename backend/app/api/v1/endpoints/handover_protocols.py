from datetime import date
from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import handover_protocols, ugovori
from app.models.domain import ProtocolType
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class ProtocolCreate(BaseModel):
    contract_id: str
    type: ProtocolType
    date: date
    meter_readings: Dict[str, Any] = {}
    keys_handed_over: Optional[str] = None
    notes: Optional[str] = None


class ProtocolUpdate(BaseModel):
    date: Optional[date] = None
    meter_readings: Optional[Dict[str, Any]] = None
    keys_handed_over: Optional[str] = None
    notes: Optional[str] = None


@router.get(
    "/contract/{contract_id}",
    dependencies=[Depends(deps.require_scopes("leases:read"))],
)
async def get_contract_protocols(
    contract_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items = await handover_protocols.find_all(
        filters={"contract_id": contract_id},
        order_by="date",
        order_dir="desc",
    )
    return [handover_protocols.to_dict(item) for item in items]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("leases:update")),
        Depends(deps.require_tenant()),
    ],
)
async def create_protocol(
    item_in: ProtocolCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Verify contract exists
    contract = await ugovori.get_by_id(item_in.contract_id)
    if not contract:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    item_data = item_in.model_dump()
    item_data["created_by"] = current_user["id"]

    instance = await handover_protocols.create(item_data)
    return handover_protocols.to_dict(instance)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("leases:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_protocol(
    id: str,
    item_in: ProtocolUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await handover_protocols.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zapisnik nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return handover_protocols.to_dict(existing)

    updated = await handover_protocols.update_by_id(id, update_data)
    return handover_protocols.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("leases:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_protocol(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await handover_protocols.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zapisnik nije pronađen")

    await handover_protocols.delete_by_id(id)
    return {"message": "Zapisnik uspješno obrisan"}

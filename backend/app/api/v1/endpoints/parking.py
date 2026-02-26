from typing import Any, Dict, List, Optional

from app.api import deps
from app.db.repositories.instance import parking_spaces
from app.models.domain import ParkingSpace
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter()


class ParkingSpaceCreate(BaseModel):
    nekretnina_id: str
    tenant_id: Optional[str] = None
    floor: str
    internal_id: str
    vehicle_plates: List[str] = []
    notes: Optional[str] = None


class ParkingSpaceUpdate(BaseModel):
    nekretnina_id: Optional[str] = None
    tenant_id: Optional[str] = None
    floor: Optional[str] = None
    internal_id: Optional[str] = None
    vehicle_plates: Optional[List[str]] = None
    notes: Optional[str] = None


@router.get(
    "",
    response_model=List[ParkingSpace],
    dependencies=[Depends(deps.require_scopes("properties:read"))],
)
async def get_parking_spaces(
    nekretnina_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve parking spaces, optionally filtered by property.
    """
    filters = {}
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id

    spaces = await parking_spaces.find_all(filters=filters)
    return [parking_spaces.to_dict(space) for space in spaces]


@router.post(
    "",
    response_model=ParkingSpace,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def create_parking_space(
    space_in: ParkingSpaceCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new parking space.
    """
    space_data = space_in.model_dump()
    space_data["created_by"] = current_user["id"]

    instance = await parking_spaces.create(space_data)
    return parking_spaces.to_dict(instance)


@router.put(
    "/{space_id}",
    response_model=ParkingSpace,
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_parking_space(
    space_id: str,
    space_update: ParkingSpaceUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Any:
    """
    Update a parking space.
    """
    existing = await parking_spaces.get_by_id(space_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Parking space not found")

    # Limit to max 2 plates if provided
    if space_update.vehicle_plates is not None and len(space_update.vehicle_plates) > 2:
        raise HTTPException(
            status_code=400, detail="Maximum 2 vehicle plates allowed per space"
        )

    update_data = space_update.model_dump(exclude_unset=True)

    updated = await parking_spaces.update_by_id(space_id, update_data)
    return parking_spaces.to_dict(updated)


@router.delete(
    "/{space_id}",
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_parking_space(
    space_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a parking space.
    """
    deleted = await parking_spaces.delete_by_id(space_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Parking space not found")
    return {"message": "Parking prostor je obrisan"}

from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.api import deps
from app.db.repositories.instance import parking_spaces, ugovori
from app.models.domain import ParkingSpace, ParkingStatus, StatusUgovora
from app.models.tables import UgovoriRow, ugovor_parkings
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

# Statuses considered "active" for contract checks (mirrors units.py).
_ACTIVE_STATUSES = [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]


async def _find_active_contract_holding_parking(parking_id: str):
    """Find any active contract that links this parking via the junction."""
    junction_subq = (
        select(ugovor_parkings.c.ugovor_id)
        .where(ugovor_parkings.c.parking_id == parking_id)
        .scalar_subquery()
    )
    return await ugovori.find_one(
        extra_conditions=[
            UgovoriRow.id.in_(junction_subq),
            UgovoriRow.status.in_(_ACTIVE_STATUSES),
        ],
    )


class ParkingSpaceCreate(BaseModel):
    nekretnina_id: str
    floor: str
    internal_id: str
    naziv: Optional[str] = None
    status: ParkingStatus = ParkingStatus.DOSTUPNO
    osnovna_zakupnina: Optional[float] = None
    vehicle_plates: List[str] = []
    notes: Optional[str] = None


class ParkingSpaceUpdate(BaseModel):
    nekretnina_id: Optional[str] = None
    floor: Optional[str] = None
    internal_id: Optional[str] = None
    naziv: Optional[str] = None
    status: Optional[ParkingStatus] = None
    osnovna_zakupnina: Optional[float] = None
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
    """Retrieve parking spaces, optionally filtered by property."""
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
    """Create a new parking space."""
    if space_in.vehicle_plates and len(space_in.vehicle_plates) > 2:
        raise HTTPException(
            status_code=400,
            detail="Maximum 2 vehicle plates allowed per space",
        )

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
    """Update a parking space.

    Status changes are guarded the same way property units are: a parking
    with an active contract cannot be flipped back to "dostupno", and a
    parking without a contract cannot be set to "iznajmljeno". The
    contract flow drives those transitions automatically.
    """
    existing = await parking_spaces.get_by_id(space_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Parking space not found")

    if space_update.vehicle_plates is not None and len(space_update.vehicle_plates) > 2:
        raise HTTPException(
            status_code=400, detail="Maximum 2 vehicle plates allowed per space"
        )

    update_data = space_update.model_dump(exclude_unset=True)

    # Block moving a parking to another property while it's still on a
    # contract — the contract would end up referencing a parking outside
    # its `nekretnina_id`, which corrupts overlap checks and reports.
    if (
        "nekretnina_id" in update_data
        and update_data["nekretnina_id"] != existing.nekretnina_id
    ):
        active_contract = await _find_active_contract_holding_parking(space_id)
        if active_contract:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Parkirno mjesto ima aktivan ugovor "
                    f"({active_contract.interna_oznaka or '—'}). "
                    "Raskinite ugovor prije premještanja na drugu nekretninu."
                ),
            )

    if "status" in update_data:
        new_status_raw = update_data["status"]
        new_status = (
            new_status_raw.value
            if isinstance(new_status_raw, ParkingStatus)
            else new_status_raw
        )
        # Idempotent re-save (no actual status change) is always allowed —
        # the form re-submits all fields and we don't want to reject a
        # napomena edit because of historical state drift.
        if new_status != existing.status:
            active_contract = await _find_active_contract_holding_parking(space_id)

            if active_contract and new_status == ParkingStatus.DOSTUPNO.value:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Parkirno mjesto ima aktivan ugovor "
                        f"({active_contract.interna_oznaka or '—'}). "
                        "Status se automatski kontrolira putem ugovora."
                    ),
                )
            if (
                not active_contract
                and new_status == ParkingStatus.IZNAJMLJENO.value
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Parkirno mjesto nema aktivan ugovor — status "
                        "'iznajmljeno' se automatski postavlja prilikom "
                        "kreiranja ugovora."
                    ),
                )

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
    """Delete a parking space, blocking deletion when an active contract
    still references it (returns 409 so the UI can distinguish RI errors
    from validation problems)."""
    existing = await parking_spaces.get_by_id(space_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Parking space not found")

    active_contract = await _find_active_contract_holding_parking(space_id)
    if active_contract:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Parkirno mjesto ima aktivan ugovor "
                f"({active_contract.interna_oznaka or '—'}). "
                "Raskinite ili arhivirajte ugovor prije brisanja parkirnog mjesta."
            ),
        )

    deleted = await parking_spaces.delete_by_id(space_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Parking space not found")
    return {"message": "Parking prostor je obrisan"}

from typing import Any, Dict, Optional

from sqlalchemy import or_, select

from app.api import deps
from app.db.repositories.instance import property_units, ugovori
from app.models.domain import PropertyUnitStatus, StatusUgovora
from app.models.tables import UgovoriRow, ugovor_units
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

router = APIRouter()

# Statuses considered "active" for contract checks
_ACTIVE_STATUSES = [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]


async def _find_active_contract_holding_unit(unit_id: str):
    """Look at BOTH the legacy primary FK and the junction table — a
    multi-unit contract may hold this unit only through the M2M."""
    junction_subq = (
        select(ugovor_units.c.ugovor_id)
        .where(ugovor_units.c.property_unit_id == unit_id)
        .scalar_subquery()
    )
    return await ugovori.find_one(
        extra_conditions=[
            or_(
                UgovoriRow.property_unit_id == unit_id,
                UgovoriRow.id.in_(junction_subq),
            ),
            UgovoriRow.status.in_(_ACTIVE_STATUSES),
        ],
    )


class PropertyUnitUpdate(BaseModel):
    oznaka: Optional[str] = None
    naziv: Optional[str] = None
    kat: Optional[str] = None
    povrsina_m2: Optional[float] = None
    status: Optional[PropertyUnitStatus] = None
    osnovna_zakupnina: Optional[float] = None
    napomena: Optional[str] = None


@router.get("", dependencies=[Depends(deps.require_scopes("properties:read"))])
async def get_units(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    nekretnina_id: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    filters = {}
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id

    items, total = await property_units.find_many(
        filters=filters,
        order_by="oznaka",
        order_dir="asc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [property_units.to_dict(item) for item in items]


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("properties:read"))])
async def get_unit(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await property_units.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Jedinica nije pronađena")
    return property_units.to_dict(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_unit(
    id: str,
    item_in: PropertyUnitUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await property_units.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Jedinica nije pronađena")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return property_units.to_dict(existing)

    # Validate status changes against active contracts. Skip the check when
    # the status isn't actually changing — an idempotent re-save (e.g. user
    # edits the napomena field on a rented unit) shouldn't be rejected just
    # because the unit ↔ contract state is historically inconsistent.
    if "status" in update_data:
        new_status_raw = update_data["status"]
        new_status = (
            new_status_raw.value
            if isinstance(new_status_raw, PropertyUnitStatus)
            else new_status_raw
        )
        if new_status != existing.status:
            active_contract = await _find_active_contract_holding_unit(id)

            if active_contract and new_status == PropertyUnitStatus.DOSTUPNO.value:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Podprostor ima aktivan ugovor "
                        f"({active_contract.interna_oznaka or '—'}). "
                        "Status se automatski kontrolira putem ugovora."
                    ),
                )
            if (
                not active_contract
                and new_status == PropertyUnitStatus.IZNAJMLJENO.value
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Podprostor nema aktivan ugovor — status 'iznajmljeno' "
                        "se automatski postavlja prilikom kreiranja ugovora."
                    ),
                )

    updated = await property_units.update_by_id(id, update_data)
    return property_units.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("properties:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_unit(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await property_units.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Jedinica nije pronađena")

    # Prevent deletion if unit has active contracts (legacy primary FK or
    # M2M junction). Returning 409 lets the frontend distinguish "delete
    # blocked by referential integrity" from validation errors.
    active_contract = await _find_active_contract_holding_unit(id)
    if active_contract:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Podprostor ima aktivan ugovor "
                f"({active_contract.interna_oznaka or '—'}). "
                "Raskinite ili arhivirajte ugovor prije brisanja podprostora."
            ),
        )

    await property_units.delete_by_id(id)
    return {"message": "Jedinica uspješno obrisana"}

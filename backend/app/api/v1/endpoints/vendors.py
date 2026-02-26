import logging
from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import dobavljaci
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class VendorCreate(BaseModel):
    naziv: str = Field(max_length=200)
    tip: Optional[str] = Field(default=None, max_length=100)
    kontakt_ime: Optional[str] = Field(default=None, max_length=200)
    kontakt_email: Optional[str] = Field(default=None, max_length=200)
    kontakt_telefon: Optional[str] = Field(default=None, max_length=100)
    oib: Optional[str] = Field(default=None, max_length=20)
    adresa: Optional[str] = Field(default=None, max_length=500)
    napomena: Optional[str] = Field(default=None, max_length=2000)
    ocjena: Optional[int] = Field(default=None, ge=1, le=5)


class VendorUpdate(BaseModel):
    naziv: Optional[str] = Field(default=None, max_length=200)
    tip: Optional[str] = Field(default=None, max_length=100)
    kontakt_ime: Optional[str] = Field(default=None, max_length=200)
    kontakt_email: Optional[str] = Field(default=None, max_length=200)
    kontakt_telefon: Optional[str] = Field(default=None, max_length=100)
    oib: Optional[str] = Field(default=None, max_length=20)
    adresa: Optional[str] = Field(default=None, max_length=500)
    napomena: Optional[str] = Field(default=None, max_length=2000)
    ocjena: Optional[int] = Field(default=None, ge=1, le=5)


class VendorOut(VendorCreate):
    id: str


@router.get(
    "",
    dependencies=[Depends(deps.require_scopes("maintenance:read"))],
    response_model=list[VendorOut],
)
async def get_vendors(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items, total = await dobavljaci.find_many(
        filters={},
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [dobavljaci.to_dict(item) for item in items]


@router.get(
    "/{id}",
    dependencies=[Depends(deps.require_scopes("maintenance:read"))],
    response_model=VendorOut,
)
async def get_vendor(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await dobavljaci.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")
    return dobavljaci.to_dict(item)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("maintenance:create")),
        Depends(deps.require_tenant()),
    ],
    response_model=VendorOut,
)
async def create_vendor(
    item_in: VendorCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item_data = item_in.model_dump()
    item_data["created_by"] = current_user["id"]

    instance = await dobavljaci.create(item_data)
    return dobavljaci.to_dict(instance)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("maintenance:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=VendorOut,
)
async def update_vendor(
    id: str,
    item_in: VendorUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await dobavljaci.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return dobavljaci.to_dict(existing)

    updated = await dobavljaci.update_by_id(id, update_data)
    return dobavljaci.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("maintenance:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_vendor(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await dobavljaci.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")

    await dobavljaci.delete_by_id(id)
    return {"message": "Dobavljač uspješno obrisan"}

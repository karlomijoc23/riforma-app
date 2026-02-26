from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import nekretnine, property_units
from app.models.domain import PropertyUnitStatus, VrstaNekrtnine
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

router = APIRouter()


# Models for requests
class PropertyCreate(BaseModel):
    naziv: str = Field(max_length=200)
    adresa: str = Field(max_length=500)
    grad: Optional[str] = Field(default=None, max_length=200)
    katastarska_opcina: Optional[str] = Field(default=None, max_length=200)
    broj_kat_cestice: Optional[str] = Field(default=None, max_length=100)
    vrsta: VrstaNekrtnine = VrstaNekrtnine.OSTALO
    povrsina: float = 0.0
    godina_izgradnje: Optional[int] = None
    vlasnik: Optional[str] = Field(default=None, max_length=200)
    udio_vlasnistva: Optional[str] = Field(default=None, max_length=100)
    nabavna_cijena: Optional[float] = None
    trzisna_vrijednost: Optional[float] = None
    prosllogodisnji_prihodi: Optional[float] = None
    prosllogodisnji_rashodi: Optional[float] = None
    amortizacija: Optional[float] = None
    neto_prihod: Optional[float] = None
    zadnja_obnova: Optional[str] = Field(default=None, max_length=100)  # Date string
    potrebna_ulaganja: Optional[str] = Field(default=None, max_length=2000)
    troskovi_odrzavanja: Optional[float] = None
    osiguranje: Optional[str] = Field(default=None, max_length=500)
    sudski_sporovi: Optional[str] = Field(default=None, max_length=2000)
    hipoteke: Optional[str] = Field(default=None, max_length=2000)
    napomene: Optional[str] = Field(default=None, max_length=5000)
    slika: Optional[str] = Field(default=None, max_length=500)
    financijska_povijest: Optional[list[Dict[str, Any]]] = Field(
        default=None, max_length=50
    )
    has_parking: bool = False


class PropertyUpdate(BaseModel):
    naziv: Optional[str] = Field(default=None, max_length=200)
    adresa: Optional[str] = Field(default=None, max_length=500)
    grad: Optional[str] = Field(default=None, max_length=200)
    katastarska_opcina: Optional[str] = Field(default=None, max_length=200)
    broj_kat_cestice: Optional[str] = Field(default=None, max_length=100)
    vrsta: Optional[VrstaNekrtnine] = None
    povrsina: Optional[float] = None
    godina_izgradnje: Optional[int] = None
    vlasnik: Optional[str] = Field(default=None, max_length=200)
    udio_vlasnistva: Optional[str] = Field(default=None, max_length=100)
    nabavna_cijena: Optional[float] = None
    trzisna_vrijednost: Optional[float] = None
    prosllogodisnji_prihodi: Optional[float] = None
    prosllogodisnji_rashodi: Optional[float] = None
    amortizacija: Optional[float] = None
    neto_prihod: Optional[float] = None
    zadnja_obnova: Optional[str] = Field(default=None, max_length=100)
    potrebna_ulaganja: Optional[str] = Field(default=None, max_length=2000)
    troskovi_odrzavanja: Optional[float] = None
    osiguranje: Optional[str] = Field(default=None, max_length=500)
    sudski_sporovi: Optional[str] = Field(default=None, max_length=2000)
    hipoteke: Optional[str] = Field(default=None, max_length=2000)
    napomene: Optional[str] = Field(default=None, max_length=5000)
    slika: Optional[str] = Field(default=None, max_length=500)
    financijska_povijest: Optional[list[Dict[str, Any]]] = Field(
        default=None, max_length=50
    )
    has_parking: Optional[bool] = None


class PropertyUnitCreate(BaseModel):
    oznaka: str = Field(max_length=100)
    naziv: str = Field(max_length=200)
    kat: Optional[str] = Field(default=None, max_length=100)
    povrsina_m2: float = 0.0
    status: PropertyUnitStatus = PropertyUnitStatus.DOSTUPNO
    osnovna_zakupnina: Optional[float] = None
    napomena: Optional[str] = Field(default=None, max_length=5000)


class PropertyOut(PropertyCreate):
    id: str


@router.get(
    "",
    dependencies=[Depends(deps.require_scopes("properties:read"))],
    response_model=list[PropertyOut],
)
async def get_properties(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    items, total = await nekretnine.find_many(
        filters={},
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [nekretnine.to_dict(item) for item in items]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("properties:create")),
        Depends(deps.require_tenant()),
    ],
    response_model=PropertyOut,
)
async def create_property(
    item_in: PropertyCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item_data = item_in.model_dump()
    item_data["created_by"] = current_user["id"]

    instance = await nekretnine.create(item_data)
    return nekretnine.to_dict(instance)


@router.get(
    "/{id}",
    dependencies=[Depends(deps.require_scopes("properties:read"))],
    response_model=PropertyOut,
)
async def get_property(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await nekretnine.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")
    return nekretnine.to_dict(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
    response_model=PropertyOut,
)
async def update_property(
    id: str,
    item_in: PropertyUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await nekretnine.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return nekretnine.to_dict(existing)

    updated = await nekretnine.update_by_id(id, update_data)
    return nekretnine.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("properties:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_property(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await nekretnine.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    await nekretnine.delete_by_id(id)
    return {"message": "Nekretnina uspješno obrisana"}


@router.post(
    "/{id}/units",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def create_property_unit(
    id: str,
    unit_in: PropertyUnitCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await nekretnine.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    unit_data = unit_in.model_dump()
    unit_data["nekretnina_id"] = id
    unit_data["created_by"] = current_user["id"]

    instance = await property_units.create(unit_data)
    return property_units.to_dict(instance)


@router.get(
    "/{id}/units", dependencies=[Depends(deps.require_scopes("properties:read"))]
)
async def get_property_units(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await nekretnine.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    items = await property_units.find_all(
        filters={"nekretnina_id": id},
        order_by="oznaka",
        order_dir="asc",
    )
    return [property_units.to_dict(item) for item in items]

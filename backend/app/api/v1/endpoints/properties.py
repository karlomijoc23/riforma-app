from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import nekretnine, property_units
from app.models.domain import PropertyUnitStatus, VrstaNekrtnine
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import Response as FastAPIResponse
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
    povrsina_objekta: Optional[float] = None
    povrsina_zemljista: Optional[float] = None
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
    povrsina_objekta: Optional[float] = None
    povrsina_zemljista: Optional[float] = None
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
    povrsina_m2: float = Field(default=0.0, ge=0)
    status: PropertyUnitStatus = PropertyUnitStatus.DOSTUPNO
    osnovna_zakupnina: Optional[float] = Field(default=None, ge=0)
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

    # Pre-flight: block delete if any contract still references this property
    # (DB FK is RESTRICT and would otherwise raise a 500 IntegrityError),
    # and warn if there are units or parkings — those CASCADE silently and
    # take with them every junction row, which can leave older contracts
    # with empty resource sets.
    from app.db.repositories.instance import (
        parking_spaces,
        property_units,
        ugovori,
    )
    from app.models.tables import UgovoriRow

    blocking_contract = await ugovori.find_one(
        nekretnina_id=id,
        extra_conditions=[
            UgovoriRow.status.in_(["aktivno", "na_isteku"]),
        ],
    )
    if blocking_contract:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Nekretnina ima aktivan ugovor "
                f"({blocking_contract.interna_oznaka or '—'}). "
                "Raskinite ili arhivirajte ugovor prije brisanja nekretnine."
            ),
        )

    # Soft warning: any non-active contracts (istekao/raskinuto/arhivirano)
    # also block to preserve audit trail.
    any_contract = await ugovori.find_one(nekretnina_id=id)
    if any_contract:
        raise HTTPException(
            status_code=409,
            detail=(
                "Nekretnina ima povijesne ugovore. Prvo ih obrišite ili "
                "arhivirajte, zatim obrišite nekretninu."
            ),
        )

    # No contracts → safe. Units + parkings cascade via FK; that's fine.
    _ = property_units, parking_spaces  # silence flake8 unused

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


@router.get(
    "/portfolio-report/export-pdf",
    dependencies=[Depends(deps.require_scopes("reports:read"))],
)
async def export_portfolio_report_pdf(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Server-side PDF of the property portfolio report.

    Aggregates the same data the React component used to compute client-
    side, then renders through the Riforma brand template — selectable
    text, real typography, no html2canvas screenshots.
    """
    from app.services.property_report_pdf_service import render_property_report_pdf

    pdf_bytes = await render_property_report_pdf()
    filename = "riforma-izvjestaj-portfelja.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{id}/export-pdf",
    dependencies=[Depends(deps.require_scopes("properties:read"))],
)
async def export_property_detail_pdf(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Server-side PDF of a single property's detail report.

    Includes property facts, financial KPIs, occupancy, podprostori,
    parking spaces, and active contracts. Mirrors the on-screen detail
    page as a single-page handout.
    """
    from app.services.property_detail_pdf_service import (
        render_property_detail_pdf,
    )

    pdf_bytes = await render_property_detail_pdf(id)

    item = await nekretnine.get_by_id(id)
    safe_name = "nekretnina"
    if item and item.naziv:
        # ASCII-only — Content-Disposition is latin-1 encoded, so Croatian
        # diacritics (č, ć, ž, š, đ) crash the header. Strip them via NFKD
        # decomposition then drop the combining marks.
        import unicodedata
        normalized = unicodedata.normalize("NFKD", item.naziv)
        ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
        safe_name = "".join(
            c if (c.isascii() and c.isalnum()) or c in ("-", "_") else "_"
            for c in ascii_only
        )[:60] or "nekretnina"
    filename = f"riforma-nekretnina-{safe_name}.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

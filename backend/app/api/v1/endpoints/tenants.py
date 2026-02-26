import asyncio
from typing import Any, Dict, Optional

from app.api import deps
from app.db.repositories.instance import (
    dokumenti,
    maintenance_tasks,
    racuni,
    ugovori,
    zakupnici,
)
from app.models.domain import ZakupnikStatus, ZakupnikTip
from app.models.tables import ZakupniciRow
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import or_

router = APIRouter()


class TenantCreate(BaseModel):
    naziv_firme: Optional[str] = None
    ime_prezime: Optional[str] = None
    oib: Optional[str] = None
    adresa: Optional[str] = None
    adresa_ulica: Optional[str] = None
    adresa_kucni_broj: Optional[str] = None
    adresa_postanski_broj: Optional[str] = None
    adresa_grad: Optional[str] = None
    adresa_drzava: Optional[str] = None
    sjediste: Optional[str] = None
    kontakt_ime: Optional[str] = None
    kontakt_email: Optional[str] = None
    kontakt_telefon: Optional[str] = None
    iban: Optional[str] = None
    pdv_obveznik: bool = False
    pdv_id: Optional[str] = None
    maticni_broj: Optional[str] = None
    registracijski_broj: Optional[str] = None
    eracun_dostava_kanal: Optional[str] = None
    eracun_identifikator: Optional[str] = None
    eracun_email: Optional[str] = None
    eracun_posrednik: Optional[str] = None
    fiskalizacija_napomena: Optional[str] = None
    odgovorna_osoba: Optional[str] = None
    oznake: Optional[list] = None
    opis_usluge: Optional[str] = None
    radno_vrijeme: Optional[str] = None
    biljeske: Optional[str] = None
    hitnost_odziva_sati: Optional[int] = None
    kontakt_osobe: Optional[list] = None
    status: ZakupnikStatus = ZakupnikStatus.AKTIVAN
    tip: ZakupnikTip = ZakupnikTip.ZAKUPNIK
    napomena: Optional[str] = None


class TenantUpdate(BaseModel):
    naziv_firme: Optional[str] = None
    ime_prezime: Optional[str] = None
    oib: Optional[str] = None
    adresa: Optional[str] = None
    adresa_ulica: Optional[str] = None
    adresa_kucni_broj: Optional[str] = None
    adresa_postanski_broj: Optional[str] = None
    adresa_grad: Optional[str] = None
    adresa_drzava: Optional[str] = None
    sjediste: Optional[str] = None
    kontakt_ime: Optional[str] = None
    kontakt_email: Optional[str] = None
    kontakt_telefon: Optional[str] = None
    iban: Optional[str] = None
    pdv_obveznik: Optional[bool] = None
    pdv_id: Optional[str] = None
    maticni_broj: Optional[str] = None
    registracijski_broj: Optional[str] = None
    eracun_dostava_kanal: Optional[str] = None
    eracun_identifikator: Optional[str] = None
    eracun_email: Optional[str] = None
    eracun_posrednik: Optional[str] = None
    fiskalizacija_napomena: Optional[str] = None
    odgovorna_osoba: Optional[str] = None
    oznake: Optional[list] = None
    opis_usluge: Optional[str] = None
    radno_vrijeme: Optional[str] = None
    biljeske: Optional[str] = None
    hitnost_odziva_sati: Optional[int] = None
    kontakt_osobe: Optional[list] = None
    status: Optional[ZakupnikStatus] = None
    tip: Optional[ZakupnikTip] = None
    napomena: Optional[str] = None


@router.get("", dependencies=[Depends(deps.require_scopes("tenants:read"))])
async def get_tenants(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    extra_conditions = []
    if search:
        search_term = f"%{search}%"
        extra_conditions.append(
            or_(
                ZakupniciRow.naziv_firme.ilike(search_term),
                ZakupniciRow.kontakt_email.ilike(search_term),
                ZakupniciRow.oib.ilike(search_term),
            )
        )

    items, total = await zakupnici.find_many(
        filters={},
        extra_conditions=extra_conditions if extra_conditions else None,
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [zakupnici.to_dict(item) for item in items]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_scopes("tenants:create"))],
)
async def create_tenant(
    item_in: TenantCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item_data = item_in.model_dump()
    item_data["created_by"] = current_user["id"]

    instance = await zakupnici.create(item_data)
    return zakupnici.to_dict(instance)


@router.get(
    "/{id}/overview", dependencies=[Depends(deps.require_scopes("tenants:read"))]
)
async def get_tenant_overview(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Aggregated overview of a tenant: contracts, bills, maintenance, documents."""
    item = await zakupnici.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")

    ugovori_list, racuni_list, dokumenti_list, maintenance_list = await asyncio.gather(
        ugovori.find_all(
            filters={"zakupnik_id": id}, order_by="created_at", order_dir="desc"
        ),
        racuni.find_all(
            filters={"zakupnik_id": id}, order_by="datum_racuna", order_dir="desc"
        ),
        dokumenti.find_all(
            filters={"zakupnik_id": id}, order_by="created_at", order_dir="desc"
        ),
        maintenance_tasks.find_all(
            filters={"zakupnik_id": id}, order_by="created_at", order_dir="desc"
        ),
    )

    total_rent = sum(float(u.osnovna_zakupnina or 0) for u in ugovori_list)
    total_bills = sum(float(r.iznos or 0) for r in racuni_list)
    unpaid_bills = sum(
        float(r.iznos or 0)
        for r in racuni_list
        if r.status_placanja != "placeno"
    )
    active_contracts = sum(1 for u in ugovori_list if u.status == "aktivno")

    return {
        "zakupnik": zakupnici.to_dict(item),
        "ugovori": [ugovori.to_dict(u) for u in ugovori_list],
        "racuni": [racuni.to_dict(r) for r in racuni_list],
        "dokumenti": [dokumenti.to_dict(d) for d in dokumenti_list],
        "maintenance": [maintenance_tasks.to_dict(m) for m in maintenance_list],
        "summary": {
            "active_contracts": active_contracts,
            "total_monthly_rent": round(total_rent, 2),
            "total_billed": round(total_bills, 2),
            "unpaid_bills": round(unpaid_bills, 2),
            "total_documents": len(dokumenti_list),
            "total_maintenance": len(maintenance_list),
        },
    }


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("tenants:read"))])
async def get_tenant(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await zakupnici.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")
    return zakupnici.to_dict(item)


@router.put("/{id}", dependencies=[Depends(deps.require_scopes("tenants:update"))])
async def update_tenant(
    id: str,
    item_in: TenantUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await zakupnici.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return zakupnici.to_dict(existing)

    updated = await zakupnici.update_by_id(id, update_data)
    return zakupnici.to_dict(updated)


@router.delete("/{id}", dependencies=[Depends(deps.require_scopes("tenants:delete"))])
async def delete_tenant(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await zakupnici.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")

    await zakupnici.delete_by_id(id)
    return {"message": "Zakupnik uspješno obrisan"}

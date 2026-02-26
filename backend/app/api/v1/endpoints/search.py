from typing import Any, Dict

from sqlalchemy import or_

from app.api import deps
from app.db.repositories.instance import nekretnine, ugovori, zakupnici
from app.models.tables import NekretnineRow, UgovoriRow, ZakupniciRow
from fastapi import APIRouter, Depends

router = APIRouter()


@router.get("/", dependencies=[Depends(deps.require_scopes("properties:read"))])
async def search(
    q: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    if not q:
        return {}

    search_term = f"%{q}%"

    results = {}

    # Search properties
    props, _ = await nekretnine.find_many(
        extra_conditions=[or_(
            NekretnineRow.naziv.ilike(search_term),
            NekretnineRow.adresa.ilike(search_term),
            NekretnineRow.katastarska_opcina.ilike(search_term),
        )],
        limit=10,
    )
    results["nekretnine"] = [nekretnine.to_dict(p) for p in props]

    # Search tenants
    tenants, _ = await zakupnici.find_many(
        extra_conditions=[or_(
            ZakupniciRow.naziv_firme.ilike(search_term),
            ZakupniciRow.ime_prezime.ilike(search_term),
            ZakupniciRow.oib.ilike(search_term),
        )],
        limit=10,
    )
    results["zakupnici"] = [zakupnici.to_dict(t) for t in tenants]

    # Search contracts
    contracts, _ = await ugovori.find_many(
        extra_conditions=[or_(
            UgovoriRow.interna_oznaka.ilike(search_term),
            UgovoriRow.napomena.ilike(search_term),
        )],
        limit=10,
    )
    results["ugovori"] = [ugovori.to_dict(c) for c in contracts]

    return results

"""Tenant self-service endpoints.

Every route here is scoped to the **current user's linked zakupnik record**
via `get_current_zakupnik`. A user with no link (admin hasn't invited yet)
gets 403 from the dependency. Multi-contract zakupnici see all their
contracts at once.

Endpoints (mounted under `/api/v1/self`):
  GET   /profile      — zakupnik record (own contact info)
  GET   /contracts    — all contracts for this zakupnik
  GET   /bills        — racuni filtered to this zakupnik
  GET   /maintenance  — maintenance tasks where zakupnik_id = self
  POST  /maintenance  — submit a new maintenance request
  GET   /documents    — documents linked to self or to self's contracts
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_

from app.api import deps
from app.db.repositories.instance import (
    dokumenti,
    maintenance_tasks,
    racuni,
    ugovori,
    zakupnici,
)
from app.models.domain import MaintenancePriority, MaintenanceStatus
from app.models.tables import (
    DokumentiRow,
    MaintenanceTaskRow,
    RacuniRow,
    UgovoriRow,
)

router = APIRouter()


class MaintenanceRequest(BaseModel):
    """Body for a tenant-submitted maintenance request."""

    naziv: str = Field(max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    prioritet: MaintenancePriority = MaintenancePriority.SREDNJE


@router.get(
    "/profile",
    dependencies=[Depends(deps.require_scopes("self:read"))],
)
async def get_my_profile(zakupnik=Depends(deps.get_current_zakupnik)):
    """Return the zakupnik record linked to the current tenant user."""
    return zakupnici.to_dict(zakupnik)


@router.get(
    "/contracts",
    dependencies=[Depends(deps.require_scopes("self:read"))],
)
async def get_my_contracts(zakupnik=Depends(deps.get_current_zakupnik)):
    """Every contract belonging to this zakupnik, enriched with the full
    unit + parking sets (same shape as the admin /ugovori list)."""
    from app.models.tables import ugovor_parkings as _pjunction
    from app.models.tables import ugovor_units as _ujunction
    from app.db.session import get_async_session_factory
    from sqlalchemy import select as _select

    items = await ugovori.find_all(
        filters={"zakupnik_id": zakupnik.id},
        order_by="datum_pocetka",
        order_dir="desc",
    )
    contract_ids = [c.id for c in items]
    units_by_contract: Dict[str, List[str]] = {}
    parkings_by_contract: Dict[str, List[str]] = {}
    if contract_ids:
        session_factory = get_async_session_factory()
        async with session_factory() as session:
            ures = await session.execute(
                _select(
                    _ujunction.c.ugovor_id, _ujunction.c.property_unit_id
                ).where(_ujunction.c.ugovor_id.in_(contract_ids))
            )
            for cid, uid in ures.all():
                units_by_contract.setdefault(cid, []).append(uid)
            pres = await session.execute(
                _select(
                    _pjunction.c.ugovor_id, _pjunction.c.parking_id
                ).where(_pjunction.c.ugovor_id.in_(contract_ids))
            )
            for cid, pid in pres.all():
                parkings_by_contract.setdefault(cid, []).append(pid)

    results = []
    for c in items:
        d = ugovori.to_dict(c)
        unit_set = list(units_by_contract.get(c.id, []))
        if c.property_unit_id and c.property_unit_id not in unit_set:
            unit_set.insert(0, c.property_unit_id)
        d["property_unit_ids"] = unit_set
        d["parking_ids"] = parkings_by_contract.get(c.id, [])
        results.append(d)
    return results


@router.get(
    "/bills",
    dependencies=[Depends(deps.require_scopes("self:read"))],
)
async def get_my_bills(
    status_filter: Optional[str] = None,
    zakupnik=Depends(deps.get_current_zakupnik),
):
    """All racuni for this zakupnik, newest first. Optional status filter."""
    filters: Dict[str, Any] = {"zakupnik_id": zakupnik.id}
    if status_filter:
        filters["status_placanja"] = status_filter
    items = await racuni.find_all(
        filters=filters,
        order_by="datum_racuna",
        order_dir="desc",
    )
    return [racuni.to_dict(r) for r in items]


@router.get(
    "/maintenance",
    dependencies=[Depends(deps.require_scopes("self:maintenance"))],
)
async def get_my_maintenance(zakupnik=Depends(deps.get_current_zakupnik)):
    """Maintenance tasks linked to this zakupnik (either explicitly via
    zakupnik_id, or implicitly via a contract this zakupnik holds)."""
    # Tasks linked to one of this zakupnik's contracts.
    contracts = await ugovori.find_all(filters={"zakupnik_id": zakupnik.id})
    contract_ids = [c.id for c in contracts]

    extra = []
    if contract_ids:
        extra.append(
            or_(
                MaintenanceTaskRow.zakupnik_id == zakupnik.id,
                MaintenanceTaskRow.ugovor_id.in_(contract_ids),
            )
        )
    else:
        extra.append(MaintenanceTaskRow.zakupnik_id == zakupnik.id)

    items = await maintenance_tasks.find_all(
        extra_conditions=extra,
        order_by="created_at",
        order_dir="desc",
    )
    return [maintenance_tasks.to_dict(t) for t in items]


@router.post(
    "/maintenance",
    status_code=201,
    dependencies=[Depends(deps.require_scopes("self:maintenance"))],
)
async def submit_maintenance_request(
    body: MaintenanceRequest,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
    zakupnik=Depends(deps.get_current_zakupnik),
):
    """Tenant submits a maintenance request. Auto-tagged with zakupnik_id
    and (if applicable) a contract id so the admin sees it under the
    right context. Status starts as `novi`."""
    # Pick a sensible nekretnina_id: prefer the body value if it belongs
    # to one of the zakupnik's contracts; otherwise the latest contract's
    # property; otherwise None.
    contract = None
    nekretnina_id = body.nekretnina_id
    if not nekretnina_id:
        contracts = await ugovori.find_all(
            filters={"zakupnik_id": zakupnik.id},
            order_by="datum_pocetka",
            order_dir="desc",
        )
        if contracts:
            contract = contracts[0]
            nekretnina_id = contract.nekretnina_id

    task_data: Dict[str, Any] = {
        "naziv": body.naziv,
        "opis": body.opis,
        "status": MaintenanceStatus.NOVI.value,
        "prioritet": body.prioritet.value,
        "datum_prijave": date.today(),
        "prijavio_user_id": current_user["id"],
        "prijavio": current_user.get("name") or zakupnik.kontakt_ime
        or zakupnik.naziv_firme,
        "zakupnik_id": zakupnik.id,
        "nekretnina_id": nekretnina_id,
        "property_unit_id": body.property_unit_id,
        "ugovor_id": contract.id if contract else None,
        "aktivnosti": [
            {
                "tip": "kreiran",
                "opis": "Zakupnik prijavio nalog kroz self-service.",
                "autor": current_user.get("name") or "Zakupnik",
                "timestamp": date.today().isoformat(),
            }
        ],
    }
    new_task = await maintenance_tasks.create(task_data)
    return maintenance_tasks.to_dict(new_task)


@router.get(
    "/documents",
    dependencies=[Depends(deps.require_scopes("self:documents"))],
)
async def get_my_documents(zakupnik=Depends(deps.get_current_zakupnik)):
    """Documents directly linked to this zakupnik OR to one of their
    contracts. Tenant cannot see arbitrary property docs."""
    contracts = await ugovori.find_all(filters={"zakupnik_id": zakupnik.id})
    contract_ids = [c.id for c in contracts]

    extra = []
    if contract_ids:
        extra.append(
            or_(
                DokumentiRow.zakupnik_id == zakupnik.id,
                DokumentiRow.ugovor_id.in_(contract_ids),
            )
        )
    else:
        extra.append(DokumentiRow.zakupnik_id == zakupnik.id)

    items = await dokumenti.find_all(
        extra_conditions=extra,
        order_by="created_at",
        order_dir="desc",
    )
    return [dokumenti.to_dict(d) for d in items]


@router.get(
    "/summary",
    dependencies=[Depends(deps.require_scopes("self:read"))],
)
async def get_my_summary(zakupnik=Depends(deps.get_current_zakupnik)):
    """One-shot summary for the portal landing page: active contract count,
    outstanding bill total, next bill due date, open maintenance count."""
    contracts = await ugovori.find_all(filters={"zakupnik_id": zakupnik.id})
    active_contracts = [
        c for c in contracts if c.status in ("aktivno", "na_isteku")
    ]
    contract_ids = [c.id for c in contracts]

    bills = await racuni.find_all(filters={"zakupnik_id": zakupnik.id})
    outstanding = [
        r
        for r in bills
        if r.status_placanja in ("ceka_placanje", "prekoraceno")
    ]
    outstanding_total = sum(float(r.iznos or 0) for r in outstanding)
    next_due = None
    for r in sorted(
        outstanding,
        key=lambda x: x.datum_dospijeca or date(2099, 12, 31),
    ):
        if r.datum_dospijeca:
            next_due = r.datum_dospijeca.isoformat()
            break

    open_tasks = 0
    if contract_ids:
        tasks = await maintenance_tasks.find_all(
            extra_conditions=[
                or_(
                    MaintenanceTaskRow.zakupnik_id == zakupnik.id,
                    MaintenanceTaskRow.ugovor_id.in_(contract_ids),
                ),
                MaintenanceTaskRow.status.in_(
                    ["novi", "u_tijeku", "ceka_dobavljaca", "potrebna_odluka"]
                ),
            ]
        )
        open_tasks = len(tasks)
    else:
        tasks = await maintenance_tasks.find_all(
            extra_conditions=[
                MaintenanceTaskRow.zakupnik_id == zakupnik.id,
                MaintenanceTaskRow.status.in_(
                    ["novi", "u_tijeku", "ceka_dobavljaca", "potrebna_odluka"]
                ),
            ]
        )
        open_tasks = len(tasks)

    return {
        "zakupnik_naziv": zakupnik.naziv_firme or zakupnik.ime_prezime,
        "active_contracts": len(active_contracts),
        "total_contracts": len(contracts),
        "outstanding_bills_count": len(outstanding),
        "outstanding_total": round(outstanding_total, 2),
        "next_due_date": next_due,
        "open_maintenance": open_tasks,
    }


__all__ = ["router"]

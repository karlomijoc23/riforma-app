from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func, or_

from app.api import deps
from app.db.repositories.instance import (
    maintenance_tasks,
    nekretnine,
    property_units,
    ugovori,
    users,
)
from app.models.domain import MaintenancePriority, MaintenanceStatus
from app.models.tables import MaintenanceTaskRow, NekretnineRow
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

router = APIRouter()


class MaintenanceTaskCreate(BaseModel):
    naziv: str = Field(max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    ugovor_id: Optional[str] = Field(default=None, max_length=100)
    prijavio_user_id: Optional[str] = Field(default=None, max_length=100)
    dodijeljeno_user_id: Optional[str] = Field(default=None, max_length=100)
    status: MaintenanceStatus = MaintenanceStatus.NOVI
    prioritet: MaintenancePriority = MaintenancePriority.SREDNJE
    datum_prijave: Optional[date] = None
    rok: Optional[date] = None
    trosak_materijal: Optional[float] = None
    trosak_rad: Optional[float] = None
    napomena: Optional[str] = Field(default=None, max_length=5000)
    oznake: List[str] = Field(default=[], max_length=50)
    aktivnosti: List[Dict[str, Any]] = Field(default=[], max_length=100)
    # Supplier / vendor fields
    dobavljac_naziv: Optional[str] = Field(default=None, max_length=200)
    dobavljac_kontakt: Optional[str] = Field(default=None, max_length=200)
    dobavljac_telefon: Optional[str] = Field(default=None, max_length=100)
    # Recurring task fields
    ponavljanje: Optional[str] = Field(
        default=None, max_length=100
    )  # None, "mjesecno", "kvartalno", "polugodisnje", "godisnje"
    ponavljanje_do: Optional[date] = None  # End date for recurrence
    parent_task_id: Optional[str] = Field(
        default=None, max_length=100
    )  # Links recurring instances to original


class MaintenanceTaskUpdate(BaseModel):
    naziv: Optional[str] = Field(default=None, max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    ugovor_id: Optional[str] = Field(default=None, max_length=100)
    dodijeljeno_user_id: Optional[str] = Field(default=None, max_length=100)
    status: Optional[MaintenanceStatus] = None
    prioritet: Optional[MaintenancePriority] = None
    rok: Optional[date] = None
    trosak_materijal: Optional[float] = None
    trosak_rad: Optional[float] = None
    napomena: Optional[str] = Field(default=None, max_length=5000)
    oznake: Optional[List[str]] = Field(default=None, max_length=50)
    # Supplier / vendor fields
    dobavljac_naziv: Optional[str] = Field(default=None, max_length=200)
    dobavljac_kontakt: Optional[str] = Field(default=None, max_length=200)
    dobavljac_telefon: Optional[str] = Field(default=None, max_length=100)
    # Recurring
    ponavljanje: Optional[str] = Field(default=None, max_length=100)
    ponavljanje_do: Optional[date] = None


class CommentCreate(BaseModel):
    poruka: str = Field(max_length=5000)
    autor: Optional[str] = Field(default=None, max_length=200)


RECURRENCE_DELTAS = {
    "mjesecno": timedelta(days=30),
    "kvartalno": timedelta(days=91),
    "polugodisnje": timedelta(days=182),
    "godisnje": timedelta(days=365),
}


@router.get("/", dependencies=[Depends(deps.require_scopes("maintenance:read"))])
async def get_maintenance_tasks(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    q: Optional[str] = None,
    prioritet: Optional[str] = None,
    status_filter: Optional[str] = None,
    nekretnina_id: Optional[str] = None,
    rok_do: Optional[date] = None,
    oznaka: Optional[str] = None,
    dobavljac: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    extra_conds = []
    filters = {}

    if q:
        search_term = f"%{q}%"
        extra_conds.append(
            or_(
                MaintenanceTaskRow.naziv.ilike(search_term),
                MaintenanceTaskRow.opis.ilike(search_term),
                MaintenanceTaskRow.dobavljac_naziv.ilike(search_term),
            )
        )
    if prioritet:
        filters["prioritet"] = prioritet
    if status_filter:
        filters["status"] = status_filter
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id
    if rok_do:
        extra_conds.append(MaintenanceTaskRow.rok <= rok_do)
    if oznaka:
        extra_conds.append(
            func.json_contains(MaintenanceTaskRow.oznake, f'"{oznaka}"')
        )
    if dobavljac:
        extra_conds.append(
            MaintenanceTaskRow.dobavljac_naziv.ilike(f"%{dobavljac}%")
        )

    items, total = await maintenance_tasks.find_many(
        filters=filters,
        extra_conditions=extra_conds if extra_conds else None,
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)
    return [maintenance_tasks.to_dict(item) for item in items]


@router.get(
    "/analytics",
    dependencies=[Depends(deps.require_scopes("maintenance:read"))],
)
async def get_maintenance_analytics(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Aggregate maintenance cost analytics."""
    tasks = await maintenance_tasks.find_all()

    total_materijal = 0.0
    total_rad = 0.0
    by_property = {}  # property_id -> {materijal, rad, count}
    by_priority = {}  # prioritet -> {materijal, rad, count}
    by_month = {}  # YYYY-MM -> {materijal, rad, count}

    for t in tasks:
        mat = float(t.trosak_materijal or 0)
        rad = float(t.trosak_rad or 0)
        total_materijal += mat
        total_rad += rad

        # By property
        pid = t.nekretnina_id or "nepoznato"
        if pid not in by_property:
            by_property[pid] = {"materijal": 0, "rad": 0, "count": 0}
        by_property[pid]["materijal"] += mat
        by_property[pid]["rad"] += rad
        by_property[pid]["count"] += 1

        # By priority
        pri = t.prioritet or "srednje"
        if pri not in by_priority:
            by_priority[pri] = {"materijal": 0, "rad": 0, "count": 0}
        by_priority[pri]["materijal"] += mat
        by_priority[pri]["rad"] += rad
        by_priority[pri]["count"] += 1

        # By month (from datum_prijave or created_at)
        datum = t.datum_prijave or t.created_at or ""
        month_key = str(datum)[:7] if len(str(datum)) >= 7 else "nepoznato"
        if month_key not in by_month:
            by_month[month_key] = {"materijal": 0, "rad": 0, "count": 0}
        by_month[month_key]["materijal"] += mat
        by_month[month_key]["rad"] += rad
        by_month[month_key]["count"] += 1

    # Resolve property names
    prop_ids = [pid for pid in by_property if pid != "nepoznato"]
    property_map = {}
    if prop_ids:
        props = await nekretnine.find_all(
            extra_conditions=[NekretnineRow.id.in_(prop_ids)]
        )
        property_map = {p.id: (p.naziv or "?") for p in props}

    by_property_named = {}
    for pid, vals in by_property.items():
        label = (
            property_map.get(pid, "Nepoznato") if pid != "nepoznato" else "Nepoznato"
        )
        by_property_named[pid] = {
            **vals,
            "naziv": label,
            "materijal": round(vals["materijal"], 2),
            "rad": round(vals["rad"], 2),
            "ukupno": round(vals["materijal"] + vals["rad"], 2),
        }

    by_priority_out = {}
    for pri, vals in by_priority.items():
        by_priority_out[pri] = {
            **vals,
            "materijal": round(vals["materijal"], 2),
            "rad": round(vals["rad"], 2),
            "ukupno": round(vals["materijal"] + vals["rad"], 2),
        }

    by_month_out = {}
    for m, vals in sorted(by_month.items()):
        by_month_out[m] = {
            **vals,
            "materijal": round(vals["materijal"], 2),
            "rad": round(vals["rad"], 2),
            "ukupno": round(vals["materijal"] + vals["rad"], 2),
        }

    total_cost = total_materijal + total_rad

    return {
        "total_materijal": round(total_materijal, 2),
        "total_rad": round(total_rad, 2),
        "total_cost": round(total_cost, 2),
        "total_tasks": len(tasks),
        "by_property": by_property_named,
        "by_priority": by_priority_out,
        "by_month": by_month_out,
    }


@router.get(
    "/report",
    dependencies=[Depends(deps.require_scopes("maintenance:read"))],
)
async def get_maintenance_report(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Aggregated maintenance report data."""
    all_tasks = await maintenance_tasks.find_all()
    tasks = [maintenance_tasks.to_dict(t) for t in all_tasks]

    total = len(tasks)
    status_counts = {}
    priority_counts = {}
    by_property = {}
    total_material = 0.0
    total_labor = 0.0
    overdue = 0
    today_str = date.today().isoformat()

    for t in tasks:
        s = t.get("status", "novi")
        status_counts[s] = status_counts.get(s, 0) + 1

        p = t.get("prioritet", "srednje")
        priority_counts[p] = priority_counts.get(p, 0) + 1

        nid = t.get("nekretnina_id")
        if nid:
            by_property[nid] = by_property.get(nid, 0) + 1

        total_material += float(t.get("trosak_materijal") or 0)
        total_labor += float(t.get("trosak_rad") or 0)

        rok = t.get("rok")
        if rok and str(rok) < today_str and s not in ("zavrseno", "arhivirano"):
            overdue += 1

    # Fetch property names
    prop_ids = list(by_property.keys())
    property_map = {}
    if prop_ids:
        props = await nekretnine.find_all(
            extra_conditions=[NekretnineRow.id.in_(prop_ids)]
        )
        property_map = {p.id: (p.naziv or "?") for p in props}

    tasks_by_property = [
        {"id": pid, "naziv": property_map.get(pid, "Nepoznato"), "count": cnt}
        for pid, cnt in sorted(by_property.items(), key=lambda x: -x[1])
    ]

    return {
        "total": total,
        "status_counts": status_counts,
        "priority_counts": priority_counts,
        "total_material": round(total_material, 2),
        "total_labor": round(total_labor, 2),
        "total_cost": round(total_material + total_labor, 2),
        "overdue": overdue,
        "tasks_by_property": tasks_by_property,
    }


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("maintenance:create")),
        Depends(deps.require_tenant()),
    ],
)
async def create_maintenance_task(
    item_in: MaintenanceTaskCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item_data = item_in.model_dump()
    item_data["created_by"] = current_user["id"]
    if not item_data.get("datum_prijave"):
        item_data["datum_prijave"] = date.today()

    # Initial activity
    item_data["aktivnosti"] = [
        {
            "tip": "kreiran",
            "opis": "Zadatak kreiran",
            "autor": current_user["name"],
            "timestamp": date.today().isoformat(),
        }
    ]

    # Validate relations (simplified)
    if item_data.get("ugovor_id"):
        contract = await ugovori.get_by_id(item_data["ugovor_id"])
        if not contract:
            raise HTTPException(status_code=400, detail="Ugovor nije pronađen")
        if (
            item_data.get("nekretnina_id")
            and contract.nekretnina_id != item_data["nekretnina_id"]
        ):
            raise HTTPException(
                status_code=400, detail="Ugovor ne pripada odabranoj nekretnini"
            )
        if not item_data.get("nekretnina_id"):
            item_data["nekretnina_id"] = contract.nekretnina_id
        if not item_data.get("property_unit_id"):
            item_data["property_unit_id"] = contract.property_unit_id

    if item_data.get("property_unit_id") and item_data.get("nekretnina_id"):
        unit = await property_units.get_by_id(item_data["property_unit_id"])
        if unit and unit.nekretnina_id != item_data["nekretnina_id"]:
            raise HTTPException(
                status_code=400, detail="Podprostor ne pripada odabranoj nekretnini"
            )

    # Relax assignee role check — allow any active user
    if item_data.get("dodijeljeno_user_id"):
        assignee = await users.get_by_id(item_data["dodijeljeno_user_id"])
        if not assignee:
            raise HTTPException(
                status_code=400, detail="Dodijeljeni korisnik nije pronađen"
            )

    new_item = await maintenance_tasks.create(item_data)

    # If recurring, create future instances
    recurrence = item_in.ponavljanje
    if recurrence and recurrence in RECURRENCE_DELTAS and item_in.rok:
        parent_id = new_item.id
        delta = RECURRENCE_DELTAS[recurrence]
        end_date = item_in.ponavljanje_do or (item_in.rok + timedelta(days=365))
        next_date = item_in.rok + delta
        while next_date <= end_date:
            child_data = item_in.model_dump()
            child_data["created_by"] = current_user["id"]
            child_data["datum_prijave"] = date.today()
            child_data["rok"] = next_date
            child_data["parent_task_id"] = parent_id
            child_data["ponavljanje"] = None  # Children don't recurse
            child_data["aktivnosti"] = [
                {
                    "tip": "kreiran",
                    "opis": f"Ponavljajući zadatak (iz {item_in.naziv})",
                    "autor": current_user["name"],
                    "timestamp": date.today().isoformat(),
                }
            ]
            await maintenance_tasks.create(child_data)
            next_date += delta

    return maintenance_tasks.to_dict(new_item)


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("maintenance:read"))])
async def get_maintenance_task(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await maintenance_tasks.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")
    return maintenance_tasks.to_dict(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("maintenance:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_maintenance_task(
    id: str,
    item_in: MaintenanceTaskUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await maintenance_tasks.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return maintenance_tasks.to_dict(existing)

    updated = await maintenance_tasks.update_by_id(id, update_data)
    return maintenance_tasks.to_dict(updated)


@router.patch(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("maintenance:update")),
        Depends(deps.require_tenant()),
    ],
)
async def patch_maintenance_task(
    id: str,
    item_in: MaintenanceTaskUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await maintenance_tasks.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return maintenance_tasks.to_dict(existing)

    # Handle status change activity
    if "status" in update_data and update_data["status"] != existing.status:
        activity = {
            "tip": "promjena_statusa",
            "opis": f"Status promijenjen u {update_data['status']}",
            "autor": current_user["name"],
            "timestamp": date.today().isoformat(),
        }
        activities = list(existing.aktivnosti or [])
        activities.append(activity)
        update_data["aktivnosti"] = activities

    updated = await maintenance_tasks.update_by_id(id, update_data)
    return maintenance_tasks.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("maintenance:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_maintenance_task(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await maintenance_tasks.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")

    await maintenance_tasks.delete_by_id(id)
    return {"message": "Zadatak obrisan"}


@router.post(
    "/{id}/comments",
    dependencies=[
        Depends(deps.require_scopes("maintenance:update")),
        Depends(deps.require_tenant()),
    ],
)
async def add_comment(
    id: str,
    comment: CommentCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await maintenance_tasks.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")

    activity = {
        "tip": "komentar",
        "opis": comment.poruka,
        "autor": comment.autor or current_user["name"],
        "timestamp": date.today().isoformat(),
    }

    activities = list(existing.aktivnosti or [])
    activities.append(activity)

    await maintenance_tasks.update_by_id(id, {"aktivnosti": activities})
    updated = await maintenance_tasks.get_by_id(id)
    return maintenance_tasks.to_dict(updated)

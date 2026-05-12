from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import String, cast, func, or_

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
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel, Field

router = APIRouter()


class MaintenanceTaskCreate(BaseModel):
    naziv: str = Field(max_length=200)
    opis: Optional[str] = Field(default=None, max_length=5000)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    # Legacy single-unit pointer (kept as the "primary" so reports + recurring
    # children keep working). If `property_unit_ids` is also given, the two
    # are merged with `property_unit_id` becoming the first/primary entry.
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    # Full M:N unit set for tasks that cover multiple units (e.g. "paint
    # hallway A2 + A3"). Empty / None means "single primary unit" (legacy).
    property_unit_ids: Optional[List[str]] = None
    ugovor_id: Optional[str] = Field(default=None, max_length=100)
    prijavio_user_id: Optional[str] = Field(default=None, max_length=100)
    dodijeljeno_user_id: Optional[str] = Field(default=None, max_length=100)
    prijavio: Optional[str] = Field(default=None, max_length=200)
    dodijeljeno: Optional[str] = Field(default=None, max_length=200)
    status: MaintenanceStatus = MaintenanceStatus.NOVI
    prioritet: MaintenancePriority = MaintenancePriority.SREDNJE
    datum_prijave: Optional[date] = None
    rok: Optional[date] = None
    trosak_materijal: Optional[float] = None
    trosak_rad: Optional[float] = None
    procijenjeni_trosak: Optional[float] = None
    stvarni_trosak: Optional[float] = None
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
    # Replace the M:N set when present. None / unset means "leave alone".
    property_unit_ids: Optional[List[str]] = None
    ugovor_id: Optional[str] = Field(default=None, max_length=100)
    dodijeljeno_user_id: Optional[str] = Field(default=None, max_length=100)
    prijavio: Optional[str] = Field(default=None, max_length=200)
    dodijeljeno: Optional[str] = Field(default=None, max_length=200)
    status: Optional[MaintenanceStatus] = None
    prioritet: Optional[MaintenancePriority] = None
    rok: Optional[date] = None
    trosak_materijal: Optional[float] = None
    trosak_rad: Optional[float] = None
    procijenjeni_trosak: Optional[float] = None
    stvarni_trosak: Optional[float] = None
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


# ---------------------------------------------------------------------------
# M:N helpers — mirror of ugovor_units helpers in contracts.py. Reuse same
# transactional pattern so junction inserts can run in the caller's session.
# ---------------------------------------------------------------------------


async def _resolve_task_unit_ids(item_data: dict) -> List[str]:
    """Combine legacy `property_unit_id` and new `property_unit_ids` into a
    deduplicated, ordered list. The first element (if any) becomes the
    "primary" unit stored on the task row. Validates each unit exists and
    belongs to the task's nekretnina."""
    unit_ids: List[str] = []
    primary = item_data.get("property_unit_id")
    if primary:
        unit_ids.append(primary)
    for uid in item_data.get("property_unit_ids") or []:
        if uid and uid not in unit_ids:
            unit_ids.append(uid)

    if not unit_ids:
        return []

    nekretnina_id = item_data.get("nekretnina_id")
    for uid in unit_ids:
        unit = await property_units.get_by_id(uid)
        if not unit:
            raise HTTPException(
                status_code=400, detail=f"Podprostor '{uid}' ne postoji."
            )
        if nekretnina_id and unit.nekretnina_id != nekretnina_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Podprostor '{unit.oznaka or uid}' ne pripada"
                    " odabranoj nekretnini."
                ),
            )
    return unit_ids


async def _set_task_units(
    task_id: str,
    unit_ids: List[str],
    *,
    session=None,
) -> None:
    """Replace junction rows for a task. Reuses caller session when
    provided so junction inserts roll back with the task row."""
    from app.db.session import get_async_session_factory
    from app.models.tables import maintenance_task_units as _junction
    from sqlalchemy import delete as _delete, insert as _insert

    async def _do(s):
        await s.execute(
            _delete(_junction).where(_junction.c.maintenance_task_id == task_id)
        )
        if unit_ids:
            await s.execute(
                _insert(_junction),
                [
                    {"maintenance_task_id": task_id, "property_unit_id": uid}
                    for uid in unit_ids
                ],
            )

    if session is not None:
        await _do(session)
        return

    session_factory = get_async_session_factory()
    async with session_factory() as own_session:
        async with own_session.begin():
            await _do(own_session)


async def _get_task_unit_ids(task_id: str) -> List[str]:
    """Return all unit ids linked to the task via the junction."""
    from app.db.session import get_async_session_factory
    from app.models.tables import maintenance_task_units as _junction
    from sqlalchemy import select as _select

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            _select(_junction.c.property_unit_id).where(
                _junction.c.maintenance_task_id == task_id
            )
        )
        return [row[0] for row in result.all()]


async def _apply_unit_changes(
    task_id: str,
    existing,
    update_data: dict,
) -> List[str]:
    """Shared by PUT + PATCH: detect unit set changes in the update payload,
    resolve the new full set, sync the junction, and return the new ids.

    Mutates `update_data` in place: removes `property_unit_ids`, sets
    `property_unit_id` to the new primary (first of the set or None).
    """
    if (
        "property_unit_id" not in update_data
        and "property_unit_ids" not in update_data
    ):
        # No unit-related change requested — leave the existing junction.
        current = await _get_task_unit_ids(task_id)
        if existing.property_unit_id and existing.property_unit_id not in current:
            current = [existing.property_unit_id] + current
        return current

    merged = {
        "nekretnina_id": update_data.get(
            "nekretnina_id", existing.nekretnina_id
        ),
        "property_unit_id": update_data.get(
            "property_unit_id", existing.property_unit_id
        ),
        "property_unit_ids": update_data.get("property_unit_ids"),
    }
    new_unit_ids = await _resolve_task_unit_ids(merged)
    update_data["property_unit_id"] = new_unit_ids[0] if new_unit_ids else None
    update_data.pop("property_unit_ids", None)

    await _set_task_units(task_id, new_unit_ids)
    return new_unit_ids


async def _enrich_with_unit_ids(items_dicts: List[dict], task_ids: List[str]) -> None:
    """Batch-load junction rows for a list of tasks and attach
    `property_unit_ids` to each dict. Includes the legacy primary FK if
    not already present so callers get the complete set."""
    if not task_ids:
        return
    from app.db.session import get_async_session_factory
    from app.models.tables import maintenance_task_units as _junction
    from sqlalchemy import select as _select

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            _select(
                _junction.c.maintenance_task_id, _junction.c.property_unit_id
            ).where(_junction.c.maintenance_task_id.in_(task_ids))
        )
        by_task: Dict[str, List[str]] = {}
        for tid, uid in result.all():
            by_task.setdefault(tid, []).append(uid)

    for d in items_dicts:
        junction_ids = by_task.get(d.get("id"), [])
        primary = d.get("property_unit_id")
        if primary and primary not in junction_ids:
            junction_ids.insert(0, primary)
        d["property_unit_ids"] = junction_ids


@router.get("", dependencies=[Depends(deps.require_scopes("maintenance:read"))])
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
        # json_contains is MariaDB-specific; fall back to LIKE for SQLite
        from app.core.config import get_settings as _get_settings
        _db_url = _get_settings().DB_SETTINGS.sqlalchemy_url()
        if _db_url.startswith("sqlite"):
            extra_conds.append(
                cast(MaintenanceTaskRow.oznake, String).like(f'%"{oznaka}"%')
            )
        else:
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
    results = [maintenance_tasks.to_dict(item) for item in items]
    await _enrich_with_unit_ids(results, [item.id for item in items])
    return results


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
    "/report/export-pdf",
    dependencies=[Depends(deps.require_scopes("maintenance:read"))],
)
async def export_maintenance_report_pdf(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Server-side PDF of the maintenance overview report."""
    from app.services.maintenance_report_pdf_service import (
        render_maintenance_report_pdf,
    )

    pdf_bytes = await render_maintenance_report_pdf()
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                'attachment; filename="riforma-izvjestaj-odrzavanja.pdf"'
            ),
        },
    )


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
    "",
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
        if (
            not item_data.get("property_unit_id")
            and not item_data.get("property_unit_ids")
        ):
            item_data["property_unit_id"] = contract.property_unit_id

    # Resolve full unit list (legacy + M:N payload merged & validated).
    unit_ids = await _resolve_task_unit_ids(item_data)
    primary_unit = unit_ids[0] if unit_ids else None
    item_data["property_unit_id"] = primary_unit
    item_data.pop("property_unit_ids", None)

    # Relax assignee role check — allow any active user
    if item_data.get("dodijeljeno_user_id"):
        assignee = await users.get_by_id(item_data["dodijeljeno_user_id"])
        if not assignee:
            raise HTTPException(
                status_code=400, detail="Dodijeljeni korisnik nije pronađen"
            )

    from app.db.transaction import db_transaction

    async with db_transaction() as txn:
        new_item = await maintenance_tasks.create(item_data, session=txn)
        if unit_ids:
            await _set_task_units(new_item.id, unit_ids, session=txn)

    # If recurring, create future instances (each child gets the SAME unit
    # set as the parent via the junction so multi-unit tasks recur cleanly).
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
            child_data["property_unit_id"] = primary_unit
            child_data.pop("property_unit_ids", None)
            child_data["aktivnosti"] = [
                {
                    "tip": "kreiran",
                    "opis": f"Ponavljajući zadatak (iz {item_in.naziv})",
                    "autor": current_user["name"],
                    "timestamp": date.today().isoformat(),
                }
            ]
            async with db_transaction() as txn:
                child = await maintenance_tasks.create(child_data, session=txn)
                if unit_ids:
                    await _set_task_units(child.id, unit_ids, session=txn)
            next_date += delta

    result = maintenance_tasks.to_dict(new_item)
    result["property_unit_ids"] = unit_ids
    return result


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("maintenance:read"))])
async def get_maintenance_task(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await maintenance_tasks.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Zadatak nije pronađen")
    result = maintenance_tasks.to_dict(item)
    junction_ids = await _get_task_unit_ids(id)
    if item.property_unit_id and item.property_unit_id not in junction_ids:
        junction_ids.insert(0, item.property_unit_id)
    result["property_unit_ids"] = junction_ids
    return result


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

    new_unit_ids = await _apply_unit_changes(id, existing, update_data)

    updated = await maintenance_tasks.update_by_id(id, update_data)
    result = maintenance_tasks.to_dict(updated)
    result["property_unit_ids"] = new_unit_ids
    return result


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

    new_unit_ids = await _apply_unit_changes(id, existing, update_data)

    updated = await maintenance_tasks.update_by_id(id, update_data)
    result = maintenance_tasks.to_dict(updated)
    result["property_unit_ids"] = new_unit_ids
    return result


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

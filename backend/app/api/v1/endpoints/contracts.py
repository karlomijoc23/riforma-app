import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional

from app.api import deps
from app.db.repositories.instance import (
    parking_spaces,
    property_units,
    ugovori,
    users,
)
from app.db.session import get_async_session_factory
from app.db.transaction import db_transaction
from app.models.domain import (
    ApprovalStatus,
    ParkingStatus,
    PropertyUnitStatus,
    StatusUgovora,
)
from app.models.tables import UgovoriRow
from app.services.approval_service import (
    build_approval_fields_for_create,
    get_approvers_for_scope,
    user_can_approve_leases,
)
from app.core.email import send_email
from app.core.time import local_today
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_, text

logger = logging.getLogger(__name__)

EXPIRY_WARNING_DAYS = 30

router = APIRouter()

# Per-process asyncio locks keyed by (resource_kind, resource_id). Used as a
# fallback when the database does not support advisory locks (SQLite in
# tests). Keeps test concurrency honest; production uses MariaDB GET_LOCK
# which is cross-process.
_RESOURCE_LOCKS: Dict[str, asyncio.Lock] = {}
_RESOURCE_LOCKS_GUARD = asyncio.Lock()


async def _get_resource_asyncio_lock(key: str) -> asyncio.Lock:
    async with _RESOURCE_LOCKS_GUARD:
        lock = _RESOURCE_LOCKS.get(key)
        if lock is None:
            lock = asyncio.Lock()
            _RESOURCE_LOCKS[key] = lock
        return lock


@asynccontextmanager
async def _advisory_lock(
    resource_kind: str,
    resource_id: str,
    label: str,
    timeout: int = 5,
):
    """Acquire a lock scoped to one rentable resource (unit or parking).

    Prevents the TOCTOU race where two concurrent requests both pass the
    overlap check and then both insert a contract for the same resource.

    - MariaDB: cross-process advisory lock via GET_LOCK.
    - SQLite/other: process-local asyncio.Lock (sufficient for single-worker
      test runs; production should not run on SQLite).
    """
    if not resource_id:
        yield
        return

    key = f"{resource_kind}:{resource_id}"
    lock_name = f"contract_{resource_kind}_{resource_id}"
    timeout_msg = f"Nije moguće zaključati {label} — pokušajte ponovo."

    from app.core.config import get_settings as _get_settings
    db_url = _get_settings().DB_SETTINGS.sqlalchemy_url()
    if db_url.startswith("sqlite"):
        lock = await _get_resource_asyncio_lock(key)
        try:
            await asyncio.wait_for(lock.acquire(), timeout=timeout)
        except asyncio.TimeoutError:
            raise HTTPException(status_code=409, detail=timeout_msg)
        try:
            yield
        finally:
            lock.release()
        return

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        async with session.begin():
            result = await session.execute(
                text("SELECT GET_LOCK(:name, :timeout)"),
                {"name": lock_name, "timeout": timeout},
            )
            acquired = result.scalar()
            if not acquired:
                raise HTTPException(status_code=409, detail=timeout_msg)
            try:
                yield
            finally:
                await session.execute(
                    text("SELECT RELEASE_LOCK(:name)"),
                    {"name": lock_name},
                )


@asynccontextmanager
async def advisory_lock_for_unit(unit_id: str, timeout: int = 5):
    async with _advisory_lock("unit", unit_id, "jedinicu", timeout):
        yield


@asynccontextmanager
async def advisory_lock_for_parking(parking_id: str, timeout: int = 5):
    async with _advisory_lock("parking", parking_id, "parkirno mjesto", timeout):
        yield


@asynccontextmanager
async def advisory_lock_for_resource(
    resource: "tuple[str, str]", timeout: int = 5
):
    """Dispatch to the right per-kind lock from a (kind, id) pair."""
    kind, rid = resource
    if kind == "unit":
        async with advisory_lock_for_unit(rid, timeout):
            yield
    elif kind == "parking":
        async with advisory_lock_for_parking(rid, timeout):
            yield
    else:
        raise ValueError(f"Unknown lockable resource kind: {kind}")


def compute_contract_status(datum_zavrsetka) -> StatusUgovora:
    """Compute correct status based on end date vs local 'today'.

    Uses the business timezone (Europe/Zagreb by default) rather than
    server-local UTC so the day boundary matches what the user sees on
    their calendar.
    """
    today = local_today()
    if isinstance(datum_zavrsetka, str):
        end = date.fromisoformat(datum_zavrsetka)
    elif isinstance(datum_zavrsetka, date):
        end = datum_zavrsetka
    else:
        return StatusUgovora.AKTIVNO

    if end < today:
        return StatusUgovora.ISTEKAO
    from datetime import timedelta

    if end <= today + timedelta(days=EXPIRY_WARNING_DAYS):
        return StatusUgovora.NA_ISTEKU
    return StatusUgovora.AKTIVNO


class ContractCreate(BaseModel):
    interna_oznaka: str = Field(max_length=100)
    nekretnina_id: str = Field(max_length=100)
    zakupnik_id: str = Field(max_length=100)
    # Legacy single-unit pointer. Still accepted; if `property_unit_ids` is
    # also given, the two are merged with `property_unit_id` becoming the
    # primary unit.
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    # New M2M field — one contract can cover multiple units within the same
    # nekretnina. Empty list / None means "no specific unit" (whole-property
    # contract). All entries must belong to `nekretnina_id`.
    property_unit_ids: Optional[List[str]] = None
    # Parking spaces covered by this contract. Independent of units —
    # a contract may be parking-only, units-only, or a mix. All entries
    # must belong to `nekretnina_id`.
    parking_ids: Optional[List[str]] = None
    datum_potpisivanja: Optional[date] = None
    datum_pocetka: date
    datum_zavrsetka: date
    trajanje_mjeseci: int = Field(ge=0)
    opcija_produljenja: bool = False
    uvjeti_produljenja: Optional[str] = Field(default=None, max_length=2000)
    rok_otkaza_dani: Optional[int] = None
    osnovna_zakupnina: float = 0
    zakupnina_po_m2: Optional[float] = None
    cam_troskovi: Optional[float] = None
    polog_depozit: Optional[float] = None
    garancija: Optional[float] = None
    indeksacija: bool = False
    indeks: Optional[str] = Field(default=None, max_length=200)
    formula_indeksacije: Optional[str] = Field(default=None, max_length=500)
    obveze_odrzavanja: Optional[str] = Field(default=None, max_length=2000)
    namjena_prostora: Optional[str] = Field(default=None, max_length=500)
    rezije_brojila: Optional[str] = Field(default=None, max_length=500)
    status: StatusUgovora = StatusUgovora.AKTIVNO
    napomena: Optional[str] = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.datum_pocetka and self.datum_zavrsetka:
            if self.datum_pocetka > self.datum_zavrsetka:
                raise ValueError("Datum početka ne može biti nakon" " datuma završetka")
        return self

    @model_validator(mode="after")
    def validate_rent_fields(self):
        # Either set osnovna_zakupnina (fixed total) OR zakupnina_po_m2 (computed
        # from unit area), never both. Silent-ignore of po_m2 when osnovna is set
        # has caused bills to be off by thousands of euros in the past.
        if (self.osnovna_zakupnina or 0) > 0 and (self.zakupnina_po_m2 or 0) > 0:
            raise ValueError(
                "Postavite samo jedno: 'osnovna_zakupnina' (ukupni mjesečni iznos)"
                " ILI 'zakupnina_po_m2' (sustav će izračunati iz površine jedinice)."
            )
        return self


class ContractUpdate(BaseModel):
    interna_oznaka: Optional[str] = Field(default=None, max_length=100)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    zakupnik_id: Optional[str] = Field(default=None, max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
    # Replace the full unit set when present. None means "leave units alone".
    property_unit_ids: Optional[List[str]] = None
    # Replace the parking set when present. None means "leave parkings alone".
    parking_ids: Optional[List[str]] = None
    datum_potpisivanja: Optional[date] = None
    datum_pocetka: Optional[date] = None
    datum_zavrsetka: Optional[date] = None
    trajanje_mjeseci: Optional[int] = None
    opcija_produljenja: Optional[bool] = None
    uvjeti_produljenja: Optional[str] = Field(default=None, max_length=2000)
    rok_otkaza_dani: Optional[int] = None
    osnovna_zakupnina: Optional[float] = None
    zakupnina_po_m2: Optional[float] = None
    cam_troskovi: Optional[float] = None
    polog_depozit: Optional[float] = None
    garancija: Optional[float] = None
    indeksacija: Optional[bool] = None
    indeks: Optional[str] = Field(default=None, max_length=200)
    formula_indeksacije: Optional[str] = Field(default=None, max_length=500)
    obveze_odrzavanja: Optional[str] = Field(default=None, max_length=2000)
    namjena_prostora: Optional[str] = Field(default=None, max_length=500)
    rezije_brojila: Optional[str] = Field(default=None, max_length=500)
    status: Optional[StatusUgovora] = None
    napomena: Optional[str] = Field(default=None, max_length=5000)


class ApprovalCommentBody(BaseModel):
    komentar: Optional[str] = Field(default=None, max_length=5000)


async def check_contract_overlap(
    unit_id: str,
    start_date: date,
    end_date: date,
    exclude_contract_id: Optional[str] = None,
):
    """
    Check if there is any approved/legacy active contract for the given unit
    in the given time range.

    Overlap logic uses strict inequality so that back-to-back contracts
    (old contract ends on day X, new contract starts on day X) do not
    collide — the existing contract's end day is its last day of tenure,
    and the new contract's start day is its first day.

    Looks at BOTH the legacy `property_unit_id` column and the new
    `ugovor_units` junction so a multi-unit contract created via the new
    M2M path is still seen by checks that only know the legacy field, and
    vice-versa.
    """
    if not unit_id:
        return

    from app.models.tables import ugovor_units as _junction
    from sqlalchemy import select as _select

    # Find every contract id that links to this unit through the junction.
    junction_subq = (
        _select(_junction.c.ugovor_id)
        .where(_junction.c.property_unit_id == unit_id)
        .scalar_subquery()
    )

    conditions = [
        or_(
            UgovoriRow.property_unit_id == unit_id,
            UgovoriRow.id.in_(junction_subq),
        ),
        UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
        or_(
            UgovoriRow.approval_status == ApprovalStatus.APPROVED.value,
            UgovoriRow.approval_status.is_(None),
        ),
        UgovoriRow.datum_pocetka < end_date,
        UgovoriRow.datum_zavrsetka > start_date,
    ]

    if exclude_contract_id:
        conditions.append(UgovoriRow.id != exclude_contract_id)

    overlap = await ugovori.find_one(extra_conditions=conditions)
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Postoji preklapanje s ugovorom "
                f"{overlap.interna_oznaka} za ovaj period."
            ),
        )


async def _resolve_contract_unit_ids(item_data: dict) -> List[str]:
    """Combine legacy `property_unit_id` and new `property_unit_ids` payload
    fields into a deduplicated, ordered list. The first element (if any)
    becomes the "primary" unit stored on `UgovoriRow.property_unit_id`.

    Validates that every unit exists and belongs to the contract's property.
    """
    unit_ids: List[str] = []
    primary = item_data.get("property_unit_id")
    if primary:
        unit_ids.append(primary)
    for uid in (item_data.get("property_unit_ids") or []):
        if uid and uid not in unit_ids:
            unit_ids.append(uid)

    if not unit_ids:
        return []

    nekretnina_id = item_data.get("nekretnina_id")
    for uid in unit_ids:
        unit = await property_units.get_by_id(uid)
        if not unit:
            raise HTTPException(
                status_code=400,
                detail=f"Jedinica '{uid}' ne postoji.",
            )
        if nekretnina_id and unit.nekretnina_id != nekretnina_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Jedinica '{unit.oznaka or uid}' ne pripada navedenoj"
                    " nekretnini."
                ),
            )
    return unit_ids


async def _set_contract_units(
    contract_id: str,
    unit_ids: List[str],
    *,
    session=None,
) -> None:
    """Replace the junction rows for a contract with `unit_ids`.

    When a `session` is supplied (the caller's open transaction), the
    delete + insert run inside that transaction so a junction failure
    rolls back the contract row too. Otherwise we open our own.
    """
    from app.db.session import get_async_session_factory
    from app.models.tables import ugovor_units as _junction
    from sqlalchemy import delete as _delete, insert as _insert

    async def _do(s):
        await s.execute(
            _delete(_junction).where(_junction.c.ugovor_id == contract_id)
        )
        if unit_ids:
            await s.execute(
                _insert(_junction),
                [
                    {"ugovor_id": contract_id, "property_unit_id": uid}
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


async def _get_contract_unit_ids(contract_id: str) -> List[str]:
    """Return all units linked to the contract via the junction."""
    from app.db.session import get_async_session_factory
    from app.models.tables import ugovor_units as _junction
    from sqlalchemy import select as _select

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            _select(_junction.c.property_unit_id).where(
                _junction.c.ugovor_id == contract_id
            )
        )
        return [row[0] for row in result.all()]


async def _sync_units_status(unit_ids: List[str], target: PropertyUnitStatus) -> None:
    """Set status on every unit in the list. Used when contract status
    changes and the linked units must follow."""
    for uid in unit_ids:
        if uid:
            await property_units.update_by_id(uid, {"status": target})


# ---------------------------------------------------------------------------
# Parking helpers (mirror of the unit helpers above). Parking has no legacy
# primary FK on UgovoriRow — the junction table is the only source of truth.
# ---------------------------------------------------------------------------


async def check_parking_overlap(
    parking_id: str,
    start_date: date,
    end_date: date,
    exclude_contract_id: Optional[str] = None,
):
    """Reject if any approved contract already covers this parking in the
    given date range. Same semantics as `check_contract_overlap` for units
    (strict inequality so back-to-back contracts do not collide)."""
    if not parking_id:
        return

    from app.models.tables import ugovor_parkings as _junction
    from sqlalchemy import select as _select

    junction_subq = (
        _select(_junction.c.ugovor_id)
        .where(_junction.c.parking_id == parking_id)
        .scalar_subquery()
    )

    conditions = [
        UgovoriRow.id.in_(junction_subq),
        UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
        or_(
            UgovoriRow.approval_status == ApprovalStatus.APPROVED.value,
            UgovoriRow.approval_status.is_(None),
        ),
        UgovoriRow.datum_pocetka < end_date,
        UgovoriRow.datum_zavrsetka > start_date,
    ]
    if exclude_contract_id:
        conditions.append(UgovoriRow.id != exclude_contract_id)

    overlap = await ugovori.find_one(extra_conditions=conditions)
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Postoji preklapanje s ugovorom "
                f"{overlap.interna_oznaka} za parkirno mjesto u ovom periodu."
            ),
        )


async def _resolve_contract_parking_ids(item_data: dict) -> List[str]:
    """Validate every parking id in `parking_ids`: must exist and belong to
    the contract's nekretnina. Returns a deduplicated, ordered list."""
    raw = item_data.get("parking_ids") or []
    parking_ids: List[str] = []
    for pid in raw:
        if pid and pid not in parking_ids:
            parking_ids.append(pid)

    if not parking_ids:
        return []

    nekretnina_id = item_data.get("nekretnina_id")
    for pid in parking_ids:
        space = await parking_spaces.get_by_id(pid)
        if not space:
            raise HTTPException(
                status_code=400,
                detail=f"Parkirno mjesto '{pid}' ne postoji.",
            )
        if nekretnina_id and space.nekretnina_id != nekretnina_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Parkirno mjesto '{space.internal_id or pid}' ne pripada"
                    " navedenoj nekretnini."
                ),
            )
    return parking_ids


async def _set_contract_parkings(
    contract_id: str,
    parking_ids: List[str],
    *,
    session=None,
) -> None:
    """Replace the junction rows for a contract with `parking_ids`.

    Same caller-session pattern as `_set_contract_units` so the parking
    junction inserts roll back together with the contract row when the
    caller is inside an open transaction.
    """
    from app.db.session import get_async_session_factory
    from app.models.tables import ugovor_parkings as _junction
    from sqlalchemy import delete as _delete, insert as _insert

    async def _do(s):
        await s.execute(
            _delete(_junction).where(_junction.c.ugovor_id == contract_id)
        )
        if parking_ids:
            await s.execute(
                _insert(_junction),
                [
                    {"ugovor_id": contract_id, "parking_id": pid}
                    for pid in parking_ids
                ],
            )

    if session is not None:
        await _do(session)
        return

    session_factory = get_async_session_factory()
    async with session_factory() as own_session:
        async with own_session.begin():
            await _do(own_session)


async def _get_contract_parking_ids(contract_id: str) -> List[str]:
    """Return all parkings linked to the contract via the junction."""
    from app.db.session import get_async_session_factory
    from app.models.tables import ugovor_parkings as _junction
    from sqlalchemy import select as _select

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            _select(_junction.c.parking_id).where(
                _junction.c.ugovor_id == contract_id
            )
        )
        return [row[0] for row in result.all()]


async def _sync_parkings_status(
    parking_ids: List[str], target: ParkingStatus
) -> None:
    """Set status on every parking in the list."""
    for pid in parking_ids:
        if pid:
            await parking_spaces.update_by_id(pid, {"status": target})


async def _free_removed_units(
    unit_ids: List[str], excluded_contract_id: str
) -> None:
    """For each unit id, set status DOSTUPNO unless ANOTHER active contract
    still claims the unit (legacy primary FK OR `ugovor_units` junction).

    Used when units are removed from a contract via update — without this
    the unit stays IZNAJMLJENO with no contract backing it.
    """
    from app.models.tables import ugovor_units as _junction
    from sqlalchemy import select as _select

    for uid in unit_ids:
        if not uid:
            continue
        junction_subq = (
            _select(_junction.c.ugovor_id)
            .where(_junction.c.property_unit_id == uid)
            .scalar_subquery()
        )
        other_active = await ugovori.find_one(
            extra_conditions=[
                or_(
                    UgovoriRow.property_unit_id == uid,
                    UgovoriRow.id.in_(junction_subq),
                ),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                UgovoriRow.id != excluded_contract_id,
            ]
        )
        if not other_active:
            await property_units.update_by_id(
                uid, {"status": PropertyUnitStatus.DOSTUPNO.value}
            )


async def _free_removed_parkings(
    parking_ids: List[str], excluded_contract_id: str
) -> None:
    """Mirror of `_free_removed_units` for parking spaces (no legacy FK)."""
    from app.models.tables import ugovor_parkings as _pjunction
    from sqlalchemy import select as _select

    for pid in parking_ids:
        if not pid:
            continue
        junction_subq = (
            _select(_pjunction.c.ugovor_id)
            .where(_pjunction.c.parking_id == pid)
            .scalar_subquery()
        )
        other_active = await ugovori.find_one(
            extra_conditions=[
                UgovoriRow.id.in_(junction_subq),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                UgovoriRow.id != excluded_contract_id,
            ]
        )
        if not other_active:
            await parking_spaces.update_by_id(
                pid, {"status": ParkingStatus.DOSTUPNO.value}
            )


def _resource_targets(
    unit_ids: List[str], parking_ids: List[str]
) -> List[tuple]:
    """Return a deterministic, sorted list of (kind, id) tuples that need
    to be advisory-locked. Sorted to avoid deadlocks when two contract
    inserts share resources."""
    targets = [("unit", uid) for uid in unit_ids if uid]
    targets.extend(("parking", pid) for pid in parking_ids if pid)
    targets.sort()
    return targets


async def calculate_rent_if_needed(
    item_data: dict, unit_ids: Optional[List[str]] = None
):
    """Compute `osnovna_zakupnina` from `zakupnina_po_m2` when only the
    per-m² rate was provided.

    For a multi-unit contract the per-m² rate is multiplied by the SUM of
    unit areas, not just the primary unit. Caller may pass an explicit
    `unit_ids` list (recommended); otherwise the legacy `property_unit_id`
    + payload `property_unit_ids` are merged from `item_data`.
    """
    if not (
        item_data.get("zakupnina_po_m2")
        and item_data.get("osnovna_zakupnina", 0) == 0
    ):
        return item_data

    # Resolve unit ids: explicit arg wins, else read from item_data.
    if unit_ids is None:
        unit_ids = []
        primary = item_data.get("property_unit_id")
        if primary:
            unit_ids.append(primary)
        for uid in item_data.get("property_unit_ids") or []:
            if uid and uid not in unit_ids:
                unit_ids.append(uid)

    if not unit_ids:
        return item_data

    total_area = 0.0
    for uid in unit_ids:
        unit = await property_units.get_by_id(uid)
        if unit and unit.povrsina_m2:
            total_area += float(unit.povrsina_m2)

    if total_area > 0:
        item_data["osnovna_zakupnina"] = round(
            float(item_data["zakupnina_po_m2"]) * total_area, 2
        )
    return item_data


# ---------------------------------------------------------------------------
# Email template helpers for approval workflow
# ---------------------------------------------------------------------------


def _build_approval_request_email(
    contract: Dict[str, Any], submitter: Dict[str, Any]
) -> str:
    """Build HTML email requesting approval for a contract."""
    oznaka = escape(contract.get("interna_oznaka", "N/A"))
    submitter_name = escape(submitter.get("name") or submitter.get("id", "N/A"))
    return (
        '<div style="font-family:sans-serif;max-width:600px;'
        'margin:0 auto;">'
        '<div style="background:#1e293b;color:white;padding:20px;'
        'border-radius:8px 8px 0 0;">'
        '<h2 style="margin:0;">Zahtjev za odobrenje ugovora</h2>'
        '<p style="margin:4px 0 0;opacity:0.8;">Riforma</p>'
        "</div>"
        '<div style="padding:20px;background:#f8fafc;'
        'border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">'
        f"<p>Korisnik <strong>{submitter_name}</strong>"
        f" je poslao ugovor "
        f"<strong>{oznaka}</strong> na odobrenje.</p>"
        "<p>Prijavite se na platformu kako biste pregledali"
        " i odobrili ugovor.</p>"
        '<p style="margin-top:16px;color:#64748b;'
        'font-size:13px;">'
        "Ova poruka je automatski generirana.</p>"
        "</div></div>"
    )


def _build_approved_email(contract: Dict[str, Any], approver: Dict[str, Any]) -> str:
    """Build HTML email notifying that a contract was approved."""
    oznaka = escape(contract.get("interna_oznaka", "N/A"))
    approver_name = escape(approver.get("name") or approver.get("id", "N/A"))
    return (
        '<div style="font-family:sans-serif;max-width:600px;'
        'margin:0 auto;">'
        '<div style="background:#16a34a;color:white;padding:20px;'
        'border-radius:8px 8px 0 0;">'
        '<h2 style="margin:0;">Ugovor odobren</h2>'
        '<p style="margin:4px 0 0;opacity:0.8;">Riforma</p>'
        "</div>"
        '<div style="padding:20px;background:#f8fafc;'
        'border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">'
        f"<p>Ugovor <strong>{oznaka}</strong> je odobren"
        f" od strane <strong>{approver_name}</strong>.</p>"
        '<p style="margin-top:16px;color:#64748b;'
        'font-size:13px;">'
        "Ova poruka je automatski generirana.</p>"
        "</div></div>"
    )


def _build_rejected_email(
    contract: Dict[str, Any],
    rejector: Dict[str, Any],
    comment: str,
) -> str:
    """Build HTML email notifying that a contract was rejected."""
    oznaka = escape(contract.get("interna_oznaka", "N/A"))
    rejector_name = escape(rejector.get("name") or rejector.get("id", "N/A"))
    safe_comment = escape(comment)
    return (
        '<div style="font-family:sans-serif;max-width:600px;'
        'margin:0 auto;">'
        '<div style="background:#dc2626;color:white;padding:20px;'
        'border-radius:8px 8px 0 0;">'
        '<h2 style="margin:0;">Ugovor odbijen</h2>'
        '<p style="margin:4px 0 0;opacity:0.8;">Riforma</p>'
        "</div>"
        '<div style="padding:20px;background:#f8fafc;'
        'border:1px solid #e2e8f0;border-radius:0 0 8px 8px;">'
        f"<p>Ugovor <strong>{oznaka}</strong> je odbijen"
        f" od strane <strong>{rejector_name}</strong>.</p>"
        f"<p><strong>Razlog:</strong> {safe_comment}</p>"
        '<p style="margin-top:16px;color:#64748b;'
        'font-size:13px;">'
        "Ova poruka je automatski generirana.</p>"
        "</div></div>"
    )


async def _notify_approvers(
    contract: Dict[str, Any], submitter: Dict[str, Any]
) -> None:
    """Send approval request emails to all users with leases:approve scope."""
    try:
        approvers: List[Dict[str, Any]] = await get_approvers_for_scope(
            "leases:approve"
        )
        html = _build_approval_request_email(contract, submitter)
        oznaka = contract.get("interna_oznaka", "N/A")
        subject = f"Riforma: Ugovor {oznaka} čeka odobrenje"
        for approver in approvers:
            email = approver.get("email")
            if email:
                await send_email(email, subject, html)
    except Exception:
        logger.exception("Neuspjelo slanje obavijesti odobriteljima")


async def _notify_creator(
    contract: Dict[str, Any],
    actor: Dict[str, Any],
    approved: bool,
    comment: Optional[str] = None,
) -> None:
    """Send approval/rejection notification to the contract creator."""
    try:
        creator_id = contract.get("created_by")
        if not creator_id:
            return
        creator = await users.get_by_id(creator_id)
        if not creator or not creator.email:
            return

        oznaka = contract.get("interna_oznaka", "N/A")
        if approved:
            html = _build_approved_email(contract, actor)
            subject = f"Riforma: Ugovor {oznaka} je odobren"
        else:
            html = _build_rejected_email(contract, actor, comment or "")
            subject = f"Riforma: Ugovor {oznaka} je odbijen"
        await send_email(creator.email, subject, html)
    except Exception:
        logger.exception("Neuspjelo slanje obavijesti kreatoru ugovora")


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------


@router.get("", dependencies=[Depends(deps.require_scopes("leases:read"))])
async def get_contracts(
    response: Response,
    skip: int = 0,
    limit: int = 100,
    nekretnina_id: Optional[str] = None,
    approval_status: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    filters: Dict[str, Any] = {}
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id
    if approval_status:
        filters["approval_status"] = approval_status

    items, total = await ugovori.find_many(
        filters=filters,
        order_by="created_at",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    response.headers["X-Total-Count"] = str(total)

    # Batch-load junction tables so the response includes the full unit +
    # parking sets for every contract in the page, not just the legacy
    # primary FK. Two queries, no N+1.
    from app.models.tables import ugovor_parkings as _pjunction
    from app.models.tables import ugovor_units as _ujunction
    from sqlalchemy import select as _select

    contract_ids = [item.id for item in items]
    units_by_contract: Dict[str, List[str]] = {}
    parkings_by_contract: Dict[str, List[str]] = {}
    if contract_ids:
        session_factory = get_async_session_factory()
        async with session_factory() as session:
            unit_rows = await session.execute(
                _select(
                    _ujunction.c.ugovor_id, _ujunction.c.property_unit_id
                ).where(_ujunction.c.ugovor_id.in_(contract_ids))
            )
            for ugovor_id, unit_id in unit_rows.all():
                units_by_contract.setdefault(ugovor_id, []).append(unit_id)
            parking_rows = await session.execute(
                _select(
                    _pjunction.c.ugovor_id, _pjunction.c.parking_id
                ).where(_pjunction.c.ugovor_id.in_(contract_ids))
            )
            for ugovor_id, parking_id in parking_rows.all():
                parkings_by_contract.setdefault(ugovor_id, []).append(parking_id)

    # Real-time status correction based on dates
    results = []
    for item in items:
        item_dict = ugovori.to_dict(item)
        current = item_dict.get("status")
        if current in (
            StatusUgovora.AKTIVNO.value,
            StatusUgovora.NA_ISTEKU.value,
        ) and item_dict.get("datum_zavrsetka"):
            correct = compute_contract_status(item.datum_zavrsetka).value
            if correct != current:
                item_dict["status"] = correct
        # Merge legacy primary FK with the junction so the front-end
        # sees the complete coverage in one place.
        unit_set = list(units_by_contract.get(item.id, []))
        if item.property_unit_id and item.property_unit_id not in unit_set:
            unit_set.insert(0, item.property_unit_id)
        item_dict["property_unit_ids"] = unit_set
        item_dict["parking_ids"] = parkings_by_contract.get(item.id, [])
        results.append(item_dict)

    return results


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("leases:create")),
        Depends(deps.require_tenant()),
    ],
)
async def create_contract(
    item_in: ContractCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item_data = item_in.model_dump()

    # 0. Duplicate check — same oznaka + nekretnina is forbidden whenever
    # the existing contract is still in any "live" state (active rental
    # or pending approval). Rejected / withdrawn drafts don't block; the
    # `(tenant_id, interna_oznaka)` UNIQUE in the DB would otherwise crash
    # on insert as a 500 IntegrityError.
    existing_dup = await ugovori.find_one(
        interna_oznaka=item_data.get("interna_oznaka"),
        nekretnina_id=item_data.get("nekretnina_id"),
        extra_conditions=[
            or_(
                UgovoriRow.status.in_(
                    [
                        StatusUgovora.AKTIVNO.value,
                        StatusUgovora.NA_ISTEKU.value,
                    ]
                ),
                UgovoriRow.approval_status == ApprovalStatus.PENDING_APPROVAL.value,
                UgovoriRow.approval_status == ApprovalStatus.DRAFT.value,
            ),
        ],
    )
    if existing_dup:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Već postoji ugovor s oznakom "
                f"'{item_data['interna_oznaka']}' za ovu nekretninu."
            ),
        )

    # Resolve full unit + parking list (legacy + M2M payload merged & validated).
    unit_ids = await _resolve_contract_unit_ids(item_data)
    parking_ids = await _resolve_contract_parking_ids(item_data)
    primary_unit = unit_ids[0] if unit_ids else None
    item_data["property_unit_id"] = primary_unit
    item_data.pop("property_unit_ids", None)
    item_data.pop("parking_ids", None)

    # Lock every involved resource (unit and parking) so two concurrent
    # requests for any of them serialise on overlap+insert. Sorted to
    # avoid deadlocks if two contracts share resources.
    lock_targets = _resource_targets(unit_ids, parking_ids)

    async def _create_under_locks(remaining: List[tuple]):
        if not remaining:
            # Inside all locks — perform overlap checks + insert.
            for uid in unit_ids:
                await check_contract_overlap(
                    uid,
                    item_data["datum_pocetka"],
                    item_data["datum_zavrsetka"],
                )
            for pid in parking_ids:
                await check_parking_overlap(
                    pid,
                    item_data["datum_pocetka"],
                    item_data["datum_zavrsetka"],
                )

            normalised = await calculate_rent_if_needed(item_data, unit_ids)
            if normalised.get("datum_zavrsetka"):
                normalised["status"] = compute_contract_status(
                    normalised["datum_zavrsetka"]
                ).value
            normalised["created_by"] = current_user["id"]
            normalised.update(
                build_approval_fields_for_create(current_user, "leases")
            )

            async with db_transaction() as txn:
                created = await ugovori.create(normalised, session=txn)
                # Both AKTIVNO and NA_ISTEKU represent an active rental;
                # short contracts created within 30 days of expiry land
                # as NA_ISTEKU directly and still need their resources to
                # be marked iznajmljeno.
                if normalised.get(
                    "approval_status"
                ) == ApprovalStatus.APPROVED.value and normalised.get(
                    "status"
                ) in (
                    StatusUgovora.AKTIVNO.value,
                    StatusUgovora.NA_ISTEKU.value,
                ):
                    for uid in unit_ids:
                        await property_units.update_by_id(
                            uid,
                            {"status": PropertyUnitStatus.IZNAJMLJENO},
                            session=txn,
                        )
                    for pid in parking_ids:
                        await parking_spaces.update_by_id(
                            pid,
                            {"status": ParkingStatus.IZNAJMLJENO},
                            session=txn,
                        )
                # Populate junctions inside the same transaction so a
                # failure rolls back the contract row too.
                if unit_ids:
                    await _set_contract_units(
                        created.id, unit_ids, session=txn
                    )
                if parking_ids:
                    await _set_contract_parkings(
                        created.id, parking_ids, session=txn
                    )
            return created

        head, *tail = remaining
        async with advisory_lock_for_resource(head):
            return await _create_under_locks(tail)

    if lock_targets:
        new_item = await _create_under_locks(lock_targets)
    else:
        # Whole-property contract — no per-resource lock to take.
        normalised = await calculate_rent_if_needed(item_data)
        if normalised.get("datum_zavrsetka"):
            normalised["status"] = compute_contract_status(
                normalised["datum_zavrsetka"]
            ).value
        normalised["created_by"] = current_user["id"]
        normalised.update(
            build_approval_fields_for_create(current_user, "leases")
        )
        async with db_transaction() as txn:
            new_item = await ugovori.create(normalised, session=txn)

    result = ugovori.to_dict(new_item)
    result["property_unit_ids"] = unit_ids
    result["parking_ids"] = parking_ids
    return result


@router.get(
    "/report/export-pdf",
    dependencies=[Depends(deps.require_scopes("leases:read"))],
)
async def export_contracts_report_pdf(
    status: Optional[str] = None,
    nekretnina_id: Optional[str] = None,
    zakupnik_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Server-side PDF of the contracts overview report.

    All filter params are optional — without them this returns the
    full portfolio view (matches the `ContractReport` page); with
    them it matches the `UgovoriPage` filtered listing.
    """
    from app.services.contracts_report_pdf_service import (
        render_contracts_report_pdf,
    )

    pdf_bytes = await render_contracts_report_pdf(
        status=status,
        nekretnina_id=nekretnina_id,
        zakupnik_id=zakupnik_id,
        date_from=date_from,
        date_to=date_to,
    )
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                'attachment; filename="riforma-izvjestaj-ugovora.pdf"'
            ),
        },
    )


@router.get(
    "/{id}/export-pdf",
    dependencies=[Depends(deps.require_scopes("leases:read"))],
)
async def export_contract_pdf(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Render a branded PDF of the contract using the brand/ template.

    Uses WeasyPrint on the server — fonts, layout, and Croatian characters
    are guaranteed identical regardless of the client OS. Falls back with
    503 if WeasyPrint's native libraries aren't installed.
    """
    from app.services.contract_pdf_service import render_contract_pdf

    item = await ugovori.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    pdf_bytes = await render_contract_pdf(item)
    safe_ref = (item.interna_oznaka or id).replace("/", "-").replace(" ", "_")
    filename = f"ugovor-{safe_ref}.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


class AnnexPdfBody(BaseModel):
    nova_zakupnina: Optional[float] = None
    novi_datum_zavrsetka: Optional[str] = Field(default=None, max_length=20)
    dodatne_promjene: Optional[str] = Field(default=None, max_length=5000)
    body_text: Optional[str] = Field(default=None, max_length=20000)


@router.post(
    "/{id}/export-aneks-pdf",
    dependencies=[Depends(deps.require_scopes("leases:update"))],
)
async def export_annex_pdf(
    id: str,
    body: AnnexPdfBody = AnnexPdfBody(),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Render a branded PDF annex for an existing contract.

    Uses WeasyPrint + brand/aneks-template.html. The caller supplies the
    financial / date changes; body_text is free-form (typically the AI-
    generated annex text from /api/ai/generate-contract-annex, optionally
    edited by the user).
    """
    from app.services.contract_pdf_service import render_annex_pdf

    item = await ugovori.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    pdf_bytes = await render_annex_pdf(
        item,
        nova_zakupnina=body.nova_zakupnina,
        novi_datum_zavrsetka=body.novi_datum_zavrsetka,
        dodatne_promjene=body.dodatne_promjene,
        body_text=body.body_text,
    )
    safe_ref = (item.interna_oznaka or id).replace("/", "-").replace(" ", "_")
    filename = f"aneks-{safe_ref}.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("leases:read"))])
async def get_contract(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await ugovori.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Real-time status correction
    item_dict = ugovori.to_dict(item)
    current = item_dict.get("status")
    if current in (
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.NA_ISTEKU.value,
    ) and item_dict.get("datum_zavrsetka"):
        correct = compute_contract_status(item.datum_zavrsetka).value
        if correct != current:
            item_dict["status"] = correct

    item_dict["property_unit_ids"] = await _get_contract_unit_ids(id)
    item_dict["parking_ids"] = await _get_contract_parking_ids(id)
    return item_dict


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("leases:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_contract(
    id: str,
    item_in: ContractUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Approval guards
    existing_approval = existing.approval_status or ApprovalStatus.APPROVED.value
    if existing_approval == ApprovalStatus.PENDING_APPROVAL.value:
        if not user_can_approve_leases(current_user):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Ugovor koji čeka odobrenje ne može se uređivati."
                    " Prvo ga povucite."
                ),
            )

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return ugovori.to_dict(existing)

    # If previously rejected, reset to draft and clear approval comment
    if existing_approval == ApprovalStatus.REJECTED.value:
        update_data["approval_status"] = ApprovalStatus.DRAFT.value
        update_data["approval_comment"] = None

    # Prepare complete data for validation (merge existing with update)
    # We need dates and unit_ids to check overlap
    existing_dict = ugovori.to_dict(existing)
    merged_data = {**existing_dict, **update_data}

    # Convert string dates back to date objects if needed for overlap check helper
    def parse_date(d):
        if isinstance(d, str):
            try:
                return datetime.strptime(d, "%Y-%m-%d").date()
            except ValueError:
                return datetime.fromisoformat(d).date()
        return d

    # Resolve unit set BEFORE the overlap check. The caller may have sent:
    #   - only `property_unit_id` (legacy single-unit edit)
    #   - only `property_unit_ids` (replace the M2M set)
    #   - both (primary + extras)
    #   - neither (no unit change — use whatever is currently linked)
    raw_payload = item_in.model_dump(exclude_unset=True)
    parking_was_set = "parking_ids" in raw_payload

    # Snapshot the CURRENT unit + parking sets so we can free the resources
    # that get removed by this update. Without this, removing a unit from a
    # contract leaves it IZNAJMLJENO with no contract backing it.
    old_unit_ids = await _get_contract_unit_ids(id)
    if existing.property_unit_id and existing.property_unit_id not in old_unit_ids:
        old_unit_ids.append(existing.property_unit_id)
    old_parking_ids = await _get_contract_parking_ids(id)

    # Block changing nekretnina_id while contract has linked resources —
    # they would be left pointing at units/parkings of a different property.
    new_nekretnina_id = update_data.get("nekretnina_id")
    if (
        new_nekretnina_id
        and new_nekretnina_id != existing.nekretnina_id
        and (old_unit_ids or old_parking_ids)
    ):
        # Caller must explicitly clear or re-specify both sets in the same
        # request, otherwise resources straddle properties.
        if "property_unit_ids" not in raw_payload or "parking_ids" not in raw_payload:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Promjena nekretnine na ugovoru zahtijeva da u istom"
                    " zahtjevu pošaljete novi `property_unit_ids` i `parking_ids`"
                    " skupove (mogu biti prazni)."
                ),
            )

    if (
        "property_unit_id" in update_data
        or "property_unit_ids" in update_data
    ):
        ids_for_resolver = {
            "nekretnina_id": merged_data.get("nekretnina_id"),
            "property_unit_id": merged_data.get("property_unit_id"),
            "property_unit_ids": update_data.get("property_unit_ids"),
        }
        new_unit_ids = await _resolve_contract_unit_ids(ids_for_resolver)
        update_data["property_unit_id"] = new_unit_ids[0] if new_unit_ids else None
        update_data.pop("property_unit_ids", None)
    else:
        new_unit_ids = list(old_unit_ids)

    # Resolve parking set the same way. Parking has no legacy primary FK,
    # so the only signal is presence of `parking_ids` in the payload.
    if parking_was_set:
        new_parking_ids = await _resolve_contract_parking_ids({
            "nekretnina_id": merged_data.get("nekretnina_id"),
            "parking_ids": update_data.get("parking_ids"),
        })
        update_data.pop("parking_ids", None)
    else:
        new_parking_ids = list(old_parking_ids)

    # Overlap check across every involved resource, when dates or set changed.
    dates_changed = (
        "datum_pocetka" in update_data or "datum_zavrsetka" in update_data
    )
    unit_set_changed = "property_unit_id" in update_data
    if dates_changed or unit_set_changed or parking_was_set:
        start = parse_date(merged_data.get("datum_pocetka"))
        end = parse_date(merged_data.get("datum_zavrsetka"))
        if start and end:
            for uid in sorted(new_unit_ids):
                async with advisory_lock_for_unit(uid):
                    await check_contract_overlap(
                        uid, start, end, exclude_contract_id=id
                    )
            for pid in sorted(new_parking_ids):
                async with advisory_lock_for_parking(pid):
                    await check_parking_overlap(
                        pid, start, end, exclude_contract_id=id
                    )

    # 2. Financial Logic — use the resolved full unit set so multi-unit
    # contracts compute rent over total area, not just the primary unit.
    if "zakupnina_po_m2" in update_data and "osnovna_zakupnina" not in update_data:
        temp_merged = {**existing_dict, **update_data}
        temp_merged = await calculate_rent_if_needed(temp_merged, new_unit_ids)
        if temp_merged["osnovna_zakupnina"] != existing_dict.get("osnovna_zakupnina"):
            update_data["osnovna_zakupnina"] = temp_merged["osnovna_zakupnina"]

    updated = await ugovori.update_by_id(id, update_data)

    # Sync junction if the unit set was edited.
    if (
        "property_unit_id" in update_data
        or "property_unit_ids" in raw_payload
    ):
        await _set_contract_units(id, new_unit_ids)
    if parking_was_set:
        await _set_contract_parkings(id, new_parking_ids)

    # Free resources that were removed from this contract — without this
    # they keep their IZNAJMLJENO status with no contract backing them.
    removed_units = [u for u in old_unit_ids if u not in new_unit_ids]
    if removed_units:
        await _free_removed_units(removed_units, excluded_contract_id=id)
    removed_parkings = [p for p in old_parking_ids if p not in new_parking_ids]
    if removed_parkings:
        await _free_removed_parkings(removed_parkings, excluded_contract_id=id)

    # 3. Status Sync — propagate to ALL units AND parkings on the contract.
    new_status = update_data.get("status")
    if new_status:
        unit_target: Optional[PropertyUnitStatus] = None
        parking_target: Optional[ParkingStatus] = None
        if new_status in (StatusUgovora.AKTIVNO, StatusUgovora.NA_ISTEKU):
            unit_target = PropertyUnitStatus.IZNAJMLJENO
            parking_target = ParkingStatus.IZNAJMLJENO
        elif new_status in (
            StatusUgovora.RASKINUTO,
            StatusUgovora.ARHIVIRANO,
            StatusUgovora.ISTEKAO,
        ):
            unit_target = PropertyUnitStatus.DOSTUPNO
            parking_target = ParkingStatus.DOSTUPNO
        if unit_target is not None:
            await _sync_units_status(new_unit_ids, unit_target)
        if parking_target is not None:
            await _sync_parkings_status(new_parking_ids, parking_target)

    result = ugovori.to_dict(updated)
    result["property_unit_ids"] = new_unit_ids
    result["parking_ids"] = new_parking_ids
    return result


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("leases:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_contract(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Free EVERY unit linked to this contract (legacy primary + junction).
    linked_units = await _get_contract_unit_ids(id)
    if existing.property_unit_id and existing.property_unit_id not in linked_units:
        linked_units.append(existing.property_unit_id)

    linked_parkings = await _get_contract_parking_ids(id)

    is_active = existing.status in [
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.NA_ISTEKU.value,
    ]

    if is_active and linked_units:
        from app.models.tables import ugovor_units as _junction
        from sqlalchemy import select as _select

        for uid in linked_units:
            # Only free a unit if NO other active contract still claims it
            # (via primary FK or via the junction table).
            junction_subq = (
                _select(_junction.c.ugovor_id)
                .where(_junction.c.property_unit_id == uid)
                .scalar_subquery()
            )
            other_active = await ugovori.find_one(
                extra_conditions=[
                    or_(
                        UgovoriRow.property_unit_id == uid,
                        UgovoriRow.id.in_(junction_subq),
                    ),
                    UgovoriRow.status.in_(
                        [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                    ),
                    UgovoriRow.id != id,
                ],
            )
            if not other_active:
                await property_units.update_by_id(
                    uid, {"status": PropertyUnitStatus.DOSTUPNO}
                )

    if is_active and linked_parkings:
        from app.models.tables import ugovor_parkings as _pjunction
        from sqlalchemy import select as _select

        for pid in linked_parkings:
            junction_subq = (
                _select(_pjunction.c.ugovor_id)
                .where(_pjunction.c.parking_id == pid)
                .scalar_subquery()
            )
            other_active = await ugovori.find_one(
                extra_conditions=[
                    UgovoriRow.id.in_(junction_subq),
                    UgovoriRow.status.in_(
                        [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                    ),
                    UgovoriRow.id != id,
                ],
            )
            if not other_active:
                await parking_spaces.update_by_id(
                    pid, {"status": ParkingStatus.DOSTUPNO}
                )

    await ugovori.delete_by_id(id)
    return {"message": "Ugovor uspješno obrisan"}


# Valid status transitions. Terminal states (ISTEKAO, RASKINUTO, ARHIVIRANO)
# cannot go back to AKTIVNO — the correct workflow is to create a renewal.
# This prevents accidental re-activation of a finished contract from stepping
# over an active replacement and clashing on overlap/unit-status sync.
VALID_STATUS_TRANSITIONS = {
    StatusUgovora.AKTIVNO: {
        StatusUgovora.NA_ISTEKU,
        StatusUgovora.ISTEKAO,
        StatusUgovora.RASKINUTO,
        StatusUgovora.ARHIVIRANO,
    },
    StatusUgovora.NA_ISTEKU: {
        StatusUgovora.AKTIVNO,
        StatusUgovora.ISTEKAO,
        StatusUgovora.RASKINUTO,
        StatusUgovora.ARHIVIRANO,
    },
    StatusUgovora.ISTEKAO: {StatusUgovora.ARHIVIRANO},
    StatusUgovora.RASKINUTO: {StatusUgovora.ARHIVIRANO},
    StatusUgovora.ARHIVIRANO: set(),
}


class ContractStatusUpdate(BaseModel):
    novi_status: StatusUgovora


@router.put(
    "/{id}/status",
    dependencies=[
        Depends(deps.require_scopes("leases:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_contract_status(
    id: str,
    status_update: ContractStatusUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Only allow status changes on approved or legacy contracts
    existing_approval = existing.approval_status or ApprovalStatus.APPROVED.value
    if existing_approval not in (
        ApprovalStatus.APPROVED.value,
        None,
    ):
        raise HTTPException(
            status_code=422,
            detail="Promjena statusa dozvoljena je samo za odobrene ugovore.",
        )

    # Validate status transition
    current_status_str = existing.status or StatusUgovora.AKTIVNO.value
    try:
        current_status = StatusUgovora(current_status_str)
    except ValueError:
        current_status = StatusUgovora.AKTIVNO

    allowed = VALID_STATUS_TRANSITIONS.get(current_status, set())
    if (
        status_update.novi_status != current_status
        and status_update.novi_status not in allowed
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Nije moguća promjena statusa iz "
                f"'{current_status.value}' u '{status_update.novi_status.value}'"
            ),
        )

    await ugovori.update_by_id(id, {"status": status_update.novi_status.value})

    # Sync status on EVERY linked unit (junction + legacy primary) and
    # every linked parking (junction only).
    linked_units = await _get_contract_unit_ids(id)
    if existing.property_unit_id and existing.property_unit_id not in linked_units:
        linked_units.append(existing.property_unit_id)
    linked_parkings = await _get_contract_parking_ids(id)

    unit_target: Optional[PropertyUnitStatus] = None
    parking_target: Optional[ParkingStatus] = None
    if status_update.novi_status in (
        StatusUgovora.AKTIVNO,
        StatusUgovora.NA_ISTEKU,
    ):
        unit_target = PropertyUnitStatus.IZNAJMLJENO
        parking_target = ParkingStatus.IZNAJMLJENO
    elif status_update.novi_status in (
        StatusUgovora.RASKINUTO,
        StatusUgovora.ARHIVIRANO,
        StatusUgovora.ISTEKAO,
    ):
        unit_target = PropertyUnitStatus.DOSTUPNO
        parking_target = ParkingStatus.DOSTUPNO
    if unit_target is not None:
        await _sync_units_status(linked_units, unit_target)
    if parking_target is not None:
        await _sync_parkings_status(linked_parkings, parking_target)

    updated = await ugovori.get_by_id(id)
    result = ugovori.to_dict(updated)
    result["property_unit_ids"] = linked_units
    result["parking_ids"] = linked_parkings
    return result


# ---------------------------------------------------------------------------
# Approval workflow endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/{id}/submit-for-approval",
    dependencies=[
        Depends(deps.require_scopes("leases:create")),
        Depends(deps.require_tenant()),
    ],
)
async def submit_for_approval(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Submit a draft or rejected contract for approval."""
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Backward compat: missing field treated as already approved
    current_approval = existing.approval_status or ApprovalStatus.APPROVED.value
    if current_approval not in (
        ApprovalStatus.DRAFT.value,
        ApprovalStatus.REJECTED.value,
    ):
        raise HTTPException(
            status_code=422,
            detail="Samo ugovori u statusu 'draft' ili 'rejected' mogu se poslati na odobrenje.",
        )

    # Verify submitter is creator OR has leases:update scope
    is_creator = existing.created_by == current_user.get("id")
    has_update = "leases:update" in current_user.get(
        "scopes", []
    ) or "*" in current_user.get("scopes", [])
    if not is_creator and not has_update:
        raise HTTPException(
            status_code=403,
            detail=(
                "Samo kreator ugovora ili korisnik s ovlasti"
                " uređivanja može poslati na odobrenje."
            ),
        )

    now = datetime.now(timezone.utc)

    # All submissions go to pending — approval is always explicit
    update_fields: Dict[str, Any] = {
        "approval_status": ApprovalStatus.PENDING_APPROVAL.value,
        "submitted_for_approval_at": now,
        "submitted_by": current_user["id"],
        "approved_by": None,
        "approved_at": None,
        "approval_comment": None,
    }
    await ugovori.update_by_id(id, update_fields)

    # Notify approvers (non-critical)
    refreshed = await ugovori.get_by_id(id)
    refreshed_dict = ugovori.to_dict(refreshed) if refreshed else ugovori.to_dict(existing)
    await _notify_approvers(refreshed_dict, current_user)

    updated = await ugovori.get_by_id(id)
    return ugovori.to_dict(updated)


@router.post(
    "/{id}/approve",
    dependencies=[
        Depends(deps.require_scopes("leases:approve")),
        Depends(deps.require_tenant()),
    ],
)
async def approve_contract(
    id: str,
    body: ApprovalCommentBody = ApprovalCommentBody(),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Approve a pending contract."""
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    current_approval = existing.approval_status
    if current_approval != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo ugovori koji čekaju odobrenje mogu se odobriti.",
        )

    # Segregation of duties: the creator cannot approve their own contract.
    if existing.created_by and existing.created_by == current_user.get("id"):
        raise HTTPException(
            status_code=422,
            detail="Ne možete odobriti ugovor koji ste sami kreirali.",
        )

    # Run overlap check on every linked unit + parking.
    linked_units = await _get_contract_unit_ids(id)
    if existing.property_unit_id and existing.property_unit_id not in linked_units:
        linked_units.append(existing.property_unit_id)
    linked_parkings = await _get_contract_parking_ids(id)

    if linked_units or linked_parkings:
        def _parse_date(d):
            if isinstance(d, str):
                try:
                    return datetime.strptime(d, "%Y-%m-%d").date()
                except ValueError:
                    return datetime.fromisoformat(d).date()
            return d

        start = _parse_date(existing.datum_pocetka)
        end = _parse_date(existing.datum_zavrsetka)
        if start and end:
            for uid in sorted(linked_units):
                async with advisory_lock_for_unit(uid):
                    await check_contract_overlap(
                        uid, start, end, exclude_contract_id=id
                    )
            for pid in sorted(linked_parkings):
                async with advisory_lock_for_parking(pid):
                    await check_parking_overlap(
                        pid, start, end, exclude_contract_id=id
                    )

    now = datetime.now(timezone.utc)
    update_fields: Dict[str, Any] = {
        "approval_status": ApprovalStatus.APPROVED.value,
        "approved_by": current_user["id"],
        "approved_at": now,
        "approval_comment": body.komentar,
    }
    await ugovori.update_by_id(id, update_fields)

    # Mark every linked unit + parking IZNAJMLJENO when the contract is
    # currently active.
    contract_active = existing.status in (
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.AKTIVNO,
        StatusUgovora.NA_ISTEKU.value,
        StatusUgovora.NA_ISTEKU,
    )
    if contract_active and linked_units:
        await _sync_units_status(linked_units, PropertyUnitStatus.IZNAJMLJENO)
    if contract_active and linked_parkings:
        await _sync_parkings_status(linked_parkings, ParkingStatus.IZNAJMLJENO)

    # Notify creator
    refreshed = await ugovori.get_by_id(id)
    refreshed_dict = ugovori.to_dict(refreshed) if refreshed else ugovori.to_dict(existing)
    await _notify_creator(refreshed_dict, current_user, approved=True)

    updated = await ugovori.get_by_id(id)
    return ugovori.to_dict(updated)


@router.post(
    "/{id}/reject",
    dependencies=[
        Depends(deps.require_scopes("leases:approve")),
        Depends(deps.require_tenant()),
    ],
)
async def reject_contract(
    id: str,
    body: ApprovalCommentBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Reject a pending contract. Requires a non-empty comment."""
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    current_approval = existing.approval_status
    if current_approval != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo ugovori koji čekaju odobrenje mogu se odbiti.",
        )

    if not body.komentar or not body.komentar.strip():
        raise HTTPException(
            status_code=422,
            detail="Komentar je obavezan pri odbijanju ugovora.",
        )

    now = datetime.now(timezone.utc)
    update_fields: Dict[str, Any] = {
        "approval_status": ApprovalStatus.REJECTED.value,
        "approved_by": current_user["id"],
        "approved_at": now,
        "approval_comment": body.komentar.strip(),
    }
    await ugovori.update_by_id(id, update_fields)

    # Notify creator with rejection reason
    refreshed = await ugovori.get_by_id(id)
    refreshed_dict = ugovori.to_dict(refreshed) if refreshed else ugovori.to_dict(existing)
    await _notify_creator(
        refreshed_dict,
        current_user,
        approved=False,
        comment=body.komentar.strip(),
    )

    updated = await ugovori.get_by_id(id)
    return ugovori.to_dict(updated)


@router.post(
    "/{id}/withdraw",
    dependencies=[
        Depends(deps.require_scopes("leases:create")),
        Depends(deps.require_tenant()),
    ],
)
async def withdraw_contract(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Withdraw a pending contract back to draft."""
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    current_approval = existing.approval_status
    if current_approval != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo ugovori koji čekaju odobrenje mogu se povući.",
        )

    # Verify user is creator OR has leases:update scope
    is_creator = existing.created_by == current_user.get("id")
    has_update = "leases:update" in current_user.get(
        "scopes", []
    ) or "*" in current_user.get("scopes", [])
    if not is_creator and not has_update:
        raise HTTPException(
            status_code=403,
            detail="Samo kreator ugovora ili korisnik s ovlasti uređivanja može povući ugovor.",
        )

    update_fields: Dict[str, Any] = {
        "approval_status": ApprovalStatus.DRAFT.value,
        "approved_by": None,
        "approved_at": None,
        "approval_comment": None,
        "submitted_for_approval_at": None,
        "submitted_by": None,
    }
    await ugovori.update_by_id(id, update_fields)

    updated = await ugovori.get_by_id(id)
    return ugovori.to_dict(updated)


# ---------------------------------------------------------------------------
# Renewal & Escalation endpoints
# ---------------------------------------------------------------------------


class RenewalBody(BaseModel):
    trajanje_mjeseci: int = Field(default=12, ge=1, le=120)
    eskalacija_postotak: float = Field(default=0, ge=0, le=100)


def _add_months(start: date, months: int) -> date:
    """Add *months* calendar months to *start*, clamping day to month end."""
    from dateutil.relativedelta import relativedelta

    return start + relativedelta(months=months)


@router.get(
    "/{id}/escalation-preview",
    dependencies=[Depends(deps.require_scopes("leases:read"))],
)
async def preview_escalation(
    id: str,
    postotak: float = 3.0,
    trajanje_mjeseci: int = 12,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Preview rent escalation without creating anything."""
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    current_rent = float(existing.osnovna_zakupnina or 0)
    new_rent = round(current_rent * (1 + postotak / 100), 2)
    difference = round(new_rent - current_rent, 2)

    # Parse end date of existing contract as new start
    end_raw = existing.datum_zavrsetka
    if isinstance(end_raw, str):
        new_start = date.fromisoformat(end_raw)
    elif isinstance(end_raw, date):
        new_start = end_raw
    else:
        new_start = date.today()

    new_end = _add_months(new_start, trajanje_mjeseci)

    return {
        "trenutna_zakupnina": current_rent,
        "nova_zakupnina": new_rent,
        "razlika": difference,
        "postotak": postotak,
        "novi_datum_pocetka": new_start.isoformat(),
        "novi_datum_zavrsetka": new_end.isoformat(),
        "trajanje_mjeseci": trajanje_mjeseci,
    }


@router.post(
    "/{id}/renew",
    dependencies=[
        Depends(deps.require_scopes("leases:update")),
        Depends(deps.require_tenant()),
    ],
)
async def renew_contract(
    id: str,
    body: RenewalBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Create a renewed contract based on an existing one.

    The renewal:
    - Carries over the **full unit set** (junction + legacy primary), not
      just the legacy `property_unit_id` — multi-unit contracts renew
      cleanly.
    - Builds the payload through the regular Pydantic validators
      (`ContractCreate`) so the rent-fields rule (B5) and date checks fire.
    - Uses `local_today()` so the fallback start matches the business zone.
    - Marks the old contract ISTEKAO and re-syncs every linked unit to a
      consistent status so the cron self-healer doesn't have a window of
      orphaned IZNAJMLJENO units between old expiry and new approval.
    """
    existing = await ugovori.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Ugovor nije pronađen")

    # Only active or expiring contracts can be renewed
    current_status = existing.status or ""
    if current_status not in (
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.NA_ISTEKU.value,
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Samo aktivni ili ugovori na isteku mogu se produžiti. "
                f"Trenutni status: {current_status}"
            ),
        )

    # Calculate new dates — fallback uses business-zone today.
    end_raw = existing.datum_zavrsetka
    if isinstance(end_raw, str):
        new_start = date.fromisoformat(end_raw)
    elif isinstance(end_raw, date):
        new_start = end_raw
    else:
        new_start = local_today()

    new_end = _add_months(new_start, body.trajanje_mjeseci)

    # Carry over the full unit + parking set so multi-resource contracts
    # renew with everything intact, not just the legacy primary unit.
    inherited_unit_ids = await _get_contract_unit_ids(id)
    if existing.property_unit_id and existing.property_unit_id not in inherited_unit_ids:
        inherited_unit_ids.append(existing.property_unit_id)
    inherited_parking_ids = await _get_contract_parking_ids(id)

    # Decide the new financial fields. Legacy data may have BOTH
    # osnovna_zakupnina and zakupnina_po_m2 set (created before B5
    # validator landed). Prefer escalating osnovna_zakupnina and clearing
    # po_m2 so the new contract validates cleanly.
    current_rent = float(existing.osnovna_zakupnina or 0)
    new_rent = round(current_rent * (1 + body.eskalacija_postotak / 100), 2)

    # New label gets an `-OBN-{hex}` suffix so the renewal does not collide
    # on the (tenant_id, interna_oznaka) unique index. We try a few times
    # with longer suffix lengths and a probe query — multiple amendments
    # over years made the previous 4-hex (~65k space) collision-prone.
    new_oznaka = None
    for hex_len in (6, 8, 12):
        for _ in range(5):
            candidate = (
                f"{existing.interna_oznaka}-OBN-"
                f"{uuid.uuid4().hex[:hex_len].upper()}"
                if existing.interna_oznaka
                else f"OBN-{uuid.uuid4().hex[:hex_len].upper()}"
            )
            taken = await ugovori.find_one(interna_oznaka=candidate)
            if not taken:
                new_oznaka = candidate
                break
        if new_oznaka:
            break
    if new_oznaka is None:
        # Astronomically unlikely (millions of renewals + bad luck). Fail
        # loud rather than 500 inside the create call.
        raise HTTPException(
            status_code=500,
            detail="Ne mogu generirati jedinstvenu oznaku za obnovu ugovora.",
        )

    # Build a ContractCreate payload from the existing row, then run it
    # through the Pydantic model so all validators apply.
    payload = {
        "interna_oznaka": new_oznaka,
        "nekretnina_id": existing.nekretnina_id,
        "zakupnik_id": existing.zakupnik_id,
        "property_unit_id": inherited_unit_ids[0] if inherited_unit_ids else None,
        "property_unit_ids": inherited_unit_ids,
        "parking_ids": inherited_parking_ids,
        "datum_potpisivanja": local_today(),
        "datum_pocetka": new_start,
        "datum_zavrsetka": new_end,
        "trajanje_mjeseci": body.trajanje_mjeseci,
        "opcija_produljenja": existing.opcija_produljenja,
        "uvjeti_produljenja": existing.uvjeti_produljenja,
        "rok_otkaza_dani": existing.rok_otkaza_dani,
        "osnovna_zakupnina": new_rent,
        "zakupnina_po_m2": None,  # cleared on renewal — see comment above
        "cam_troskovi": existing.cam_troskovi,
        "polog_depozit": existing.polog_depozit,
        "garancija": existing.garancija,
        "indeksacija": existing.indeksacija,
        "indeks": existing.indeks,
        "formula_indeksacije": existing.formula_indeksacije,
        "obveze_odrzavanja": existing.obveze_odrzavanja,
        "namjena_prostora": existing.namjena_prostora,
        "rezije_brojila": existing.rezije_brojila,
        "status": compute_contract_status(new_end),
        "napomena": existing.napomena,
    }
    try:
        validated = ContractCreate(**payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    new_contract = validated.model_dump()
    new_contract["parent_contract_id"] = id
    new_contract["status"] = compute_contract_status(new_end).value
    new_contract["created_by"] = current_user["id"]
    new_contract.update(build_approval_fields_for_create(current_user, "leases"))
    # Strip helper fields — junctions are populated separately.
    new_contract.pop("property_unit_ids", None)
    new_contract.pop("parking_ids", None)

    # Lock every resource involved (sorted to avoid deadlocks) and check
    # overlap on each.
    lock_targets = _resource_targets(inherited_unit_ids, inherited_parking_ids)

    async def _create_under_locks(remaining: List[tuple]):
        if not remaining:
            for uid in inherited_unit_ids:
                await check_contract_overlap(
                    uid, new_start, new_end, exclude_contract_id=id
                )
            for pid in inherited_parking_ids:
                await check_parking_overlap(
                    pid, new_start, new_end, exclude_contract_id=id
                )
            # Insert + populate junctions in one transaction so a junction
            # failure rolls back the new contract row too.
            async with db_transaction() as txn:
                created_inner = await ugovori.create(new_contract, session=txn)
                if inherited_unit_ids:
                    await _set_contract_units(
                        created_inner.id, inherited_unit_ids, session=txn
                    )
                if inherited_parking_ids:
                    await _set_contract_parkings(
                        created_inner.id, inherited_parking_ids, session=txn
                    )
            return created_inner
        head, *tail = remaining
        async with advisory_lock_for_resource(head):
            return await _create_under_locks(tail)

    if lock_targets:
        created = await _create_under_locks(lock_targets)
    else:
        created = await ugovori.create(new_contract)

    # Mark old contract as expired.
    await ugovori.update_by_id(id, {"status": StatusUgovora.ISTEKAO.value})

    # Status sync: the old contract just transitioned to ISTEKAO and the
    # new one starts as pending_approval — that combination would leave
    # every linked resource IZNAJMLJENO with NO approved active contract
    # backing it. Free everything now; it gets marked IZNAJMLJENO again
    # on approve.
    if inherited_unit_ids:
        await _sync_units_status(inherited_unit_ids, PropertyUnitStatus.DOSTUPNO)
    if inherited_parking_ids:
        await _sync_parkings_status(
            inherited_parking_ids, ParkingStatus.DOSTUPNO
        )

    result = ugovori.to_dict(created)
    result["property_unit_ids"] = inherited_unit_ids
    result["parking_ids"] = inherited_parking_ids
    return result

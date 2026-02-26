import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from html import escape
from typing import Any, Dict, List, Optional

from app.api import deps
from app.db.repositories.instance import property_units, ugovori, users
from app.db.session import get_async_session_factory
from app.models.domain import ApprovalStatus, PropertyUnitStatus, StatusUgovora
from app.models.tables import UgovoriRow
from app.services.approval_service import (
    build_approval_fields_for_create,
    get_approvers_for_scope,
    user_can_approve_leases,
)
from app.services.notification_service import send_email
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_, text

logger = logging.getLogger(__name__)

EXPIRY_WARNING_DAYS = 30

router = APIRouter()


@asynccontextmanager
async def advisory_lock_for_unit(unit_id: str, timeout: int = 5):
    """Acquire a MariaDB advisory lock scoped to a property unit.

    This prevents the TOCTOU race where two concurrent requests both pass
    the overlap check and then both insert a contract for the same unit.
    """
    if not unit_id:
        yield
        return

    lock_name = f"contract_unit_{unit_id}"
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        async with session.begin():
            result = await session.execute(
                text("SELECT GET_LOCK(:name, :timeout)"),
                {"name": lock_name, "timeout": timeout},
            )
            acquired = result.scalar()
            if not acquired:
                raise HTTPException(
                    status_code=409,
                    detail="Nije moguće zaključati jedinicu — pokušajte ponovo.",
                )
            try:
                yield
            finally:
                await session.execute(
                    text("SELECT RELEASE_LOCK(:name)"),
                    {"name": lock_name},
                )


def compute_contract_status(datum_zavrsetka) -> StatusUgovora:
    """Compute correct status based on end date vs today."""
    today = date.today()
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
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
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


class ContractUpdate(BaseModel):
    interna_oznaka: Optional[str] = Field(default=None, max_length=100)
    nekretnina_id: Optional[str] = Field(default=None, max_length=100)
    zakupnik_id: Optional[str] = Field(default=None, max_length=100)
    property_unit_id: Optional[str] = Field(default=None, max_length=100)
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
    Overlap logic: (StartA <= EndB) and (EndA >= StartB)
    Only approved or legacy (no approval_status field) contracts count.
    """
    if not unit_id:
        return

    conditions = [
        UgovoriRow.property_unit_id == unit_id,
        UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
        or_(
            UgovoriRow.approval_status == ApprovalStatus.APPROVED.value,
            UgovoriRow.approval_status.is_(None),
        ),
        UgovoriRow.datum_pocetka <= end_date,
        UgovoriRow.datum_zavrsetka >= start_date,
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


async def calculate_rent_if_needed(item_data: dict):
    """
    Calculate basic rent from rent_per_m2 if basic rent is 0 or missing,
    and we have unit surface area.
    """
    if (
        item_data.get("zakupnina_po_m2")
        and item_data.get("osnovna_zakupnina", 0) == 0
        and item_data.get("property_unit_id")
    ):
        unit = await property_units.get_by_id(item_data["property_unit_id"])
        if unit and unit.povrsina_m2:
            item_data["osnovna_zakupnina"] = (
                item_data["zakupnina_po_m2"] * unit.povrsina_m2
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


@router.get("/", dependencies=[Depends(deps.require_scopes("leases:read"))])
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
        results.append(item_dict)

    return results


@router.post(
    "/",
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
    unit_id = item_data.get("property_unit_id")

    # 0. Duplicate check — same oznaka + nekretnina + active status
    existing_dup = await ugovori.find_one(
        interna_oznaka=item_data.get("interna_oznaka"),
        nekretnina_id=item_data.get("nekretnina_id"),
        extra_conditions=[
            UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
        ],
    )
    if existing_dup:
        raise HTTPException(
            status_code=400,
            detail=f"Već postoji aktivan ugovor s oznakom '{item_data['interna_oznaka']}' za ovu nekretninu.",
        )

    # Advisory lock prevents race condition on overlap check
    async with advisory_lock_for_unit(unit_id):
        # 1. Check Overlap
        if unit_id:
            await check_contract_overlap(
                unit_id,
                item_data["datum_pocetka"],
                item_data["datum_zavrsetka"],
            )

        # 2. Financial Logic
        item_data = await calculate_rent_if_needed(item_data)

        # 2b. Compute correct status based on dates
        if item_data.get("datum_zavrsetka"):
            item_data["status"] = compute_contract_status(
                item_data["datum_zavrsetka"]
            ).value

        item_data["created_by"] = current_user["id"]

        # 3. Approval fields
        approval_fields = build_approval_fields_for_create(current_user, "leases")
        item_data.update(approval_fields)

        new_item = await ugovori.create(item_data)

    # 4. Status Sync (Update Unit) — only if approved
    if (
        item_data.get("approval_status") == ApprovalStatus.APPROVED.value
        and item_data.get("status") == StatusUgovora.AKTIVNO.value
        and unit_id
    ):
        await property_units.update_by_id(
            unit_id, {"status": PropertyUnitStatus.IZNAJMLJENO}
        )

    return ugovori.to_dict(new_item)


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
    # We need dates and unit_id to check overlap
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

    # 1. Check Overlap (under advisory lock to prevent race condition)
    if (
        "datum_pocetka" in update_data
        or "datum_zavrsetka" in update_data
        or "property_unit_id" in update_data
    ):
        unit_id = merged_data.get("property_unit_id")
        start = parse_date(merged_data.get("datum_pocetka"))
        end = parse_date(merged_data.get("datum_zavrsetka"))

        if unit_id and start and end:
            async with advisory_lock_for_unit(unit_id):
                await check_contract_overlap(
                    unit_id, start, end, exclude_contract_id=id
                )

    # 2. Financial Logic
    if "zakupnina_po_m2" in update_data and "osnovna_zakupnina" not in update_data:
        temp_merged = {**existing_dict, **update_data}
        temp_merged = await calculate_rent_if_needed(temp_merged)
        if temp_merged["osnovna_zakupnina"] != existing_dict.get("osnovna_zakupnina"):
            update_data["osnovna_zakupnina"] = temp_merged["osnovna_zakupnina"]

    updated = await ugovori.update_by_id(id, update_data)

    # 3. Status Sync
    new_status = update_data.get("status")
    unit_id = merged_data.get("property_unit_id")

    if new_status and unit_id:
        if new_status == StatusUgovora.AKTIVNO:
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.IZNAJMLJENO}
            )
        elif new_status in [
            StatusUgovora.RASKINUTO,
            StatusUgovora.ARHIVIRANO,
            StatusUgovora.ISTEKAO,
        ]:
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.DOSTUPNO}
            )

    return ugovori.to_dict(updated)


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

    # Free unit if contract was active/expiring
    unit_id = existing.property_unit_id
    if unit_id and existing.status in [
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.NA_ISTEKU.value,
    ]:
        # Only free if no other active contract exists for this unit
        other_active = await ugovori.find_one(
            property_unit_id=unit_id,
            extra_conditions=[
                UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
                UgovoriRow.id != id,
            ],
        )
        if not other_active:
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.DOSTUPNO}
            )

    await ugovori.delete_by_id(id)
    return {"message": "Ugovor uspješno obrisan"}


# Valid status transitions
VALID_STATUS_TRANSITIONS = {
    StatusUgovora.AKTIVNO: {
        StatusUgovora.NA_ISTEKU,
        StatusUgovora.RASKINUTO,
        StatusUgovora.ARHIVIRANO,
    },
    StatusUgovora.NA_ISTEKU: {
        StatusUgovora.AKTIVNO,
        StatusUgovora.ISTEKAO,
        StatusUgovora.RASKINUTO,
        StatusUgovora.ARHIVIRANO,
    },
    StatusUgovora.ISTEKAO: {StatusUgovora.ARHIVIRANO, StatusUgovora.AKTIVNO},
    StatusUgovora.RASKINUTO: {StatusUgovora.ARHIVIRANO, StatusUgovora.AKTIVNO},
    StatusUgovora.ARHIVIRANO: {StatusUgovora.AKTIVNO},
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

    # Sync Unit Status if exists
    if existing.property_unit_id:
        unit_id = existing.property_unit_id
        if status_update.novi_status == StatusUgovora.AKTIVNO:
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.IZNAJMLJENO}
            )
        elif status_update.novi_status in [
            StatusUgovora.RASKINUTO,
            StatusUgovora.ARHIVIRANO,
            StatusUgovora.ISTEKAO,
        ]:
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.DOSTUPNO}
            )

    updated = await ugovori.get_by_id(id)
    return ugovori.to_dict(updated)


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

    now = datetime.now(timezone.utc).isoformat()

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

    # Run overlap check before approving (under advisory lock)
    if existing.property_unit_id:

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
            async with advisory_lock_for_unit(existing.property_unit_id):
                await check_contract_overlap(
                    existing.property_unit_id,
                    start,
                    end,
                    exclude_contract_id=id,
                )

    now = datetime.now(timezone.utc).isoformat()
    update_fields: Dict[str, Any] = {
        "approval_status": ApprovalStatus.APPROVED.value,
        "approved_by": current_user["id"],
        "approved_at": now,
        "approval_comment": body.komentar,
    }
    await ugovori.update_by_id(id, update_fields)

    # Sync unit status to IZNAJMLJENO if contract is AKTIVNO with property_unit_id
    if existing.status in (
        StatusUgovora.AKTIVNO.value,
        StatusUgovora.AKTIVNO,
    ) and existing.property_unit_id:
        await property_units.update_by_id(
            existing.property_unit_id, {"status": PropertyUnitStatus.IZNAJMLJENO}
        )

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

    now = datetime.now(timezone.utc).isoformat()
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
    """Create a renewed contract based on an existing one."""
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

    # Calculate new dates
    end_raw = existing.datum_zavrsetka
    if isinstance(end_raw, str):
        new_start = date.fromisoformat(end_raw)
    elif isinstance(end_raw, date):
        new_start = end_raw
    else:
        new_start = date.today()

    new_end = _add_months(new_start, body.trajanje_mjeseci)

    # Calculate escalated rent
    current_rent = float(existing.osnovna_zakupnina or 0)
    new_rent = round(current_rent * (1 + body.eskalacija_postotak / 100), 2)

    # Build new contract from existing data
    # Convert ORM instance to dict first, then copy relevant fields
    existing_dict = ugovori.to_dict(existing)

    EXCLUDE_KEYS = {
        "_id",
        "id",
        "created_at",
        "updated_at",
        "approval_status",
        "approved_by",
        "approved_at",
        "approval_comment",
        "submitted_for_approval_at",
        "submitted_by",
    }
    new_contract = {k: v for k, v in existing_dict.items() if k not in EXCLUDE_KEYS}

    new_contract.update(
        {
            "datum_pocetka": new_start,
            "datum_zavrsetka": new_end,
            "trajanje_mjeseci": body.trajanje_mjeseci,
            "osnovna_zakupnina": new_rent,
            "parent_contract_id": id,
            "status": compute_contract_status(new_end).value,
            "created_by": current_user["id"],
        }
    )

    # Reset approval fields for the new contract
    approval_fields = build_approval_fields_for_create(current_user, "leases")
    new_contract.update(approval_fields)

    # Check overlap for the new period (if unit-scoped)
    unit_id = new_contract.get("property_unit_id")
    if unit_id:
        async with advisory_lock_for_unit(unit_id):
            await check_contract_overlap(
                unit_id, new_start, new_end, exclude_contract_id=id
            )
            created = await ugovori.create(new_contract)
    else:
        created = await ugovori.create(new_contract)

    # Mark old contract as expired
    await ugovori.update_by_id(id, {"status": StatusUgovora.ISTEKAO.value})

    # If old contract had a unit and new contract is active+approved, keep unit rented
    # (unit stays IZNAJMLJENO because the new contract continues)

    return ugovori.to_dict(created)

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any, Dict, Optional

from app.api import deps
from app.core.config import get_settings
from app.db.repositories.instance import racuni, ugovori, users
from app.models.domain import (
    ApprovalStatus,
    PreknjizavanjeStatus,
    RacunStatus,
    UtilityType,
)
from app.models.tables import RacuniRow
from app.services.approval_service import (
    build_approval_fields_for_create,
    get_approvers_for_scope,
    user_can_approve_financials,
)
from app.services.notification_service import send_email
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

CLAUDE_TEXT_MODEL = settings.CLAUDE_MODEL

# File upload constraints (reuse from documents)
MAX_FILE_SIZE_MB = 50
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def _sanitize_filename(filename: str) -> str:
    filename = Path(filename).name
    filename = re.sub(r"[^\w.\-]", "_", filename)
    return filename


# --------------- Models ---------------


class RacunUpdate(BaseModel):
    tip_utroska: Optional[str] = None
    dobavljac: Optional[str] = None
    broj_racuna: Optional[str] = None
    datum_racuna: Optional[str] = None
    datum_dospijeca: Optional[str] = None
    iznos: Optional[float] = None
    valuta: Optional[str] = None
    nekretnina_id: Optional[str] = None
    zakupnik_id: Optional[str] = None
    property_unit_id: Optional[str] = None
    status_placanja: Optional[str] = None
    preknjizavanje_status: Optional[str] = None
    preknjizavanje_napomena: Optional[str] = None
    napomena: Optional[str] = None
    period_od: Optional[str] = None
    period_do: Optional[str] = None
    potrosnja_kwh: Optional[float] = None
    potrosnja_m3: Optional[float] = None


class PreknjizavanjeUpdate(BaseModel):
    preknjizavanje_status: str
    preknjizavanje_napomena: Optional[str] = None


class ApprovalCommentBody(BaseModel):
    komentar: Optional[str] = None


# --------------- Email Templates ---------------

# Shared inline styles for email templates (keep lines short)
_TD = "padding:8px;border-bottom:1px solid #e2e8f0"
_TD_LABEL = f"{_TD};color:#64748b"
_TD_VAL = f"{_TD};font-weight:600"
_WRAP = "font-family:sans-serif;max-width:600px;margin:0 auto"
_BODY = (
    "padding:20px;background:#f8fafc;"
    "border:1px solid #e2e8f0;border-radius:0 0 8px 8px"
)
_HDR = "color:white;padding:20px;border-radius:8px 8px 0 0"
_TBL = "width:100%;border-collapse:collapse;margin-top:12px"
_FOOT = "margin-top:16px;color:#64748b;font-size:13px"


def _bill_table_rows(tip, dobavljac, broj, iznos, valuta):
    """Shared table rows for bill email templates."""
    s_tip = escape(str(tip))
    s_dob = escape(str(dobavljac))
    s_broj = escape(str(broj))
    s_val = escape(str(valuta))
    return f"""
                <tr>
                    <td style="{_TD_LABEL}">Tip utroska</td>
                    <td style="{_TD_VAL}">{s_tip}</td>
                </tr>
                <tr>
                    <td style="{_TD_LABEL}">Dobavljac</td>
                    <td style="{_TD_VAL}">{s_dob}</td>
                </tr>
                <tr>
                    <td style="{_TD_LABEL}">Broj racuna</td>
                    <td style="{_TD_VAL}">{s_broj}</td>
                </tr>
                <tr>
                    <td style="{_TD_LABEL}">Iznos</td>
                    <td style="{_TD_VAL}">{iznos:.2f} {s_val}</td>
                </tr>"""


def _build_bill_approval_request_email(
    bill: Dict[str, Any], submitter: Dict[str, Any]
) -> str:
    """Build approval request email with slate header."""
    tip = bill.get("tip_utroska", "N/A")
    dobavljac = bill.get("dobavljac", "N/A")
    iznos = bill.get("iznos", 0) or 0
    valuta = bill.get("valuta", "EUR")
    broj = bill.get("broj_racuna", "N/A")
    submitter_name = escape(submitter.get("name") or submitter.get("id", "N/A"))
    rows = _bill_table_rows(tip, dobavljac, broj, iznos, valuta)

    return f"""
    <div style="{_WRAP}">
        <div style="background:#1e293b;{_HDR}">
            <h2 style="margin:0;">Zahtjev za odobrenje racuna</h2>
            <p style="margin:4px 0 0;opacity:0.8;">
                Riforma - Odobrenja</p>
        </div>
        <div style="{_BODY}">
            <p><strong>{submitter_name}</strong>
                je podnio/la racun na odobrenje.</p>
            <table style="{_TBL}">{rows}
            </table>
            <p style="{_FOOT}">
                Prijavite se na platformu za pregled i odobrenje.
            </p>
        </div>
    </div>"""


def _build_bill_approved_email(bill: Dict[str, Any], approver: Dict[str, Any]) -> str:
    """Build approval confirmation email with green header."""
    tip = bill.get("tip_utroska", "N/A")
    dobavljac = bill.get("dobavljac", "N/A")
    iznos = bill.get("iznos", 0) or 0
    valuta = bill.get("valuta", "EUR")
    broj = bill.get("broj_racuna", "N/A")
    approver_name = escape(approver.get("name") or approver.get("id", "N/A"))
    rows = _bill_table_rows(tip, dobavljac, broj, iznos, valuta)

    return f"""
    <div style="{_WRAP}">
        <div style="background:#16a34a;{_HDR}">
            <h2 style="margin:0;">Racun odobren</h2>
            <p style="margin:4px 0 0;opacity:0.8;">
                Riforma - Odobrenja</p>
        </div>
        <div style="{_BODY}">
            <p><strong>{approver_name}</strong>
                je odobrio/la vas racun.</p>
            <table style="{_TBL}">{rows}
            </table>
            <p style="{_FOOT}">
                Prijavite se na platformu za vise detalja.
            </p>
        </div>
    </div>"""


def _build_bill_rejected_email(
    bill: Dict[str, Any],
    rejector: Dict[str, Any],
    comment: str,
) -> str:
    """Build rejection email with red header."""
    tip = bill.get("tip_utroska", "N/A")
    dobavljac = bill.get("dobavljac", "N/A")
    iznos = bill.get("iznos", 0) or 0
    valuta = bill.get("valuta", "EUR")
    broj = bill.get("broj_racuna", "N/A")
    rejector_name = escape(rejector.get("name") or rejector.get("id", "N/A"))
    rows = _bill_table_rows(tip, dobavljac, broj, iznos, valuta)
    safe_comment = escape(comment)
    _rej_box = (
        "margin-top:16px;padding:12px;background:#fef2f2;"
        "border:1px solid #fecaca;border-radius:6px"
    )

    return f"""
    <div style="{_WRAP}">
        <div style="background:#dc2626;{_HDR}">
            <h2 style="margin:0;">Racun odbijen</h2>
            <p style="margin:4px 0 0;opacity:0.8;">
                Riforma - Odobrenja</p>
        </div>
        <div style="{_BODY}">
            <p><strong>{rejector_name}</strong>
                je odbio/la vas racun.</p>
            <table style="{_TBL}">{rows}
            </table>
            <div style="{_rej_box}">
                <p style="margin:0;color:#991b1b;font-weight:600;">
                    Razlog odbijanja:</p>
                <p style="margin:4px 0 0;color:#991b1b;">
                    {safe_comment}</p>
            </div>
            <p style="{_FOOT}">
                Prijavite se na platformu za ispravke
                i ponovnu prijavu.
            </p>
        </div>
    </div>"""


# --------------- CRUD ---------------


@router.get("", dependencies=[Depends(deps.require_scopes("financials:read"))])
async def get_racuni(
    skip: int = 0,
    limit: int = 200,
    nekretnina_id: Optional[str] = None,
    zakupnik_id: Optional[str] = None,
    tip_utroska: Optional[str] = None,
    status_placanja: Optional[str] = None,
    preknjizavanje_status: Optional[str] = None,
    approval_status: Optional[str] = None,
    period_od: Optional[str] = None,
    period_do: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    filters: Dict[str, Any] = {}

    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id
    if zakupnik_id:
        filters["zakupnik_id"] = zakupnik_id
    if tip_utroska:
        filters["tip_utroska"] = tip_utroska
    if status_placanja:
        filters["status_placanja"] = status_placanja
    if preknjizavanje_status:
        filters["preknjizavanje_status"] = preknjizavanje_status
    if approval_status:
        filters["approval_status"] = approval_status

    # Date range filter on datum_racuna via extra_conditions
    extra_conditions = []
    if period_od:
        extra_conditions.append(RacuniRow.datum_racuna >= period_od)
    if period_do:
        extra_conditions.append(RacuniRow.datum_racuna <= period_do)

    items, total = await racuni.find_many(
        filters=filters,
        extra_conditions=extra_conditions if extra_conditions else [],
        order_by="datum_racuna",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    return [racuni.to_dict(item) for item in items]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def create_racun(
    tip_utroska: str = Form(...),
    dobavljac: str = Form(""),
    broj_racuna: str = Form(""),
    datum_racuna: str = Form(""),
    datum_dospijeca: str = Form(""),
    iznos: float = Form(0.0),
    valuta: str = Form("EUR"),
    nekretnina_id: Optional[str] = Form(None),
    zakupnik_id: Optional[str] = Form(None),
    property_unit_id: Optional[str] = Form(None),
    status_placanja: str = Form("ceka_placanje"),
    preknjizavanje_status: str = Form("nije_primjenjivo"),
    preknjizavanje_napomena: Optional[str] = Form(None),
    napomena: Optional[str] = Form(None),
    period_od: Optional[str] = Form(None),
    period_do: Optional[str] = Form(None),
    potrosnja_kwh: Optional[float] = Form(None),
    potrosnja_m3: Optional[float] = Form(None),
    file: UploadFile = File(None),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Validate enums
    try:
        RacunStatus(status_placanja)
    except ValueError:
        raise HTTPException(status_code=422, detail="Nevazeci status placanja")
    try:
        PreknjizavanjeStatus(preknjizavanje_status)
    except ValueError:
        raise HTTPException(status_code=422, detail="Nevazeci status preknjizavanja")
    try:
        UtilityType(tip_utroska)
    except ValueError:
        raise HTTPException(status_code=422, detail="Nevazeci tip utroska")

    doc_id = str(uuid.uuid4())
    file_path = None
    original_filename = None
    content_type = None

    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Nedozvoljeni tip datoteke: {ext}."
                    f" Dozvoljeni: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
                ),
            )
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=422,
                detail=f"Datoteka je prevelika. Maksimalna velicina: {MAX_FILE_SIZE_MB}MB",
            )
        safe_filename = _sanitize_filename(file.filename)
        filename = f"{doc_id}_{safe_filename}"
        settings.UPLOAD_DIR.mkdir(exist_ok=True)
        dest_path = settings.UPLOAD_DIR / filename
        with dest_path.open("wb") as buffer:
            buffer.write(contents)
        file_path = str(dest_path)
        original_filename = file.filename
        content_type = file.content_type

    doc_data = {
        "id": doc_id,
        "tip_utroska": tip_utroska,
        "dobavljac": dobavljac,
        "broj_racuna": broj_racuna,
        "datum_racuna": datum_racuna,
        "datum_dospijeca": datum_dospijeca,
        "iznos": iznos,
        "valuta": valuta,
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": property_unit_id,
        "status_placanja": status_placanja,
        "preknjizavanje_status": preknjizavanje_status,
        "preknjizavanje_napomena": preknjizavanje_napomena,
        "napomena": napomena,
        "period_od": period_od,
        "period_do": period_do,
        "potrosnja_kwh": potrosnja_kwh,
        "potrosnja_m3": potrosnja_m3,
        "file_path": file_path,
        "original_filename": original_filename,
        "content_type": content_type,
        "putanja_datoteke": (
            f"uploads/{doc_id}_{_sanitize_filename(file.filename)}"
            if file and file.filename
            else None
        ),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Add approval workflow fields
    approval_fields = build_approval_fields_for_create(current_user, "financials")
    doc_data.update(approval_fields)

    new_item = await racuni.create(doc_data)
    return racuni.to_dict(new_item)


@router.get(
    "/analytics/summary",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def get_racuni_analytics(
    nekretnina_id: Optional[str] = None,
    period_od: Optional[str] = None,
    period_do: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    filters: Dict[str, Any] = {}
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id

    extra_conditions = []
    if period_od:
        extra_conditions.append(RacuniRow.datum_racuna >= period_od)
    if period_do:
        extra_conditions.append(RacuniRow.datum_racuna <= period_do)

    items = await racuni.find_all(
        filters=filters,
        extra_conditions=extra_conditions if extra_conditions else [],
    )

    # Aggregate by utility type
    po_tipu: Dict[str, float] = {}
    po_nekretnini: Dict[str, float] = {}
    po_statusu: Dict[str, int] = {}
    ukupno = 0.0
    neplaceno = 0.0
    za_preknjizavanje = 0

    for item in items:
        iznos = float(item.iznos or 0)
        tip = item.tip_utroska or "ostalo"
        nek_id = item.nekretnina_id or "nepoznato"
        st = item.status_placanja or "ceka_placanje"
        prk = item.preknjizavanje_status or "nije_primjenjivo"

        ukupno += iznos
        po_tipu[tip] = po_tipu.get(tip, 0) + iznos
        po_nekretnini[nek_id] = po_nekretnini.get(nek_id, 0) + iznos
        po_statusu[st] = po_statusu.get(st, 0) + 1

        if st in ("ceka_placanje", "djelomicno_placeno", "prekoraceno"):
            neplaceno += iznos
        if prk == "ceka":
            za_preknjizavanje += 1

    return {
        "ukupno_iznos": round(ukupno, 2),
        "neplaceno_iznos": round(neplaceno, 2),
        "za_preknjizavanje": za_preknjizavanje,
        "ukupno_racuna": len(items),
        "po_tipu": po_tipu,
        "po_nekretnini": po_nekretnini,
        "po_statusu": po_statusu,
    }


@router.get(
    "/ledger/{zakupnik_id}",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def get_tenant_ledger(
    zakupnik_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Get financial ledger for a specific tenant."""
    items = await racuni.find_all(
        filters={"zakupnik_id": zakupnik_id},
        order_by="datum_racuna",
    )

    total_billed = 0
    total_paid = 0
    for item in items:
        total_billed += float(item.iznos or 0)
        total_paid += float(item.total_paid or 0)

    return {
        "zakupnik_id": zakupnik_id,
        "racuni": [racuni.to_dict(item) for item in items],
        "ukupno_zaduzenje": round(total_billed, 2),
        "ukupno_placeno": round(total_paid, 2),
        "saldo": round(total_billed - total_paid, 2),
    }


@router.get(
    "/tax-summary",
    dependencies=[
        Depends(deps.require_scopes("financials:read")),
        Depends(deps.require_tenant()),
    ],
)
async def get_tax_summary(
    year: Optional[int] = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Tax summary for a given year."""
    target_year = year or datetime.now().year
    year_str = str(target_year)

    all_racuni = await racuni.find_all()
    all_ugovori = await ugovori.find_all()

    # Income from contracts active in target year
    total_income = 0
    for u in all_ugovori:
        start = u.datum_pocetka or ""
        end = u.datum_zavrsetka or ""
        if start and start[:4] <= year_str and (not end or end[:4] >= year_str):
            monthly = float(u.osnovna_zakupnina or 0) + float(
                u.cam_troskovi or 0
            )
            total_income += monthly * 12

    # Expenses from bills in target year
    total_expenses = 0
    expense_by_type = {}
    for r in all_racuni:
        datum = r.datum_racuna or ""
        if datum and datum[:4] == year_str:
            iznos = float(r.iznos or 0)
            total_expenses += iznos
            tip = r.tip_utroska or "ostalo"
            expense_by_type[tip] = expense_by_type.get(tip, 0) + iznos

    net = total_income - total_expenses

    return {
        "year": target_year,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net_profit": round(net, 2),
        "expense_breakdown": {
            k: round(v, 2) for k, v in sorted(expense_by_type.items())
        },
        "estimated_tax_base": round(max(0, net), 2),
    }


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("financials:read"))])
async def get_racun(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")
    return racuni.to_dict(item)


@router.put(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("financials:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_racun(
    id: str,
    update_data: RacunUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    # Block edits while bill is pending approval
    current_approval = item.approval_status or "approved"
    if current_approval == ApprovalStatus.PENDING_APPROVAL.value:
        if not user_can_approve_financials(current_user):
            raise HTTPException(
                status_code=422,
                detail="Racun je na cekanju odobrenja i ne moze se uredivati",
            )

    update_dict = update_data.model_dump(exclude_unset=True)

    # Validate enums if present
    if "status_placanja" in update_dict:
        try:
            RacunStatus(update_dict["status_placanja"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Nevazeci status placanja")
    if "preknjizavanje_status" in update_dict:
        try:
            PreknjizavanjeStatus(update_dict["preknjizavanje_status"])
        except ValueError:
            raise HTTPException(
                status_code=422, detail="Nevazeci status preknjizavanja"
            )
    if "tip_utroska" in update_dict:
        try:
            UtilityType(update_dict["tip_utroska"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Nevazeci tip utroska")

    if update_dict:
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        updated = await racuni.update_by_id(id, update_dict)
    else:
        updated = item

    return racuni.to_dict(updated)


@router.patch(
    "/{id}/preknjizavanje",
    dependencies=[
        Depends(deps.require_scopes("financials:update")),
        Depends(deps.require_tenant()),
    ],
)
async def update_preknjizavanje(
    id: str,
    data: PreknjizavanjeUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    try:
        PreknjizavanjeStatus(data.preknjizavanje_status)
    except ValueError:
        raise HTTPException(status_code=422, detail="Nevazeci status preknjizavanja")

    update_dict = {
        "preknjizavanje_status": data.preknjizavanje_status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.preknjizavanje_napomena is not None:
        update_dict["preknjizavanje_napomena"] = data.preknjizavanje_napomena

    updated = await racuni.update_by_id(id, update_dict)
    return racuni.to_dict(updated)


@router.delete(
    "/{id}",
    dependencies=[
        Depends(deps.require_scopes("financials:delete")),
        Depends(deps.require_tenant()),
    ],
)
async def delete_racun(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    # Delete attached file
    fp = item.file_path
    if fp:
        path = Path(fp).resolve()
        if str(path).startswith(str(settings.UPLOAD_DIR.resolve())) and path.exists():
            try:
                path.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete file {fp}: {e}")

    await racuni.delete_by_id(id)
    return {"message": "Racun uspjesno obrisan"}


# --------------- Payment Recording ---------------


class PaymentBody(BaseModel):
    iznos_uplate: float
    datum_uplate: Optional[str] = None
    napomena: Optional[str] = None


@router.post(
    "/{id}/payment",
    dependencies=[
        Depends(deps.require_scopes("financials:update")),
        Depends(deps.require_tenant()),
    ],
)
async def record_payment(
    id: str,
    body: PaymentBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Record a payment against a bill."""
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    if body.iznos_uplate <= 0:
        raise HTTPException(status_code=422, detail="Iznos uplate mora biti pozitivan")

    payment = {
        "id": str(uuid.uuid4()),
        "iznos": body.iznos_uplate,
        "datum": body.datum_uplate or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "napomena": body.napomena or "",
        "recorded_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Add to payments array (JSON column)
    payments = list(item.payments or [])
    payments.append(payment)

    # Calculate total paid
    total_paid = sum(float(p.get("iznos", 0)) for p in payments)
    bill_amount = float(item.iznos or 0)

    # Auto-update payment status
    if total_paid >= bill_amount:
        new_status = "placeno"
    elif total_paid > 0:
        new_status = "djelomicno_placeno"
    else:
        new_status = item.status_placanja or "ceka_placanje"

    updated = await racuni.update_by_id(id, {
        "payments": payments,
        "status_placanja": new_status,
        "total_paid": total_paid,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })

    return racuni.to_dict(updated)


# --------------- Approval Workflow ---------------


@router.post(
    "/{id}/submit-for-approval",
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def submit_for_approval(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Submit a bill for approval."""
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    # Backward compat: old docs without approval_status treated as approved
    current_status = item.approval_status or "approved"
    if current_status not in (
        ApprovalStatus.DRAFT.value,
        ApprovalStatus.REJECTED.value,
    ):
        raise HTTPException(
            status_code=422,
            detail="Racun se moze podnijeti na odobrenje samo iz statusa 'draft' ili 'rejected'",
        )

    # Verify submitter is the creator OR has financials:create scope
    creator_id = item.created_by
    if current_user["id"] != creator_id:
        # Already checked via require_scopes("financials:create"), so this is fine
        pass

    now = datetime.now(timezone.utc).isoformat()

    # All submissions go to pending — approval is always explicit
    update_fields = {
        "approval_status": ApprovalStatus.PENDING_APPROVAL.value,
        "submitted_for_approval_at": now,
        "submitted_by": current_user["id"],
        "approved_by": None,
        "approved_at": None,
        "approval_comment": None,
        "updated_at": now,
    }
    await racuni.update_by_id(id, update_fields)

    # Send email to all users with financials:approve scope
    updated_bill = await racuni.get_by_id(id)
    updated_bill_dict = racuni.to_dict(updated_bill)
    approvers = await get_approvers_for_scope("financials:approve")
    html = _build_bill_approval_request_email(updated_bill_dict, current_user)
    for approver in approvers:
        email = approver.get("email")
        if email:
            await send_email(email, "Riforma: Racun ceka odobrenje", html)

    return racuni.to_dict(updated_bill)


@router.post(
    "/{id}/approve",
    dependencies=[
        Depends(deps.require_scopes("financials:approve")),
        Depends(deps.require_tenant()),
    ],
)
async def approve_racun(
    id: str,
    body: ApprovalCommentBody = None,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Approve a pending bill."""
    if body is None:
        body = ApprovalCommentBody()

    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    current_status = item.approval_status or "approved"
    if current_status != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo racuni sa statusom 'pending_approval' se mogu odobriti",
        )

    now = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "approval_status": ApprovalStatus.APPROVED.value,
        "approved_by": current_user["id"],
        "approved_at": now,
        "approval_comment": body.komentar,
        "updated_at": now,
    }
    await racuni.update_by_id(id, update_fields)

    # Send email to the creator
    updated_bill = await racuni.get_by_id(id)
    updated_bill_dict = racuni.to_dict(updated_bill)
    creator_id = item.created_by
    if creator_id:
        creator = await users.get_by_id(creator_id)
        if creator and creator.email:
            html = _build_bill_approved_email(updated_bill_dict, current_user)
            await send_email(creator.email, "Riforma: Racun odobren", html)

    return racuni.to_dict(updated_bill)


@router.post(
    "/{id}/reject",
    dependencies=[
        Depends(deps.require_scopes("financials:approve")),
        Depends(deps.require_tenant()),
    ],
)
async def reject_racun(
    id: str,
    body: ApprovalCommentBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Reject a pending bill. Requires a non-empty comment."""
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    current_status = item.approval_status or "approved"
    if current_status != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo racuni sa statusom 'pending_approval' se mogu odbiti",
        )

    if not body.komentar or not body.komentar.strip():
        raise HTTPException(
            status_code=422,
            detail="Komentar je obavezan pri odbijanju racuna",
        )

    now = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "approval_status": ApprovalStatus.REJECTED.value,
        "approved_by": current_user["id"],
        "approved_at": now,
        "approval_comment": body.komentar.strip(),
        "updated_at": now,
    }
    await racuni.update_by_id(id, update_fields)

    # Send email to the creator
    updated_bill = await racuni.get_by_id(id)
    updated_bill_dict = racuni.to_dict(updated_bill)
    creator_id = item.created_by
    if creator_id:
        creator = await users.get_by_id(creator_id)
        if creator and creator.email:
            html = _build_bill_rejected_email(
                updated_bill_dict, current_user, body.komentar.strip()
            )
            await send_email(creator.email, "Riforma: Racun odbijen", html)

    return racuni.to_dict(updated_bill)


@router.post(
    "/{id}/withdraw",
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def withdraw_racun(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Withdraw a bill from approval (reset to draft)."""
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    current_status = item.approval_status or "approved"
    if current_status != ApprovalStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=422,
            detail="Samo racuni sa statusom 'pending_approval' se mogu povuci",
        )

    # Verify user is creator OR has financials:create scope (already checked by dep)
    creator_id = item.created_by
    if current_user["id"] != creator_id:
        # Already validated via require_scopes("financials:create")
        pass

    now = datetime.now(timezone.utc).isoformat()
    update_fields = {
        "approval_status": ApprovalStatus.DRAFT.value,
        "approved_by": None,
        "approved_at": None,
        "approval_comment": None,
        "submitted_for_approval_at": None,
        "submitted_by": None,
        "updated_at": now,
    }
    updated = await racuni.update_by_id(id, update_fields)
    return racuni.to_dict(updated)


# --------------- AI Parse ---------------


def _get_anthropic_client():
    if anthropic is None:
        raise HTTPException(
            status_code=500,
            detail="Anthropic SDK nije instaliran",
        )
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        return None
    return anthropic.Anthropic(api_key=api_key)


@router.post(
    "/{id}/parse-ai",
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def parse_racun_ai(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """AI-parse an uploaded bill PDF to extract structured data."""
    item = await racuni.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")

    fp = item.file_path
    if not fp or not Path(fp).exists():
        raise HTTPException(status_code=400, detail="Racun nema prilozenu datoteku")

    if PdfReader is None:
        raise HTTPException(status_code=500, detail="pypdf nije instaliran")

    # Read PDF text
    try:
        reader = PdfReader(fp)
        text = ""
        for page in reader.pages[:5]:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    except Exception as e:
        logger.error(f"Failed to read PDF for racun {id}: {e}")
        raise HTTPException(status_code=400, detail="Greska pri citanju PDF-a")

    if len(text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="PDF ne sadrzi dovoljno teksta za analizu",
        )

    client = _get_anthropic_client()

    # Mock fallback
    if client is None:
        return {
            "success": True,
            "data": {
                "dobavljac": "Mock Dobavljac d.o.o.",
                "broj_racuna": "MOCK-2024-001",
                "datum_racuna": "2024-06-01",
                "datum_dospijeca": "2024-07-01",
                "iznos": 350.00,
                "valuta": "EUR",
                "tip_utroska": "struja",
                "period_od": "2024-05-01",
                "period_do": "2024-05-31",
                "potrosnja_kwh": 1250.0,
            },
            "metadata": {"source": "fallback"},
        }

    json_structure = """
    {
        "dobavljac": "string (naziv dobavljaca/isporucitelja)",
        "broj_racuna": "string (broj racuna)",
        "datum_racuna": "YYYY-MM-DD (datum izdavanja)",
        "datum_dospijeca": "YYYY-MM-DD (datum dospijeca placanja)",
        "iznos": "number (ukupan iznos za platiti)",
        "valuta": "string (EUR, HRK...)",
        "tip_utroska": "string (struja|voda|plin|komunalije|internet|ostalo)",
        "period_od": "YYYY-MM-DD (pocetak obracunskog razdoblja) ili null",
        "period_do": "YYYY-MM-DD (kraj obracunskog razdoblja) ili null",
        "potrosnja_kwh": "number (potrosnja u kWh) ili null",
        "potrosnja_m3": "number (potrosnja u m3) ili null"
    }
    """

    try:
        response = client.messages.create(
            model=CLAUDE_TEXT_MODEL,
            max_tokens=1024,
            system=(
                "Ti si asistent za analizu racuna za komunalne usluge i energente. "
                "Vracas iskljucivo validan JSON bez ikakvih dodatnih objasnjenja."
            ),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Analiziraj tekst racuna i izvuci podatke u JSON formatu:\n"
                        f"{json_structure}\n\nTekst racuna:\n{text[:6000]}"
                    ),
                },
            ],
            temperature=0,
        )

        content = response.content[0].text.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        data = json.loads(content)

        return {"success": True, "data": data, "metadata": {"source": "anthropic"}}

    except json.JSONDecodeError:
        logger.error("AI returned invalid JSON for racun parsing")
        raise HTTPException(
            status_code=500,
            detail="AI je vratio neispravan JSON. Pokusajte ponovo.",
        )
    except Exception as e:
        logger.error(f"AI racun parsing failed: {e}")
        raise HTTPException(status_code=500, detail="Greska pri AI analizi racuna")

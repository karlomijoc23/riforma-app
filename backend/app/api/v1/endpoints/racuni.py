import asyncio
import json
import logging
import re
import uuid
from datetime import date, datetime, timezone
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
from app.core.email import send_email
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

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


def _normalize_file_path(item: dict) -> dict:
    """Derive putanja_datoteke from file_path for consistent API responses."""
    fp = item.get("file_path")
    if fp:
        if "uploads/" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads/"):]
        elif "uploads\\" in fp:
            item["putanja_datoteke"] = fp[fp.rfind("uploads\\"):].replace("\\", "/")
    return item


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


# --------------- Bill split ---------------


class BillSplitBody(BaseModel):
    """Request body for the split engine.

    `unit_ids` lists the rentable units to split across; for the
    ``custom_percent`` and ``manual_amount`` methods, ``values`` must
    parallel that list (same length, same order).
    """
    method: str
    unit_ids: list[str]
    values: Optional[list[float]] = None


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
        extra_conditions.append(RacuniRow.datum_racuna >= date.fromisoformat(period_od))
    if period_do:
        extra_conditions.append(RacuniRow.datum_racuna <= date.fromisoformat(period_do))

    items, total = await racuni.find_many(
        filters=filters,
        extra_conditions=extra_conditions if extra_conditions else [],
        order_by="datum_racuna",
        order_dir="desc",
        skip=skip,
        limit=limit,
    )
    return [_normalize_file_path(racuni.to_dict(item)) for item in items]


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

    # Parse date strings into Python date objects. SQLAlchemy's SQLite
    # backend rejects bare strings on Date columns; MariaDB tolerates them
    # but the inconsistency makes tests flaky. Parse once, normalise.
    def _parse_date_or_none(value: Optional[str]) -> Optional[date]:
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=f"Datum '{value}' nije u ispravnom formatu (YYYY-MM-DD).",
            )

    parsed_datum_racuna = _parse_date_or_none(datum_racuna)
    parsed_datum_dospijeca = _parse_date_or_none(datum_dospijeca)
    parsed_period_od = _parse_date_or_none(period_od)
    parsed_period_do = _parse_date_or_none(period_do)

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
        "datum_racuna": parsed_datum_racuna,
        "datum_dospijeca": parsed_datum_dospijeca,
        "iznos": iznos,
        "valuta": valuta,
        "nekretnina_id": nekretnina_id,
        "zakupnik_id": zakupnik_id,
        "property_unit_id": property_unit_id,
        "status_placanja": status_placanja,
        "preknjizavanje_status": preknjizavanje_status,
        "preknjizavanje_napomena": preknjizavanje_napomena,
        "napomena": napomena,
        "period_od": parsed_period_od,
        "period_do": parsed_period_do,
        "potrosnja_kwh": potrosnja_kwh,
        "potrosnja_m3": potrosnja_m3,
        "file_path": file_path,
        "original_filename": original_filename,
        "content_type": content_type,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    # Add approval workflow fields
    approval_fields = build_approval_fields_for_create(current_user, "financials")
    doc_data.update(approval_fields)

    new_item = await racuni.create(doc_data)
    return _normalize_file_path(racuni.to_dict(new_item))


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
    return await racuni.analytics_summary(
        nekretnina_id=nekretnina_id,
        period_od=date.fromisoformat(period_od) if period_od else None,
        period_do=date.fromisoformat(period_do) if period_do else None,
    )


@router.get(
    "/analytics/cam-reconciliation",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def cam_reconciliation(
    nekretnina_id: str,
    godina: int,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Year-over-year CAM-style reconciliation for one property.

    Returns the per-utility totals for the requested year alongside the
    previous year's totals so the user can see drift at a glance. This
    is what landlords use at year-end to issue true-up charges/refunds
    against the per-tenant CAM estimates.
    """
    from datetime import date as _date

    def _bounds(year: int):
        return _date(year, 1, 1), _date(year, 12, 31)

    cur_from, cur_to = _bounds(godina)
    prev_from, prev_to = _bounds(godina - 1)

    cur_rows = await racuni.find_all(extra_conditions=[
        RacuniRow.nekretnina_id == nekretnina_id,
        RacuniRow.datum_racuna >= cur_from,
        RacuniRow.datum_racuna <= cur_to,
        # Don't double-count: master bills become children, count children only.
        RacuniRow.is_master_bill.is_(False),
    ])
    prev_rows = await racuni.find_all(extra_conditions=[
        RacuniRow.nekretnina_id == nekretnina_id,
        RacuniRow.datum_racuna >= prev_from,
        RacuniRow.datum_racuna <= prev_to,
        RacuniRow.is_master_bill.is_(False),
    ])

    def _aggregate(rows):
        out: Dict[str, Dict[str, float]] = {}
        for r in rows:
            tip = r.tip_utroska or "ostalo"
            entry = out.setdefault(tip, {"iznos": 0.0, "broj_racuna": 0})
            entry["iznos"] += float(r.iznos or 0)
            entry["broj_racuna"] += 1
        return out

    cur = _aggregate(cur_rows)
    prev = _aggregate(prev_rows)

    by_utility = []
    for tip in sorted(set(cur.keys()) | set(prev.keys())):
        cur_amount = round(cur.get(tip, {}).get("iznos", 0.0), 2)
        prev_amount = round(prev.get(tip, {}).get("iznos", 0.0), 2)
        delta = round(cur_amount - prev_amount, 2)
        delta_pct = (
            round((delta / prev_amount) * 100, 1)
            if prev_amount > 0
            else None
        )
        by_utility.append({
            "tip_utroska": tip,
            "godina_amount": cur_amount,
            "prev_godina_amount": prev_amount,
            "delta": delta,
            "delta_pct": delta_pct,
            "broj_racuna": cur.get(tip, {}).get("broj_racuna", 0),
        })

    total_cur = round(sum(u["godina_amount"] for u in by_utility), 2)
    total_prev = round(sum(u["prev_godina_amount"] for u in by_utility), 2)
    return {
        "nekretnina_id": nekretnina_id,
        "godina": godina,
        "total_godina": total_cur,
        "total_prev_godina": total_prev,
        "delta": round(total_cur - total_prev, 2),
        "delta_pct": (
            round(((total_cur - total_prev) / total_prev) * 100, 1)
            if total_prev > 0
            else None
        ),
        "by_utility": by_utility,
    }


@router.get(
    "/analytics/anomalies",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def detect_bill_anomalies(
    threshold_pct: float = 30.0,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Find bills whose amount is more than `threshold_pct` % above the
    rolling 12-month average for the same property + utility type.

    This is the "struja je 35% veća nego inače — provjeri curi li negdje"
    early-warning signal. Cheap to compute (one pass through the bills
    table) and very actionable.
    """
    from collections import defaultdict
    from datetime import timedelta

    today = date.today()
    cutoff_recent = today - timedelta(days=90)
    cutoff_baseline = today - timedelta(days=365)

    rows = await racuni.find_all(extra_conditions=[
        RacuniRow.datum_racuna >= cutoff_baseline,
        RacuniRow.is_master_bill.is_(False),
        RacuniRow.iznos > 0,
    ])

    # Group by (nekretnina, tip) → bills in baseline window
    baseline: Dict[tuple, List[float]] = defaultdict(list)
    recent: List[Any] = []
    for r in rows:
        if not r.nekretnina_id or not r.datum_racuna:
            continue
        key = (r.nekretnina_id, r.tip_utroska or "ostalo")
        baseline[key].append(float(r.iznos))
        if r.datum_racuna >= cutoff_recent:
            recent.append(r)

    anomalies: List[Dict[str, Any]] = []
    for r in recent:
        key = (r.nekretnina_id, r.tip_utroska or "ostalo")
        history = [v for v in baseline[key] if v != float(r.iznos or 0)]
        # Need at least 2 historical points to claim "average".
        if len(history) < 2:
            continue
        avg = sum(history) / len(history)
        if avg <= 0:
            continue
        pct_over = ((float(r.iznos or 0) - avg) / avg) * 100
        if pct_over >= threshold_pct:
            anomalies.append({
                "racun_id": r.id,
                "broj_racuna": r.broj_racuna,
                "tip_utroska": r.tip_utroska,
                "dobavljac": r.dobavljac,
                "datum_racuna": r.datum_racuna.isoformat() if r.datum_racuna else None,
                "iznos": round(float(r.iznos or 0), 2),
                "rolling_average": round(avg, 2),
                "pct_over_average": round(pct_over, 1),
                "nekretnina_id": r.nekretnina_id,
            })

    anomalies.sort(key=lambda a: a["pct_over_average"], reverse=True)
    return {
        "threshold_pct": threshold_pct,
        "window_recent_days": 90,
        "window_baseline_days": 365,
        "count": len(anomalies),
        "anomalies": anomalies,
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
    items, (total_billed, total_paid) = await asyncio.gather(
        racuni.find_all(
            filters={"zakupnik_id": zakupnik_id},
            order_by="datum_racuna",
        ),
        racuni.ledger_totals(zakupnik_id),
    )

    return {
        "zakupnik_id": zakupnik_id,
        "racuni": [_normalize_file_path(racuni.to_dict(item)) for item in items],
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

    # Parallel: contract income + bill expenses via SQL
    income_result, expense_result = await asyncio.gather(
        ugovori.tax_income_for_year(target_year),
        racuni.expense_by_year(target_year),
    )

    total_income = income_result
    total_expenses, expense_by_type = expense_result
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
    return _normalize_file_path(racuni.to_dict(item))


# --------------- Bill split endpoints ---------------


@router.post(
    "/{id}/split-preview",
    dependencies=[Depends(deps.require_scopes("financials:update"))],
)
async def preview_bill_split(
    id: str,
    body: BillSplitBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Compute a per-unit breakdown without writing anything. Lets the
    UI show a live preview as the user adjusts the allocation."""
    from app.services.bill_split_service import (
        BillSplitMethod,
        compute_split,
    )

    master = await racuni.get_by_id(id)
    if not master:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")
    try:
        method = BillSplitMethod(body.method)
    except ValueError:
        raise HTTPException(
            status_code=422, detail=f"Nepoznat način podjele: {body.method}"
        )

    breakdown = await compute_split(master, method, body.unit_ids, body.values)
    return {
        "master_amount": float(master.iznos or 0),
        "breakdown": breakdown,
        "total": round(sum(b["amount"] for b in breakdown), 2),
    }


@router.post(
    "/{id}/split",
    dependencies=[
        Depends(deps.require_scopes("financials:update")),
        Depends(deps.require_tenant()),
    ],
)
async def split_bill(
    id: str,
    body: BillSplitBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Materialise the split — create one child Račun per unit. Refuses
    if the master is already split (call DELETE first to redo)."""
    from app.services.bill_split_service import BillSplitMethod, apply_split

    master = await racuni.get_by_id(id)
    if not master:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")
    try:
        method = BillSplitMethod(body.method)
    except ValueError:
        raise HTTPException(
            status_code=422, detail=f"Nepoznat način podjele: {body.method}"
        )

    children = await apply_split(
        master, method, body.unit_ids, body.values, current_user["id"]
    )
    return {
        "master_id": id,
        "children": [_normalize_file_path(racuni.to_dict(c)) for c in children],
    }


@router.get(
    "/{id}/children",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def get_bill_children(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Return all child bills generated from this master."""
    from app.services.bill_split_service import list_children

    master = await racuni.get_by_id(id)
    if not master:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")
    children = await list_children(id)
    return [_normalize_file_path(racuni.to_dict(c)) for c in children]


@router.delete(
    "/{id}/split",
    dependencies=[
        Depends(deps.require_scopes("financials:update")),
        Depends(deps.require_tenant()),
    ],
)
async def remove_bill_split(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Undo a split — delete every child and clear the master flag.
    Refuses if any child has recorded payments."""
    from app.services.bill_split_service import remove_split

    master = await racuni.get_by_id(id)
    if not master:
        raise HTTPException(status_code=404, detail="Racun nije pronadjen")
    deleted = await remove_split(master)
    return {"deleted_children": deleted}


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
        update_dict["updated_at"] = datetime.now(timezone.utc)
        updated = await racuni.update_by_id(id, update_dict)
    else:
        updated = item

    return _normalize_file_path(racuni.to_dict(updated))


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

    if item.preknjizavanje_status == "zavrseno" and data.preknjizavanje_status == "zavrseno":
        raise HTTPException(status_code=422, detail="Preknjizavanje je vec zavrseno")

    update_dict = {
        "preknjizavanje_status": data.preknjizavanje_status,
        "updated_at": datetime.now(timezone.utc),
    }
    if data.preknjizavanje_napomena is not None:
        update_dict["preknjizavanje_napomena"] = data.preknjizavanje_napomena

    updated = await racuni.update_by_id(id, update_dict)
    return _normalize_file_path(racuni.to_dict(updated))


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
    # `gt=0` na Pydantic razini odbije 0 i negativne iznose s 422
    # prije nego endpoint dođe do ručnog `<= 0` provjere.
    iznos_uplate: float = Field(..., gt=0)
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

    # PaymentBody već radi `gt=0` validaciju, ali zadržimo ovo kao
    # safety net za stara API klijenta koja možda zaobiđu schemu.
    if body.iznos_uplate <= 0:
        raise HTTPException(status_code=422, detail="Iznos uplate mora biti pozitivan")

    # Spriječi overpayment — preplata nije prihvatljiva poslovno
    # (računovođe traže credit note). Postojeće uplate + nova ne
    # smije premašiti iznos računa za više od 1 centi tolerancije
    # (zaokruživanje).
    existing_paid = sum(float(p.get("iznos", 0)) for p in (item.payments or []))
    bill_amount = float(item.iznos or 0)
    if existing_paid + body.iznos_uplate > bill_amount + 0.01:
        remaining = max(0.0, bill_amount - existing_paid)
        raise HTTPException(
            status_code=422,
            detail=(
                f"Uplata premašuje preostali iznos računa. Preostalo za "
                f"plaćanje: {remaining:.2f} EUR"
            ),
        )

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
        "updated_at": datetime.now(timezone.utc),
    })

    return _normalize_file_path(racuni.to_dict(updated))


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

    now = datetime.now(timezone.utc)

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

    return _normalize_file_path(racuni.to_dict(updated_bill))


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

    now = datetime.now(timezone.utc)
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

    return _normalize_file_path(racuni.to_dict(updated_bill))


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

    now = datetime.now(timezone.utc)
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

    return _normalize_file_path(racuni.to_dict(updated_bill))


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

    now = datetime.now(timezone.utc)
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
    return _normalize_file_path(racuni.to_dict(updated))


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


# ---------------------------------------------------------------------------
# AI auto-save: upload + parse + create draft in one round-trip
# ---------------------------------------------------------------------------


def _extract_pdf_text(file_path: str) -> str:
    if PdfReader is None:
        raise HTTPException(status_code=500, detail="pypdf nije instaliran")
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages[:5]:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text
    except Exception as e:
        logger.error("PDF read failed: %s", e)
        raise HTTPException(status_code=400, detail="Greska pri citanju PDF-a")


def _ai_parse_bill_text(text: str) -> Dict[str, Any]:
    """Send PDF text to Claude, parse JSON response. Returns mock data
    if no API key configured — useful for dev / smoke tests."""
    client = _get_anthropic_client()
    if client is None:
        return {
            "dobavljac": "Mock Dobavljac d.o.o.",
            "broj_racuna": "MOCK-2026-001",
            "datum_racuna": date.today().isoformat(),
            "datum_dospijeca": date.today().isoformat(),
            "iznos": 100.0,
            "valuta": "EUR",
            "tip_utroska": "ostalo",
            "_source": "fallback",
        }

    json_structure = """
    {
        "dobavljac": "string", "broj_racuna": "string",
        "datum_racuna": "YYYY-MM-DD", "datum_dospijeca": "YYYY-MM-DD",
        "iznos": "number", "valuta": "string",
        "tip_utroska": "struja|voda|plin|komunalije|internet|ostalo",
        "period_od": "YYYY-MM-DD or null", "period_do": "YYYY-MM-DD or null",
        "potrosnja_kwh": "number or null", "potrosnja_m3": "number or null"
    }
    """
    response = client.messages.create(
        model=CLAUDE_TEXT_MODEL,
        max_tokens=1024,
        system=(
            "Ti si asistent za analizu racuna za komunalne usluge i energente. "
            "Vracas iskljucivo validan JSON bez ikakvih dodatnih objasnjenja."
        ),
        messages=[{
            "role": "user",
            "content": (
                f"Analiziraj tekst racuna i izvuci podatke u JSON formatu:\n"
                f"{json_structure}\n\nTekst racuna:\n{text[:6000]}"
            ),
        }],
        temperature=0,
    )
    content = response.content[0].text.strip()
    for fence in ("```json", "```"):
        if content.startswith(fence):
            content = content[len(fence):]
        if content.endswith("```"):
            content = content[:-3]
    content = content.strip()
    return json.loads(content)


@router.post(
    "/parse-and-create",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("financials:create")),
        Depends(deps.require_tenant()),
    ],
)
async def parse_and_create_bill(
    nekretnina_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Upload a PDF supplier invoice → AI extracts fields → DRAFT bill is
    created automatically. The user only needs to review and approve.

    Cuts ~5 minutes per bill compared to the existing two-step flow
    (upload then run /parse-ai then manually fill the form).
    """
    if not file or not file.filename:
        raise HTTPException(status_code=422, detail="Datoteka je obavezna.")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=422, detail=f"Nedozvoljeni tip datoteke: {ext}"
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"Datoteka prevelika (>{MAX_FILE_SIZE_MB}MB).",
        )

    # Save the file first so the parsed data has an attachment to point at.
    doc_id = str(uuid.uuid4())
    safe_name = _sanitize_filename(file.filename)
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest = settings.UPLOAD_DIR / f"{doc_id}_{safe_name}"
    with dest.open("wb") as buf:
        buf.write(contents)

    text = _extract_pdf_text(str(dest))
    if len(text.strip()) < 20:
        # Don't fail — create an empty draft so user can fill manually.
        parsed: Dict[str, Any] = {"_source": "no_text"}
    else:
        try:
            parsed = _ai_parse_bill_text(text)
        except json.JSONDecodeError:
            parsed = {"_source": "ai_invalid_json"}
        except Exception as e:
            logger.warning("AI parsing failed in parse-and-create: %s", e)
            parsed = {"_source": "ai_error"}

    # Validate / coerce parsed values to safe defaults.
    def _safe_date(v: Any) -> Optional[date]:
        if not v:
            return None
        try:
            return date.fromisoformat(str(v))
        except Exception:
            return None

    def _safe_float(v: Any) -> float:
        try:
            return float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            return 0.0

    tip = parsed.get("tip_utroska") or "ostalo"
    try:
        UtilityType(tip)
    except ValueError:
        tip = "ostalo"

    doc_data = {
        "id": doc_id,
        "tip_utroska": tip,
        "dobavljac": parsed.get("dobavljac") or "",
        "broj_racuna": parsed.get("broj_racuna") or "",
        "datum_racuna": _safe_date(parsed.get("datum_racuna")),
        "datum_dospijeca": _safe_date(parsed.get("datum_dospijeca")),
        "iznos": _safe_float(parsed.get("iznos")),
        "valuta": parsed.get("valuta") or "EUR",
        "nekretnina_id": nekretnina_id,
        "period_od": _safe_date(parsed.get("period_od")),
        "period_do": _safe_date(parsed.get("period_do")),
        "potrosnja_kwh": _safe_float(parsed.get("potrosnja_kwh")) or None,
        "potrosnja_m3": _safe_float(parsed.get("potrosnja_m3")) or None,
        "file_path": str(dest),
        "original_filename": file.filename,
        "content_type": file.content_type,
        # Start as draft so the user reviews before it counts as a real bill.
        "approval_status": "draft",
        "status_placanja": "ceka_placanje",
        "created_by": current_user["id"],
    }
    created = await racuni.create(doc_data)
    return {
        "bill": _normalize_file_path(racuni.to_dict(created)),
        "ai_extraction": parsed,
    }

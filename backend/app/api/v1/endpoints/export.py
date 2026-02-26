import csv
import io
import logging
from datetime import datetime

from app.api import deps
from app.core.limiter import limiter
from app.db.repositories.instance import nekretnine, zakupnici, ugovori, maintenance_tasks, racuni
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

# All export endpoints require tenant context since they read tenant-scoped data

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_EXPORT_ROWS = 10_000


def make_csv_response(rows: list, headers: list, filename: str):
    """Create a StreamingResponse with CSV content."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/nekretnine",
    dependencies=[
        Depends(deps.require_scopes("properties:read")),
        Depends(deps.require_tenant()),
    ],
)
@limiter.limit("10/minute")
async def export_nekretnine(
    request: Request, current_user=Depends(deps.get_current_user)
):
    """Export all properties to CSV."""
    items = await nekretnine.find_all()
    items = items[:MAX_EXPORT_ROWS]
    headers = [
        "Naziv",
        "Vrsta",
        "Adresa",
        "Katastarska općina",
        "Broj kat. čestice",
        "Površina m²",
        "Vlasnik",
        "Udio vlasništva",
        "Godina izgradnje",
    ]
    rows = []
    for item in items:
        rows.append(
            [
                item.naziv or "",
                item.vrsta or "",
                item.adresa or "",
                item.katastarska_opcina or "",
                item.broj_kat_cestice or "",
                item.povrsina or "",
                item.vlasnik or "",
                item.udio_vlasnistva or "",
                item.godina_izgradnje or "",
            ]
        )
    stamp = datetime.now().strftime("%Y%m%d")
    return make_csv_response(rows, headers, f"nekretnine_{stamp}.csv")


@router.get(
    "/zakupnici",
    dependencies=[
        Depends(deps.require_scopes("tenants:read")),
        Depends(deps.require_tenant()),
    ],
)
@limiter.limit("10/minute")
async def export_zakupnici(
    request: Request, current_user=Depends(deps.get_current_user)
):
    """Export all tenants to CSV."""
    items = await zakupnici.find_all()
    items = items[:MAX_EXPORT_ROWS]
    headers = [
        "Tip",
        "Status",
        "Naziv firme",
        "Ime i prezime",
        "OIB",
        "IBAN",
        "Kontakt ime",
        "Kontakt email",
        "Kontakt telefon",
        "Adresa",
        "Grad",
    ]
    rows = []
    for item in items:
        rows.append(
            [
                item.tip or "",
                item.status or "",
                item.naziv_firme or "",
                item.ime_prezime or "",
                item.oib or "",
                item.iban or "",
                item.kontakt_ime or "",
                item.kontakt_email or "",
                item.kontakt_telefon or "",
                item.adresa_ulica or "",
                item.adresa_grad or "",
            ]
        )
    stamp = datetime.now().strftime("%Y%m%d")
    return make_csv_response(rows, headers, f"zakupnici_{stamp}.csv")


@router.get(
    "/ugovori",
    dependencies=[
        Depends(deps.require_scopes("contracts:read")),
        Depends(deps.require_tenant()),
    ],
)
@limiter.limit("10/minute")
async def export_ugovori(request: Request, current_user=Depends(deps.get_current_user)):
    """Export all contracts to CSV."""
    items = await ugovori.find_all()
    items = items[:MAX_EXPORT_ROWS]
    headers = [
        "Interna oznaka",
        "Status",
        "Odobrenje",
        "Datum početka",
        "Datum završetka",
        "Osnovna zakupnina €",
        "CAM troškovi €",
        "Polog/depozit €",
        "Namjena prostora",
        "Indeksacija",
    ]
    rows = []
    for item in items:
        rows.append(
            [
                item.interna_oznaka or "",
                item.status or "",
                item.approval_status or "approved",
                item.datum_pocetka or "",
                item.datum_zavrsetka or "",
                item.osnovna_zakupnina or "",
                item.cam_troskovi or "",
                item.polog_depozit or "",
                item.namjena_prostora or "",
                "Da" if item.indeksacija else "Ne",
            ]
        )
    stamp = datetime.now().strftime("%Y%m%d")
    return make_csv_response(rows, headers, f"ugovori_{stamp}.csv")


@router.get(
    "/maintenance",
    dependencies=[
        Depends(deps.require_scopes("maintenance:read")),
        Depends(deps.require_tenant()),
    ],
)
@limiter.limit("10/minute")
async def export_maintenance(
    request: Request, current_user=Depends(deps.get_current_user)
):
    """Export all maintenance tasks to CSV."""
    items = await maintenance_tasks.find_all()
    items = items[:MAX_EXPORT_ROWS]
    headers = [
        "Naziv",
        "Status",
        "Prioritet",
        "Rok",
        "Zadužen",
        "Procijenjeni trošak €",
        "Stvarni trošak €",
        "Opis",
    ]
    rows = []
    for item in items:
        rows.append(
            [
                item.title or "",
                item.status or "",
                item.priority or "",
                item.due_date or "",
                item.assigned_to or "",
                item.estimated_cost or "",
                item.actual_cost or "",
                item.description or "",
            ]
        )
    stamp = datetime.now().strftime("%Y%m%d")
    return make_csv_response(rows, headers, f"odrzavanje_{stamp}.csv")


@router.get(
    "/racuni",
    dependencies=[
        Depends(deps.require_scopes("financials:read")),
        Depends(deps.require_tenant()),
    ],
)
@limiter.limit("10/minute")
async def export_racuni(request: Request, current_user=Depends(deps.get_current_user)):
    """Export all bills to CSV."""
    items = await racuni.find_all()
    items = items[:MAX_EXPORT_ROWS]
    headers = [
        "Tip utroška",
        "Dobavljač",
        "Broj računa",
        "Datum računa",
        "Datum dospijeća",
        "Iznos €",
        "Status plaćanja",
        "Odobrenje",
        "Preknjižavanje",
        "Period od",
        "Period do",
        "Potrošnja kWh",
        "Potrošnja m³",
        "Napomena",
    ]
    rows = []
    for item in items:
        rows.append(
            [
                item.tip_utroska or "",
                item.dobavljac or "",
                item.broj_racuna or "",
                item.datum_racuna or "",
                item.datum_dospijeca or "",
                item.iznos or "",
                item.status_placanja or "",
                item.approval_status or "approved",
                item.preknjizavanje_status or "",
                item.period_od or "",
                item.period_do or "",
                item.potrosnja_kwh or "",
                item.potrosnja_m3 or "",
                item.napomena or "",
            ]
        )
    stamp = datetime.now().strftime("%Y%m%d")
    return make_csv_response(rows, headers, f"racuni_{stamp}.csv")

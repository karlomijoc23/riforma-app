import asyncio
from datetime import date
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
from fastapi.responses import Response as FastAPIResponse
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


@router.get(
    "/{id}/statement",
    dependencies=[Depends(deps.require_scopes("financials:read"))],
)
async def export_tenant_statement(
    id: str,
    period_od: str,
    period_do: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Render a branded PDF "specifikacija zaduženja" for the tenant
    covering the given period. Lists every bill, totals, outstanding
    balance. Falls back with 503 if WeasyPrint isn't installed."""
    from app.services.tenant_statement_service import render_tenant_statement_pdf

    try:
        po = date.fromisoformat(period_od)
        pd_ = date.fromisoformat(period_do)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="period_od / period_do moraju biti u formatu YYYY-MM-DD.",
        )
    if po > pd_:
        raise HTTPException(
            status_code=422,
            detail="period_od ne može biti nakon period_do.",
        )

    pdf_bytes = await render_tenant_statement_pdf(id, po, pd_)
    safe_period = f"{po.isoformat()}_{pd_.isoformat()}"
    filename = f"specifikacija-{id[:8]}-{safe_period}.pdf"
    return FastAPIResponse(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


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


class InviteTenantUserBody(BaseModel):
    email: Optional[str] = None  # falls back to zakupnik.kontakt_email
    full_name: Optional[str] = None


@router.post(
    "/{id}/invite-user",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(deps.require_scopes("tenants:update")),
        Depends(deps.require_tenant()),
    ],
)
async def invite_tenant_user(
    id: str,
    body: InviteTenantUserBody = InviteTenantUserBody(),
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Create a `tenant`-role user account and link it to this zakupnik
    so the zakupnik can self-serve via `/self/*` endpoints.

    Returns the new user payload + a one-time temporary password; the
    admin shares the password with the zakupnik through a secure channel.
    """
    import secrets
    import string

    from app.core.security import hash_password
    from app.core.roles import resolve_role_scopes
    from app.db.repositories.instance import users

    existing = await zakupnici.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")
    if existing.user_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "Zakupnik već ima povezan korisnički račun. Obrišite ga prije"
                " ponovne pozivnice."
            ),
        )

    email = (body.email or existing.kontakt_email or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Email adresa je obavezna — postavite kontakt_email na"
                " zakupniku ili je proslijedite u zahtjevu."
            ),
        )

    full_name = (
        body.full_name
        or existing.kontakt_ime
        or existing.naziv_firme
        or existing.ime_prezime
        or "Zakupnik"
    )

    if await users.find_one(email=email):
        raise HTTPException(
            status_code=400,
            detail=f"Korisnik s email adresom '{email}' već postoji.",
        )

    alphabet = string.ascii_letters + string.digits + "!@#$%"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(16))

    user_data = {
        "email": email,
        "full_name": full_name,
        "role": "tenant",
        "scopes": resolve_role_scopes("tenant", []),
        "password_hash": hash_password(temp_password),
        # Tenant must rotate before doing anything in the portal.
        "must_change_password": True,
    }
    new_user = await users.create(user_data)

    await zakupnici.update_by_id(id, {"user_id": new_user.id})

    # Prefer to email the temp password. We only echo it back to the admin
    # if SMTP isn't configured / the send failed — otherwise plaintext
    # passwords leak into proxy access logs, Sentry breadcrumbs, etc.
    from app.core.email import send_email

    invite_html = (
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">'
        '<div style="background:#1d3557;color:#fff;padding:18px;'
        'border-radius:8px 8px 0 0;">'
        f'<h2 style="margin:0;">Dobrodošli, {full_name}</h2>'
        '<p style="margin:4px 0 0;opacity:0.85;">Riforma · self-service portal</p>'
        '</div>'
        '<div style="padding:18px;background:#f8fafc;border:1px solid #e2e8f0;'
        'border-radius:0 0 8px 8px;">'
        f'<p>Vaš upravitelj portfelja kreirao Vam je račun s adresom '
        f'<strong>{email}</strong>.</p>'
        '<p>Privremena lozinka (potrebno ju je promijeniti pri prvoj prijavi):</p>'
        f'<p style="font-family:monospace;font-size:18px;background:#e2e8f0;'
        f'padding:10px 14px;border-radius:6px;">{temp_password}</p>'
        '<p style="margin-top:14px;color:#64748b;font-size:13px;">'
        'Ova poruka je automatski generirana. Ako je dobijete greškom,'
        ' obratite se upravitelju.</p>'
        '</div></div>'
    )
    sent = await send_email(
        email, "Riforma · vaš pristupni račun", invite_html
    )

    response = {
        "user_id": new_user.id,
        "email": email,
        "full_name": full_name,
        "delivery": "email" if sent else "response",
        "message": (
            "Korisnički račun kreiran. Privremena lozinka poslana e-poštom."
            if sent
            else (
                "Korisnički račun kreiran. SMTP nije konfiguriran —"
                " privremena lozinka je u 'temp_password' polju."
                " Podijelite je sa zakupnikom sigurnim kanalom."
            )
        ),
    }
    if not sent:
        # Only expose the secret when delivery actually failed.
        response["temp_password"] = temp_password
    return response


@router.delete(
    "/{id}/user-link",
    dependencies=[
        Depends(deps.require_scopes("tenants:update")),
        Depends(deps.require_tenant()),
    ],
)
async def unlink_tenant_user(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Disconnect the linked user account from this zakupnik. The user
    row stays (admin can decide separately whether to deactivate it via
    `/users` endpoints) but loses access to `/self/*` for this zakupnik.
    """
    existing = await zakupnici.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Zakupnik nije pronađen")
    if not existing.user_id:
        return {"message": "Zakupnik nema povezan korisnički račun."}
    await zakupnici.update_by_id(id, {"user_id": None})
    return {"message": "Korisnički račun odvojen od zakupnika."}

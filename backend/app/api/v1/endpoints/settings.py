"""Tenant-level settings endpoint.

Each tenant can store its own settings (company info, defaults, etc.)
in the `tenant_settings` table.  One row per tenant.
"""

import logging
from typing import Any, Dict, Optional

from app.api import deps
from app.core.validators import validate_iban, validate_oib
from app.db.repositories.instance import tenant_memberships, tenant_settings
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)
router = APIRouter()


class TenantSettings(BaseModel):
    # Company branding
    naziv_tvrtke: Optional[str] = None
    adresa: Optional[str] = None
    grad: Optional[str] = None
    postanski_broj: Optional[str] = None
    oib: Optional[str] = None
    iban: Optional[str] = None
    telefon: Optional[str] = None
    email: Optional[str] = None
    web: Optional[str] = None
    logo_url: Optional[str] = None

    # Defaults
    default_valuta: str = "EUR"
    default_pdv_stopa: float = 25.0
    default_rok_placanja_dani: int = 15
    default_jezik: str = "hr"

    # Notifications
    email_obavijesti: bool = True
    obavijest_istek_ugovora_dani: int = 30
    obavijest_rok_odrzavanja: bool = True

    # Report
    report_header_text: Optional[str] = None
    report_footer_text: Optional[str] = None

    @field_validator("oib", mode="before")
    @classmethod
    def validate_oib_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_oib(v)

    @field_validator("iban", mode="before")
    @classmethod
    def validate_iban_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_iban(v)


@router.get("", dependencies=[Depends(deps.require_scopes("settings:read"))])
async def get_settings(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    from app.db.tenant import CURRENT_TENANT_ID

    tenant_id = CURRENT_TENANT_ID.get()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nije odabran portfelj")

    doc = await tenant_settings.find_one(tenant_id=tenant_id)
    if not doc:
        # Return defaults
        defaults = TenantSettings().model_dump()
        defaults["tenant_id"] = tenant_id
        return defaults
    return tenant_settings.to_dict(doc)


@router.put(
    "",
    dependencies=[
        Depends(deps.require_scopes("settings:write")),
        Depends(deps.require_tenant()),
    ],
)
async def update_settings(
    settings_in: TenantSettings,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    from app.db.tenant import CURRENT_TENANT_ID

    tenant_id = CURRENT_TENANT_ID.get()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nije odabran portfelj")

    # Check if user has admin/owner role in this tenant
    membership = await tenant_memberships.find_one(
        user_id=current_user["id"], tenant_id=tenant_id, status="active"
    )
    if not membership or membership.role not in ["admin", "owner"]:
        raise HTTPException(
            status_code=403, detail="Samo admin ili vlasnik mogu mijenjati postavke"
        )

    settings_data = settings_in.model_dump()
    settings_data["tenant_id"] = tenant_id

    existing = await tenant_settings.find_one(tenant_id=tenant_id)
    if existing:
        updated = await tenant_settings.update_by_id(existing.id, settings_data)
        return tenant_settings.to_dict(updated)
    else:
        instance = await tenant_settings.create(settings_data)
        return tenant_settings.to_dict(instance)


@router.post(
    "/sync-statuses",
    dependencies=[
        Depends(deps.require_scopes("properties:update")),
        Depends(deps.require_tenant()),
    ],
)
async def manual_sync_statuses(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """
    Manually trigger contract & unit status synchronization.
    - Marks expiring contracts as NA_ISTEKU
    - Expires overdue contracts and frees units
    - Fixes orphaned rented units
    """
    from app.services.contract_status_service import sync_contract_and_unit_statuses

    try:
        await sync_contract_and_unit_statuses()
        return {"message": "Sinkronizacija statusa uspješno završena."}
    except Exception as e:
        logger.error(f"Status sync failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Greška prilikom sinkronizacije statusa",
        )

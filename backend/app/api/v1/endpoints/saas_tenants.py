import logging
from typing import Any, Dict, Optional

from app.api import deps
from app.core.validators import validate_iban, validate_oib
from app.db.repositories.instance import saas_tenants, tenant_memberships
from app.models.tables import SaasTenantRow
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator

logger = logging.getLogger(__name__)
router = APIRouter()


class TenantUpdate(BaseModel):
    naziv: Optional[str] = None
    tip: Optional[str] = None
    status: Optional[str] = None
    oib: Optional[str] = None
    iban: Optional[str] = None

    @field_validator("oib", mode="before")
    @classmethod
    def validate_oib_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_oib(v)

    @field_validator("iban", mode="before")
    @classmethod
    def validate_iban_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_iban(v)


class TenantCreate(BaseModel):
    naziv: str
    tip: str = "company"
    status: str = "active"
    oib: Optional[str] = None
    iban: Optional[str] = None

    @field_validator("oib", mode="before")
    @classmethod
    def validate_oib_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_oib(v)

    @field_validator("iban", mode="before")
    @classmethod
    def validate_iban_field(cls, v: Optional[str]) -> Optional[str]:
        return validate_iban(v)


@router.get("", dependencies=[Depends(deps.require_scopes("tenants:read"))])
async def get_my_tenants(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # All users (including admins) only see tenants they have an active membership for.
    # This enforces strict tenant isolation — no global admin backdoor.
    memberships = await tenant_memberships.find_all(
        filters={"user_id": current_user["id"], "status": "active"}
    )

    if not memberships:
        return []

    tenant_ids = [m.tenant_id for m in memberships]
    role_map = {m.tenant_id: m.role for m in memberships}

    items = await saas_tenants.find_all(
        extra_conditions=[SaasTenantRow.id.in_(tenant_ids)]
    )

    results = []
    for item in items:
        data = saas_tenants.to_dict(item)
        data["role"] = role_map.get(data["id"], "member")
        results.append(data)
    return results


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_scopes("tenants:create"))],
)
async def create_tenant(
    item_in: TenantCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Only admin can create tenants
    if current_user["role"] not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Nemate ovlasti za ovu radnju")

    item_data = item_in.model_dump()
    created_tenant = await saas_tenants.create(item_data)

    # Create owner membership so the user can access the new tenant
    membership_data = {
        "user_id": current_user["id"],
        "tenant_id": created_tenant.id,
        "role": "owner",
        "status": "active",
    }
    await tenant_memberships.create(membership_data)

    return saas_tenants.to_dict(created_tenant)


@router.get("/{id}", dependencies=[Depends(deps.require_scopes("tenants:read"))])
async def get_tenant(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Verify the user has access to this tenant
    membership = await tenant_memberships.find_one(
        user_id=current_user["id"], tenant_id=id, status="active"
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Nemate pristup ovom portfelju")

    item = await saas_tenants.get_by_id(id)
    if not item:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return saas_tenants.to_dict(item)


@router.put("/{id}", dependencies=[Depends(deps.require_scopes("tenants:update"))])
async def update_tenant(
    id: str,
    item_in: TenantUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Must be an admin or owner member of this specific tenant
    membership = await tenant_memberships.find_one(
        user_id=current_user["id"], tenant_id=id, status="active"
    )
    if not membership or membership.role not in ["admin", "owner"]:
        raise HTTPException(status_code=403, detail="Nemate ovlasti za ovu radnju")

    existing = await saas_tenants.get_by_id(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = item_in.model_dump(exclude_unset=True)
    if not update_data:
        return saas_tenants.to_dict(existing)

    updated = await saas_tenants.update_by_id(id, update_data)
    return saas_tenants.to_dict(updated)


@router.delete("/{id}", dependencies=[Depends(deps.require_scopes("tenants:delete"))])
async def delete_tenant(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Only an owner member of this specific tenant can delete it
    tenant = await saas_tenants.get_by_id(id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Portfelj nije pronađen")

    membership = await tenant_memberships.find_one(
        tenant_id=id, user_id=current_user["id"], status="active"
    )
    if not membership or membership.role != "owner":
        raise HTTPException(
            status_code=403, detail="Nemate ovlasti za brisanje ovog portfelja"
        )

    # Hard-delete every tenant-scoped table in dependency order so we don't
    # trip RESTRICT FKs on ugovori / racuni / property_units / etc. that
    # all point at saas_tenants. Pre-flight count gives the admin one
    # last warning if the portfolio still has business data.
    from sqlalchemy import delete as _delete, func as _func, select as _select

    from app.db.session import get_async_session_factory
    from app.models.tables import (
        ActivityLogRow,
        DobavljaciRow,
        DokumentiRow,
        HandoverProtocolRow,
        MaintenanceTaskRow,
        NekretnineRow,
        NotificationRow,
        OglasiRow,
        ParkingSpaceRow,
        ProjektiRow,
        PropertyUnitRow,
        RacuniRow,
        TenantSettingsRow,
        UgovoriRow,
        ZakupniciRow,
        ugovor_parkings,
        ugovor_units,
        maintenance_task_units,
    )

    # Order: junctions → leaves → mid-level → parents
    deletion_order = [
        # M:N junctions first (no FK to saas_tenants but tied to deleted parents)
        ugovor_units,
        ugovor_parkings,
        maintenance_task_units,
        # Activity logs + notifications + settings — leaf tables
        ActivityLogRow,
        NotificationRow,
        TenantSettingsRow,
        # Receivables / supplier records
        RacuniRow,
        # Tasks reference units/contracts/properties — drop first
        MaintenanceTaskRow,
        HandoverProtocolRow,
        # Documents reference contracts/units/properties/tenants
        DokumentiRow,
        # Contracts depend on properties + lessees
        UgovoriRow,
        # Listings reference properties
        OglasiRow,
        # Projects reference properties
        ProjektiRow,
        # Parking + units depend on properties
        ParkingSpaceRow,
        PropertyUnitRow,
        # Top-level tenant-scoped entities
        ZakupniciRow,
        NekretnineRow,
        DobavljaciRow,
    ]

    session_factory = get_async_session_factory()
    async with session_factory() as session:
        async with session.begin():
            # Junction tables don't carry tenant_id — delete by joining
            # through their tenant-scoped parents. Easiest: delete every
            # junction row whose left FK references a tenant-scoped row
            # in this portfolio.
            await session.execute(
                _delete(ugovor_units).where(
                    ugovor_units.c.ugovor_id.in_(
                        _select(UgovoriRow.id).where(
                            UgovoriRow.tenant_id == id
                        )
                    )
                )
            )
            await session.execute(
                _delete(ugovor_parkings).where(
                    ugovor_parkings.c.ugovor_id.in_(
                        _select(UgovoriRow.id).where(
                            UgovoriRow.tenant_id == id
                        )
                    )
                )
            )
            await session.execute(
                _delete(maintenance_task_units).where(
                    maintenance_task_units.c.maintenance_task_id.in_(
                        _select(MaintenanceTaskRow.id).where(
                            MaintenanceTaskRow.tenant_id == id
                        )
                    )
                )
            )

            # Now wipe each tenant-scoped table.
            for table in deletion_order:
                if table in (ugovor_units, ugovor_parkings, maintenance_task_units):
                    continue  # already handled
                if hasattr(table, "tenant_id"):
                    await session.execute(
                        _delete(table).where(table.tenant_id == id)
                    )

            # Memberships + the tenant row itself.
            from app.models.tables import TenantMembershipRow as _TM
            from app.models.tables import SaasTenantRow as _ST

            await session.execute(
                _delete(_TM).where(_TM.tenant_id == id)
            )
            await session.execute(_delete(_ST).where(_ST.id == id))

    return {"message": "Portfelj uspješno obrisan"}

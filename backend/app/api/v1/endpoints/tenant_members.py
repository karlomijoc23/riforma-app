from typing import Any, Dict

from app.api import deps
from app.db.repositories.instance import saas_tenants, tenant_memberships, users
from app.models.domain import (
    TenantMembership,
    TenantMembershipRole,
    TenantMembershipStatus,
)
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

router = APIRouter(
    dependencies=[Depends(deps.require_scopes("tenants:manage_members"))],
)


class TenantMemberCreate(BaseModel):
    user_id: str
    role: TenantMembershipRole = TenantMembershipRole.MEMBER


class TenantMemberUpdate(BaseModel):
    role: TenantMembershipRole


async def _require_tenant_admin(current_user: Dict[str, Any], tenant_id: str):
    """Verify current user is an admin or owner of the specific tenant."""
    caller_membership = await tenant_memberships.find_one(
        tenant_id=tenant_id, user_id=current_user["id"], status="active"
    )
    if not caller_membership or caller_membership.role not in ["admin", "owner"]:
        raise HTTPException(
            status_code=403,
            detail="Nemate ovlasti za upravljanje članovima ovog portfelja",
        )
    return caller_membership


@router.post("/{tenant_id}/members", status_code=status.HTTP_201_CREATED)
async def add_tenant_member(
    tenant_id: str,
    member_in: TenantMemberCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    await _require_tenant_admin(current_user, tenant_id)

    # Check if tenant exists
    tenant = await saas_tenants.get_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Portfelj nije pronađen")

    # Check if user exists
    user = await users.get_by_id(member_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")

    # Check if membership already exists
    existing = await tenant_memberships.find_one(
        tenant_id=tenant_id, user_id=member_in.user_id
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Korisnik je već član ovog portfelja"
        )

    membership = TenantMembership(
        user_id=member_in.user_id,
        tenant_id=tenant_id,
        role=member_in.role,
        status=TenantMembershipStatus.ACTIVE,
        invited_by=current_user["id"],
    )

    membership_data = membership.model_dump()
    created = await tenant_memberships.create(membership_data)

    return tenant_memberships.to_dict(created)


@router.put("/{tenant_id}/members/{user_id}", response_model=Dict[str, Any])
async def update_tenant_member(
    tenant_id: str,
    user_id: str,
    member_in: TenantMemberUpdate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    await _require_tenant_admin(current_user, tenant_id)

    # Check existence
    existing = await tenant_memberships.find_one(
        tenant_id=tenant_id, user_id=user_id
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Članstvo nije pronađeno")

    # Update role
    await tenant_memberships.update_many(
        filters={"tenant_id": tenant_id, "user_id": user_id},
        data={"role": member_in.role.value},
    )

    return {"message": "Uloga ažurirana"}


@router.delete("/{tenant_id}/members/{user_id}", response_model=Dict[str, Any])
async def remove_tenant_member(
    tenant_id: str,
    user_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    await _require_tenant_admin(current_user, tenant_id)

    # Check existence
    existing = await tenant_memberships.find_one(
        tenant_id=tenant_id, user_id=user_id
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Članstvo nije pronađeno")

    # Prevent removing the last owner
    if existing.role == "owner":
        owners = await tenant_memberships.find_all(
            filters={"tenant_id": tenant_id, "role": "owner", "status": "active"}
        )
        if len(owners) <= 1:
            raise HTTPException(
                status_code=400,
                detail="Nije moguće ukloniti jedinog vlasnika portfelja",
            )

    await tenant_memberships.delete_many(
        filters={"tenant_id": tenant_id, "user_id": user_id}
    )

    return {"message": "Član uklonjen"}

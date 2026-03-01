import logging
import secrets
import string
from typing import Any, Dict, List

from app.api import deps
from app.core.roles import resolve_membership_role, resolve_role_scopes
from app.core.security import hash_password
from app.db.repositories.instance import users, tenant_memberships, saas_tenants
from app.db.transaction import db_transaction
from app.models.domain import User, UserMembershipDisplay, UserPublic
from app.models.tables import UserRow
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_ROLES = {
    "viewer",
    "admin",
    "owner",
    "property_manager",
    "accountant",
    "unositelj",
    "vendor",
}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "viewer"
    scopes: List[str] = []


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(deps.require_scopes("users:create"))],
)
async def create_user(
    user_in: UserCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):

    # Check if exists
    email = user_in.email.lower()
    existing = await users.find_one(email=email)
    if existing:
        raise HTTPException(
            status_code=400, detail="Korisnik s tom email adresom već postoji"
        )

    # Validate role
    if user_in.role not in VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"Nepoznata uloga: {user_in.role}. Dozvoljene: {', '.join(sorted(VALID_ROLES))}",
        )

    # Generate a random temporary password
    # TODO: When SMTP is configured, send an invite email instead
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(16))
    logger.info("Created user %s with temporary password", email)

    user_data = {
        "email": email,
        "full_name": user_in.full_name,
        "role": user_in.role,
        "scopes": resolve_role_scopes(user_in.role, user_in.scopes),
        "password_hash": hash_password(temp_password),
    }

    new_user_row = await users.create(user_data)

    user_dict = users.to_dict(new_user_row)
    response_data = UserPublic(**user_dict).model_dump()
    # Return the temp password so the admin can share it with the new user.
    # This is the only time it is visible -- it is not stored in plaintext.
    # NOTE: Ideally, send via email when SMTP is configured. For now, the
    # admin copies it from the response and shares it securely.
    response_data["temp_password"] = temp_password
    return response_data


@router.get("", dependencies=[Depends(deps.require_scopes("users:read"))])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    from app.db.tenant import CURRENT_TENANT_ID
    from app.models.tables import TenantMembershipRow, SaasTenantRow

    current_tenant = CURRENT_TENANT_ID.get()

    # Scope to current tenant: only return users that are members of this tenant
    if current_tenant:
        membership_rows = await tenant_memberships.find_all(
            filters={"tenant_id": current_tenant, "status": "active"}
        )
        member_user_ids = [m.user_id for m in membership_rows]

        if not member_user_ids:
            return []

        user_items = await users.find_all(
            extra_conditions=[UserRow.id.in_(member_user_ids)],
            order_by="created_at",
            order_dir="desc",
        )
    else:
        user_items = await users.find_all(
            order_by="created_at",
            order_dir="desc",
        )

    # Apply pagination manually (find_all returns all)
    user_items = user_items[:limit]

    # Convert to Public and enrich with memberships
    results = []
    user_ids = [u.id for u in user_items]

    # Fetch memberships for these users (only within visible tenants)
    if current_tenant:
        # Only show membership for current tenant (isolation)
        all_memberships = [m for m in membership_rows if m.user_id in set(user_ids)]
    else:
        all_memberships = await tenant_memberships.find_all(
            extra_conditions=[TenantMembershipRow.user_id.in_(user_ids)]
        )

    tenant_ids = list(set([m.tenant_id for m in all_memberships]))
    if tenant_ids:
        all_tenants = await saas_tenants.find_all(
            extra_conditions=[SaasTenantRow.id.in_(tenant_ids)]
        )
    else:
        all_tenants = []
    tenant_map = {t.id: t.naziv for t in all_tenants}

    memberships_by_user = {}
    for m in all_memberships:
        uid = m.user_id
        if uid not in memberships_by_user:
            memberships_by_user[uid] = []
        t_name = tenant_map.get(m.tenant_id, "Unknown Tenant")
        memberships_by_user[uid].append(
            UserMembershipDisplay(
                tenant_id=m.tenant_id, tenant_name=t_name, role=m.role
            )
        )

    for user_row in user_items:
        user_dict = users.to_dict(user_row)
        user_public = UserPublic(**user_dict)
        user_public.memberships = memberships_by_user.get(user_row.id, [])
        results.append(user_public)

    return results


@router.get("/me", response_model=UserPublic)
async def get_me(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    user_row = await users.get_by_id(current_user["id"])
    if not user_row:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")
    user_dict = users.to_dict(user_row)
    return UserPublic(**user_dict)


class AssignRoleBody(BaseModel):
    role: str


@router.post(
    "/{id}/assign", dependencies=[Depends(deps.require_scopes("users:assign"))]
)
async def assign_user_to_tenant(
    id: str,
    body: AssignRoleBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    if body.role not in VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Nepoznata uloga: {body.role}."
                f" Dozvoljene: {', '.join(sorted(VALID_ROLES))}"
            ),
        )

    user_row = await users.get_by_id(id)
    if not user_row:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")

    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Nije odabran tenant")

    membership_role = resolve_membership_role(body.role)

    # Check if membership exists
    membership = await tenant_memberships.find_one(user_id=id, tenant_id=tenant_id)

    if membership:
        await tenant_memberships.update_by_id(
            membership.id, {"role": membership_role.value}
        )
    else:
        await tenant_memberships.create(
            {
                "user_id": id,
                "tenant_id": tenant_id,
                "role": membership_role.value,
                "status": "active",
            }
        )

    return {"message": "Korisnik dodijeljen"}


@router.delete(
    "/{id}",
    response_model=Dict[str, Any],
    dependencies=[Depends(deps.require_scopes("users:delete"))],
)
async def delete_user(
    id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):

    # Check if user exists
    user_row = await users.get_by_id(id)
    if not user_row:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")

    # Delete memberships + user atomically
    async with db_transaction() as txn:
        await tenant_memberships.delete_many(filters={"user_id": id}, session=txn)
        await users.delete_by_id(id, session=txn)

    return {"message": "Korisnik uspješno obrisan"}

import logging
import secrets
import string
from typing import Any, Dict, List, Optional

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
    "tenant",
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
        # Force rotation on first login since admin issued this password.
        "must_change_password": True,
    }

    new_user_row = await users.create(user_data)

    user_dict = users.to_dict(new_user_row)
    response_data = UserPublic(**user_dict).model_dump()

    # Email the temp password rather than returning it in the response when
    # SMTP is configured. Plaintext passwords in API responses leak into
    # access logs, error trackers, and HAR captures — undesirable even for
    # a one-shot value. Fallback to `temp_password` field only when send
    # fails so the admin still has a way to share it manually.
    from app.core.email import send_email

    invite_html = (
        '<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">'
        '<div style="background:#1d3557;color:#fff;padding:18px;'
        'border-radius:8px 8px 0 0;">'
        f'<h2 style="margin:0;">Dobrodošli, {user_in.full_name}</h2>'
        '<p style="margin:4px 0 0;opacity:0.85;">Riforma platforma</p>'
        '</div>'
        '<div style="padding:18px;background:#f8fafc;border:1px solid #e2e8f0;'
        'border-radius:0 0 8px 8px;">'
        f'<p>Kreiran Vam je račun s adresom <strong>{email}</strong>.</p>'
        f'<p>Privremena lozinka (potrebno ju je promijeniti pri prvoj prijavi):</p>'
        f'<p style="font-family:monospace;font-size:18px;background:#e2e8f0;'
        f'padding:10px 14px;border-radius:6px;">{temp_password}</p>'
        '</div></div>'
    )
    sent = await send_email(
        email, "Riforma · vaš pristupni račun", invite_html
    )
    response_data["delivery"] = "email" if sent else "response"
    if not sent:
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


class ChangePasswordBody(BaseModel):
    """Self-service password change. `current_password` is required for
    normal rotations; users flagged `must_change_password` (e.g. fresh
    invitation) may skip it since the temp password is admin-issued."""

    current_password: Optional[str] = None
    new_password: str


@router.put("/me/password")
async def change_my_password(
    body: ChangePasswordBody,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Let the current user rotate their own password. Required to clear
    the `must_change_password` flag set by admin invites."""
    from datetime import datetime, timezone

    from app.core.security import hash_password, verify_password

    user_row = await users.get_by_id(current_user["id"])
    if not user_row:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")

    # First-time rotation (admin-issued temp password) doesn't require the
    # user to type the temp password again — the auth they just used IS
    # the temp password. Normal rotations require it for safety.
    if not user_row.must_change_password:
        if not body.current_password:
            raise HTTPException(
                status_code=400, detail="Trenutna lozinka je obavezna."
            )
        if not verify_password(body.current_password, user_row.password_hash):
            raise HTTPException(
                status_code=400, detail="Trenutna lozinka nije ispravna."
            )

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Nova lozinka mora imati najmanje 8 znakova.",
        )

    await users.update_by_id(
        user_row.id,
        {
            "password_hash": hash_password(body.new_password),
            "password_changed_at": datetime.now(timezone.utc),
            "must_change_password": False,
        },
    )
    return {"message": "Lozinka uspješno promijenjena."}


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

from typing import Any, Dict, Optional

from app.core.config import get_settings
from app.core.roles import DEFAULT_ROLE, resolve_role_scopes, scope_matches
from app.db.repositories.instance import users, tenant_memberships
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt

settings = get_settings()

# Open endpoints that don't require auth
OPEN_ENDPOINTS = {
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/auth/login",
    "/health",
}


async def get_current_user(request: Request) -> Dict[str, Any]:

    # 1. Try httpOnly cookie first
    token_value: Optional[str] = request.cookies.get("access_token")

    # 2. Fallback to Bearer header (API clients, tests, mobile)
    if not token_value:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token_value = auth_header.split(" ", 1)[1].strip()
        elif auth_header:
            token_value = auth_header.strip()

    if not token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Neautorizirano",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token_value, settings.AUTH_SECRET, algorithms=[settings.AUTH_ALGORITHM]
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Neautorizirano",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Neautorizirano",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Fetch user from DB via repository
    user_row = await users.get_by_id(user_id)
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Neautorizirano",
            headers={"WWW-Authenticate": "Bearer"},
        )

    role = user_row.role or DEFAULT_ROLE
    token_scopes = payload.get("scopes", [])
    user_scopes = user_row.scopes or []
    scopes = resolve_role_scopes(role, token_scopes or user_scopes)

    principal = {
        "id": user_row.id,
        "name": user_row.full_name or user_row.email,
        "role": role,
        "scopes": scopes,
        "token_based": False,
        "tenant_id": None,
    }

    # --- Tenant isolation ------------------------------------------------
    from app.db.tenant import CURRENT_TENANT_ID

    tenant_id = request.headers.get("X-Tenant-Id")

    # Verify the user is a member of the requested tenant.
    # If the header contains an invalid/stale tenant ID, fall back to the
    # user's first active membership instead of returning 403.  This avoids
    # a chicken-and-egg problem where the frontend needs to call /tenants
    # to discover valid tenant IDs but the interceptor already attaches a
    # (potentially stale) X-Tenant-Id header.
    membership = None
    if tenant_id:
        membership = await tenant_memberships.find_one(
            user_id=user_row.id, tenant_id=tenant_id, status="active"
        )
        if membership:
            principal["tenant_role"] = membership.role or "member"

    if not membership:
        # Header missing, invalid, or user has no access -> pick first active
        active_memberships = await tenant_memberships.find_all(
            filters={"user_id": user_row.id, "status": "active"},
            order_by="created_at",
            order_dir="asc",
        )
        first_membership = active_memberships[0] if active_memberships else None
        if first_membership:
            tenant_id = first_membership.tenant_id
            principal["tenant_role"] = first_membership.role or "member"
        else:
            tenant_id = None
        # If still no tenant_id the user has no memberships -- leave
        # CURRENT_TENANT_ID unset; scoped collections will return nothing.

    if tenant_id:
        CURRENT_TENANT_ID.set(tenant_id)
    principal["tenant_id"] = tenant_id

    request.state.current_user = principal
    return principal


def require_tenant():
    """Dependency that ensures the current user has an active tenant context.
    Apply to endpoints that write to tenant-scoped collections."""

    async def _dependency(
        current_user: Dict[str, Any] = Depends(get_current_user),
    ):
        if not current_user.get("tenant_id"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "NO_TENANT",
                    "message": "Morate kreirati portfelj prije korištenja ove funkcije.",
                },
            )
        return True

    return _dependency


def require_scopes(*scopes: str):
    async def _dependency(
        request: Request, current_user: Dict[str, Any] = Depends(get_current_user)
    ):
        granted = list(current_user.get("scopes", []))
        # Add tenant scopes if any (logic from original code)
        tenant_scopes = getattr(request.state, "tenant_scopes", [])
        if tenant_scopes:
            for scope in tenant_scopes:
                if scope not in granted:
                    granted.append(scope)

        missing = [scope for scope in scopes if not scope_matches(granted, scope)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Nedostaju ovlasti: {', '.join(missing)}",
            )
        return True

    return _dependency

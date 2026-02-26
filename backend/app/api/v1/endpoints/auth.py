import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.api import deps
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.roles import DEFAULT_ROLE, resolve_role_scopes
from app.core.security import create_access_token, hash_password, verify_password
from app.db.repositories.instance import users, saas_tenants, tenant_memberships
from app.models.domain import UserPublic
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, field_validator

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

# Account lockout: max failed attempts before temporary lock
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15


def _validate_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Lozinka mora imati najmanje 8 znakova")
    if len(v) > 128:
        raise ValueError("Lozinka ne smije imati više od 128 znakova")
    return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) > 128:
            raise ValueError("Lozinka ne smije imati više od 128 znakova")
        return v


def _is_behind_proxy(request: Request) -> bool:
    """Detect if running behind a reverse proxy (HTTPS terminated at proxy)."""
    return (
        request.headers.get("X-Forwarded-Proto") == "https"
        or request.url.scheme == "https"
    )


def _set_auth_cookies(
    response: JSONResponse,
    access_token: str,
    *,
    secure: bool,
    max_age: int,
) -> None:
    """Set httpOnly access_token cookie and readable csrf_token cookie."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )
    response.set_cookie(
        key="csrf_token",
        value=secrets.token_urlsafe(32),
        httponly=False,  # Frontend must read this
        secure=secure,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


@router.post("/login")
@limiter.limit("5/minute")
async def login(request: Request, login_data: LoginRequest):
    email = login_data.email.lower()
    user = await users.find_one(email=email)

    # Account lockout check
    if user:
        if user.locked_until and user.locked_until > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Račun je privremeno zaključan. Pokušajte kasnije.",
            )
        elif user.locked_until:
            # Lock expired -- reset
            await users.update_by_id(
                user.id,
                {"failed_login_attempts": 0, "locked_until": None},
            )

    if not user or not verify_password(login_data.password, user.password_hash):
        # Increment failed attempts if user exists
        if user:
            new_failed = (user.failed_login_attempts or 0) + 1
            update_fields = {"failed_login_attempts": new_failed}
            if new_failed >= MAX_FAILED_ATTEMPTS:
                lock_time = datetime.now(timezone.utc) + timedelta(
                    minutes=LOCKOUT_DURATION_MINUTES
                )
                update_fields["locked_until"] = lock_time
                logger.warning(
                    f"Account locked due to {new_failed} failed attempts: {email}"
                )
            await users.update_by_id(user.id, update_fields)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Neispravan email ili lozinka",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not (user.active if user.active is not None else True):
        raise HTTPException(status_code=400, detail="Korisnički račun nije aktivan")

    # Reset failed attempts on successful login
    if (user.failed_login_attempts or 0) > 0:
        await users.update_by_id(
            user.id,
            {"failed_login_attempts": 0, "locked_until": None},
        )

    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    # Resolve scopes
    role = user.role or DEFAULT_ROLE
    scopes = resolve_role_scopes(role, user.scopes or [])

    token_payload = {
        "sub": user.id,
        "scopes": scopes,
        "role": role,
        "name": user.full_name,
        "email": user.email,
    }

    access_token = create_access_token(
        data=token_payload, expires_delta=access_token_expires
    )

    user_public = UserPublic(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role,
        scopes=scopes,
        active=user.active if user.active is not None else True,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )

    # Only return user data in body -- token is in httpOnly cookie only
    response = JSONResponse(
        content={
            "token_type": "bearer",
            "user": user_public.model_dump(mode="json"),
        }
    )
    is_secure = _is_behind_proxy(request)
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    _set_auth_cookies(response, access_token, secure=is_secure, max_age=max_age)

    return response


@router.post("/logout")
async def logout():
    """Clear auth cookies."""
    response = JSONResponse(content={"message": "Odjava uspješna"})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return response


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    create_tenant: bool = True  # Default to True to maintain backward compatibility
    tenant_id: Optional[str] = None  # Assign to existing tenant atomically
    tenant_role: Optional[str] = "member"  # Role when assigning to existing tenant

    @field_validator("password")
    @classmethod
    def password_policy(cls, v: str) -> str:
        return _validate_password(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest):
    email = body.email.lower()
    user = await users.find_one(email=email)
    # Always return success (don't leak if email exists)
    if user:
        token = secrets.token_urlsafe(32)
        expiry = datetime.now(timezone.utc) + timedelta(hours=1)
        await users.update_by_id(
            user.id,
            {"reset_token": token, "reset_token_expires": expiry},
        )
        # TODO: Send email with reset link when SMTP configured
        logger.info("Password reset token generated for %s", email)
    return {
        "message": "Ako postoji račun s tom adresom, poslali smo upute za resetiranje."
    }


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_policy(cls, v: str) -> str:
        return _validate_password(v)


@router.post("/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest):
    user = await users.find_one(reset_token=body.token)
    if not user:
        raise HTTPException(
            status_code=400,
            detail="Nevažeći ili istekli token za resetiranje",
        )

    # Check expiry -- reset_token_expires is already a datetime from ORM
    if user.reset_token_expires:
        if user.reset_token_expires < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=400,
                detail="Nevažeći ili istekli token za resetiranje",
            )

    await users.update_by_id(
        user.id,
        {
            "password_hash": hash_password(body.new_password),
            "reset_token": None,
            "reset_token_expires": None,
            "failed_login_attempts": 0,
            "locked_until": None,
        },
    )
    return {"message": "Lozinka uspješno promijenjena"}


@router.post(
    "/register",
    response_model=UserPublic,
    dependencies=[Depends(deps.require_scopes("users:create"))],
)
@limiter.limit("3/minute")
async def register(request: Request, user_in: RegisterRequest):
    from app.models.domain import (
        TenantMembershipRole,
    )

    email = user_in.email.lower()
    existing = await users.find_one(email=email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Korisnik s tom email adresom već postoji",
        )

    # Create user via repository -- no manual datetime conversion needed
    user_data = {
        "email": email,
        "password_hash": hash_password(user_in.password),
        "full_name": user_in.full_name,
        "role": DEFAULT_ROLE,
        "scopes": [],
    }
    user_instance = await users.create(user_data)

    # Atomic tenant assignment: assign to existing tenant if tenant_id provided
    if user_in.tenant_id:
        tenant_row = await saas_tenants.get_by_id(user_in.tenant_id)
        if not tenant_row:
            raise HTTPException(
                status_code=400,
                detail="Portfelj nije pronađen.",
            )
        role_value = user_in.tenant_role or "member"
        try:
            role_enum = TenantMembershipRole(role_value)
        except ValueError:
            role_enum = TenantMembershipRole.MEMBER
        await tenant_memberships.create({
            "user_id": user_instance.id,
            "tenant_id": user_in.tenant_id,
            "role": role_enum.value,
            "status": "active",
        })

    elif user_in.create_tenant:
        # Default Tenant
        tenant_name = f"Tvrtka korisnika {email.split('@')[0]}"
        if user_in.full_name:
            tenant_name = f"Tvrtka korisnika {user_in.full_name}"

        tenant_instance = await saas_tenants.create({
            "naziv": tenant_name,
            "created_by": user_instance.id,
        })

        # Default Membership
        await tenant_memberships.create({
            "user_id": user_instance.id,
            "tenant_id": tenant_instance.id,
            "role": TenantMembershipRole.OWNER.value,
            "status": "active",
        })

    # Convert ORM instance to dict for UserPublic response
    user_dict = users.to_dict(user_instance)
    return UserPublic(**user_dict)

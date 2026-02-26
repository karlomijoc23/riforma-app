import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

import sentry_sdk
from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from app.core.roles import DEFAULT_ROLE, resolve_role_scopes
from app.core.security import hash_password
from app.db.repositories.instance import users as users_repo, activity_logs, saas_tenants, tenant_memberships
from app.db.session import dispose_engine
from app.models.domain import ActivityLog, User
from app.services.contract_status_service import sync_contract_and_unit_statuses
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from slowapi.errors import RateLimitExceeded

settings = get_settings()

# Configure structured logging early
setup_logging(level=settings.LOG_LEVEL, fmt=settings.LOG_FORMAT)

_sentry_dsn = getattr(settings, "SENTRY_DSN_BACKEND", None)
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.1,
        environment=settings.ENVIRONMENT,
    )
elif settings.ENVIRONMENT == "production":
    logging.getLogger(__name__).warning(
        "SENTRY_DSN_BACKEND is not set — production errors will not be tracked in Sentry"
    )

logger = logging.getLogger(__name__)


async def run_scheduler():
    """
    Background task to run periodic jobs.
    """
    from app.db.tenant import CURRENT_TENANT_ID

    while True:
        try:
            # Background jobs need a tenant context; iterate over all active tenants
            all_tenants = await saas_tenants.find_all(filters={"status": "active"})
            for t in all_tenants:
                CURRENT_TENANT_ID.set(t.id)
                try:
                    await sync_contract_and_unit_statuses()
                    from app.services.recurring_maintenance_service import (
                        generate_recurring_tasks,
                    )

                    await generate_recurring_tasks()
                    from app.services.notification_service import run_all_notifications

                    await run_all_notifications()
                except Exception as e:
                    logger.error(f"Scheduler error for tenant {t.id}: {e}")
                finally:
                    CURRENT_TENANT_ID.set(None)
        except Exception as e:
            logger.error(f"Error in background scheduler: {e}")

        # Sleep for 24 hours
        await asyncio.sleep(86400)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    # Always attempt to create tables (safe operation if they exist)
    from app.db.base import Base
    from app.db.session import get_engine

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed admin if needed
    if (
        settings.SEED_ADMIN_ON_STARTUP
        and settings.INITIAL_ADMIN_EMAIL
        and settings.INITIAL_ADMIN_PASSWORD
    ):
        email = settings.INITIAL_ADMIN_EMAIL.lower()
        existing = await users_repo.find_one(email=email)
        if not existing:
            role = settings.INITIAL_ADMIN_ROLE
            user = User(
                email=email,
                full_name=settings.INITIAL_ADMIN_FULL_NAME,
                role=role,
                scopes=resolve_role_scopes(role, ["*"] if role == "owner" else []),
                password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
            )
            await users_repo.create(user.model_dump())
            logger.info(f"Seeded initial admin: {email}")
        else:
            # Update existing admin to match env (useful if password changed in env)
            logger.info(f"Updating existing admin from env: {email}")
            await users_repo.update_by_id(existing.id, {
                "password_hash": hash_password(settings.INITIAL_ADMIN_PASSWORD),
                "full_name": settings.INITIAL_ADMIN_FULL_NAME,
                "role": settings.INITIAL_ADMIN_ROLE,
                "scopes": resolve_role_scopes(
                    settings.INITIAL_ADMIN_ROLE,
                    ["*"] if settings.INITIAL_ADMIN_ROLE == "owner" else [],
                ),
            })

    # Seed default tenant + membership so the admin can use the app immediately
    if settings.SEED_ADMIN_ON_STARTUP:
        DEFAULT_TENANT_ID = "tenant-default"
        existing_tenant = await saas_tenants.find_one(id=DEFAULT_TENANT_ID)
        if not existing_tenant:
            await saas_tenants.create({
                "id": DEFAULT_TENANT_ID,
                "naziv": "Moj portfelj",
                "tip": "company",
                "status": "active",
            })
            logger.info(f"Seeded default tenant: {DEFAULT_TENANT_ID}")

        # Link admin user to the default tenant
        admin_user = await users_repo.find_one(email=settings.INITIAL_ADMIN_EMAIL.lower())
        if admin_user:
            existing_membership = await tenant_memberships.find_one(
                user_id=admin_user.id, tenant_id=DEFAULT_TENANT_ID
            )
            if not existing_membership:
                await tenant_memberships.create({
                    "user_id": admin_user.id,
                    "tenant_id": DEFAULT_TENANT_ID,
                    "role": "owner",
                    "status": "active",
                })
                logger.info(f"Linked admin to default tenant")

    # Run initial status sync on startup (fix stale data immediately)
    from app.db.tenant import CURRENT_TENANT_ID
    try:
        all_tenants = await saas_tenants.find_all(filters={"status": "active"})
        for t in all_tenants:
            CURRENT_TENANT_ID.set(t.id)
            try:
                await sync_contract_and_unit_statuses()
            finally:
                CURRENT_TENANT_ID.set(None)
        logger.info("Initial contract/unit status sync completed.")
    except Exception as e:
        logger.error(f"Initial status sync failed: {e}")

    # Start background scheduler
    asyncio.create_task(run_scheduler())

    yield

    # Shutdown logic
    await dispose_engine()


_is_prod = settings.ENVIRONMENT == "production"

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=None if _is_prod else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    description="Riforma Proptech Platform API",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)


# --- Rate limit handler ---
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Previše zahtjeva. Pokušajte ponovo kasnije."},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    msg = str(exc)
    if "tenant-scoped collection" in msg:
        return JSONResponse(
            status_code=403,
            content={
                "detail": {
                    "code": "NO_TENANT",
                    "message": "Morate kreirati portfelj prije korištenja ove funkcije.",
                }
            },
        )
    # Re-raise non-tenant ValueErrors to the global handler
    raise exc


# --- Global exception handler (1.5) ---
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True,
    )
    if _is_prod:
        return JSONResponse(
            status_code=500,
            content={"detail": "Interna greška poslužitelja"},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Interna greška: {str(exc)}"},
    )


@app.get("/")
async def root():
    return {"message": "Welcome to Riforma API. Visit /docs for documentation."}


@app.get("/health", tags=["system"])
async def health_check():
    """Liveness probe - is the server running?"""
    return {"status": "ok"}


@app.get("/ready", tags=["system"])
async def readiness_check():
    """Readiness probe - can the server handle requests? Checks DB connection."""
    try:
        from app.db.session import get_engine
        from sqlalchemy import text

        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "database": "disconnected"},
        )


# CSRF protection (double-submit cookie pattern)
from app.middleware.csrf import CSRFMiddleware  # noqa: E402

app.add_middleware(CSRFMiddleware)

# CORS — explicit methods and headers (1.8)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Tenant-Id",
        "X-CSRF-Token",
    ],
    expose_headers=["X-Total-Count", "X-Request-ID"],
)


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    headers = response.headers
    headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path.startswith("/uploads/"):
        headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; img-src 'self'; style-src 'self'; frame-ancestors 'self'",
        )
    else:
        headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
    )
    headers.setdefault(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
    )
    # CSP — strict: no unsafe-eval, no unsafe-inline for scripts
    if "Content-Security-Policy" not in headers:
        headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' data:; font-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'; "
            "connect-src 'self'; frame-ancestors 'self'"
        )
    return response


# Activity Logging Middleware
@app.middleware("http")
async def activity_logger(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()

    try:
        response = await call_next(request)
        status_code = response.status_code
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        # Return request ID in response header (3.3)
        response.headers["X-Request-ID"] = request_id

        principal = getattr(request.state, "current_user", None) or {
            "id": "guest",
            "name": "guest",
            "role": DEFAULT_ROLE,
            "scopes": resolve_role_scopes(DEFAULT_ROLE),
        }

        try:
            from app.db.tenant import CURRENT_TENANT_ID
            if CURRENT_TENANT_ID.get(None) is not None:
                log = ActivityLog(
                    user=principal.get("name", "anonymous"),
                    role=principal.get("role", DEFAULT_ROLE),
                    actor_id=principal.get("id"),
                    method=request.method,
                    path=request.url.path,
                    status_code=status_code,
                    scopes=principal.get("scopes", []),
                    request_id=request_id,
                    duration_ms=duration_ms,
                )
                await activity_logs.create(log.model_dump())
        except Exception as e:
            logger.error(f"Failed to log activity: {e}")

        return response
    except Exception:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        try:
            from app.db.tenant import CURRENT_TENANT_ID
            if CURRENT_TENANT_ID.get(None) is not None:
                principal = getattr(request.state, "current_user", None) or {
                    "id": "guest",
                    "name": "guest",
                    "role": DEFAULT_ROLE,
                    "scopes": resolve_role_scopes(DEFAULT_ROLE),
                }
                log = ActivityLog(
                    user=principal.get("name", "anonymous"),
                    role=principal.get("role", DEFAULT_ROLE),
                    actor_id=principal.get("id"),
                    method=request.method,
                    path=request.url.path,
                    status_code=500,
                    scopes=principal.get("scopes", []),
                    request_id=request_id,
                    duration_ms=duration_ms,
                    message="Interna greška poslužitelja",
                )
                await activity_logs.create(log.model_dump())
        except Exception:
            pass
        raise


app.include_router(api_router, prefix=settings.API_V1_STR)


# Ensure upload directory exists
UPLOAD_DIR = settings.UPLOAD_DIR
if not UPLOAD_DIR.exists():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# Auth-protected uploads endpoint (replaces unauthenticated StaticFiles mount)
@app.get("/uploads/{file_path:path}", tags=["uploads"])
async def serve_upload(file_path: str, request: Request):
    """Serve uploaded files with authentication check."""
    # Require valid auth (cookie or Bearer)
    from app.api.deps import get_current_user

    try:
        await get_current_user(request)
    except Exception:
        return JSONResponse(
            status_code=401,
            content={"detail": "Neautorizirano"},
        )

    # Resolve and validate path (prevent directory traversal)
    requested = (UPLOAD_DIR / file_path).resolve()
    if not str(requested).startswith(str(UPLOAD_DIR.resolve())):
        return JSONResponse(
            status_code=403,
            content={"detail": "Pristup datoteci nije dozvoljen"},
        )

    if not requested.exists() or not requested.is_file():
        return JSONResponse(
            status_code=404,
            content={"detail": "Datoteka nije pronađena"},
        )

    return FileResponse(path=str(requested))

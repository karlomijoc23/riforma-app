import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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
            # Clean up expired revoked tokens
            from app.db.repositories.instance import revoked_tokens
            from app.models.tables import RevokedTokenRow

            await revoked_tokens.delete_many(
                extra_conditions=[
                    RevokedTokenRow.expires_at < datetime.now(timezone.utc)
                ]
            )

            # Background jobs need a tenant context; iterate over all active tenants.
            # We use ContextVar.set() → reset(token) so the context unwinds
            # exactly to its prior state on every iteration. Previously
            # `set(None)` left the ContextVar with a None value rather than
            # restoring the original, which can leak through to coroutines
            # scheduled in the wrong order on asyncio edge cases.
            all_tenants = await saas_tenants.find_all(filters={"status": "active"})
            for t in all_tenants:
                token = CURRENT_TENANT_ID.set(t.id)
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
                    CURRENT_TENANT_ID.reset(token)
        except Exception as e:
            logger.error(f"Error in background scheduler: {e}")

        # Sleep for 24 hours
        await asyncio.sleep(86400)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic

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
    if "tenant-scoped" in msg and "without" in msg:
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
        from app.db.session import get_engine, get_pool_stats
        from sqlalchemy import text

        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "database": "connected",
            "pool": get_pool_stats(),
        }
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
#
# The write goes through `asyncio.create_task` so it doesn't add DB
# round-trip latency to every response. `create_task` snapshots the
# current ContextVars (including CURRENT_TENANT_ID), so the
# tenant-scoped repository sees the right tenant inside the background
# task even though the request context has unwound by then.
#
# We keep strong references in `_pending_activity_logs` until each task
# finishes — without this, Python may GC a still-running task created
# in middleware and warn about it. The set is bounded by request
# throughput × write latency, which is tiny in practice.

_pending_activity_logs: "set[asyncio.Task]" = set()


def _spawn_activity_log_write(payload: dict) -> None:
    """Fire-and-forget activity-log insert. Errors are logged, not raised."""

    async def _write() -> None:
        try:
            await activity_logs.create(payload)
        except Exception as exc:  # noqa: BLE001 - background write, never crash
            logger.error("Failed to log activity: %s", exc)

    task = asyncio.create_task(_write())
    _pending_activity_logs.add(task)
    task.add_done_callback(_pending_activity_logs.discard)


@app.middleware("http")
async def activity_logger(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = time.perf_counter()

    from app.db.tenant import CURRENT_TENANT_ID

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
                _spawn_activity_log_write(log.model_dump())
        except Exception as e:
            logger.error(f"Failed to log activity: {e}")

        return response
    except Exception:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        try:
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
                _spawn_activity_log_write(log.model_dump())
        except Exception:
            pass
        raise


app.include_router(api_router, prefix=settings.API_V1_STR)


# Ensure upload directory exists and is writable. A silent permission error
# here used to surface as "upload 500 / document not saved" in production;
# we fail fast with a clear log instead so the same incident doesn't recur.
UPLOAD_DIR = settings.UPLOAD_DIR
try:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except OSError as _exc:
    logger.error(
        "UPLOAD_DIR %s is not creatable: %s. "
        "Check ownership (chown -R riforma:riforma) and systemd ReadWritePaths.",
        UPLOAD_DIR,
        _exc,
    )
else:
    _probe = UPLOAD_DIR / ".write_probe"
    try:
        _probe.write_bytes(b"ok")
        _probe.unlink()
    except OSError as _exc:
        logger.error(
            "UPLOAD_DIR %s exists but is not writable by the service user: %s. "
            "Uploads will return 500 until ownership/systemd paths are fixed.",
            UPLOAD_DIR,
            _exc,
        )


# Auth-protected uploads endpoint (replaces unauthenticated StaticFiles mount)
@app.get("/uploads/{file_path:path}", tags=["uploads"])
async def serve_upload(file_path: str, request: Request):
    """Serve uploaded files with authentication AND tenant scope checks.

    The filename pattern is `{doc_id}_{...}` for the original and
    `{doc_id}_thumb.jpg` / `{doc_id}_medium.jpg` for image variants. We
    extract the doc_id (a UUID4), look up the document row, and verify
    its tenant matches the caller's CURRENT_TENANT_ID. Without this
    check, an authenticated user in tenant B could fetch tenant A's
    file just by knowing or guessing a UUID-prefixed filename.
    """
    from app.api.deps import get_current_user

    try:
        principal = await get_current_user(request)
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

    # Tenant scope check: extract the doc_id prefix (UUID4 = 36 chars
    # ending before the first underscore in the filename) and confirm
    # the owning document belongs to the caller's tenant.
    from app.db.repositories.instance import dokumenti
    from app.db.tenant import CURRENT_TENANT_ID
    from sqlalchemy import or_ as _or

    filename = requested.name
    doc_id = filename.split("_", 1)[0] if "_" in filename else None
    if doc_id and len(doc_id) == 36:
        # `dokumenti` is tenant-scoped via the repository, so a get_by_id
        # inside the caller's tenant returns the row only if it belongs
        # to that tenant. A cross-tenant filename returns None → 403.
        # Set CURRENT_TENANT_ID from principal for the duration of this
        # lookup since /uploads/* isn't routed through the v1 router.
        if principal.get("tenant_id"):
            CURRENT_TENANT_ID.set(principal["tenant_id"])
        doc = await dokumenti.get_by_id(doc_id)
        if not doc:
            # Either doesn't exist, or belongs to a different tenant.
            return JSONResponse(
                status_code=403,
                content={"detail": "Pristup datoteci nije dozvoljen"},
            )

    return FileResponse(path=str(requested))

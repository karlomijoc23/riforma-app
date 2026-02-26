"""CSRF protection using the double-submit cookie pattern.

Only enforced when the request is authenticated via a cookie (not a Bearer
header), so API clients / tests that use ``Authorization: Bearer`` are
unaffected.
"""

import logging
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
EXEMPT_PATHS = {"/api/auth/login", "/api/auth/logout", "/health", "/ready"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Safe methods never need CSRF validation
        if request.method in SAFE_METHODS:
            return await call_next(request)

        # Some paths are exempt (login sets the cookie, so it can't
        # require one yet)
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        # Only enforce when auth comes from cookie, not Bearer header
        auth_header = request.headers.get("Authorization", "")
        has_cookie_auth = "access_token" in request.cookies
        has_bearer_auth = auth_header.startswith("Bearer ")

        if has_cookie_auth and not has_bearer_auth:
            csrf_cookie = request.cookies.get("csrf_token", "")
            csrf_header = request.headers.get("X-CSRF-Token", "")

            if (
                not csrf_cookie
                or not csrf_header
                or not secrets.compare_digest(csrf_cookie, csrf_header)
            ):
                logger.warning(
                    "CSRF validation failed for %s %s",
                    request.method,
                    request.url.path,
                )
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF provjera neuspješna"},
                )

        return await call_next(request)

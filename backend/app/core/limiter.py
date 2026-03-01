"""Shared rate limiter instance (slowapi).

Import ``limiter`` from here in any endpoint module that needs rate limiting.

Default rate: 60 requests/minute per IP (covers all endpoints).
Individual endpoints can override with @limiter.limit("5/minute") etc.
"""

from slowapi import Limiter
from starlette.requests import Request


def get_client_ip(request: Request) -> str:
    """Extract the real client IP behind a reverse proxy."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("X-Real-IP")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(
    key_func=get_client_ip,
    default_limits=["60/minute"],
)

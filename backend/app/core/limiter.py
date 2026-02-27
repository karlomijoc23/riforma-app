"""Shared rate limiter instance (slowapi).

Import ``limiter`` from here in any endpoint module that needs rate limiting.

Default rate: 60 requests/minute per IP (covers all endpoints).
Individual endpoints can override with @limiter.limit("5/minute") etc.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
)

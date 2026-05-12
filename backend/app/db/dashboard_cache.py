"""Per-worker dashboard TTL cache.

The dashboard endpoint aggregates six tables and is hit on every page
load, so a short-lived in-memory cache is worth the complexity. Without
invalidation, edits to contracts / properties / etc. would stay invisible
to the dashboard for up to TTL seconds — which surprised the user when
testing.

This module owns the cache so:
  * `dashboard.py` reads/writes via `get`, `set_cached`.
  * Tenant-scoped repos call `invalidate_current_tenant()` after a write
    that affects any dashboard counter (see `invalidates_dashboard_cache`
    on `BaseRepository`).

Caveat: the dict is per-worker. With multiple uvicorn workers a write on
worker A still leaves a stale entry on worker B until TTL. The user runs
a single worker for now; if that changes, swap this for Redis with the
same interface.
"""

from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple

from app.db.tenant import CURRENT_TENANT_ID

CACHE_TTL_SECONDS = 30

# (tenant_id) -> (timestamp_monotonic, payload)
_cache: Dict[str, Tuple[float, dict]] = {}


def get(tenant_id: str) -> Optional[dict]:
    """Return cached payload if present and not yet expired."""
    entry = _cache.get(tenant_id)
    if not entry:
        return None
    ts, data = entry
    if (time.monotonic() - ts) >= CACHE_TTL_SECONDS:
        return None
    return data


def set_cached(tenant_id: str, payload: dict) -> None:
    _cache[tenant_id] = (time.monotonic(), payload)


def invalidate(tenant_id: str) -> None:
    _cache.pop(tenant_id, None)


def invalidate_current_tenant() -> None:
    """Drop the cache entry for the tenant in the active request context.

    Called from `BaseRepository` write paths on repos flagged with
    `invalidates_dashboard_cache = True`. No-op if there is no tenant in
    context (e.g. a write that ran before the request middleware set it,
    which shouldn't happen but we don't want to crash a successful write
    on a cache-warming detail).
    """
    tenant_id = CURRENT_TENANT_ID.get(None)
    if tenant_id:
        _cache.pop(tenant_id, None)


def invalidate_all() -> None:
    """Wipe the entire cache. Used by tests and admin endpoints."""
    _cache.clear()


def _peek() -> Dict[str, Tuple[float, Any]]:
    """Test-only accessor. Don't read from this in production code."""
    return _cache

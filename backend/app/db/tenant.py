"""Tenant context for multi-tenant isolation."""

from __future__ import annotations

import contextvars
from typing import Optional

CURRENT_TENANT_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_tenant_id", default=None
)

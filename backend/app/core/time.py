"""Timezone-aware "today" helper.

Server clocks may run on UTC while the business operates in a local zone
(Europe/Zagreb by default). Using `date.today()` directly means contracts
flip to NA_ISTEKU or ISTEKAO up to 2 hours before or after the local
calendar would expect during DST windows.

Switch the status-critical call sites to ``local_today()`` so they all
resolve off the same clock. Other call sites (audit timestamps, activity
logs) can keep UTC — they care about ordering, not calendar boundaries.
"""
from __future__ import annotations

import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

# Default matches the business locale. Override with APP_TIMEZONE for
# tenants / deployments in other regions.
DEFAULT_TZ_NAME = os.environ.get("APP_TIMEZONE", "Europe/Zagreb")


def _app_tz() -> ZoneInfo:
    try:
        return ZoneInfo(DEFAULT_TZ_NAME)
    except Exception:
        # tzdata may be unavailable on a misconfigured host — fall back to UTC
        return ZoneInfo("UTC")


def local_today() -> date:
    """Return today's date in the configured local timezone."""
    return datetime.now(_app_tz()).date()


def local_now() -> datetime:
    """Return the current timezone-aware datetime in the configured zone."""
    return datetime.now(_app_tz())

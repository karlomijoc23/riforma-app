"""Helpers for annual contract indexation anniversary dates.

A contract with `indeksacija = True` and a populated
`indeksacija_dan` / `indeksacija_mjesec` repeats its indexation on that
day-of-year for the life of the contract. This module computes the
upcoming anniversary date in a way that:

- never returns a date past `datum_zavrsetka`;
- safely clamps day-of-month (e.g. 31. veljače → zadnji dan veljače);
- handles leap years implicitly (29. veljače in a non-leap year clamps
  to 28. veljače).

Pure date math — no DB calls.
"""

from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Optional


def _clamp_day_to_month(year: int, month: int, day: int) -> date:
    """Build a date, clamping `day` to the month's last valid day."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, last))


def next_indexation_date(
    today: date,
    contract: Any,
) -> Optional[date]:
    """Return the next indexation anniversary that falls strictly after
    `today` and at-or-before the contract's `datum_zavrsetka`.

    Returns ``None`` if the contract is not indexed, has no
    day/month set, has already ended, or has no upcoming anniversary
    inside its remaining term.
    """
    if not getattr(contract, "indeksacija", False):
        return None
    dan = getattr(contract, "indeksacija_dan", None)
    mjesec = getattr(contract, "indeksacija_mjesec", None)
    if not dan or not mjesec:
        return None

    end = getattr(contract, "datum_zavrsetka", None)
    start = getattr(contract, "datum_pocetka", None)
    if end is None or (isinstance(end, date) and end < today):
        return None

    # Anchor on the contract start year so first-year indexation only
    # fires if start was before the anniversary that year — otherwise
    # we'd be applying indexation immediately after signing, which
    # would surprise users.
    first_year = today.year
    if isinstance(start, date) and start.year > first_year:
        first_year = start.year

    candidate = _clamp_day_to_month(first_year, mjesec, dan)
    while candidate <= today:
        candidate = _clamp_day_to_month(candidate.year + 1, mjesec, dan)

    if isinstance(end, date) and candidate > end:
        return None
    return candidate


def format_indexation_anchor(contract: Any) -> Optional[str]:
    """Return `DD.MM.` human-readable label, or None if not set."""
    dan = getattr(contract, "indeksacija_dan", None)
    mjesec = getattr(contract, "indeksacija_mjesec", None)
    if not dan or not mjesec:
        return None
    return f"{dan:02d}.{mjesec:02d}."

"""
Pydantic-compatible validator functions for JSON-typed columns.

Each function accepts a raw value (None, a JSON string, or already-parsed
Python data) and returns the validated/coerced value.  Raises ``ValueError``
with a clear message when the data is invalid.

Usage in Pydantic v2 models::

    from pydantic import field_validator
    from app.models.validators import validate_string_list

    class MyModel(BaseModel):
        tags: List[str] = []

        @field_validator("tags", mode="before")
        @classmethod
        def _tags(cls, v):
            return validate_string_list(v)
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_json(v: Any) -> Any:
    """If *v* is a JSON string, parse it; otherwise return as-is."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"Invalid JSON string: {exc}") from exc
    return v


# ---------------------------------------------------------------------------
# Public validators
# ---------------------------------------------------------------------------

def validate_string_list(v: Any) -> List[str]:
    """Validate that *v* is a ``List[str]``.

    Accepts:
        - a Python list of strings
        - a JSON-encoded string that decodes to a list of strings
        - an empty list

    Raises ``ValueError`` for anything else.
    """
    if v is None:
        return []
    v = _parse_json(v)
    if not isinstance(v, list):
        raise ValueError(f"Expected a list of strings, got {type(v).__name__}")
    for i, item in enumerate(v):
        if not isinstance(item, str):
            raise ValueError(
                f"Expected string at index {i}, got {type(item).__name__}"
            )
    return v


def validate_string_list_optional(v: Any) -> Optional[List[str]]:
    """Like :func:`validate_string_list` but allows ``None``.

    Returns ``None`` when *v* is ``None``; otherwise delegates to
    :func:`validate_string_list`.
    """
    if v is None:
        return None
    return validate_string_list(v)


def validate_kontakt_osobe(v: Any) -> Optional[List[Dict[str, Any]]]:
    """Validate that *v* is an ``Optional[List[KontaktOsoba-like dict]]``.

    Each dict must contain at least an ``ime`` key (string).  Additional
    recognised keys: ``id``, ``uloga``, ``email``, ``telefon``,
    ``napomena``, ``preferirani_kanal``, ``hitnost_odziva_sati``.
    """
    if v is None:
        return None
    v = _parse_json(v)
    if not isinstance(v, list):
        raise ValueError(
            f"Expected a list of contact-person dicts, got {type(v).__name__}"
        )
    for i, item in enumerate(v):
        if not isinstance(item, dict):
            raise ValueError(
                f"Expected dict at index {i}, got {type(item).__name__}"
            )
        if "ime" not in item:
            raise ValueError(
                f"Contact person at index {i} is missing required key 'ime'"
            )
        if not isinstance(item["ime"], str) or not item["ime"].strip():
            raise ValueError(
                f"Contact person at index {i}: 'ime' must be a non-empty string"
            )
    return v


def validate_dict(v: Any) -> Dict[str, Any]:
    """Validate that *v* is a ``Dict[str, Any]`` (free-form).

    Accepts:
        - a Python dict
        - a JSON-encoded string that decodes to a dict
        - ``None`` is coerced to ``{}``
    """
    if v is None:
        return {}
    v = _parse_json(v)
    if not isinstance(v, dict):
        raise ValueError(f"Expected a dict, got {type(v).__name__}")
    return v


def validate_dict_optional(v: Any) -> Optional[Dict[str, Any]]:
    """Like :func:`validate_dict` but allows ``None``.

    Returns ``None`` when *v* is ``None``; otherwise ensures a dict.
    """
    if v is None:
        return None
    v = _parse_json(v)
    if not isinstance(v, dict):
        raise ValueError(f"Expected a dict or None, got {type(v).__name__}")
    return v


def validate_vehicle_plates(v: Any) -> List[str]:
    """Validate that *v* is a list of vehicle plate strings, max 2 items.

    Raises ``ValueError`` if more than 2 plates are provided or if any
    element is not a string.
    """
    if v is None:
        return []
    v = _parse_json(v)
    if not isinstance(v, list):
        raise ValueError(
            f"Expected a list of vehicle plates, got {type(v).__name__}"
        )
    if len(v) > 2:
        raise ValueError(
            f"Maximum 2 vehicle plates allowed, got {len(v)}"
        )
    for i, plate in enumerate(v):
        if not isinstance(plate, str):
            raise ValueError(
                f"Expected string plate at index {i}, got {type(plate).__name__}"
            )
        if not plate.strip():
            raise ValueError(f"Vehicle plate at index {i} must not be empty")
    return v


def validate_payments(v: Any) -> List[Dict[str, Any]]:
    """Validate that *v* is a ``List[Dict[str, Any]]`` of payment records.

    Each payment dict must contain:
        - ``amount`` (int or float, > 0)
        - ``date`` (string — ISO date)
        - ``method`` (string)
    """
    if v is None:
        return []
    v = _parse_json(v)
    if not isinstance(v, list):
        raise ValueError(f"Expected a list of payment dicts, got {type(v).__name__}")
    for i, payment in enumerate(v):
        if not isinstance(payment, dict):
            raise ValueError(
                f"Expected dict at index {i}, got {type(payment).__name__}"
            )
        # amount
        if "amount" not in payment:
            raise ValueError(f"Payment at index {i} is missing required key 'amount'")
        if not isinstance(payment["amount"], (int, float)):
            raise ValueError(
                f"Payment at index {i}: 'amount' must be a number, "
                f"got {type(payment['amount']).__name__}"
            )
        # date
        if "date" not in payment:
            raise ValueError(f"Payment at index {i} is missing required key 'date'")
        if not isinstance(payment["date"], str):
            raise ValueError(
                f"Payment at index {i}: 'date' must be a string, "
                f"got {type(payment['date']).__name__}"
            )
        # method
        if "method" not in payment:
            raise ValueError(f"Payment at index {i} is missing required key 'method'")
        if not isinstance(payment["method"], str):
            raise ValueError(
                f"Payment at index {i}: 'method' must be a string, "
                f"got {type(payment['method']).__name__}"
            )
    return v


def validate_budget_breakdown(v: Any) -> Dict[str, float]:
    """Validate that *v* is a ``Dict[str, float]``.

    All keys must be strings and all values must be numeric (int or float).
    ``None`` is coerced to ``{}``.
    """
    if v is None:
        return {}
    v = _parse_json(v)
    if not isinstance(v, dict):
        raise ValueError(f"Expected a dict, got {type(v).__name__}")
    for key, value in v.items():
        if not isinstance(key, str):
            raise ValueError(
                f"Budget breakdown key must be a string, got {type(key).__name__}"
            )
        if not isinstance(value, (int, float)):
            raise ValueError(
                f"Budget breakdown value for '{key}' must be numeric, "
                f"got {type(value).__name__}"
            )
    # Coerce int values to float for consistency
    return {k: float(val) for k, val in v.items()}

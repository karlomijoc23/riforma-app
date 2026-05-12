"""Shared helpers for server-side PDF rendering.

All Jinja-based report services (`monthly_report_pdf_service`,
`property_report_pdf_service`, `maintenance_report_pdf_service`,
`project_report_pdf_service`) share the same WeasyPrint plumbing,
hr-HR formatters, and brand directory — this module centralises them
so a fix in one place applies everywhere.
"""
from __future__ import annotations

import ctypes
import logging
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader, select_autoescape

logger = logging.getLogger(__name__)


def _preload_weasyprint_native_libs() -> None:
    """Preload WeasyPrint's native deps on macOS so cffi.dlopen() can find them.

    macOS strips `DYLD_*` env vars from subprocesses spawned by Python
    (System Integrity Protection), which means setting them in
    `start_backend.sh` doesn't reach uvicorn's reload worker. Without a
    working dyld path, WeasyPrint fails with "cannot load library
    'libgobject-2.0-0'" even when libs are installed via Homebrew.

    Loading each .dylib explicitly with RTLD_GLOBAL puts it in the
    process's symbol table, so when WeasyPrint later asks dlopen() for
    the same library by name, the loader returns the already-loaded
    handle without consulting any search path.

    No-op on Linux (deps are on the default loader path) and Windows.
    Silently skips libs that aren't present so a host without Homebrew
    falls through to the original WeasyPrint error message.
    """
    if sys.platform != "darwin":
        return
    homebrew_lib = Path("/opt/homebrew/lib")
    if not homebrew_lib.is_dir():
        # Intel Macs use /usr/local/lib; try that as a fallback.
        homebrew_lib = Path("/usr/local/lib")
        if not homebrew_lib.is_dir():
            return
    # Order matters: deeper deps first so dependents resolve their symbols.
    for libname in (
        "libffi.dylib",
        "libglib-2.0.0.dylib",
        "libgobject-2.0.0.dylib",
        "libfontconfig.1.dylib",
        "libfreetype.6.dylib",
        "libharfbuzz.0.dylib",
        "libpango-1.0.0.dylib",
        "libpangoft2-1.0.0.dylib",
        "libcairo.2.dylib",
        "libgdk_pixbuf-2.0.0.dylib",
    ):
        path = homebrew_lib / libname
        if path.exists():
            try:
                ctypes.CDLL(str(path), mode=ctypes.RTLD_GLOBAL)
            except OSError as exc:  # noqa: PERF203
                logger.debug("Could not preload %s: %s", path, exc)

# Repo root resolves to .../RIFORMA-APP-CODEBASE; brand/ lives next to backend/.
_REPO_ROOT = Path(__file__).resolve().parents[3]
BRAND_DIR = _REPO_ROOT / "brand"

MONTH_NAMES = [
    "Siječanj", "Veljača", "Ožujak", "Travanj", "Svibanj", "Lipanj",
    "Srpanj", "Kolovoz", "Rujan", "Listopad", "Studeni", "Prosinac",
]

PRIORITY_LABELS = {
    "visoko": "Visoko",
    "srednje": "Srednje",
    "nisko": "Nisko",
    "kriticno": "Kritično",
}


def format_currency(value: Any) -> str:
    """hr-HR money formatting: 1.234,56 € (non-breaking space before €)."""
    if value is None or value == "":
        return "0,00 €"
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    integer, _, fractional = f"{amount:,.2f}".partition(".")
    integer = integer.replace(",", ".")
    return f"{integer},{fractional} €"


def format_number(value: Any, decimals: int = 0) -> str:
    """hr-HR number formatting without a unit suffix."""
    if value is None or value == "":
        return "—"
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    integer, _, fractional = f"{amount:,.{decimals}f}".partition(".")
    integer = integer.replace(",", ".")
    if decimals > 0 and fractional:
        return f"{integer},{fractional}"
    return integer


def format_date(value: Any) -> str:
    """Display dates as dd.mm.yyyy. — handles ISO strings, dates, datetimes."""
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = date.fromisoformat(value[:10])
        except ValueError:
            return value
    if isinstance(value, datetime):
        value = value.date()
    try:
        return value.strftime("%d.%m.%Y.")
    except Exception:
        return str(value)


def clamp_pct(value: Any) -> float:
    """Clamp a number to 0..100 — used for progress bar fill widths."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if n < 0:
        return 0.0
    if n > 100:
        return 100.0
    return n


def priority_label(value: Any) -> str:
    if not value:
        return "Nisko"
    return PRIORITY_LABELS.get(str(value).lower(), str(value).capitalize())


def make_jinja_env() -> Environment:
    """Return a Jinja Environment loaded from `brand/` with the standard
    filters and globals registered. Each service can add its own as needed."""
    env = Environment(
        loader=FileSystemLoader(str(BRAND_DIR)),
        autoescape=select_autoescape(enabled_extensions=("html",)),
    )
    env.filters["currency"] = format_currency
    env.filters["number"] = format_number
    env.filters["fdate"] = format_date
    env.filters["clamp_pct"] = clamp_pct
    env.globals["priority_label"] = priority_label
    return env


def html_to_pdf(html: str, base_url: Optional[str] = None) -> bytes:
    """Run WeasyPrint. Returns 503 with a clear message if native libs are
    missing — same contract as `contract_pdf_service.html_to_pdf`."""
    _preload_weasyprint_native_libs()
    try:
        from weasyprint import HTML  # type: ignore
    except ImportError as exc:
        logger.error("WeasyPrint not installed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Generiranje PDF-a nije dostupno — WeasyPrint nije instaliran."
                " Instalirajte system pakete (libpango, libcairo) i"
                " `pip install weasyprint`."
            ),
        )
    except OSError as exc:
        logger.error("WeasyPrint native libs missing: %s", exc)
        raise HTTPException(
            status_code=503,
            detail=(
                "Generiranje PDF-a nije dostupno — nedostaju native biblioteke"
                " (libpango / libcairo). Obratite se administratoru."
            ),
        )
    return HTML(string=html, base_url=base_url or str(BRAND_DIR)).write_pdf()

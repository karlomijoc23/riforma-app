"""Render the monthly portfolio report (AI-generated JSON) into a real PDF.

The frontend already has the structured report payload after the user
generates it on /reports/monthly; this service just expands it into a
Jinja template and rasterises with WeasyPrint. Result is selectable
text + crisp typography rather than the html2canvas screenshot we used
before.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException

from app.services.pdf_common import MONTH_NAMES, html_to_pdf, make_jinja_env

_jinja_env = make_jinja_env()


def render_monthly_report_pdf(
    report: Dict[str, Any],
    mjesec: int,
    godina: int,
    source: Optional[str] = None,
) -> bytes:
    """Take the structured report (same shape returned by `/ai/monthly-report`)
    and produce a print-ready PDF.

    Accepts the payload from the client so the PDF endpoint doesn't have
    to re-run the AI call (saves cost + latency, and guarantees the PDF
    matches what the user sees on screen).
    """
    if not (1 <= mjesec <= 12):
        raise HTTPException(status_code=422, detail="Mjesec mora biti 1-12")
    if not (2020 <= godina <= 2099):
        raise HTTPException(status_code=422, detail="Nevažeća godina")

    if not isinstance(report, dict) or not report:
        raise HTTPException(
            status_code=400,
            detail=(
                "Izvještaj je prazan — prvo generirajte izvještaj"
                " pa pokušajte ponovo."
            ),
        )

    now = datetime.now(timezone.utc)
    period_label = f"{MONTH_NAMES[mjesec - 1]} {godina}."

    source_label = None
    if source:
        source_label = "AI" if source == "anthropic" else "Podaci"

    template = _jinja_env.get_template("monthly-report-template.html")
    html = template.render(
        report=report,
        period_label=period_label,
        generated_at=now.strftime("%d.%m.%Y."),
        generated_at_long=now.strftime("%d.%m.%Y. %H:%M"),
        source=source,
        source_label=source_label,
    )
    return html_to_pdf(html)

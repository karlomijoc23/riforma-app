"""Server-side PDF for a single project's status report.

Loads project + phases + transactions + documents through repositories
(same data the React `ProjectReportPage` used to fetch via
`api.getProject`), aggregates the totals, and renders through Jinja
+ WeasyPrint. Replaces the html2canvas screenshot path.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException

from app.db.repositories.instance import (
    project_documents,
    project_phases,
    project_transactions,
    projekti,
)
from app.services.pdf_common import html_to_pdf, make_jinja_env

_STATUS_LABELS = {
    "planning": "Planiranje",
    "in_progress": "U tijeku",
    "completed": "Završeno",
    "on_hold": "Na čekanju",
    "cancelled": "Otkazano",
}

_STATUS_COLORS = {
    "planning": "#6366f1",
    "in_progress": "#3b82f6",
    "completed": "#10b981",
    "on_hold": "#d97706",
    "cancelled": "#dc2626",
}

_PHASE_STATUS_LABELS = {
    "pending": "Na čekanju",
    "in_progress": "U tijeku",
    "completed": "Završeno",
    "delayed": "Kasni",
}

_PHASE_STATUS_COLORS = {
    "pending": "#94a3b8",
    "in_progress": "#3b82f6",
    "completed": "#10b981",
    "delayed": "#dc2626",
}

_jinja_env = make_jinja_env()


async def _build_context(project_id: str) -> Dict[str, Any]:
    project = await projekti.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nije pronađen")

    phases_rows = await project_phases.find_all(
        filters={"project_id": project_id}, order_by="order", order_dir="asc"
    )
    docs_rows = await project_documents.find_all(
        filters={"project_id": project_id}
    )
    txs_rows = await project_transactions.find_all(
        filters={"project_id": project_id}, order_by="date", order_dir="desc"
    )

    project_dict = projekti.to_dict(project)

    phases: List[Dict[str, Any]] = []
    for p in phases_rows:
        d = project_phases.to_dict(p)
        d["status_label"] = _PHASE_STATUS_LABELS.get(d.get("status"), d.get("status") or "—")
        d["status_color"] = _PHASE_STATUS_COLORS.get(d.get("status"), "#94a3b8")
        phases.append(d)

    transactions = [project_transactions.to_dict(t) for t in txs_rows]
    documents = [project_documents.to_dict(d) for d in docs_rows]

    budget = float(project_dict.get("budget") or 0)
    spent = float(project_dict.get("spent") or 0)
    remaining = budget - spent
    budget_pct = round((spent / budget * 100) if budget > 0 else 0)

    completed_phases = sum(1 for p in phases if p.get("status") == "completed")
    phase_pct = round((completed_phases / len(phases) * 100) if phases else 0)

    total_income = sum(
        float(t.get("amount") or 0)
        for t in transactions
        if t.get("type") == "income"
    )
    total_expense = sum(
        float(t.get("amount") or 0)
        for t in transactions
        if t.get("type") != "income"
    )
    net_amount = total_income - total_expense

    status = project_dict.get("status") or "planning"
    status_label = _STATUS_LABELS.get(status, status)
    status_color = _STATUS_COLORS.get(status, "#94a3b8")

    now = datetime.now(timezone.utc)
    return {
        "project": project_dict,
        "status_label": status_label,
        "status_color": status_color,
        "budget": budget,
        "spent": spent,
        "remaining": remaining,
        "budget_pct": budget_pct,
        "phases": phases,
        "completed_phases": completed_phases,
        "phase_pct": phase_pct,
        "transactions": transactions,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_amount": net_amount,
        "documents": documents,
        "generated_at": now.strftime("%d.%m.%Y."),
        "generated_at_long": now.strftime("%d.%m.%Y. %H:%M"),
    }


async def render_project_report_pdf(project_id: str) -> bytes:
    context = await _build_context(project_id)
    template = _jinja_env.get_template("project-report-template.html")
    html = template.render(**context)
    return html_to_pdf(html)

"""Server-side PDF for the maintenance overview report.

Same recipe as the property report — data aggregated server-side from
DB repositories so the PDF is authoritative, then rendered through the
shared Jinja+WeasyPrint pipeline. Replaces the html2canvas screenshot
that the React component used to produce.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List

from app.core.time import local_today
from app.db.repositories.instance import (
    maintenance_tasks,
    nekretnine,
    users,
)
from app.services.pdf_common import html_to_pdf, make_jinja_env

_STATUS_LABELS = {
    "novi": "Novi",
    "planiran": "Planiran",
    "u_tijeku": "U tijeku",
    "ceka_dobavljaca": "Čeka dobavljača",
    "potrebna_odluka": "Potrebna odluka",
    "zavrseno": "Završeno",
    "arhivirano": "Arhivirano",
}

_STATUS_COLORS = {
    "novi": "#0ea5e9",
    "planiran": "#6366f1",
    "u_tijeku": "#3b82f6",
    "ceka_dobavljaca": "#a855f7",
    "potrebna_odluka": "#f59e0b",
    "zavrseno": "#10b981",
    "arhivirano": "#94a3b8",
}

_PRIORITY_LABELS = {
    "kriticno": "Kritični",
    "visoko": "Visoki",
    "srednje": "Srednji",
    "nisko": "Niski",
}

_PRIORITY_COLORS = {
    "kriticno": "#dc2626",
    "visoko": "#ea580c",
    "srednje": "#d97706",
    "nisko": "#16a34a",
}

_PRIORITY_ORDER = {"kriticno": 0, "visoko": 1, "srednje": 2, "nisko": 3}

_OPEN_STATUSES = {"novi", "planiran", "u_tijeku", "ceka_dobavljaca", "potrebna_odluka"}
_TERMINAL_STATUSES = {"zavrseno", "arhivirano"}

_jinja_env = make_jinja_env()


def _is_overdue(task: Any, today: date) -> bool:
    if task.status in _TERMINAL_STATUSES:
        return False
    if not task.rok:
        return False
    rok = task.rok
    if isinstance(rok, str):
        try:
            rok = date.fromisoformat(rok[:10])
        except ValueError:
            return False
    if isinstance(rok, datetime):
        rok = rok.date()
    return rok < today


def _status_label(s: Any) -> str:
    return _STATUS_LABELS.get(str(s or ""), str(s or "—"))


def _status_color(s: Any) -> str:
    return _STATUS_COLORS.get(str(s or ""), "#94a3b8")


def _priority_label(p: Any) -> str:
    return _PRIORITY_LABELS.get(str(p or ""), str(p or "—"))


def _priority_color(p: Any) -> str:
    return _PRIORITY_COLORS.get(str(p or ""), "#94a3b8")


async def _build_context() -> Dict[str, Any]:
    today = local_today()

    tasks_rows = await maintenance_tasks.find_all()
    props_rows = await nekretnine.find_all()
    users_rows = await users.find_all()

    properties_by_id = {p.id: p for p in props_rows}
    users_by_id = {u.id: u for u in users_rows}

    enriched_tasks: List[Dict[str, Any]] = []
    overdue_count = 0
    open_count = 0
    completed_count = 0
    critical_count = 0
    cost_material = 0.0
    cost_labor = 0.0

    status_counts: Dict[str, int] = {}
    priority_counts: Dict[str, int] = {}
    tasks_by_property: Dict[str, int] = {}
    costs_by_property: Dict[str, float] = {}

    for t in tasks_rows:
        prop = properties_by_id.get(t.nekretnina_id) if t.nekretnina_id else None
        prop_name = prop.naziv if prop else "Nepovezano"

        assigned_user = (
            users_by_id.get(t.dodijeljeno_user_id)
            if t.dodijeljeno_user_id
            else None
        )
        assigned_label = (
            t.dodijeljeno
            or (assigned_user.full_name or assigned_user.email if assigned_user else None)
            or "—"
        )

        is_overdue = _is_overdue(t, today)
        if is_overdue:
            overdue_count += 1
        if t.status in _OPEN_STATUSES:
            open_count += 1
        if t.status == "zavrseno":
            completed_count += 1
        if t.prioritet == "kriticno" and t.status not in _TERMINAL_STATUSES:
            critical_count += 1

        m = float(t.trosak_materijal or 0)
        r = float(t.trosak_rad or 0)
        cost_material += m
        cost_labor += r

        status_counts[t.status or "nepoznato"] = status_counts.get(
            t.status or "nepoznato", 0
        ) + 1
        priority_counts[t.prioritet or "nepoznato"] = priority_counts.get(
            t.prioritet or "nepoznato", 0
        ) + 1
        tasks_by_property[prop_name] = tasks_by_property.get(prop_name, 0) + 1
        costs_by_property[prop_name] = costs_by_property.get(prop_name, 0) + m + r

        enriched_tasks.append({
            "id": t.id,
            "naziv": t.naziv,
            "opis": t.opis,
            "nekretnina_naziv": prop_name,
            "prioritet": t.prioritet,
            "priority_label": _priority_label(t.prioritet),
            "priority_color": _priority_color(t.prioritet),
            "status": t.status,
            "status_label": _status_label(t.status),
            "status_color": _status_color(t.status),
            "rok": t.rok,
            "is_overdue": is_overdue,
            "trosak_materijal": (
                t.trosak_materijal if t.trosak_materijal is not None else None
            ),
            "trosak_rad": t.trosak_rad if t.trosak_rad is not None else None,
            "dodijeljeno_naziv": assigned_label,
        })

    # Sort: critical → high → medium → low; ties broken by due date.
    enriched_tasks.sort(
        key=lambda x: (
            _PRIORITY_ORDER.get(x["prioritet"] or "", 99),
            x["rok"].isoformat() if isinstance(x["rok"], date) else (x["rok"] or "9999-99-99"),
        )
    )

    total_cost = cost_material + cost_labor
    total_tasks = len(enriched_tasks)

    def _bucket(label_fn, color_fn, counts, order_fn=None):
        items = [
            {
                "key": k,
                "label": label_fn(k),
                "color": color_fn(k),
                "count": v,
                "pct": round((v / total_tasks * 100) if total_tasks else 0),
            }
            for k, v in counts.items()
        ]
        if order_fn:
            items.sort(key=order_fn)
        else:
            items.sort(key=lambda i: -i["count"])
        return items

    status_summary = _bucket(_status_label, _status_color, status_counts)
    priority_summary = _bucket(
        _priority_label,
        _priority_color,
        priority_counts,
        order_fn=lambda i: _PRIORITY_ORDER.get(i["key"], 99),
    )

    tasks_by_property_list = sorted(
        ({"name": k, "count": v} for k, v in tasks_by_property.items()),
        key=lambda x: -x["count"],
    )
    costs_by_property_list = sorted(
        ({"name": k, "cost": v} for k, v in costs_by_property.items()),
        key=lambda x: -x["cost"],
    )

    overdue_preview = [t for t in enriched_tasks if t["is_overdue"]][:5]

    totals = {
        "total": total_tasks,
        "open": open_count,
        "critical": critical_count,
        "overdue": overdue_count,
        "completed": completed_count,
        "cost_material": round(cost_material, 2),
        "cost_labor": round(cost_labor, 2),
        "cost_total": round(total_cost, 2),
        "cost_material_pct": (
            round(cost_material / total_cost * 100) if total_cost > 0 else 0
        ),
        "cost_labor_pct": (
            round(cost_labor / total_cost * 100) if total_cost > 0 else 0
        ),
    }

    now = datetime.now(timezone.utc)
    return {
        "tasks": enriched_tasks,
        "totals": totals,
        "status_summary": status_summary,
        "priority_summary": priority_summary,
        "tasks_by_property": tasks_by_property_list,
        "costs_by_property": costs_by_property_list,
        "overdue_preview": overdue_preview,
        "generated_at": now.strftime("%d.%m.%Y."),
        "generated_at_long": now.strftime("%d.%m.%Y. %H:%M"),
    }


async def render_maintenance_report_pdf() -> bytes:
    context = await _build_context()
    template = _jinja_env.get_template("maintenance-report-template.html")
    html = template.render(**context)
    return html_to_pdf(html)

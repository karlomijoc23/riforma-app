"""Server-side PDF for the contract listing / overview report.

Powers both the per-tenant filtered view from `UgovoriPage` and the
full-portfolio `ContractReport` page. Filters are passed via query
params so the same endpoint serves both: no filters → full picture,
with filters → narrowed snapshot that matches what the user has on
screen.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, select

from app.db.repositories.instance import (
    nekretnine,
    property_units,
    ugovori,
    zakupnici,
)
from app.db.session import get_async_session_factory
from app.models.tables import UgovoriRow, ugovor_units
from app.services.pdf_common import html_to_pdf, make_jinja_env

_STATUS_LABELS = {
    "aktivno": "Aktivno",
    "na_isteku": "Na isteku",
    "istekao": "Istekao",
    "raskinuto": "Raskinuto",
    "arhivirano": "Arhivirano",
}

_STATUS_COLORS = {
    "aktivno": "#16a34a",
    "na_isteku": "#d97706",
    "istekao": "#dc2626",
    "raskinuto": "#6b7280",
    "arhivirano": "#94a3b8",
}

_STATUS_PILLS = {
    "aktivno": "active",
    "na_isteku": "expiring",
    "istekao": "expired",
    "raskinuto": "neutral",
    "arhivirano": "neutral",
}

_STATUS_ORDER = {
    "aktivno": 0,
    "na_isteku": 1,
    "istekao": 2,
    "raskinuto": 3,
    "arhivirano": 4,
}

_jinja_env = make_jinja_env()


def _status_label(s: Any) -> str:
    return _STATUS_LABELS.get(str(s or ""), str(s or "—"))


def _status_color(s: Any) -> str:
    return _STATUS_COLORS.get(str(s or ""), "#94a3b8")


def _status_pill(s: Any) -> str:
    return _STATUS_PILLS.get(str(s or ""), "neutral")


async def _load_ugovor_unit_links() -> Dict[str, List[str]]:
    """Return {ugovor_id: [property_unit_id, ...]} from the M:N junction.
    Same helper as in property_report_pdf_service — kept duplicated here
    so this module is self-contained; small enough that a shared util
    file is overkill."""
    factory = get_async_session_factory()
    async with factory() as session:
        rows = (
            await session.execute(
                select(ugovor_units.c.ugovor_id, ugovor_units.c.property_unit_id)
            )
        ).all()
    out: Dict[str, List[str]] = {}
    for ug_id, unit_id in rows:
        out.setdefault(ug_id, []).append(unit_id)
    return out


def _contract_unit_ids(contract: Any, junction: Dict[str, List[str]]) -> List[str]:
    """Junction first, fall back to legacy `property_unit_id`."""
    ids = list(junction.get(contract.id, []))
    if not ids and getattr(contract, "property_unit_id", None):
        ids = [contract.property_unit_id]
    return ids


def _is_expiring_soon(end_date: Any, today: date, days: int = 90) -> bool:
    """True if end_date is in (today, today + days]."""
    if not end_date:
        return False
    if isinstance(end_date, str):
        try:
            end_date = date.fromisoformat(end_date[:10])
        except ValueError:
            return False
    if isinstance(end_date, datetime):
        end_date = end_date.date()
    delta = (end_date - today).days
    return 0 < delta <= days


async def _build_context(
    status: Optional[str] = None,
    nekretnina_id: Optional[str] = None,
    zakupnik_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    extra = []
    if status:
        extra.append(UgovoriRow.status == status)
    if date_from:
        extra.append(UgovoriRow.datum_zavrsetka >= date_from)
    if date_to:
        extra.append(UgovoriRow.datum_pocetka <= date_to)

    filters: Dict[str, Any] = {}
    if nekretnina_id:
        filters["nekretnina_id"] = nekretnina_id
    if zakupnik_id:
        filters["zakupnik_id"] = zakupnik_id

    contract_rows = await ugovori.find_all(
        filters=filters,
        extra_conditions=extra if extra else None,
    )

    nek_rows = await nekretnine.find_all()
    zak_rows = await zakupnici.find_all()
    unit_rows = await property_units.find_all()
    ugovor_unit_map = await _load_ugovor_unit_links()
    nek_by_id = {n.id: n for n in nek_rows}
    zak_by_id = {z.id: z for z in zak_rows}
    units_by_id = {u.id: u for u in unit_rows}

    # €/m² akumulacija — za top/bottom 3 i prosjek po nekretnini.
    # Računamo samo na aktivnim ugovorima s mjerljivom površinom — istekli
    # ne ulaze jer bi zamutili "trenutnu" sliku zakupnine.
    per_contract_rent_m2: List[Dict[str, Any]] = []
    per_property_rent_m2: Dict[str, Dict[str, float]] = {}

    today = datetime.now(timezone.utc).date()

    enriched: List[Dict[str, Any]] = []
    revenue_by_prop: Dict[str, float] = {}
    tenant_buckets: Dict[str, Dict[str, Any]] = {}

    monthly_rent = 0.0
    cam_total = 0.0
    active_count = 0
    expired_count = 0
    terminated_count = 0
    expiring_soon_count = 0
    indexation_count = 0
    durations: List[int] = []
    status_counts: Dict[str, int] = {}

    for c in contract_rows:
        d = ugovori.to_dict(c)

        nek = nek_by_id.get(c.nekretnina_id) if c.nekretnina_id else None
        zak = zak_by_id.get(c.zakupnik_id) if c.zakupnik_id else None
        d["nekretnina_naziv"] = nek.naziv if nek else "—"
        d["zakupnik_naziv"] = (
            (zak.naziv_firme or zak.ime_prezime) if zak else "—"
        )
        d["status_label"] = _status_label(d.get("status"))
        d["status_pill_class"] = _status_pill(d.get("status"))
        enriched.append(d)

        s = c.status or "nepoznato"
        status_counts[s] = status_counts.get(s, 0) + 1

        if c.status == "aktivno":
            active_count += 1
            rent_val = float(c.osnovna_zakupnina or 0)
            monthly_rent += rent_val
            cam_total += float(c.cam_troskovi or 0)

            prop_key = nek.naziv if nek else "Nepovezano"
            revenue_by_prop[prop_key] = revenue_by_prop.get(prop_key, 0) + rent_val
            tenant_key = d["zakupnik_naziv"]
            bucket = tenant_buckets.setdefault(
                tenant_key, {"name": tenant_key, "count": 0, "rent": 0.0}
            )
            bucket["count"] += 1
            bucket["rent"] += rent_val

            # €/m² agregacija: zbroji površine svih jedinica koje ugovor
            # pokriva, izračunaj omjer. Preskoči ako je rent 0 ili nema
            # mjerljive površine (junction prazan i bez legacy FK-a).
            if rent_val > 0:
                unit_ids = _contract_unit_ids(c, ugovor_unit_map)
                area = sum(
                    float(units_by_id[uid].povrsina_m2 or 0)
                    for uid in unit_ids
                    if uid in units_by_id
                )
                if area > 0:
                    eur_per_m2 = rent_val / area
                    per_contract_rent_m2.append({
                        "contract_id": c.id,
                        "oznaka": c.interna_oznaka or "—",
                        "property_id": c.nekretnina_id,
                        "property_name": nek.naziv if nek else "Nepovezano",
                        "tenant_name": d["zakupnik_naziv"],
                        "area_m2": area,
                        "rent": rent_val,
                        "eur_per_m2": eur_per_m2,
                    })
                    pp = per_property_rent_m2.setdefault(
                        c.nekretnina_id or "_none_", {"rent": 0.0, "area": 0.0}
                    )
                    pp["rent"] += rent_val
                    pp["area"] += area

            if _is_expiring_soon(c.datum_zavrsetka, today):
                expiring_soon_count += 1

        if c.status == "na_isteku":
            expiring_soon_count += 1

        if c.status == "istekao":
            expired_count += 1
        if c.status == "raskinuto":
            terminated_count += 1
        if c.indeksacija and c.status == "aktivno":
            indexation_count += 1

        # Duration in months for the average
        if c.datum_pocetka and c.datum_zavrsetka:
            try:
                start = c.datum_pocetka if isinstance(c.datum_pocetka, date) else date.fromisoformat(str(c.datum_pocetka)[:10])
                end = c.datum_zavrsetka if isinstance(c.datum_zavrsetka, date) else date.fromisoformat(str(c.datum_zavrsetka)[:10])
                months = round((end - start).days / 30)
                if months > 0:
                    durations.append(months)
            except (ValueError, TypeError):
                pass

    # Sort contracts: status priority then end date
    enriched.sort(
        key=lambda c: (
            _STATUS_ORDER.get(c.get("status") or "", 5),
            c.get("datum_zavrsetka") or "9999-12-31",
        )
    )

    avg_duration = round(sum(durations) / len(durations)) if durations else 0
    annual_rent = monthly_rent * 12

    total = len(enriched)
    status_summary = sorted(
        (
            {
                "key": k,
                "label": _status_label(k),
                "color": _status_color(k),
                "count": v,
                "pct": round((v / total * 100) if total else 0),
            }
            for k, v in status_counts.items()
        ),
        key=lambda r: _STATUS_ORDER.get(r["key"], 5),
    )

    # Summary sekcije su kratke i pregledne — cap-ane na 5 najvećih
    # po prihodu. Pun popis svih ugovora ide u "Detaljan pregled ugovora"
    # koji namjerno NEMA cap.
    SUMMARY_LIMIT = 5
    revenue_sorted = sorted(
        [{"name": k, "amount": v} for k, v in revenue_by_prop.items()],
        key=lambda r: -r["amount"],
    )
    revenue_list = revenue_sorted[:SUMMARY_LIMIT]
    revenue_overflow = max(0, len(revenue_sorted) - SUMMARY_LIMIT)

    tenants_sorted = sorted(
        tenant_buckets.values(), key=lambda r: -r["rent"]
    )
    top_tenants = tenants_sorted[:SUMMARY_LIMIT]
    tenants_overflow = max(0, len(tenants_sorted) - SUMMARY_LIMIT)

    totals = {
        "count": total,
        "active_count": active_count,
        "expired_count": expired_count,
        "terminated_count": terminated_count,
        "expiring_soon_count": expiring_soon_count,
        "indexation_count": indexation_count,
        "avg_duration_months": avg_duration,
        "monthly_rent": round(monthly_rent, 2),
        "annual_rent": round(annual_rent, 2),
        "cam_total": round(cam_total, 2),
    }

    # Build a human-readable filter label for the header
    label_parts = []
    if status:
        label_parts.append(f"status: {_status_label(status)}")
    if nekretnina_id and nekretnina_id in nek_by_id:
        label_parts.append(f"nekretnina: {nek_by_id[nekretnina_id].naziv}")
    if zakupnik_id and zakupnik_id in zak_by_id:
        z = zak_by_id[zakupnik_id]
        label_parts.append(f"zakupnik: {z.naziv_firme or z.ime_prezime}")
    if date_from:
        label_parts.append(f"od {date_from}")
    if date_to:
        label_parts.append(f"do {date_to}")
    filter_label = " · ".join(label_parts) if label_parts else None

    # ── €/m² analiza (top/bottom + prosjek po nekretnini) ────────────
    top_rent_per_m2 = sorted(
        per_contract_rent_m2, key=lambda r: -r["eur_per_m2"]
    )[:3]
    bottom_rent_per_m2 = sorted(
        per_contract_rent_m2, key=lambda r: r["eur_per_m2"]
    )[:3]

    avg_per_property = []
    for prop_id, b in per_property_rent_m2.items():
        if b["area"] <= 0:
            continue
        prop_name = (
            nek_by_id[prop_id].naziv if prop_id in nek_by_id else "Nepovezano"
        )
        avg_per_property.append({
            "property_id": prop_id,
            "property_name": prop_name,
            "rent": b["rent"],
            "area_m2": b["area"],
            "eur_per_m2": b["rent"] / b["area"],
        })
    avg_per_property.sort(key=lambda r: -r["eur_per_m2"])

    total_rent_for_m2 = sum(b["rent"] for b in per_property_rent_m2.values())
    total_area_for_m2 = sum(b["area"] for b in per_property_rent_m2.values())
    portfolio_avg_per_m2 = (
        total_rent_for_m2 / total_area_for_m2 if total_area_for_m2 > 0 else 0
    )

    # Mapiraj €/m² i vs-portfelj % natrag na svaki ugovor u `enriched`,
    # kako bi tablica detalja mogla prikazati te brojeve umjesto CAM/Status.
    # Neaktivni ili ugovori bez mjerljive površine dobivaju None — frontend
    # render to prikaže kao "—".
    eur_per_m2_by_contract = {
        r["contract_id"]: r["eur_per_m2"] for r in per_contract_rent_m2
    }
    for d in enriched:
        e = eur_per_m2_by_contract.get(d["id"])
        d["eur_per_m2"] = e
        if e is not None and portfolio_avg_per_m2 > 0:
            d["vs_portfolio_pct"] = (e - portfolio_avg_per_m2) / portfolio_avg_per_m2 * 100
        else:
            d["vs_portfolio_pct"] = None

    now = datetime.now(timezone.utc)
    return {
        "contracts": enriched,
        "totals": totals,
        "status_summary": status_summary,
        "revenue_by_property": revenue_list,
        "revenue_overflow": revenue_overflow,
        "top_tenants": top_tenants,
        "tenants_overflow": tenants_overflow,
        "top_rent_per_m2": top_rent_per_m2,
        "bottom_rent_per_m2": bottom_rent_per_m2,
        "avg_per_property": avg_per_property,
        "portfolio_avg_per_m2": portfolio_avg_per_m2,
        "filter_label": filter_label,
        "generated_at": now.strftime("%d.%m.%Y."),
        "generated_at_long": now.strftime("%d.%m.%Y. %H:%M"),
    }


async def render_contracts_report_pdf(
    status: Optional[str] = None,
    nekretnina_id: Optional[str] = None,
    zakupnik_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> bytes:
    context = await _build_context(
        status=status,
        nekretnina_id=nekretnina_id,
        zakupnik_id=zakupnik_id,
        date_from=date_from,
        date_to=date_to,
    )
    template = _jinja_env.get_template("contracts-report-template.html")
    html = template.render(**context)
    return html_to_pdf(html)

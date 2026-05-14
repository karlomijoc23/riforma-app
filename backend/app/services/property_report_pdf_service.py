"""Server-side PDF for the property portfolio report.

Pulls the same three slices the frontend used to fetch (`/nekretnine`,
`/ugovori`, `/units`), re-implements the per-property aggregation here
so the numbers in the PDF are authoritative DB-derived values rather
than whatever the React component happened to have in state, and
renders the result through the shared Jinja+WeasyPrint pipeline.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

from sqlalchemy import select

from app.db.repositories.instance import nekretnine, property_units, ugovori
from app.db.session import get_async_session_factory
from app.models.tables import ugovor_units
from app.services.pdf_common import html_to_pdf, make_jinja_env

_TYPE_LABELS = {
    "poslovna_zgrada": "Poslovna zgrada",
    "stambeni_objekt": "Stambeni objekt",
    "stan": "Stan",
    "zemljiste": "Zemljište",
    "ostalo": "Ostalo",
}

_TYPE_COLORS = {
    "poslovna_zgrada": "#3b82f6",
    "stambeni_objekt": "#f97316",
    "stan": "#a855f7",
    "zemljiste": "#10b981",
    "ostalo": "#6b7280",
}

_ACTIVE_CONTRACT_STATUSES = ("aktivno", "na_isteku")

_jinja_env = make_jinja_env()


def _type_label(value: Any) -> str:
    if not value:
        return "Ostalo"
    return _TYPE_LABELS.get(str(value), str(value))


def _type_color(value: Any) -> str:
    if not value:
        return _TYPE_COLORS["ostalo"]
    return _TYPE_COLORS.get(str(value), _TYPE_COLORS["ostalo"])


async def _load_ugovor_unit_links() -> Dict[str, List[str]]:
    """Return {ugovor_id: [property_unit_id, ...]} from the M:N junction."""
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
    """Collect every unit id this contract touches — junction first, fall
    back to the legacy `property_unit_id` FK so old single-unit rows still
    contribute to the per-m² maths."""
    ids = list(junction.get(contract.id, []))
    if not ids and getattr(contract, "property_unit_id", None):
        ids = [contract.property_unit_id]
    return ids


async def _build_context() -> Dict[str, Any]:
    """Aggregate properties + units + active contracts into the shape the
    template expects. Mirrors the React component's logic 1:1 so the PDF
    matches the on-screen view."""
    props_rows = await nekretnine.find_all()
    units_rows = await property_units.find_all()
    contracts_rows = await ugovori.find_all()
    ugovor_unit_map = await _load_ugovor_unit_links()
    units_by_id = {u.id: u for u in units_rows}

    units_by_property: Dict[str, List[Any]] = {}
    for u in units_rows:
        units_by_property.setdefault(u.nekretnina_id, []).append(u)

    contracts_by_property: Dict[str, List[Any]] = {}
    for c in contracts_rows:
        if c.status in _ACTIVE_CONTRACT_STATUSES:
            contracts_by_property.setdefault(c.nekretnina_id, []).append(c)

    enriched: List[Dict[str, Any]] = []
    type_summary: Dict[str, Dict[str, Any]] = {}
    for p in props_rows:
        prop_units = units_by_property.get(p.id, [])
        prop_contracts = contracts_by_property.get(p.id, [])

        monthly_income = sum(
            float(c.osnovna_zakupnina or 0) for c in prop_contracts
        )
        total_units = len(prop_units)
        occupied_units = sum(
            1 for u in prop_units if u.status == "iznajmljeno"
        )
        if total_units > 0:
            occupancy = round(occupied_units / total_units * 100)
        elif prop_contracts:
            occupancy = 100
        else:
            occupancy = 0

        market_value = float(p.trzisna_vrijednost or 0)
        povrsina = float(p.povrsina or 0)
        vrsta = p.vrsta or "ostalo"

        # ROI = godišnji prihod / tržišna vrijednost. Bez tržišne
        # vrijednosti je nedefiniran (None — template prikaže "—").
        roi_pct = (monthly_income * 12 / market_value * 100) if market_value > 0 else None

        enriched.append({
            "id": p.id,
            "naziv": p.naziv,
            "adresa": p.adresa,
            "vrsta": vrsta,
            "type_label": _type_label(vrsta),
            "type_color": _type_color(vrsta),
            "povrsina": povrsina,
            "roi_pct": roi_pct,
            "trzisna_vrijednost": market_value,
            "monthly_income": monthly_income,
            "occupancy_percent": occupancy,
            "occupied_units": occupied_units,
            "total_units": total_units,
            "active_contract_count": len(prop_contracts),
        })

        bucket = type_summary.setdefault(
            vrsta,
            {
                "key": vrsta,
                "label": _type_label(vrsta),
                "color": _type_color(vrsta),
                "count": 0,
                "value": 0.0,
                "income": 0.0,
            },
        )
        bucket["count"] += 1
        bucket["value"] += market_value
        bucket["income"] += monthly_income

    # Match the frontend's sort: highest market value first, then highest income
    enriched.sort(
        key=lambda x: (-x["trzisna_vrijednost"], -x["monthly_income"])
    )

    total_area = sum(p["povrsina"] for p in enriched)
    total_value = sum(p["trzisna_vrijednost"] for p in enriched)
    total_monthly = sum(p["monthly_income"] for p in enriched)
    total_units = sum(p["total_units"] for p in enriched)
    occupied_units = sum(p["occupied_units"] for p in enriched)
    total_active = sum(p["active_contract_count"] for p in enriched)
    total_props = len(enriched)
    avg_occupancy = (
        sum(p["occupancy_percent"] for p in enriched) / total_props
        if total_props
        else 0
    )
    annual_income = total_monthly * 12
    avg_yield = (annual_income / total_value * 100) if total_value > 0 else 0

    totals = {
        "total_properties": total_props,
        "total_area": total_area,
        "total_value": total_value,
        "total_active_contracts": total_active,
        "monthly_income": total_monthly,
        "annual_income": annual_income,
        "avg_yield": round(avg_yield, 1),
        "avg_occupancy": round(avg_occupancy, 1),
        "total_units": total_units,
        "occupied_units": occupied_units,
    }

    # Type summary as a sorted list (descending value) for stable rendering
    type_list = sorted(type_summary.values(), key=lambda t: -t["value"])

    # ── €/m² analiza (po pojedinačnim aktivnim ugovorima) ────────────
    # Za svaki ugovor: zbroji površine svih jedinica koje pokriva
    # (junction + legacy FK). Ako su 0, preskoči — €/m² je nedefiniran.
    property_name_map = {p.id: p.naziv for p in props_rows}
    per_contract: List[Dict[str, Any]] = []
    per_property_rent: Dict[str, Dict[str, float]] = {}

    for c in contracts_rows:
        if c.status not in _ACTIVE_CONTRACT_STATUSES:
            continue
        rent = float(c.osnovna_zakupnina or 0)
        if rent <= 0:
            continue

        unit_ids = _contract_unit_ids(c, ugovor_unit_map)
        area = sum(
            float(units_by_id[uid].povrsina_m2 or 0)
            for uid in unit_ids
            if uid in units_by_id
        )
        if area <= 0:
            continue

        eur_per_m2 = rent / area
        per_contract.append({
            "contract_id": c.id,
            "oznaka": c.interna_oznaka or "—",
            "property_id": c.nekretnina_id,
            "property_name": property_name_map.get(c.nekretnina_id, "Nepoznato"),
            "area_m2": area,
            "rent": rent,
            "eur_per_m2": eur_per_m2,
        })

        # Po-nekretnina agregacija: zbroji rent + area pa izračunaj prosjek
        bucket = per_property_rent.setdefault(
            c.nekretnina_id, {"rent": 0.0, "area": 0.0}
        )
        bucket["rent"] += rent
        bucket["area"] += area

    # Top 3 najbolje plaćeno (najveći €/m²)
    top_rent_per_m2 = sorted(
        per_contract, key=lambda x: -x["eur_per_m2"]
    )[:3]
    # Bottom 3 najlošije plaćeno (najmanji €/m², ali > 0)
    bottom_rent_per_m2 = sorted(per_contract, key=lambda x: x["eur_per_m2"])[:3]

    # Prosjek €/m² po nekretnini (samo gdje ima aktivnih ugovora s mjerljivom
    # površinom — inače bi dijelili s nulom ili upalili portfelje s neunesenom
    # zakupninom)
    avg_per_property = []
    for prop_id, bucket in per_property_rent.items():
        if bucket["area"] <= 0:
            continue
        avg_per_property.append({
            "property_id": prop_id,
            "property_name": property_name_map.get(prop_id, "Nepoznato"),
            "rent": bucket["rent"],
            "area_m2": bucket["area"],
            "eur_per_m2": bucket["rent"] / bucket["area"],
        })
    avg_per_property.sort(key=lambda x: -x["eur_per_m2"])

    # Portfelj-prosjek (za usporedbu individualnih s ukupnim)
    total_rent_for_m2 = float(
        sum(b["rent"] for b in per_property_rent.values())
    )
    total_area_for_m2 = float(
        sum(b["area"] for b in per_property_rent.values())
    )
    portfolio_avg_per_m2 = (
        total_rent_for_m2 / total_area_for_m2 if total_area_for_m2 > 0 else 0.0
    )

    # Pre-render vs portfelj labela i ROI labela u Pythonu — izbjegava
    # Jinja `| format(...)` filter koji puca na Decimal vrijednostima na
    # nekim WeasyPrint / Jinja2 verzijama.
    for r in avg_per_property:
        if portfolio_avg_per_m2 > 0:
            diff = (r["eur_per_m2"] - portfolio_avg_per_m2) / portfolio_avg_per_m2 * 100
            r["vs_portfolio_pct"] = diff
            r["vs_portfolio_label"] = (
                f"+{diff:.1f} %" if diff >= 0 else f"{diff:.1f} %"
            )
        else:
            r["vs_portfolio_pct"] = None
            r["vs_portfolio_label"] = "—"

    # Pre-render ROI label per property
    for p in enriched:
        roi = p.get("roi_pct")
        if roi is None:
            p["roi_label"] = "—"
        else:
            p["roi_label"] = f"{float(roi):.1f} %"

    now = datetime.now(timezone.utc)
    return {
        "properties": enriched,
        "totals": totals,
        "type_summary": type_list,
        "top_rent_per_m2": top_rent_per_m2,
        "bottom_rent_per_m2": bottom_rent_per_m2,
        "avg_per_property": avg_per_property,
        "portfolio_avg_per_m2": portfolio_avg_per_m2,
        "generated_at": now.strftime("%d.%m.%Y."),
        "generated_at_long": now.strftime("%d.%m.%Y. %H:%M"),
    }


async def render_property_report_pdf() -> bytes:
    """Top-level: pull data, render template, return PDF bytes."""
    context = await _build_context()
    template = _jinja_env.get_template("property-report-template.html")
    html = template.render(**context)
    return html_to_pdf(html)

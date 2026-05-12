"""Server-side PDF for a single nekretnina (property) detail report.

Pulls the nekretnina with its podprostori, parking spaces, active
contracts, and zakupnik names so the PDF is a self-contained snapshot
of the property — what investors see when they ask for a one-pager.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import HTTPException

from app.db.repositories.instance import (
    nekretnine,
    parking_spaces,
    property_units,
    ugovori,
    zakupnici,
)
from app.services.pdf_common import html_to_pdf, make_jinja_env

_TYPE_LABELS = {
    "poslovna_zgrada": "Poslovna zgrada",
    "stambeni_objekt": "Stambeni objekt",
    "stan": "Stan",
    "zemljiste": "Zemljište",
    "ostalo": "Ostalo",
}

_UNIT_STATUS_LABELS = {
    "dostupno": "Dostupno",
    "rezervirano": "Rezervirano",
    "iznajmljeno": "Iznajmljeno",
    "u_odrzavanju": "U održavanju",
}

_UNIT_STATUS_PILLS = {
    "dostupno": "positive",
    "rezervirano": "warn",
    "iznajmljeno": "info",
    "u_odrzavanju": "neutral",
}

_CONTRACT_STATUS_LABELS = {
    "aktivno": "Aktivno",
    "na_isteku": "Na isteku",
    "istekao": "Istekao",
    "raskinuto": "Raskinuto",
    "arhivirano": "Arhivirano",
}

_CONTRACT_STATUS_PILLS = {
    "aktivno": "positive",
    "na_isteku": "warn",
    "istekao": "danger",
    "raskinuto": "neutral",
    "arhivirano": "neutral",
}

_ACTIVE_CONTRACT_STATUSES = ("aktivno", "na_isteku")

_jinja_env = make_jinja_env()


def _type_label(value: Any) -> str:
    return _TYPE_LABELS.get(str(value or ""), str(value or "Ostalo"))


def _unit_status_label(value: Any) -> str:
    return _UNIT_STATUS_LABELS.get(str(value or ""), str(value or "—"))


def _unit_status_pill(value: Any) -> str:
    return _UNIT_STATUS_PILLS.get(str(value or ""), "neutral")


def _contract_status_label(value: Any) -> str:
    return _CONTRACT_STATUS_LABELS.get(str(value or ""), str(value or "—"))


def _contract_status_pill(value: Any) -> str:
    return _CONTRACT_STATUS_PILLS.get(str(value or ""), "neutral")


async def _build_context(property_id: str) -> Dict[str, Any]:
    prop_row = await nekretnine.get_by_id(property_id)
    if not prop_row:
        raise HTTPException(status_code=404, detail="Nekretnina nije pronađena")

    units_rows = await property_units.find_all(
        filters={"nekretnina_id": property_id},
        order_by="oznaka",
        order_dir="asc",
    )
    parking_rows = await parking_spaces.find_all(
        filters={"nekretnina_id": property_id},
        order_by="internal_id",
        order_dir="asc",
    )
    contract_rows = await ugovori.find_all(
        filters={"nekretnina_id": property_id},
    )
    zakupnik_rows = await zakupnici.find_all()
    zakupnici_by_id = {z.id: z for z in zakupnik_rows}

    property_dict = nekretnine.to_dict(prop_row)
    property_dict["type_label"] = _type_label(property_dict.get("vrsta"))

    units: List[Dict[str, Any]] = []
    total_area = 0.0
    occupied_area = 0.0
    occupied_unit_count = 0
    for u in units_rows:
        d = property_units.to_dict(u)
        d["status_label"] = _unit_status_label(d.get("status"))
        d["status_pill_class"] = _unit_status_pill(d.get("status"))
        units.append(d)
        area = float(d.get("povrsina_m2") or 0)
        total_area += area
        if d.get("status") == "iznajmljeno":
            occupied_area += area
            occupied_unit_count += 1

    parkings: List[Dict[str, Any]] = []
    for p in parking_rows:
        d = parking_spaces.to_dict(p)
        d["status_label"] = _unit_status_label(d.get("status"))
        d["status_pill_class"] = _unit_status_pill(d.get("status"))
        parkings.append(d)

    # Active contracts only — same set the on-screen detail page highlights.
    active_contracts_raw = [
        c for c in contract_rows if c.status in _ACTIVE_CONTRACT_STATUSES
    ]
    contracts: List[Dict[str, Any]] = []
    monthly_income = 0.0
    for c in active_contracts_raw:
        d = ugovori.to_dict(c)
        z = zakupnici_by_id.get(c.zakupnik_id) if c.zakupnik_id else None
        d["zakupnik_naziv"] = (
            (z.naziv_firme or z.ime_prezime) if z else "Nepoznat zakupnik"
        )
        d["status_label"] = _contract_status_label(d.get("status"))
        d["status_pill_class"] = _contract_status_pill(d.get("status"))
        contracts.append(d)
        monthly_income += float(c.osnovna_zakupnina or 0)

    contracts.sort(key=lambda c: c.get("datum_pocetka") or "", reverse=True)

    annual_income = monthly_income * 12
    market_value = float(property_dict.get("trzisna_vrijednost") or 0)
    yield_pct = (annual_income / market_value * 100) if market_value > 0 else 0

    occupancy_pct = (
        (occupied_area / total_area * 100) if total_area > 0 else (
            100 if active_contracts_raw and not units else 0
        )
    )

    totals = {
        "market_value": market_value,
        "monthly_income": round(monthly_income, 2),
        "annual_income": round(annual_income, 2),
        "yield_pct": round(yield_pct, 2),
        "active_contracts": len(active_contracts_raw),
        "total_units": len(units),
        "occupied_units": occupied_unit_count,
        "total_area": total_area,
        "occupied_area": occupied_area,
        "occupancy_pct": round(occupancy_pct, 1),
    }

    now = datetime.now(timezone.utc)
    return {
        "property": property_dict,
        "units": units,
        "parkings": parkings,
        "contracts": contracts,
        "totals": totals,
        "generated_at": now.strftime("%d.%m.%Y."),
        "generated_at_long": now.strftime("%d.%m.%Y. %H:%M"),
    }


async def render_property_detail_pdf(property_id: str) -> bytes:
    context = await _build_context(property_id)
    template = _jinja_env.get_template("property-detail-template.html")
    html = template.render(**context)
    return html_to_pdf(html)

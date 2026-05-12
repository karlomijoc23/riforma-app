"""Allocation engine for splitting a master utility bill into per-tenant
child bills.

A master bill is the supplier invoice that arrives whole-building (e.g. one
HEP račun for the entire zgrada). The split engine produces N child bills
— one per chosen rentable unit — using the configured allocation method.
Each child carries its own approval / payment lifecycle but links back to
the master via `master_bill_id` for traceability and reporting.

Methods supported (Pydantic enum on the endpoint):
- ``po_m2``           — pro-rata by unit area (m²). Allocations need only
                        list the unit IDs; the engine reads each unit's
                        ``povrsina_m2`` from the DB.
- ``po_jedinici``     — equal share across the listed units.
- ``custom_percent``  — caller supplies a percentage per unit (must sum 100).
- ``manual_amount``   — caller supplies an explicit € amount per unit
                        (must sum to the master amount within €0.01 tol).

The engine never decides for the caller — it computes a preview, returns
the breakdown, and only writes to the DB on the explicit `apply_split` call.
"""
from __future__ import annotations

import logging
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_, select

from app.db.repositories.instance import (
    property_units,
    racuni,
    ugovori,
    zakupnici as zakupnici_repo,
)
from app.models.tables import RacuniRow, UgovoriRow, ugovor_units

logger = logging.getLogger(__name__)


# Tolerance for rounding when comparing the sum of split amounts to the
# master amount. €0.01 covers cent-rounding artefacts from percentages.
ROUNDING_TOLERANCE_EUR = 0.01


class BillSplitMethod(str, Enum):
    PO_M2 = "po_m2"
    PO_JEDINICI = "po_jedinici"
    CUSTOM_PERCENT = "custom_percent"
    MANUAL_AMOUNT = "manual_amount"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _load_units(unit_ids: List[str]) -> List[Any]:
    units: List[Any] = []
    for uid in unit_ids:
        u = await property_units.get_by_id(uid)
        if not u:
            raise HTTPException(
                status_code=400,
                detail=f"Jedinica '{uid}' ne postoji.",
            )
        units.append(u)
    return units


async def _find_active_contract_for_unit(unit_id: str) -> Optional[Any]:
    """Return the currently active (or expiring) approved contract that
    covers this unit — checking both the legacy primary FK and the new
    junction. Returns None if no contract holds the unit."""
    junction_subq = (
        select(ugovor_units.c.ugovor_id)
        .where(ugovor_units.c.property_unit_id == unit_id)
        .scalar_subquery()
    )
    return await ugovori.find_one(
        extra_conditions=[
            or_(
                UgovoriRow.property_unit_id == unit_id,
                UgovoriRow.id.in_(junction_subq),
            ),
            UgovoriRow.status.in_(["aktivno", "na_isteku"]),
            or_(
                UgovoriRow.approval_status == "approved",
                UgovoriRow.approval_status.is_(None),
            ),
        ],
    )


def _round_currency(value: float) -> float:
    return round(value, 2)


# ---------------------------------------------------------------------------
# Method-specific computation
# ---------------------------------------------------------------------------


def _split_po_jedinici(master_amount: float, units: List[Any]) -> List[float]:
    if not units:
        return []
    base = _round_currency(master_amount / len(units))
    amounts = [base] * len(units)
    # Push any rounding remainder onto the last child so the sum matches.
    drift = _round_currency(master_amount - sum(amounts))
    if drift:
        amounts[-1] = _round_currency(amounts[-1] + drift)
    return amounts


def _split_po_m2(master_amount: float, units: List[Any]) -> List[float]:
    total_area = sum((u.povrsina_m2 or 0) for u in units)
    if total_area <= 0:
        raise HTTPException(
            status_code=422,
            detail=(
                "Podjela po m² nije moguća — odabrane jedinice nemaju "
                "definiranu površinu."
            ),
        )
    amounts = [
        _round_currency(master_amount * (u.povrsina_m2 or 0) / total_area)
        for u in units
    ]
    drift = _round_currency(master_amount - sum(amounts))
    if drift and amounts:
        amounts[-1] = _round_currency(amounts[-1] + drift)
    return amounts


def _split_custom_percent(
    master_amount: float, percentages: List[float]
) -> List[float]:
    total_pct = sum(percentages)
    if abs(total_pct - 100.0) > 0.01:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Postoci moraju zbrojiti 100% (trenutno: {total_pct:.2f}%)."
            ),
        )
    amounts = [
        _round_currency(master_amount * pct / 100.0) for pct in percentages
    ]
    drift = _round_currency(master_amount - sum(amounts))
    if drift and amounts:
        amounts[-1] = _round_currency(amounts[-1] + drift)
    return amounts


def _split_manual_amount(
    master_amount: float, amounts_in: List[float]
) -> List[float]:
    amounts = [_round_currency(a) for a in amounts_in]
    diff = abs(sum(amounts) - master_amount)
    if diff > ROUNDING_TOLERANCE_EUR:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Zbroj iznosa ({sum(amounts):.2f}\u00a0€) ne odgovara"
                f" iznosu master računa ({master_amount:.2f}\u00a0€)."
            ),
        )
    return amounts


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def compute_split(
    master_bill: Any,
    method: BillSplitMethod,
    unit_ids: List[str],
    values: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """Compute the per-unit breakdown without touching the database.

    Returns a list of dicts:
        {unit_id, unit_label, amount, contract_id, zakupnik_id, zakupnik_label}

    Raises HTTPException(422) on invalid input.
    """
    if not unit_ids:
        raise HTTPException(
            status_code=422,
            detail="Odaberite barem jednu jedinicu za podjelu.",
        )

    if method in (BillSplitMethod.CUSTOM_PERCENT, BillSplitMethod.MANUAL_AMOUNT):
        if not values or len(values) != len(unit_ids):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Za odabrani način podjele potrebno je dostaviti vrijednost"
                    " za svaku jedinicu."
                ),
            )

    units = await _load_units(unit_ids)
    master_amount = float(master_bill.iznos or 0)

    if method == BillSplitMethod.PO_JEDINICI:
        amounts = _split_po_jedinici(master_amount, units)
    elif method == BillSplitMethod.PO_M2:
        amounts = _split_po_m2(master_amount, units)
    elif method == BillSplitMethod.CUSTOM_PERCENT:
        amounts = _split_custom_percent(master_amount, values or [])
    elif method == BillSplitMethod.MANUAL_AMOUNT:
        amounts = _split_manual_amount(master_amount, values or [])
    else:
        raise HTTPException(
            status_code=422, detail=f"Nepoznat način podjele: {method}"
        )

    breakdown: List[Dict[str, Any]] = []
    for unit, amount in zip(units, amounts):
        contract = await _find_active_contract_for_unit(unit.id)
        zakupnik = None
        if contract and contract.zakupnik_id:
            zakupnik = await zakupnici_repo.get_by_id(contract.zakupnik_id)

        breakdown.append(
            {
                "unit_id": unit.id,
                "unit_label": unit.oznaka or unit.naziv or "—",
                "unit_area_m2": unit.povrsina_m2 or 0,
                "amount": amount,
                "contract_id": contract.id if contract else None,
                "contract_oznaka": contract.interna_oznaka if contract else None,
                "zakupnik_id": zakupnik.id if zakupnik else None,
                "zakupnik_label": (
                    (zakupnik.naziv_firme or zakupnik.ime_prezime or "—")
                    if zakupnik
                    else None
                ),
            }
        )
    return breakdown


async def apply_split(
    master_bill: Any,
    method: BillSplitMethod,
    unit_ids: List[str],
    values: Optional[List[float]],
    user_id: str,
) -> List[Any]:
    """Materialise the split — create one child RacuniRow per unit and
    flag the master. Idempotency is the caller's job; calling apply_split
    twice without removing the previous children produces two sets.
    """
    if master_bill.master_bill_id:
        raise HTTPException(
            status_code=422,
            detail="Ne možete podijeliti račun koji je već dio podjele.",
        )
    if master_bill.is_master_bill:
        # Existing children — refuse so the caller can decide whether to
        # remove the previous split first.
        existing = await racuni.find_all(
            extra_conditions=[RacuniRow.master_bill_id == master_bill.id]
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Račun je već podijeljen. Prvo poništite postojeću podjelu."
                ),
            )

    breakdown = await compute_split(master_bill, method, unit_ids, values)

    children: List[Any] = []
    for entry in breakdown:
        child_data = {
            "tip_utroska": master_bill.tip_utroska,
            "dobavljac": master_bill.dobavljac or "",
            "broj_racuna": (
                f"{master_bill.broj_racuna}-{entry['unit_label']}"
                if master_bill.broj_racuna
                else ""
            ),
            "datum_racuna": master_bill.datum_racuna,
            "datum_dospijeca": master_bill.datum_dospijeca,
            "iznos": entry["amount"],
            "valuta": getattr(master_bill, "valuta", "EUR") or "EUR",
            "period_od": master_bill.period_od,
            "period_do": master_bill.period_do,
            "nekretnina_id": master_bill.nekretnina_id,
            "property_unit_id": entry["unit_id"],
            "ugovor_id": entry["contract_id"],
            "zakupnik_id": entry["zakupnik_id"],
            "napomena": (
                f"Dio master računa {master_bill.broj_racuna or master_bill.id}"
                f" — podjela ({method.value})."
            ),
            "status_placanja": "ceka_placanje",
            "approval_status": "approved",  # children inherit master's approval
            "is_master_bill": False,
            "master_bill_id": master_bill.id,
            "created_by": user_id,
        }
        child = await racuni.create(child_data)
        children.append(child)

    # Flag the master so it shows up in UI as "podijeljen" and the engine
    # refuses to split it twice.
    await racuni.update_by_id(master_bill.id, {"is_master_bill": True})

    logger.info(
        "Bill %s split into %d children via method=%s by user=%s",
        master_bill.id,
        len(children),
        method.value,
        user_id,
    )
    return children


async def remove_split(master_bill: Any) -> int:
    """Delete every child of this master and clear the master flag.

    Refuses if any child has recorded payments — that money tracking would
    be lost. The caller must record the refunds first.
    """
    if not master_bill.is_master_bill:
        return 0
    children = await racuni.find_all(
        extra_conditions=[RacuniRow.master_bill_id == master_bill.id]
    )
    paid = [c for c in children if (c.total_paid or 0) > 0]
    if paid:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ne mogu poništiti podjelu — {len(paid)} podračun(a) već"
                " ima zabilježene uplate."
            ),
        )
    for c in children:
        await racuni.delete_by_id(c.id)
    await racuni.update_by_id(master_bill.id, {"is_master_bill": False})
    return len(children)


async def list_children(master_bill_id: str) -> List[Any]:
    return await racuni.find_all(
        extra_conditions=[RacuniRow.master_bill_id == master_bill_id]
    )

import asyncio
import time
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from app.api import deps
from app.db.repositories.instance import (
    nekretnine,
    zakupnici,
    ugovori,
    property_units,
    maintenance_tasks,
    racuni,
)
from app.db.tenant import CURRENT_TENANT_ID
from fastapi import APIRouter, Depends

router = APIRouter()

# Simple in-memory cache: (tenant_id) -> (timestamp, data)
_dashboard_cache: Dict[str, Tuple[float, dict]] = {}
_CACHE_TTL_SECONDS = 30  # refresh every 30s
_dashboard_lock = asyncio.Lock()


@router.get("", dependencies=[Depends(deps.require_scopes("reports:read"))])
async def get_dashboard_stats(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Check TTL cache to avoid full-table scans on every page load
    tenant_id = CURRENT_TENANT_ID.get() or "__global__"
    cached = _dashboard_cache.get(tenant_id)
    if cached and (time.monotonic() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    async with _dashboard_lock:
        # Double-check after acquiring lock
        cached = _dashboard_cache.get(tenant_id)
        if cached and (time.monotonic() - cached[0]) < _CACHE_TTL_SECONDS:
            return cached[1]

        # -- Load all data in parallel (SQL aggregations) -------------------
        (
            total_properties,
            total_zakupnici,
            status_breakdown_raw,
            income_result,
            portfolio_value,
            expiring_soon,
            active_unit_id_set,
            all_properties_rows,
        ) = await asyncio.gather(
            nekretnine.count(),
            zakupnici.count(),
            ugovori.status_breakdown(),
            ugovori.active_monthly_income(),
            nekretnine.portfolio_value(),
            ugovori.expiring_soon(days=90),
            ugovori.active_unit_ids(),
            nekretnine.find_all(),
        )
        property_map = {p.id: p for p in all_properties_rows}

        # -- Contract status breakdown (from SQL) --------------------------
        status_breakdown: Dict[str, int] = defaultdict(int, status_breakdown_raw)
        active_contracts = status_breakdown.get("aktivno", 0)
        expiring_contracts = status_breakdown.get("na_isteku", 0)

        # -- Monthly income (from SQL) -------------------------------------
        monthly_income, revenue_by_prop = income_result

        # -- Revenue by property -------------------------------------------
        revenue_by_property = []
        for prop_id, prihod in revenue_by_prop.items():
            prop = property_map.get(prop_id)
            naziv = prop.naziv if prop else "Nepoznato"
            revenue_by_property.append({"id": prop_id, "naziv": naziv, "prihod": prihod})
        revenue_by_property.sort(key=lambda x: x["prihod"], reverse=True)

        # -- ROI -----------------------------------------------------------
        annual_yield = monthly_income * 12
        roi_percentage = 0.0
        if portfolio_value > 0:
            roi_percentage = (annual_yield / portfolio_value) * 100

        # -- Occupancy (najamni_kapacitet) — via repository ----------------
        total_units, occupied_units, by_property_raw = (
            await property_units.occupancy_stats(active_unit_id_set)
        )
        occupancy_rate = (
            round((occupied_units / total_units * 100), 1) if total_units > 0 else 0.0
        )

        # Enrich by_property with property names
        by_property = []
        for item in by_property_raw:
            prop = property_map.get(item["id"])
            item["naziv"] = prop.naziv if prop else "Nepoznato"
            by_property.append(item)

        najamni_kapacitet = {
            "total_units": total_units,
            "occupied_units": occupied_units,
            "occupancy_rate": occupancy_rate,
            "by_property": by_property,
        }

        # -- Maintenance ---------------------------------------------------
        (
            maintenance_new,
            maintenance_waiting,
            maintenance_in_progress,
            maintenance_done,
            pending_contract_approvals,
            pending_bill_approvals,
        ) = await asyncio.gather(
            maintenance_tasks.count(filters={"status": "novi"}),
            maintenance_tasks.count(filters={"status": "ceka_dobavljaca"}),
            maintenance_tasks.count(filters={"status": "u_tijeku"}),
            maintenance_tasks.count(filters={"status": "zavrseno"}),
            ugovori.count(filters={"approval_status": "pending_approval"}),
            racuni.count(filters={"approval_status": "pending_approval"}),
        )

        result = {
            "ukupno_nekretnina": total_properties,
            "ukupno_zakupnika": total_zakupnici,
            "aktivni_ugovori": active_contracts,
            "ugovori_na_isteku": expiring_contracts,
            "mjesecni_prihod": monthly_income,
            "ukupna_vrijednost_portfelja": portfolio_value,
            "godisnji_prinos": annual_yield,
            "prinos_postotak": round(roi_percentage, 2),
            "status_breakdown": dict(status_breakdown),
            "revenue_by_property": revenue_by_property,
            "najamni_kapacitet": najamni_kapacitet,
            "expiring_soon": expiring_soon,
            "odrzavanje_novo": maintenance_new,
            "odrzavanje_ceka_dobavljaca": maintenance_waiting,
            "odrzavanje_u_tijeku": maintenance_in_progress,
            "odrzavanje_zavrseno": maintenance_done,
            "pending_contract_approvals": pending_contract_approvals,
            "pending_bill_approvals": pending_bill_approvals,
        }

        _dashboard_cache[tenant_id] = (time.monotonic(), result)
        return result

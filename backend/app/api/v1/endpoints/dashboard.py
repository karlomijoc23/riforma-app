import asyncio
import time
from collections import defaultdict
from datetime import date, datetime
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

        # -- Load all data in parallel -------------------------------------
        (
            total_properties,
            total_zakupnici,
            status_breakdown_raw,
            income_result,
            all_contracts_rows,
            all_properties_rows,
            all_units_rows,
        ) = await asyncio.gather(
            nekretnine.count(),
            zakupnici.count(),
            ugovori.status_breakdown(),
            ugovori.active_monthly_income(),
            ugovori.find_all(),
            nekretnine.find_all(),
            property_units.find_all(),
        )
        property_map = {p.id: p for p in all_properties_rows}

        # -- Contract status breakdown (from SQL) --------------------------
        status_breakdown: Dict[str, int] = defaultdict(int, status_breakdown_raw)
        active_contracts = status_breakdown.get("aktivno", 0)
        expiring_contracts = status_breakdown.get("na_isteku", 0)

        # Build active contracts list for occupancy/expiring-soon (still needed)
        active_contracts_list: List[Any] = [
            c for c in all_contracts_rows if (c.status or "") == "aktivno"
        ]

        # -- Monthly income (from SQL) -------------------------------------
        monthly_income, revenue_by_prop = income_result

        # -- Revenue by property -------------------------------------------
        revenue_by_property = []
        for prop_id, prihod in revenue_by_prop.items():
            prop = property_map.get(prop_id)
            naziv = prop.naziv if prop else "Nepoznato"
            revenue_by_property.append({"id": prop_id, "naziv": naziv, "prihod": prihod})
        revenue_by_property.sort(key=lambda x: x["prihod"], reverse=True)

        # -- Portfolio value -----------------------------------------------
        portfolio_value = 0.0
        for p in all_properties_rows:
            try:
                portfolio_value += float(p.trzisna_vrijednost or 0)
            except (ValueError, TypeError):
                pass

        annual_yield = monthly_income * 12
        roi_percentage = 0.0
        if portfolio_value > 0:
            roi_percentage = (annual_yield / portfolio_value) * 100

        # -- Occupancy (najamni_kapacitet) ---------------------------------
        units_by_property: Dict[str, List[Any]] = defaultdict(list)
        for u in all_units_rows:
            pid = u.nekretnina_id
            if pid:
                units_by_property[pid].append(u)

        active_unit_ids: set = set()
        for c in active_contracts_list:
            uid = c.property_unit_id
            if uid:
                active_unit_ids.add(uid)

        active_property_ids: set = set()
        for c in active_contracts_list:
            pid = c.nekretnina_id
            if pid:
                active_property_ids.add(pid)

        total_units = len(all_units_rows)
        occupied_units = sum(
            1
            for u in all_units_rows
            if (u.status or "") in ("zauzeto", "occupied", "iznajmljeno")
            or u.id in active_unit_ids
        )
        occupancy_rate = (
            round((occupied_units / total_units * 100), 1) if total_units > 0 else 0.0
        )

        by_property = []
        for prop_id, units_list in units_by_property.items():
            prop = property_map.get(prop_id)
            naziv = prop.naziv if prop else "Nepoznato"
            t = len(units_list)
            o = sum(
                1
                for u in units_list
                if (u.status or "") in ("zauzeto", "occupied", "iznajmljeno")
                or u.id in active_unit_ids
            )
            rate = round((o / t * 100), 1) if t > 0 else 0.0
            by_property.append(
                {
                    "id": prop_id,
                    "naziv": naziv,
                    "total_units": t,
                    "occupied_units": o,
                    "occupancy_rate": rate,
                }
            )
        by_property.sort(key=lambda x: x["total_units"], reverse=True)

        najamni_kapacitet = {
            "total_units": total_units,
            "occupied_units": occupied_units,
            "occupancy_rate": occupancy_rate,
            "by_property": by_property,
        }

        # -- Expiring soon (contracts expiring in next 90 days) ------------
        today = date.today()
        expiring_soon = []
        for c in all_contracts_rows:
            if (c.status or "") not in ("aktivno", "na_isteku"):
                continue
            datum_zavrsetka = c.datum_zavrsetka
            if not datum_zavrsetka:
                continue
            try:
                if isinstance(datum_zavrsetka, datetime):
                    end_date = datum_zavrsetka.date()
                elif isinstance(datum_zavrsetka, date):
                    end_date = datum_zavrsetka
                else:
                    continue
            except (ValueError, TypeError):
                continue

            days_left = (end_date - today).days
            if 0 <= days_left <= 90:
                expiring_soon.append(
                    {
                        "id": c.id,
                        "interna_oznaka": c.interna_oznaka or "\u2014",
                        "zakupnik_id": c.zakupnik_id,
                        "nekretnina_id": c.nekretnina_id,
                        "datum_zavrsetka": str(end_date),
                        "osnovna_zakupnina": c.osnovna_zakupnina or 0,
                        "days_left": days_left,
                        "status": c.status,
                    }
                )
        expiring_soon.sort(key=lambda x: x["days_left"])

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

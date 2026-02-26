import time
from collections import defaultdict
from typing import Any, Dict, List, Tuple

from app.api import deps
from app.db.repositories.instance import nekretnine, property_units, ugovori
from app.db.tenant import CURRENT_TENANT_ID
from fastapi import APIRouter, Depends

router = APIRouter()

# Simple in-memory cache: (tenant_id) -> (timestamp, data)
_pricing_cache: Dict[str, Tuple[float, dict]] = {}
_CACHE_TTL_SECONDS = 60  # refresh every 60s

OUTLIER_THRESHOLD = 20.0  # percentage deviation to flag as outlier


def _safe_float(val, default=0.0) -> float:
    try:
        return float(val or default)
    except (ValueError, TypeError):
        return default


def _compute_cijena_m2(contract: Any, unit_map: Dict) -> float:
    """Compute price per m2 for a contract, matching the contracts.py logic."""
    zakupnina_po_m2 = _safe_float(contract.zakupnina_po_m2)
    if zakupnina_po_m2 > 0:
        return zakupnina_po_m2

    osnovna = _safe_float(contract.osnovna_zakupnina)
    unit_id = contract.property_unit_id
    if unit_id and unit_id in unit_map:
        povrsina = _safe_float(unit_map[unit_id].povrsina_m2)
        if povrsina > 0:
            return round(osnovna / povrsina, 2)
    return 0.0


@router.get("/analytics", dependencies=[Depends(deps.require_scopes("reports:read"))])
async def get_pricing_analytics(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    # Check TTL cache
    tenant_id = CURRENT_TENANT_ID.get() or "__global__"
    cached = _pricing_cache.get(tenant_id)
    if cached and (time.monotonic() - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    # ── Load all data ──────────────────────────────────────────────────
    all_contracts = await ugovori.find_all()
    all_units = await property_units.find_all()
    all_properties = await nekretnine.find_all()

    property_map = {p.id: p for p in all_properties}
    unit_map = {u.id: u for u in all_units}

    # Active contracts only
    active_contracts = [c for c in all_contracts if c.status == "aktivno"]

    # ── Index: units by property, contracts by property ────────────────
    units_by_property: Dict[str, List] = defaultdict(list)
    for u in all_units:
        pid = u.nekretnina_id
        if pid:
            units_by_property[pid].append(u)

    contracts_by_property: Dict[str, List] = defaultdict(list)
    for c in active_contracts:
        pid = c.nekretnina_id
        if pid:
            contracts_by_property[pid].append(c)

    # Set of unit IDs that have an active contract
    occupied_unit_ids: set = set()
    for c in active_contracts:
        uid = c.property_unit_id
        if uid:
            occupied_unit_ids.add(uid)

    # Also mark units with occupied-like status
    for u in all_units:
        if u.status in ("zauzeto", "occupied", "iznajmljeno"):
            occupied_unit_ids.add(u.id)

    # ── Compute cijena_m2 for each active contract ─────────────────────
    cijena_m2_map: Dict[Any, float] = {}
    for c in active_contracts:
        cijena_m2_map[id(c)] = _compute_cijena_m2(c, unit_map)

    # ── Benchmarks: per-property, grouped by floor ─────────────────────
    benchmarks = []
    for prop in all_properties:
        pid = prop.id
        prop_contracts = contracts_by_property.get(pid, [])
        if not prop_contracts:
            continue

        # Group contracts by floor (kat) of their unit
        groups_dict: Dict[str, List] = defaultdict(list)
        for c in prop_contracts:
            unit_id = c.property_unit_id
            unit = unit_map.get(unit_id) if unit_id else None
            kat = unit.kat if unit else None
            key = f"kat_{kat}" if kat is not None else "ostalo"
            groups_dict[key].append(c)

        groups = []
        all_prices = []
        for key, contracts in sorted(groups_dict.items()):
            prices = [cijena_m2_map[id(c)] for c in contracts if cijena_m2_map[id(c)] > 0]
            if not prices:
                continue
            all_prices.extend(prices)
            avg = round(sum(prices) / len(prices), 2)
            label = (
                f"Kat {key.replace('kat_', '')}" if key.startswith("kat_") else "Ostalo"
            )
            groups.append(
                {
                    "key": key,
                    "label": label,
                    "avg_cijena_m2": avg,
                    "min_cijena_m2": round(min(prices), 2),
                    "max_cijena_m2": round(max(prices), 2),
                    "count": len(prices),
                    "contracts": [
                        {
                            "id": c.id,
                            "interna_oznaka": c.interna_oznaka or "—",
                            "cijena_m2": cijena_m2_map[id(c)],
                            "povrsina_m2": _safe_float(
                                unit_map[c.property_unit_id].povrsina_m2
                                if c.property_unit_id
                                and c.property_unit_id in unit_map
                                else 0
                            ),
                            "zakupnik_naziv": c.zakupnik_naziv or "—",
                        }
                        for c in contracts
                        if cijena_m2_map[id(c)] > 0
                    ],
                }
            )

        property_avg = (
            round(sum(all_prices) / len(all_prices), 2) if all_prices else 0.0
        )
        benchmarks.append(
            {
                "nekretnina_id": pid,
                "nekretnina_naziv": prop.naziv or "Nepoznato",
                "vrsta": prop.vrsta or "",
                "groups": groups,
                "property_avg_m2": property_avg,
            }
        )

    # ── Heat map: per-property, per-unit deviation ─────────────────────
    # Build group averages: property + floor -> avg cijena_m2
    group_avgs: Dict[str, float] = {}  # key: "{pid}_{kat}"
    for prop in all_properties:
        pid = prop.id
        prop_contracts = contracts_by_property.get(pid, [])
        floor_prices: Dict[str, List[float]] = defaultdict(list)
        for c in prop_contracts:
            if cijena_m2_map[id(c)] <= 0:
                continue
            unit_id = c.property_unit_id
            unit = unit_map.get(unit_id) if unit_id else None
            kat = unit.kat if unit else None
            floor_key = str(kat) if kat is not None else "ostalo"
            floor_prices[floor_key].append(cijena_m2_map[id(c)])
        for floor_key, prices in floor_prices.items():
            if prices:
                group_avgs[f"{pid}_{floor_key}"] = round(sum(prices) / len(prices), 2)

    heat_map = []
    for prop in all_properties:
        pid = prop.id
        prop_contracts = contracts_by_property.get(pid, [])
        if not prop_contracts:
            continue

        units_data = []
        for c in prop_contracts:
            c_price = cijena_m2_map[id(c)]
            if c_price <= 0:
                continue
            unit_id = c.property_unit_id
            unit = unit_map.get(unit_id) if unit_id else None
            kat = unit.kat if unit else None
            floor_key = str(kat) if kat is not None else "ostalo"
            avg_key = f"{pid}_{floor_key}"
            group_avg = group_avgs.get(avg_key, 0)

            deviation_pct = 0.0
            if group_avg > 0:
                deviation_pct = round(
                    (c_price - group_avg) / group_avg * 100, 1
                )

            if deviation_pct > OUTLIER_THRESHOLD:
                hm_status = "high"
            elif deviation_pct < -OUTLIER_THRESHOLD:
                hm_status = "low"
            else:
                hm_status = "ok"

            units_data.append(
                {
                    "unit_id": unit_id or "",
                    "oznaka": (unit.oznaka or "—") if unit else "—",
                    "kat": kat,
                    "cijena_m2": c_price,
                    "group_avg": group_avg,
                    "deviation_pct": deviation_pct,
                    "status": hm_status,
                    "contract_id": c.id,
                    "zakupnik_naziv": c.zakupnik_naziv or "—",
                }
            )

        if units_data:
            heat_map.append(
                {
                    "nekretnina_id": pid,
                    "nekretnina_naziv": prop.naziv or "Nepoznato",
                    "units": units_data,
                }
            )

    # ── Free units with suggested price ────────────────────────────────
    # Portfolio-wide averages by property type for fallback
    type_prices: Dict[str, List[float]] = defaultdict(list)
    for c in active_contracts:
        c_price = cijena_m2_map[id(c)]
        if c_price <= 0:
            continue
        pid = c.nekretnina_id
        prop = property_map.get(pid)
        vrsta = (prop.vrsta or "ostalo") if prop else "ostalo"
        type_prices[vrsta].append(c_price)

    type_avgs: Dict[str, float] = {}
    for vrsta, prices in type_prices.items():
        if prices:
            type_avgs[vrsta] = round(sum(prices) / len(prices), 2)

    all_active_prices = [
        cijena_m2_map[id(c)] for c in active_contracts if cijena_m2_map[id(c)] > 0
    ]
    portfolio_avg = (
        round(sum(all_active_prices) / len(all_active_prices), 2)
        if all_active_prices
        else 0.0
    )

    free_units = []
    for u in all_units:
        if u.id in occupied_unit_ids:
            continue

        pid = u.nekretnina_id
        if not pid:
            continue

        prop = property_map.get(pid)
        prop_name = (prop.naziv or "Nepoznato") if prop else "Nepoznato"
        vrsta = (prop.vrsta or "ostalo") if prop else "ostalo"
        kat = u.kat
        povrsina = _safe_float(u.povrsina_m2)

        # Find peers: same property, same floor
        floor_key = str(kat) if kat is not None else "ostalo"
        peers = [
            c
            for c in contracts_by_property.get(pid, [])
            if cijena_m2_map[id(c)] > 0
            and (
                (
                    unit_map[c.property_unit_id].kat == kat
                    if kat is not None
                    and c.property_unit_id
                    and c.property_unit_id in unit_map
                    else True
                )
            )
        ]

        if len(peers) >= 2:
            peer_prices = [cijena_m2_map[id(c)] for c in peers]
            suggested = round(sum(peer_prices) / len(peer_prices), 2)
            basis = f"Prosjek {len(peers)} ugovora na katu {kat}"
        else:
            # Expand to entire property
            prop_peers = [
                c for c in contracts_by_property.get(pid, []) if cijena_m2_map[id(c)] > 0
            ]
            if len(prop_peers) >= 2:
                peer_prices = [cijena_m2_map[id(c)] for c in prop_peers]
                suggested = round(sum(peer_prices) / len(peer_prices), 2)
                basis = f"Prosjek {len(prop_peers)} ugovora u nekretnini"
            elif vrsta in type_avgs:
                suggested = type_avgs[vrsta]
                basis = f"Prosjek portfelja za vrstu '{vrsta}'"
            else:
                suggested = portfolio_avg
                basis = "Prosjek cijelog portfelja"

        suggested_total = round(suggested * povrsina, 2) if povrsina > 0 else 0.0

        free_units.append(
            {
                "unit_id": u.id,
                "oznaka": u.oznaka or "—",
                "nekretnina_naziv": prop_name,
                "kat": kat,
                "povrsina_m2": povrsina,
                "suggested_price_m2": suggested,
                "suggested_total": suggested_total,
                "basis": basis,
            }
        )

    free_units.sort(key=lambda x: (x["nekretnina_naziv"], x.get("kat") or 0))

    # ── Portfolio summary ──────────────────────────────────────────────
    total_units = len(all_units)
    occupied_count = len(occupied_unit_ids)
    free_count = total_units - occupied_count

    total_monthly = sum(
        _safe_float(c.osnovna_zakupnina) for c in active_contracts
    )
    potential_monthly = sum(fu["suggested_total"] for fu in free_units)
    outlier_count = sum(
        1 for hm in heat_map for u in hm["units"] if u["status"] in ("high", "low")
    )

    portfolio_summary = {
        "total_units": total_units,
        "occupied_units": occupied_count,
        "free_units": free_count,
        "avg_cijena_m2": portfolio_avg,
        "total_monthly_income": round(total_monthly, 2),
        "potential_monthly_income": round(potential_monthly, 2),
        "outlier_count": outlier_count,
    }

    result = {
        "benchmarks": benchmarks,
        "heat_map": heat_map,
        "free_units": free_units,
        "portfolio_summary": portfolio_summary,
    }

    _pricing_cache[tenant_id] = (time.monotonic(), result)
    return result

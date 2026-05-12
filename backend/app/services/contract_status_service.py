import logging
from datetime import timedelta
from typing import Optional

from sqlalchemy import or_, select

from app.core.time import local_today
from app.db.repositories.instance import parking_spaces, property_units, ugovori
from app.db.session import get_async_session_factory
from app.models.domain import ParkingStatus, PropertyUnitStatus, StatusUgovora
from app.models.tables import UgovoriRow, ugovor_parkings, ugovor_units

logger = logging.getLogger(__name__)

# Contracts within this many days of expiry are auto-marked as NA_ISTEKU
EXPIRY_WARNING_DAYS = 30


async def sync_contract_and_unit_statuses():
    """Synchronize contract statuses based on dates + free linked resources.

    Steps:
      1. Mark active contracts within the warning window as NA_ISTEKU.
      2. Find AKTIVNO/NA_ISTEKU contracts whose end date has passed → ISTEKAO.
         Free every linked unit AND parking (legacy primary FK + junction)
         unless another active contract still holds them.
      3. Self-heal orphaned IZNAJMLJENO units / parkings (status drift).
    """
    logger.info("Starting contract status synchronization...")

    today = local_today()
    today_str = today.isoformat()
    warning_date_str = (today + timedelta(days=EXPIRY_WARNING_DAYS)).isoformat()

    # ── Step 1: Mark expiring contracts as NA_ISTEKU ──
    await mark_expiring_contracts(today_str, warning_date_str)

    # ── Step 2: Expire overdue contracts ──
    expired_contracts = await ugovori.find_all(
        extra_conditions=[
            UgovoriRow.status.in_(
                [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
            ),
            UgovoriRow.datum_zavrsetka < today_str,
            or_(
                UgovoriRow.approval_status == "approved",
                UgovoriRow.approval_status.is_(None),
            ),
        ]
    )

    logger.info(f"Found {len(expired_contracts)} expired contracts to update.")

    for contract in expired_contracts:
        contract_id = contract.id
        logger.info(
            f"Expiring contract {contract_id} (Ended: {contract.datum_zavrsetka})"
        )
        await ugovori.update_by_id(
            contract_id, {"status": StatusUgovora.ISTEKAO.value}
        )
        # Release every linked unit + parking through junction (M:N) AND
        # legacy primary FK so multi-resource contracts are fully cleaned.
        await _release_contract_units(contract_id, contract.property_unit_id)
        await _release_contract_parkings(contract_id)

    logger.info("Contract status synchronization completed.")

    # ── Step 3: Self-healing for orphaned units + parkings ──
    await fix_orphaned_rented_units()
    await fix_orphaned_rented_parkings()


async def _release_contract_units(
    contract_id: str, legacy_primary_unit_id: Optional[str]
) -> None:
    """Mark every unit on this contract DOSTUPNO unless another active
    contract still claims it. Reads BOTH the legacy primary FK and the
    `ugovor_units` junction so multi-unit contracts are fully released."""
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            select(ugovor_units.c.property_unit_id).where(
                ugovor_units.c.ugovor_id == contract_id
            )
        )
        unit_ids = {row[0] for row in result.all()}
    if legacy_primary_unit_id:
        unit_ids.add(legacy_primary_unit_id)

    for uid in unit_ids:
        # An "active" hold can come from EITHER the legacy primary FK or
        # from the junction table on a different contract.
        junction_subq = (
            select(ugovor_units.c.ugovor_id)
            .where(ugovor_units.c.property_unit_id == uid)
            .scalar_subquery()
        )
        other_active = await ugovori.find_one(
            extra_conditions=[
                or_(
                    UgovoriRow.property_unit_id == uid,
                    UgovoriRow.id.in_(junction_subq),
                ),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                UgovoriRow.id != contract_id,
            ]
        )
        if not other_active:
            logger.info(f"Releasing unit {uid} to AVAILABLE.")
            await property_units.update_by_id(
                uid, {"status": PropertyUnitStatus.DOSTUPNO.value}
            )


async def _release_contract_parkings(contract_id: str) -> None:
    """Mark every parking on this contract DOSTUPNO unless another active
    contract still claims it (parking has no legacy primary FK)."""
    session_factory = get_async_session_factory()
    async with session_factory() as session:
        result = await session.execute(
            select(ugovor_parkings.c.parking_id).where(
                ugovor_parkings.c.ugovor_id == contract_id
            )
        )
        parking_ids = [row[0] for row in result.all()]

    for pid in parking_ids:
        junction_subq = (
            select(ugovor_parkings.c.ugovor_id)
            .where(ugovor_parkings.c.parking_id == pid)
            .scalar_subquery()
        )
        other_active = await ugovori.find_one(
            extra_conditions=[
                UgovoriRow.id.in_(junction_subq),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                UgovoriRow.id != contract_id,
            ]
        )
        if not other_active:
            logger.info(f"Releasing parking {pid} to AVAILABLE.")
            await parking_spaces.update_by_id(
                pid, {"status": ParkingStatus.DOSTUPNO.value}
            )


async def mark_expiring_contracts(today_str: str, warning_date_str: str):
    """Find AKTIVNO contracts with end date within the warning window and
    flip them to NA_ISTEKU. Unit/parking status remains IZNAJMLJENO since
    the rental is still active during the notice period."""
    expiring_contracts = await ugovori.find_all(
        extra_conditions=[
            UgovoriRow.status == StatusUgovora.AKTIVNO.value,
            UgovoriRow.datum_zavrsetka >= today_str,
            UgovoriRow.datum_zavrsetka <= warning_date_str,
            or_(
                UgovoriRow.approval_status == "approved",
                UgovoriRow.approval_status.is_(None),
            ),
        ]
    )

    if expiring_contracts:
        logger.info(
            f"Marking {len(expiring_contracts)} contracts as NA_ISTEKU "
            f"(expiring within {EXPIRY_WARNING_DAYS} days)."
        )

    for contract in expiring_contracts:
        logger.info(
            f"Contract {contract.id} expires on {contract.datum_zavrsetka} "
            f"→ setting NA_ISTEKU"
        )
        await ugovori.update_by_id(
            contract.id, {"status": StatusUgovora.NA_ISTEKU.value}
        )


async def fix_orphaned_rented_units():
    """Reset any unit marked IZNAJMLJENO that no active contract claims
    (via legacy primary FK OR `ugovor_units` junction) back to DOSTUPNO."""
    logger.info("Starting orphaned unit cleanup...")

    rented_units = await property_units.find_all(
        filters={"status": PropertyUnitStatus.IZNAJMLJENO.value}
    )

    count_fixed = 0
    for unit in rented_units:
        unit_id = unit.id
        junction_subq = (
            select(ugovor_units.c.ugovor_id)
            .where(ugovor_units.c.property_unit_id == unit_id)
            .scalar_subquery()
        )
        active_contract = await ugovori.find_one(
            extra_conditions=[
                or_(
                    UgovoriRow.property_unit_id == unit_id,
                    UgovoriRow.id.in_(junction_subq),
                ),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                or_(
                    UgovoriRow.approval_status == "approved",
                    UgovoriRow.approval_status.is_(None),
                ),
            ]
        )
        if not active_contract:
            logger.warning(
                f"Unit {unit_id} is marked RENTED but has no ACTIVE contract."
                " Fixing to AVAILABLE."
            )
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.DOSTUPNO.value}
            )
            count_fixed += 1

    if count_fixed > 0:
        logger.info(f"Fixed {count_fixed} orphaned rented units.")
    else:
        logger.info("No orphaned rented units found.")


async def fix_orphaned_rented_parkings():
    """Reset any parking marked IZNAJMLJENO that no active contract claims
    via `ugovor_parkings` junction back to DOSTUPNO."""
    logger.info("Starting orphaned parking cleanup...")

    rented = await parking_spaces.find_all(
        filters={"status": ParkingStatus.IZNAJMLJENO.value}
    )

    count_fixed = 0
    for space in rented:
        junction_subq = (
            select(ugovor_parkings.c.ugovor_id)
            .where(ugovor_parkings.c.parking_id == space.id)
            .scalar_subquery()
        )
        active_contract = await ugovori.find_one(
            extra_conditions=[
                UgovoriRow.id.in_(junction_subq),
                UgovoriRow.status.in_(
                    [StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]
                ),
                or_(
                    UgovoriRow.approval_status == "approved",
                    UgovoriRow.approval_status.is_(None),
                ),
            ]
        )
        if not active_contract:
            logger.warning(
                f"Parking {space.id} is marked RENTED but has no ACTIVE contract."
                " Fixing to AVAILABLE."
            )
            await parking_spaces.update_by_id(
                space.id, {"status": ParkingStatus.DOSTUPNO.value}
            )
            count_fixed += 1

    if count_fixed > 0:
        logger.info(f"Fixed {count_fixed} orphaned rented parkings.")
    else:
        logger.info("No orphaned rented parkings found.")

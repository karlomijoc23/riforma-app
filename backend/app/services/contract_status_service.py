import logging
from datetime import date, timedelta

from sqlalchemy import or_

from app.db.repositories.instance import property_units, ugovori
from app.models.domain import PropertyUnitStatus, StatusUgovora
from app.models.tables import PropertyUnitRow, UgovoriRow

logger = logging.getLogger(__name__)

# Contracts within this many days of expiry are auto-marked as NA_ISTEKU
EXPIRY_WARNING_DAYS = 30


async def sync_contract_and_unit_statuses():
    """
    Synchronizes contract statuses based on dates and updates property unit statuses.
    1. Marks active contracts nearing expiry (within 30 days) as NA_ISTEKU.
    2. Finds active/na_isteku contracts that have expired (end_date < today) -> Sets to ISTEKAO.
    3. For any contract transition to ISTEKAO, updates linked unit to DOSTUPNO.
    4. (Self-healing) Fixes orphaned units marked as rented without active contracts.
    """
    logger.info("Starting contract status synchronization...")

    today = date.today()
    today_str = today.isoformat()
    warning_date_str = (today + timedelta(days=EXPIRY_WARNING_DAYS)).isoformat()

    # ── Step 1: Mark expiring contracts as NA_ISTEKU ──
    await mark_expiring_contracts(today_str, warning_date_str)

    # ── Step 2: Expire overdue contracts (AKTIVNO or NA_ISTEKU past end date) ──
    expired_contracts = await ugovori.find_all(
        extra_conditions=[
            UgovoriRow.status.in_([StatusUgovora.AKTIVNO.value, StatusUgovora.NA_ISTEKU.value]),
            UgovoriRow.datum_zavrsetka < today_str,
            or_(UgovoriRow.approval_status == "approved", UgovoriRow.approval_status.is_(None)),
        ]
    )

    logger.info(f"Found {len(expired_contracts)} expired contracts to update.")

    for contract in expired_contracts:
        contract_id = contract.id
        unit_id = contract.property_unit_id

        logger.info(
            f"Expiring contract {contract_id} (Ended: {contract.datum_zavrsetka})"
        )

        # Update Contract Status to ISTEKAO
        await ugovori.update_by_id(contract_id, {"status": StatusUgovora.ISTEKAO.value})

        # If there is a linked unit, free it up
        if unit_id:
            # Only free if no OTHER active contract exists for this unit
            other_active = await ugovori.find_one(
                extra_conditions=[
                    UgovoriRow.property_unit_id == unit_id,
                    UgovoriRow.status.in_([
                        StatusUgovora.AKTIVNO.value,
                        StatusUgovora.NA_ISTEKU.value,
                    ]),
                    UgovoriRow.id != contract_id,
                ]
            )
            if not other_active:
                logger.info(f"Releasing unit {unit_id} to AVAILABLE.")
                await property_units.update_by_id(
                    unit_id, {"status": PropertyUnitStatus.DOSTUPNO.value}
                )

    logger.info("Contract status synchronization completed.")

    # ── Step 3: Self-healing for orphaned units ──
    await fix_orphaned_rented_units()


async def mark_expiring_contracts(today_str: str, warning_date_str: str):
    """
    Finds AKTIVNO contracts where end date is between today and today+30 days.
    Marks them as NA_ISTEKU. Does NOT change unit status (contract still active).
    """
    expiring_contracts = await ugovori.find_all(
        extra_conditions=[
            UgovoriRow.status == StatusUgovora.AKTIVNO.value,
            UgovoriRow.datum_zavrsetka >= today_str,
            UgovoriRow.datum_zavrsetka <= warning_date_str,
            or_(UgovoriRow.approval_status == "approved", UgovoriRow.approval_status.is_(None)),
        ]
    )

    if expiring_contracts:
        logger.info(
            f"Marking {len(expiring_contracts)} contracts as NA_ISTEKU "
            f"(expiring within {EXPIRY_WARNING_DAYS} days)."
        )

    for contract in expiring_contracts:
        contract_id = contract.id
        logger.info(
            f"Contract {contract_id} expires on {contract.datum_zavrsetka} "
            f"→ setting NA_ISTEKU"
        )
        await ugovori.update_by_id(contract_id, {"status": StatusUgovora.NA_ISTEKU.value})


async def fix_orphaned_rented_units():
    """
    Finds units marked as RENTED (IZNAJMLJENO) that do NOT have a corresponding
    ACTIVE or NA_ISTEKU contract. Sets them back to AVAILABLE (DOSTUPNO).
    """
    logger.info("Starting orphaned unit cleanup...")

    # Get all units that claim to be RENTED
    rented_units = await property_units.find_all(
        filters={"status": PropertyUnitStatus.IZNAJMLJENO.value}
    )

    count_fixed = 0
    for unit in rented_units:
        unit_id = unit.id
        # Check if there is an ACTIVE or NA_ISTEKU contract for this unit
        active_contract = await ugovori.find_one(
            extra_conditions=[
                UgovoriRow.property_unit_id == unit_id,
                UgovoriRow.status.in_([
                    StatusUgovora.AKTIVNO.value,
                    StatusUgovora.NA_ISTEKU.value,
                ]),
                or_(UgovoriRow.approval_status == "approved", UgovoriRow.approval_status.is_(None)),
            ]
        )

        # If no active contract found, fix the status
        if not active_contract:
            logger.warning(
                f"Unit {unit_id} is marked RENTED but has no ACTIVE contract. "
                "Fixing to AVAILABLE."
            )
            await property_units.update_by_id(
                unit_id, {"status": PropertyUnitStatus.DOSTUPNO.value}
            )
            count_fixed += 1

    if count_fixed > 0:
        logger.info(f"Fixed {count_fixed} orphaned rented units.")
    else:
        logger.info("No orphaned rented units found.")

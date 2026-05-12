import logging
import uuid
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.time import local_today
from app.db.repositories.instance import maintenance_tasks
from app.db.session import get_async_session_factory
from app.models.tables import MaintenanceTaskRow, maintenance_task_units

logger = logging.getLogger(__name__)


# Recurrence patterns
RECURRENCE_INTERVALS = {
    "daily": timedelta(days=1),
    "weekly": timedelta(weeks=1),
    "biweekly": timedelta(weeks=2),
    "monthly": timedelta(days=30),
    "quarterly": timedelta(days=90),
    "semiannual": timedelta(days=182),
    "annual": timedelta(days=365),
}


async def generate_recurring_tasks():
    """
    Check all maintenance tasks with recurrence patterns and create
    next occurrence if the current one is completed or overdue.
    """
    logger.info("Checking recurring maintenance tasks...")

    # Find tasks with ponavljanje (recurrence_pattern) set.
    # In the new schema there is no separate recurrence_active column;
    # a non-NULL ponavljanje value means recurrence is active.
    recurring_tasks = await maintenance_tasks.find_all(
        extra_conditions=[
            MaintenanceTaskRow.ponavljanje.isnot(None),
        ]
    )

    created_count = 0
    today = local_today()
    today_str = today.isoformat()

    for task in recurring_tasks:
        pattern = task.ponavljanje
        if pattern not in RECURRENCE_INTERVALS:
            continue

        # Check if task is completed or past due
        status = task.status or "novi"
        due_date = task.rok  # date object or None

        if status not in ("zavrseno", "arhivirano"):
            # Only generate if past due date
            if due_date and due_date > today:
                continue

        # Check if ANY child already exists for this parent (not just active
        # ones). A completed instance for the upcoming slot must also block a
        # re-create — otherwise two scheduler runs race and produce doubles.
        task_id = task.id
        existing_next = await maintenance_tasks.find_one(
            parent_task_id=task_id,
            extra_conditions=[
                MaintenanceTaskRow.status.in_(
                    ["novi", "u_tijeku", "zavrseno", "arhivirano"]
                ),
            ],
            order_by="rok",
            order_dir="desc",
        )

        if existing_next and existing_next.rok and due_date:
            # If the most recent child's slot is already beyond the parent's
            # current due date, the next cycle is already scheduled — skip.
            if existing_next.rok >= due_date + RECURRENCE_INTERVALS[pattern]:
                continue

        # Calculate next due date
        interval = RECURRENCE_INTERVALS[pattern]
        if due_date:
            base_date = due_date  # already a date object from ORM
            next_due = base_date + interval
            # If next_due is in the past, advance to future
            while next_due < today:
                next_due += interval
        else:
            next_due = today + interval

        # Check ponavljanje_do (recurrence_end_date)
        end_date = task.ponavljanje_do  # date object or None
        if end_date:
            if next_due > end_date:
                # Deactivate recurrence by clearing ponavljanje
                await maintenance_tasks.update_by_id(
                    task_id, {"ponavljanje": None}
                )
                logger.info(
                    "Recurrence ended for task %s (past end date %s)",
                    task_id,
                    end_date.isoformat(),
                )
                continue

        # Create next occurrence
        new_task = {
            "id": str(uuid.uuid4()),
            "naziv": task.naziv or "",
            "opis": task.opis or "",
            "status": "novi",
            "prioritet": task.prioritet or "srednje",
            "nekretnina_id": task.nekretnina_id,
            "property_unit_id": task.property_unit_id,
            "dodijeljeno_user_id": task.dodijeljeno_user_id,
            "rok": next_due,
            "trosak_materijal": task.trosak_materijal,
            "ponavljanje": pattern,
            "ponavljanje_do": end_date,
            "parent_task_id": task_id,
            "aktivnosti": [],
            "created_at": datetime.combine(today, time.min, tzinfo=timezone.utc),
        }

        # Pull the parent's full unit set so multi-unit recurring tasks
        # propagate to every child via the junction (not just primary FK).
        session_factory = get_async_session_factory()
        async with session_factory() as session:
            result = await session.execute(
                select(maintenance_task_units.c.property_unit_id).where(
                    maintenance_task_units.c.maintenance_task_id == task_id
                )
            )
            parent_unit_ids = [row[0] for row in result.all()]
        if task.property_unit_id and task.property_unit_id not in parent_unit_ids:
            parent_unit_ids.insert(0, task.property_unit_id)

        try:
            created = await maintenance_tasks.create(new_task)
            # Mirror the parent's junction on the new child so the unit set
            # stays consistent across recurring instances.
            if parent_unit_ids:
                async with session_factory() as session:
                    async with session.begin():
                        for uid in parent_unit_ids:
                            await session.execute(
                                maintenance_task_units.insert().values(
                                    maintenance_task_id=created.id,
                                    property_unit_id=uid,
                                )
                            )
            created_count += 1
            logger.info(
                "Created recurring task '%s' due %s (pattern: %s)",
                new_task["naziv"],
                next_due.isoformat(),
                pattern,
            )
        except IntegrityError:
            # uq_maintenance_recurrence_slot caught a concurrent insert — a
            # sibling scheduler worker already created this slot. Safe no-op.
            logger.info(
                "Recurring slot already exists for parent %s / %s — skipping",
                task_id,
                next_due.isoformat(),
            )

    if created_count:
        logger.info("Created %d recurring maintenance tasks.", created_count)
    else:
        logger.info("No recurring maintenance tasks needed.")

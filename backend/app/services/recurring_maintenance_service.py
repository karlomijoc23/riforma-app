import logging
import uuid
from datetime import date, timedelta

from app.db.repositories.instance import maintenance_tasks
from app.models.tables import MaintenanceTaskRow

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
    today = date.today()
    today_str = today.isoformat()

    for task in recurring_tasks:
        pattern = task.ponavljanje
        if pattern not in RECURRENCE_INTERVALS:
            continue

        # Check if task is completed or past due
        status = task.status or "open"
        due_date = task.rok  # date object or None

        if status not in ("completed", "closed"):
            # Only generate if past due date
            if due_date and due_date > today:
                continue

        # Check if next occurrence already exists
        task_id = task.id
        existing_next = await maintenance_tasks.find_one(
            parent_task_id=task_id,
            extra_conditions=[
                MaintenanceTaskRow.status.in_(["open", "in_progress"]),
            ],
        )

        if existing_next:
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
            "status": "open",
            "prioritet": task.prioritet or "medium",
            "nekretnina_id": task.nekretnina_id,
            "property_unit_id": task.property_unit_id,
            "dodijeljeno_user_id": task.dodijeljeno_user_id,
            "rok": next_due,
            "trosak_materijal": task.trosak_materijal,
            "ponavljanje": pattern,
            "ponavljanje_do": end_date,
            "parent_task_id": task_id,
            "aktivnosti": [],
            "created_at": today_str,
        }

        await maintenance_tasks.create(new_task)
        created_count += 1

        logger.info(
            "Created recurring task '%s' due %s (pattern: %s)",
            new_task["naziv"],
            next_due.isoformat(),
            pattern,
        )

    if created_count:
        logger.info("Created %d recurring maintenance tasks.", created_count)
    else:
        logger.info("No recurring maintenance tasks needed.")

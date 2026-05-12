# Handoff: MaintenanceTask → multi-unit (M:N)

**Date:** 2026-05-11
**Author:** Karlo (via Claude)
**Status:** Code complete — local backend + frontend hot-reloaded clean. Migration 016 applied locally.

## Why

Multi-unit contracts could only attach a maintenance task to ONE unit (legacy primary FK). A "paint hallway covering A2 + A3" task could only flag A2; A3 had no link. This batch mirrors the proven `ugovor_units` pattern for tasks.

## Migration

```bash
cd backend
alembic upgrade head
# Running upgrade 015_parking_unique_internal -> 016_maintenance_units
```

`016_maintenance_units_junction.py` creates `maintenance_task_units(maintenance_task_id, property_unit_id, created_at)` with cascade-delete on both sides. **Backfills** existing rows from `maintenance_tasks.property_unit_id` so the junction is the single source of truth from day one.

## Files changed

### Backend

- `backend/migrations/versions/016_maintenance_units_junction.py` — new
- `backend/app/models/tables.py`
  - New `maintenance_task_units` Table
  - `MaintenanceTaskRow.units` selectin M:N relationship (legacy `property_unit` kept for backward compat)
- `backend/app/api/v1/endpoints/maintenance.py`
  - `MaintenanceTaskCreate` / `MaintenanceTaskUpdate`: new optional `property_unit_ids: List[str]`
  - New helpers: `_resolve_task_unit_ids`, `_set_task_units`, `_get_task_unit_ids`, `_apply_unit_changes`, `_enrich_with_unit_ids` (mirror of contracts.py)
  - `GET /` list: batch-loads junctions via `_enrich_with_unit_ids` so every dict carries `property_unit_ids`
  - `GET /{id}` single: includes `property_unit_ids` (legacy primary FK merged in if missing from junction)
  - `POST /` create: resolves legacy + array, validates each unit belongs to nekretnina, populates junction **inside the same `db_transaction`** as the task row (so a junction failure rolls back the task)
  - `PUT /{id}` and `PATCH /{id}`: detect `property_unit_id` / `property_unit_ids` change, re-resolve full set, replace junction, update primary FK; pop `property_unit_ids` before `update_by_id`
  - Recurring children inside `POST /` create now copy the full unit set into each child's junction (not just legacy primary)
- `backend/app/services/recurring_maintenance_service.py`
  - Reads parent's full unit set (junction + legacy primary) and replicates it onto each scheduler-generated child task

### Frontend

- `frontend/src/features/maintenance/MaintenanceBoard.jsx`
  - `EMPTY_MAINTENANCE_FORM`: new `property_unit_ids: []` field
  - `handleEditClick`: initialises `property_unit_ids` from `task.property_unit_ids` (fallback to legacy primary)
  - `handleSubmitTask`: payload includes `property_unit_ids`
  - Form: replaced single `<Select>` with a checkbox multi-select list (max-h-32, scrollable). Switching nekretnina clears both `property_unit_id` and `property_unit_ids`
  - Card render: derives `linkedUnits` from M:N set first, falls back to legacy primary; subtitle shows comma-joined unit names
  - Detail panel: section header switches "Jedinica" → "Jedinice" when more than one; value comma-joined

## Test plan

After deploy:

1. **Create multi-unit task**
   - In the maintenance dialog, pick a property with multiple units → check 2 of them → save.
   - Card subtitle shows both unit oznake comma-joined.
   - GET `/maintenance/{id}` returns `property_unit_ids` with both ids.
2. **Edit existing single-unit task**
   - Existing task pre-fills with its single unit checked. Add a 2nd unit, save. PUT returns both ids.
3. **Recurring multi-unit task**
   - Create a `mjesecno` recurring task with 2 units checked. Inspect generated children → each child has the same 2-unit junction (not just primary).
4. **Scheduler cron**
   - When `generate_recurring_tasks` triggers a new child, query `maintenance_task_units` for the child id → expect the parent's full set.
5. **Backward compat**
   - Tasks created before migration 016 still render correctly (backfill row in junction). Their cards show the same single unit they always did.
6. **Property change clears units**
   - In the form, change `nekretnina_id` → both unit selections reset to empty.
7. **Atomic write**
   - Manually drop a unit's id after dialog open but before save (test-only). Backend should reject the create as a 400 ("podprostor ne pripada nekretnini") and the task row must NOT exist in the DB — the `db_transaction` rolls back both.

## Notes for the dev

- **No breaking changes**: legacy `property_unit_id` is still set on every task as the "primary". Reports, analytics, and any downstream code reading `task.property_unit_id` keep working.
- **Batch query on list**: junction is loaded with a single `IN`-query per page; no N+1.
- **No schema changes to Racuni / Dokumenti** — those still use single `property_unit_id`. Separate batch if/when needed.
- Local SQLite migration applied; same `op.create_table` + backfill SQL will run on MariaDB in prod.

## Out of scope (suggested follow-ups)

- Filter / analytics: `GET /maintenance` doesn't yet filter by `property_unit_id` — could be extended to "tasks touching this unit" by joining the junction.
- Report PDF (`maintenance_report_pdf_service.py`) currently aggregates by `nekretnina_id` only — would benefit from a per-unit breakdown column.
- Tests: no `maintenance_task_units` coverage in `tests/`.

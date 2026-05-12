# Handoff: Parking spaces become contract-aware (M2M with ugovori)

**Date:** 2026-05-06
**Author:** Karlo (via Claude)
**Status:** Code complete — needs migration + smoke test before merge.

## What this does

Mirrors the podprostor (PropertyUnit) lifecycle for parking spaces:

1. **Parking has a status** (`dostupno` / `rezervirano` / `iznajmljeno` / `u_odrzavanju`) that propagates through contracts the same way unit status does.
2. **Parking has its own monthly rent** (`osnovna_zakupnina`) for reference and future billing.
3. **A contract can cover multiple parkings AND multiple podprostori** — the new `ugovor_parkings` junction parallels `ugovor_units`. A contract can be parking-only, units-only, or a mix.
4. **The direct `parking_spaces.zakupnik_id` link is removed.** The lessee is derived through the active contract — same model as units. (Karlo confirmed the table is empty / pre-prod, so no backfill needed.)

## DB migration

```bash
cd backend
alembic upgrade head
# expected output: Running upgrade 013_bill_split -> 014_parking_contracts
```

`migrations/versions/014_parking_contracts.py` does:

- Drops `parking_spaces.zakupnik_id` (FK + index + column).
- Adds `parking_spaces.status` (default `dostupno`), `osnovna_zakupnina`, `naziv`.
- Creates `ugovor_parkings(ugovor_id, parking_id, created_at)` with cascade-delete on both sides and an index on `parking_id`.

`downgrade()` is provided for rollback.

## Files changed

### Backend

- `backend/migrations/versions/014_parking_contracts.py` — new migration.
- `backend/app/models/tables.py`
  - New `ugovor_parkings` Table after `ugovor_units`.
  - `ParkingSpaceRow`: drops `zakupnik_id`, adds `status` / `osnovna_zakupnina` / `naziv`, adds `ugovori` M2M relation.
  - `UgovoriRow`: new `parkings` M2M relation (selectin).
- `backend/app/models/domain.py`
  - New `ParkingStatus` enum (mirror of `PropertyUnitStatus`).
  - `ParkingSpace` Pydantic schema: drops `zakupnik_id`, adds `status` / `osnovna_zakupnina` / `naziv`.
- `backend/app/api/v1/endpoints/parking.py`
  - `ParkingSpaceCreate` / `ParkingSpaceUpdate`: drop `zakupnik_id`, add new fields.
  - PUT validates status transitions against active contracts (rejects `dostupno` if contract active, rejects `iznajmljeno` if no contract — same guards as units).
  - DELETE returns 409 if an active contract still references the parking.
- `backend/app/api/v1/endpoints/contracts.py`
  - `ContractCreate` / `ContractUpdate`: new optional `parking_ids: List[str]`.
  - New helpers parallel to unit helpers: `check_parking_overlap`, `_resolve_contract_parking_ids`, `_set_contract_parkings`, `_get_contract_parking_ids`, `_sync_parkings_status`.
  - Refactored advisory-lock helper into `_advisory_lock(kind, id, label)` with `advisory_lock_for_unit`, `advisory_lock_for_parking`, and `advisory_lock_for_resource((kind, id))` wrappers. The legacy unit lock semantics are unchanged.
  - `create_contract`: validates + locks both unit and parking IDs (sorted, deadlock-safe), runs overlap check on both, populates both junctions, syncs both statuses if approved+active.
  - `update_contract`: parallel resolve + overlap + junction + status sync for parking.
  - `update_contract_status`, `delete_contract`, `approve_contract`, `renew_contract`: all extended to handle parking.
  - GET `/{id}` returns `parking_ids` alongside `property_unit_ids`.
- `backend/app/services/contract_status_service.py`
  - Cron contract-expiry sync now also frees linked parkings (`_release_contract_parkings`) and self-heals orphans (`fix_orphaned_rented_parkings`).

### Frontend

- `frontend/src/shared/parking.js` — new helper module (status config, badges, display name, summary).
- `frontend/src/features/properties/ParkingTab.jsx`
  - Drops the zakupnik dropdown (handled by contracts now).
  - Adds Status select, Naziv input, Mjesečna zakupnina input.
  - Table columns: Oznaka / Etaža / Naziv / Status (badge) / Zakupnina / Registracije / Akcije.
- `frontend/src/features/properties/NekretninaDetailPage.jsx` — drops the obsolete `zakupnici` prop on `<ParkingTab>`.
- `frontend/src/features/contracts/UgovorForm.jsx`
  - New `parking_ids` state, `parkings` list, `fetchParkings`, `toggleParking`.
  - Parking multi-select section appears under the Jedinice section, with same UX (occupied disabled, optional rent shown, count summary).
- `frontend/src/features/contracts/UgovorDetailPage.jsx`
  - Fetches parking for the contract's nekretnina, computes `contractParkings`, renders alongside the unit list with Croatian labels.

## Test plan

After running the migration:

1. **DB sanity** — `\d parking_spaces` should show new columns; `ugovor_parkings` table exists with two rows of FKs.
2. **Parking CRUD** — create a parking via `<ParkingTab>` with status + zakupnina. Edit it. Try setting status to `iznajmljeno` without a contract → expect 400.
3. **Contract create** — Create a contract for a property that has units AND parkings. Select two units + one parking. After create:
   - Contract response includes `property_unit_ids` and `parking_ids`.
   - All linked units and the parking flip to `iznajmljeno` (because creator has approve scope and contract is `aktivno`).
4. **Overlap** — Try to create a second active contract for the same parking, overlapping dates → expect 400 with "preklapanje" message.
5. **Update** — Edit contract, replace `parking_ids` with a different parking → old parking becomes `dostupno`, new one `iznajmljeno`.
6. **Renew** — Renew a contract that has a parking → renewal carries over parking, both contracts' parkings end up `dostupno` until renewal is approved (matches existing unit behavior).
7. **Status change** — Mark contract `raskinuto` via `/{id}/status` → linked parking becomes `dostupno`.
8. **Delete contract** — Delete an active contract → linked parkings freed (unless another active contract claims them).
9. **Cron sync** — Backdate a contract `datum_zavrsetka`, run `sync_contract_and_unit_statuses()` → contract becomes `istekao`, parking becomes `dostupno`.
10. **Self-heal** — Manually set a parking to `iznajmljeno` with no contract → run `fix_orphaned_rented_parkings()` → it flips back to `dostupno`.

## Notes for the dev

- **No backfill** is performed for existing `parking_spaces` rows. Karlo confirmed the table is empty in prod. If staging has dummy data with old `zakupnik_id` values, the migration silently drops it.
- **`ugovor_parkings` is the only source of truth.** Unlike units, parking has no legacy primary FK on `UgovoriRow` — keeps the model clean.
- **Lock ordering**: `_resource_targets()` sorts `(kind, id)` tuples — `("parking", x) > ("unit", y)`, so units always lock before parkings. As long as everywhere uses the same helper, deadlocks between unit-only and unit+parking inserts cannot happen.
- The `approval_status` filter on `check_parking_overlap` matches `check_contract_overlap` (`approved` OR `NULL` for legacy data).
- Dashboard `/dashboard` still shows unit occupancy only. Parking occupancy stats are out of scope here — easy follow-up if needed.
- AI PDF parser (`/api/ai/parse-pdf-contract`) does not yet extract parking info. Future work.

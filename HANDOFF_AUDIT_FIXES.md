# Handoff: Audit fixes — contracts ↔ units ↔ parking ↔ properties

**Date:** 2026-05-08
**Author:** Karlo (via Claude)
**Status:** Code complete — locally verified (backend reloaded, frontend compiled).
**Follows:** parking + monthly report PDFs + multi-unit display fix.

## Why

Detailed audit (see chat) flagged 3 CRITICAL + 7 HIGH + 2 MEDIUM bugs in the contract / unit / parking lifecycle. This batch fixes all of them. Headline impact:

- Multi-unit contracts no longer leak orphaned IZNAJMLJENO statuses on expiry, update, or cron self-heal.
- Property delete with active contracts returns a clean 409 instead of a 500 IntegrityError.
- Junction inserts are now atomic with the contract row — no more "contract row exists with empty M:N" race.
- Rent calculated from per-m² now sums areas across all units in the contract.
- Several smaller integrity guards (parking unique constraint, nekretnina_id rebind blocked, OBN suffix retry, duplicate approval-state).

## Migrations

```bash
cd backend
alembic upgrade head
# expected: Running upgrade 014_parking_contracts -> 015_parking_unique_internal
```

`015_parking_unique_internal.py` adds `UNIQUE(nekretnina_id, internal_id)` on `parking_spaces`.

## What changed

### Backend — `app/services/contract_status_service.py`
- `sync_contract_and_unit_statuses` rewritten: extracts `_release_contract_units` helper that reads BOTH legacy `property_unit_id` AND the `ugovor_units` junction; calls both unit + parking release on every expiring contract. (CRITICAL #1)
- `fix_orphaned_rented_units` rewritten to query the junction with `or_(legacy_fk, id IN junction_subq)` so multi-unit secondary holdings are not flipped to DOSTUPNO during active tenancy. (CRITICAL #2)
- `fix_orphaned_rented_parkings` already correct from previous batch — left as-is.

### Backend — `app/api/v1/endpoints/properties.py`
- `delete_property`: pre-flight check for any active contract (409) and any historical contract (409) before delete; FK RESTRICT no longer leaks 500. (CRITICAL #3)

### Backend — `app/api/v1/endpoints/contracts.py`
- **Duplicate check** now also blocks PENDING_APPROVAL and DRAFT with same `(interna_oznaka, nekretnina)` — earlier only ACTIVE/NA_ISTEKU were considered, allowing two pending drafts that crashed the unique index on insert. (HIGH #4)
- **Update flow** snapshots old unit + parking sets, then frees the *removed* ones via new `_free_removed_units` / `_free_removed_parkings` helpers (which keep an "other active contract still holds it" guard). Earlier removing a unit from a contract left it IZNAJMLJENO with no contract backing it. (HIGH #5)
- **Update flow** blocks changing `nekretnina_id` on a contract with linked resources unless `property_unit_ids` AND `parking_ids` are explicitly re-specified in the same payload (400). (HIGH #6)
- **Renewal**: `-OBN-{hex}` suffix now tries 6 → 8 → 12 hex chars × 5 attempts each, with a uniqueness probe per attempt; fails loudly with 500 only after exhausting all combinations. (HIGH #7)
- **Junction inserts** moved inside the same `db_transaction()` as the contract row in both `create_contract` and `renew_contract`. `_set_contract_units` and `_set_contract_parkings` now accept an optional `session=` param and reuse the caller's transaction when provided. (HIGH #8)
- **`calculate_rent_if_needed`**: accepts optional explicit `unit_ids` arg; when set, sums `povrsina_m2` across all of them (not just the legacy primary). All call sites updated to pass the resolved unit set. (HIGH #9)
- **`VALID_STATUS_TRANSITIONS`**: added `AKTIVNO → ISTEKAO` so manual admin actions can mark a contract expired without first going through `na_isteku`. Cron path was already bypassing this via raw write. (HIGH #10)

### Backend — `app/api/v1/endpoints/parking.py`
- `update_parking_space`: blocks moving a parking to another `nekretnina_id` while it has an active contract (409). (MEDIUM)

### Backend — `app/models/tables.py` + new migration 015
- `ParkingSpaceRow.__table_args__`: `UniqueConstraint("nekretnina_id", "internal_id")`. (MEDIUM)

### Frontend — `features/contracts/UgovoriPage.jsx`
- Contract list table cell now renders comma-joined unit names from `property_unit_ids` (falls back to legacy `property_unit_id`) instead of only the primary. (MEDIUM)
- Contract view sheet header same fix.

## Test plan

After deploy:

1. **CRITICAL #1+#2 — cron M:N**
   - Create a contract A covering units U1+U2. Approve it. Both units → IZNAJMLJENO.
   - Backdate contract A's `datum_zavrsetka` to yesterday. Trigger `sync_contract_and_unit_statuses` (or wait for next cron tick).
   - Expected: contract A → ISTEKAO, BOTH U1 and U2 → DOSTUPNO. Pre-fix: only U1 (primary) was freed.
2. **CRITICAL #3 — delete blocked**
   - Create property P with a unit and an active contract on it.
   - DELETE `/nekretnine/{P}` → expect 409 with friendly message. Pre-fix: 500 IntegrityError.
3. **HIGH #4 — duplicate guard**
   - Create draft contract `oznaka=X` on property P. Submit for approval.
   - Try to POST another contract with same oznaka + same property → expect 400 (not 500). Includes draft + pending in the duplicate check.
4. **HIGH #5 — orphan free on update**
   - Contract covers U1+U2. PUT with `property_unit_ids: [U1]` (drop U2).
   - Expected: U2 → DOSTUPNO. Pre-fix: U2 stayed IZNAJMLJENO.
5. **HIGH #6 — nekretnina rebind**
   - PUT `nekretnina_id: P2` on a contract that has units from P1, without sending `property_unit_ids`. → expect 400 with explanation.
6. **HIGH #7 — renewal collision**
   - Renew the same contract 100 times back-to-back (test-only). No 500s.
7. **HIGH #8 — junction transaction**
   - Hard to simulate without race; verify by reading code that `_set_contract_units(..., session=txn)` is the only path in create+renew.
8. **HIGH #9 — multi-unit rent**
   - Contract with U1 (50 m²) + U2 (70 m²), `zakupnina_po_m2=10`. Save with `osnovna_zakupnina=0`.
   - Expected: backend computes `osnovna_zakupnina = 1200`. Pre-fix: only U1 area used → 500.
9. **HIGH #10 — status transitions**
   - Contract in AKTIVNO. PUT `/{id}/status` with `novi_status=istekao` → 200. Pre-fix: 422.
10. **MEDIUM — parking unique**
    - Try to add two parkings with `internal_id=PM-1` on the same property → expect 400 (or 409 from DB, surfaced by Pydantic / SQLAlchemy).
11. **MEDIUM — UgovoriPage list**
    - Open contracts list with a 3-unit contract → all 3 unit oznake in the row, comma-joined. View sheet header: same.

## Notes

- All changes are backwards-compatible with single-unit contracts.
- No new dependencies.
- Migration 015 is non-destructive (just adds UNIQUE).
- Local SQLite was reverified: backend reloaded cleanly, frontend hot-reloaded. WeasyPrint 503 stays unrelated.
- LOW-priority items from the audit are intentionally NOT touched: N+1 in advisory locks, dropping `pdfDateStamp`, MaintenanceTaskRow / RacuniRow / DokumentiRow legacy `property_unit_id` migration, EntityStore cache invalidation review, missing tests for M:N flows. These are documented as follow-ups.

## Suggested follow-ups

1. **Test coverage**: M:N parking, multi-unit M:N, removal-on-update, cron orphan vs. junction.
2. **MaintenanceTask / Racun / Dokument**: migrate single `property_unit_id` to M:N junctions if the user wants per-unit task/bill/document scoping.
3. **N+1 advisory locks**: take all locks in a single session instead of recursive nesting.
4. **EntityStore**: verify cache invalidation when units / parkings change so contract list doesn't render stale `property_unit_ids`.

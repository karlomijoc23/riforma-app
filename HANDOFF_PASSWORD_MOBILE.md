# Handoff: Force password change + Tenant portal mobile polish

**Date:** 2026-05-11
**Author:** Karlo (via Claude)
**Status:** Code complete — backend reloaded, frontend hot-reloaded, migration 018 applied locally. Tests 15/15 green.

## Why

1. **Security**: admin-issued temp passwords (from `/users` create or `/zakupnici/{id}/invite-user`) had no rotation enforcement — a tenant could log in with the same temp password forever, and an admin could quietly leak the password without consequence. This batch makes rotation mandatory before the user can do anything.
2. **UX**: zakupnici primarily access the portal from phones. The first cut of `TenantPortalPage` was desktop-first; tabs overflowed, KPI cards squeezed, touch targets were undersized.

## Migration

```bash
cd backend
alembic upgrade head
# Running upgrade 017_zakupnik_user_link -> 018_password_change_tracking
```

`018_password_change_tracking.py` adds two columns to `users`:
- `password_changed_at` (nullable timestamp) — when the user last self-set their password
- `must_change_password` (bool, default false) — set true on every admin-issued temp password; cleared by `PUT /users/me/password`

## Files added

- `backend/migrations/versions/018_password_change_tracking.py`
- `frontend/src/features/auth/ChangePasswordPage.jsx` — works in two modes:
  - `forced={true}` (auto when `user.must_change_password`): no current-password input, just new + confirm
  - Normal: current-password required, full rotation flow

## Files modified

### Backend
- `backend/app/models/tables.py` — `UserRow.password_changed_at`, `UserRow.must_change_password`
- `backend/app/models/domain.py` — `UserPublic.must_change_password` (passed to frontend on `/users/me`)
- `backend/app/api/v1/endpoints/users.py`
  - `Optional` added to typing imports
  - New `ChangePasswordBody` schema + `PUT /me/password` endpoint
  - `create_user` sets `must_change_password=True` on every new account
- `backend/app/api/v1/endpoints/tenants.py` — `invite_tenant_user` sets `must_change_password=True`

### Frontend
- `frontend/src/shared/api.js` — `changeMyPassword({current_password, new_password})` helper
- `frontend/src/shared/auth.js` — exposes `refreshUser` alias on the auth context so feature code can refresh the current-user object after a mutation without knowing about `syncUser`
- `frontend/src/App.js`
  - Lazy import for `ChangePasswordPage`
  - **Top-level interceptor**: if `user?.must_change_password` is true, the entire app renders only `<ChangePasswordPage forced={true} />` and every URL redirects to it. Applies to ALL roles (admin / tenant / etc.) — no exception
  - Tenant route block: added `/postavke/lozinka` so tenants can rotate later
  - Admin route block: added `/postavke/lozinka` for self-service rotation any time
- `frontend/src/features/portal/TenantPortalPage.jsx`
  - **Mobile polish:** header stacks on phones (`flex-col` → `sm:flex-row`); "Nova prijava" button full-width on mobile, auto on tablet+
  - TabsList: horizontal-scrolling instead of squeezing 5 tabs into 360 px viewport; each `TabsTrigger` gets `min-h-[40px]` for proper touch
  - Card content rows: `min-w-0 flex-1` on the left column (truncation), `whitespace-nowrap` on right-side amount/badge so they don't wrap and break layout
  - **Profil tab**: new "Sigurnost i sesija" card with "Promijeni lozinku" + "Odjavi se" buttons (both `min-h-[44px]` touch targets)

## Test plan

1. **Fresh admin user creation** — POST `/users` with role=property_manager. Response includes `temp_password`. Log in as that user → app immediately shows ChangePasswordPage with no admin nav. Submit new password (no current required) → redirected to `/`, admin nav appears.
2. **Tenant invite flow end-to-end** —
   - Admin opens ZakupnikDetailPage, clicks "Pozovi korisnika".
   - Copies temp password.
   - Logs out, logs in with the tenant's email + temp password.
   - Portal-style force change page (no portal nav either). Submit new password.
   - Redirected to `/portal`, all 5 tabs functional.
3. **Normal rotation** — logged-in admin visits `/postavke/lozinka` (or tenant Profil → "Promijeni lozinku"). Both `current_password` + `new_password` required. Validation: 422 on wrong current, 400 on short new (< 8 chars).
4. **Frontend force interception** — manually flip `users.must_change_password = TRUE` for a logged-in user in SQLite, refresh browser → next navigation lands on force-change page (auth refresh on next request picks it up).
5. **Mobile portal** —
   - Open Chrome devtools → iPhone 12 viewport (390 × 844)
   - Portal landing: KPI cards 1-per-row, header stacks, "Nova prijava" button full-width
   - Tabs: scroll horizontally without overflow / wrap
   - Bills tab with long opis: opis line-clamps to 2 lines, status badge + amount stay right-aligned
   - Profil tab: "Promijeni lozinku" + "Odjavi se" both finger-friendly height
6. **Tests** — `pytest tests/test_m2n_flow.py tests/test_logic.py` → 15/15 pass.
7. **Reset password** — existing `/auth/forgot-password` flow unaffected (it doesn't set `must_change_password`, but it sets `password_changed_at` — verify the reset endpoint).

## Notes for the dev

- **Existing accounts** — every user created BEFORE migration 018 has `must_change_password=false` (column default). They won't be forced to rotate. New admin-issued accounts moving forward will be. To force-rotate everyone (e.g. after a security incident), run:
  ```sql
  UPDATE users SET must_change_password = TRUE;
  ```
- **Reset password flow** (`/auth/reset-password`) should also clear `must_change_password` and set `password_changed_at` — this is a separate endpoint and was NOT touched in this batch. Easy follow-up: same two field updates in the reset handler.
- **`Optional` import** — `users.py` was missing `Optional` in its typing imports; I added it. The reload caught this as a NameError and uvicorn auto-restarted clean.
- **Password policy** — only "≥ 8 chars" is enforced. No complexity rule (uppercase/digit/symbol). If you want one, add to the validator in `ChangePasswordBody` or the endpoint.

## Out of scope (follow-ups)

- **Password complexity rules** (uppercase, digits, symbols).
- **Forgot-password reset endpoint** should also set `password_changed_at` / clear `must_change_password`.
- **SMTP** — admin still manually shares temp passwords (window.prompt for tenants, response body for users). Wire `app/core/email.py` when SMTP is configured.
- **Audit log** entry on password change (currently only logged at HTTP request level by middleware — no entity diff).

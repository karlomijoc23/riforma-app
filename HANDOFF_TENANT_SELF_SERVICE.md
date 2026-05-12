# Handoff: Tenant (Zakupnik) Self-Service Portal

**Date:** 2026-05-11
**Author:** Karlo (via Claude)
**Status:** Code complete — backend reloaded, frontend hot-reloaded, migration 017 applied locally.

## Why

The `tenant` role already had `self:read` / `self:maintenance` / `self:documents` scopes in `roles.py` but ZERO routes used them — there was no way for a zakupnik to actually log in and see their own contract / bills / documents, or submit a maintenance request. This batch builds the foundation + the mini-portal so a zakupnik can self-serve without admin involvement.

## Migration

```bash
cd backend
alembic upgrade head
# Running upgrade 016_maintenance_units -> 017_zakupnik_user_link
```

`017_zakupnik_user_link.py` adds a nullable `zakupnici.user_id` FK + UNIQUE so one tenant user = exactly one zakupnik record. Both constraints are named explicitly (`fk_zakupnici_user_id`, `uq_zakupnici_user_id`) so SQLite batch-mode rebuilds work.

## Architecture

```
                 ┌────────────────────────────────────────┐
                 │ ADMIN opens ZakupnikDetailPage         │
                 │ Clicks "Pozovi korisnika"              │
                 └───────────────┬────────────────────────┘
                                 ▼
        POST /zakupnici/{id}/invite-user
        ─ generates 16-char temp password
        ─ creates UserRow(role=tenant, scopes=[self:*])
        ─ sets zakupnici.user_id = new_user.id
        ─ returns temp_password (one-time, admin shares)
                                 │
        ZAKUPNIK logs in ────────┘
        ─ useAuth().user.role === "tenant"
        ─ App.js strips Navigation, renders <TenantPortalPage />
        ─ Page calls /api/v1/self/* endpoints
                                 │
        get_current_zakupnik dependency in deps.py
        ─ resolves UserRow.id → zakupnici.user_id row
        ─ raises 403 if no link
```

## Files added

- `backend/migrations/versions/017_zakupnik_user_link.py`
- `backend/app/api/v1/endpoints/self_service.py` — 7 endpoints (profile / contracts / bills / maintenance GET+POST / documents / summary)
- `frontend/src/features/portal/TenantPortalPage.jsx` — full portal UI

## Files modified

### Backend
- `backend/app/models/tables.py` — `ZakupniciRow.user_id` FK + relationship
- `backend/app/api/deps.py` — `get_current_zakupnik` dependency
- `backend/app/api/v1/api.py` — register `self_service.router` under `/self`
- `backend/app/api/v1/endpoints/tenants.py` — new `POST /{id}/invite-user` + `DELETE /{id}/user-link`
- `backend/app/api/v1/endpoints/users.py` — `tenant` added to `VALID_ROLES`

### Frontend
- `frontend/src/shared/api.js` — `inviteTenantUser`, `unlinkTenantUser`, `getZakupnik`, 7 `getSelf*` / `submitSelfMaintenance` helpers
- `frontend/src/features/tenants/ZakupnikDetailPage.jsx` — "Pozovi korisnika" / "Korisnik povezan" header button, handlers, state. Uses `window.prompt` to show one-time temp password (admin selects + copies)
- `frontend/src/App.js` — `TenantPortalPage` lazy import, role-aware routing: if `user.role === "tenant"`, the entire app renders just `<TenantPortalPage />` at `/portal` with no admin nav / no entity store

## Endpoint reference

| Method | Path | Scope | Returns |
|---|---|---|---|
| `GET` | `/api/v1/self/profile` | `self:read` | ZakupniciRow dict |
| `GET` | `/api/v1/self/contracts` | `self:read` | UgovoriRow dicts incl. `property_unit_ids` + `parking_ids` |
| `GET` | `/api/v1/self/bills` | `self:read` | RacuniRow dicts (filter `?status_filter=ceka_placanje`) |
| `GET` | `/api/v1/self/maintenance` | `self:maintenance` | MaintenanceTaskRow dicts |
| `POST` | `/api/v1/self/maintenance` | `self:maintenance` | Created task (auto-tagged with zakupnik + nearest contract) |
| `GET` | `/api/v1/self/documents` | `self:documents` | DokumentiRow dicts (linked to zakupnik OR to their contracts) |
| `GET` | `/api/v1/self/summary` | `self:read` | Headline KPIs for portal landing |
| `POST` | `/api/v1/zakupnici/{id}/invite-user` | `tenants:update` | New user payload + temp password |
| `DELETE` | `/api/v1/zakupnici/{id}/user-link` | `tenants:update` | OK |

All `/self/*` routes are guarded by `get_current_zakupnik` which returns 403 if the calling user has no `zakupnici.user_id` link.

## Test plan

1. **Admin invite** — open ZakupnikDetailPage for any zakupnik with `kontakt_email`. Click "Pozovi korisnika". Window prompt shows temp password. Refresh — button now reads "Korisnik povezan".
2. **Tenant login** — log out, log in with the invited email + temp password. Should land on `/portal` (no admin nav). Dashboard shows 4 KPI cards + 5 tabs.
3. **Tabs** — Ugovori shows their contracts; Računi shows bills; Prijave shows maintenance tasks; Dokumenti shows linked docs; Profil shows contact info.
4. **Submit maintenance request** — click "Nova prijava održavanja" header button. Submit with title + opis + priority. Toast confirms. New task appears under Prijave. Admin sees it on MaintenanceBoard with `zakupnik_id` set and `ugovor_id` linked to their latest contract.
5. **No-link tenant** — manually unset `zakupnici.user_id` in DB for a tenant user; log in as that user → portal shows a "Pristup nije moguć — vaš korisnički račun nije povezan" empty state with a friendly message instead of crashing.
6. **Admin unlink** — click "Korisnik povezan" header button → confirm → tenant user loses access (next page load they see the no-link error).
7. **Cross-zakupnik isolation** — log in as tenant A, try `GET /api/v1/self/profile` with tenant B's contract ID hard-coded somewhere — backend always resolves through `get_current_zakupnik`, so requests for other zakupnik's data never leak.
8. **Multi-contract zakupnik** — a zakupnik with 2 contracts sees both on the Ugovori tab.

## Notes for the dev

- **Temp password flow** is a stub. When SMTP is configured (`backend/app/core/email.py`), wire `send_email` to mail the invite + password instead of returning it in the response. Currently the admin must copy/paste.
- **Tenant Navigation** is intentionally blank — no menu, no tenant switcher, no admin tools. The whole tenant-role surface is `/portal`. Any other path redirects there.
- **EntityStore is NOT mounted** for tenant users — they don't need the cross-feature cache. Each `/self/*` call goes straight to the backend.
- **`zakupnik_id` matching of an existing user** — currently we always create a NEW user account. If the admin wants to link a pre-existing user account to a zakupnik (e.g. their own staff), there's no UI for that. Easy follow-up if needed (just expose `PATCH /zakupnici/{id}` with `user_id`).
- **No tenant onboarding UX** — the temp password is meant to be changed on first login. Frontend doesn't force this. Follow-up: redirect to `/postavke/password` on first login.

## Out of scope (suggested follow-ups)

- SMTP integration for password delivery.
- "Change password on first login" enforcement.
- Bill payment integration (mark bill as paid from portal).
- Document download / preview link from portal.
- Tenant-side approval flow for contract amendments (annexes).
- Mobile-responsive polish (current layout is desktop-first).

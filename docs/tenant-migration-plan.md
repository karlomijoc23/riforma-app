# Tenant Migration Plan

> **Status:** Legacy reference only. Production now runs on MariaDB; keep this document for historical context if you ever need to recover the original MongoDB workflow.

This runbook explains how to migrate existing single-tenant data into the new tenant-aware model introduced in `backend/server.py`. It assumes you already run the production stack on MongoDB (no in-memory database) and that all API traffic can be paused during the migration window.

## Goals

- Ensure every document in tenant-scoped collections carries a `tenant_id`.
- Provision the default tenant record (`DEFAULT_TENANT_ID`) and bind every user to it.
- Leave tenant-aware APIs in a consistent state so that the frontend can require the `X-Tenant-Id` header on every request.

## Pre-flight Checklist

- [ ] Confirm a maintenance window with stakeholders; the API should be read-only while updates run.
- [ ] Verify current `MONGO_URL` and `DB_NAME` values match production.
- [ ] Decide the identifiers you want for `DEFAULT_TENANT_ID` and `DEFAULT_TENANT_NAME` (e.g. `tenant-default` / `Primarni profil`).
- [ ] Enable application logging to capture the migration session (`uvicorn` / Mongo slow query logs).

## Phase 1 - Snapshot & Backups

1. Run a fresh `mongodump` of the production database and store it in secure, versioned storage.
   ```bash
   mongodump --uri "$MONGO_URL" --db "$DB_NAME" --out backups/$(date +%Y%m%d-%H%M)
   ```
2. Export a CSV/JSON list of current users and their roles for quick verification after the cutover.
3. Announce the start of the maintenance window and flip the application to read-only if possible (e.g. disable task queues, pause ingestion jobs).

## Phase 2 - Environment Configuration

1. Update the production secret store or environment to include:
   - `DEFAULT_TENANT_ID`
   - `DEFAULT_TENANT_NAME`
   - `USE_IN_MEMORY_DB=false`
2. Double-check that `backend/.env.production` (or its secret-store equivalent) contains the new tenant settings before redeploying.

## Phase 3 - Data Migration

1. SSH into the application host (or connect to the VPC bastion) and activate the backend virtualenv.
   ```bash
   cd /srv/riforma/backend
   source .venv/bin/activate
   ```
2. Export the production environment variables in your shell (`set -a; source .env.production; set +a`).
3. Run migrations to ensure the schema matches the tenant-aware models:
   ```bash
   python -m backend.manage migrate
   ```
4. Execute the tenant backfill script below. It inserts the default tenant, ensures every user is a member, and backfills `tenant_id` on each tenant-scoped collection.

   ```bash
   python - <<'PY'
   import asyncio
   from backend.server import (
       DEFAULT_TENANT_ID,
       DEFAULT_TENANT_NAME,
       TENANT_SCOPED_COLLECTIONS,
       Tenant,
       db,
       prepare_for_mongo,
       _ensure_default_memberships,
   )

   async def ensure_default_tenant():
       existing = await db.tenants.find_one({"id": DEFAULT_TENANT_ID})
       if existing:
           return
       await db.tenants.insert_one(
           prepare_for_mongo(Tenant(id=DEFAULT_TENANT_ID, naziv=DEFAULT_TENANT_NAME).model_dump())
       )

   async def backfill_collections():
       for name in sorted(TENANT_SCOPED_COLLECTIONS):
           collection = getattr(db, name)
           result = await collection.update_many(
               {"tenant_id": {"$exists": False}},
               {"$set": {"tenant_id": DEFAULT_TENANT_ID}},
           )
           print(f"{name}: {result.modified_count} documents updated")

   async def run():
       await ensure_default_tenant()
       await _ensure_default_memberships()
       await backfill_collections()

   asyncio.run(run())
   PY
   ```

5. (Optional) If you already created additional tenant records manually, add memberships for the correct users with a targeted script (owner/admin roles map to the `TENANT_ROLE_SCOPE_MAP` defined in `backend/server.py`).
6. Restart the backend process so it reloads the tenant defaults and picks up fresh environment variables.

## Phase 4 - Validation

- Query each tenant-scoped collection to ensure no orphaned documents remain:

  ```bash
  python - <<'PY'
  import asyncio
  from backend.server import TENANT_SCOPED_COLLECTIONS, db

  async def validate():
      for name in sorted(TENANT_SCOPED_COLLECTIONS):
          collection = getattr(db, name)
          missing = await collection.count_documents({"tenant_id": {"$exists": False}})
          print(f"{name}: {missing} documents missing tenant_id")

  asyncio.run(validate())
  PY
  ```

- Hit `GET /api/tenants` with admin credentials; confirm it returns the default tenant and any new tenant entries.
- Sign in through the frontend and confirm the SPA sends the `X-Tenant-Id` header on every protected request (check browser network tab).
- Run the automated regression suites:
  ```bash
  pytest
  corepack yarn test --runInBand
  python backend_test.py --base-url https://<your-prod-domain>
  ```

## Phase 5 - Post-migration Tasks

- Remove `INITIAL_ADMIN_*` secrets after ensuring the first admin exists.
- Update onboarding documentation so support teams know how to seed new tenants and memberships.
- Resume background workers and notify stakeholders that the window is complete.
- Monitor MongoDB metrics and application logs closely for the next 24 hours.

## Rollback Plan

If anything goes wrong, stop the backend, restore the MongoDB snapshot you took in Phase 1, redeploy the previous application build, and clear any cached frontend assets (CDN purge). Document the root cause before attempting the migration again.

## Owners & Timing

- **Owner:** Backend engineer on duty
- **Reviewer:** Tech lead / SRE
- **Estimated duration:** 30-60 minutes of downtime, plus 24 hours of elevated monitoring

Keep this document updated as tenant functionality evolves.

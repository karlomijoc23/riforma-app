# MariaDB Migration Blueprint

> **Status:** Completed. The backend now runs on MariaDB using the document-store layer described below; this blueprint remains for documentation and future audits.

## 1. Background & Goals

- Replace the current MongoDB persistence layer (Motor + custom tenant scoping) with MariaDB while preserving API behaviour and tenancy rules.
- Minimise downtime during cutover and provide a repeatable migration playbook.
- Introduce maintainable data-access abstractions (SQLAlchemy 2.0 async) that cover tenants, RBAC, workflows, AI metadata, and audit trails.

## 2. Proposed Tech Stack

- **Driver**: [`asyncmy`](https://github.com/long2ice/asyncmy) (MySQL/MariaDB asyncio driver).
- **ORM**: SQLAlchemy 2.0 (`AsyncEngine`, declarative mappings, SQLModel patterns for Pydantic interop).
- **Migrations**: Alembic (async configuration) with environment scripts wired to the new engine.
- **Connection management**: Dependency-injected session factories + FastAPI lifespan hook for startup/teardown.
- **Testing support**: Ephemeral MariaDB container via Docker Compose, plus sqlite-in-memory fallback for unit tests where possible.

## 3. Current Collections → Target Tables

| Mongo Collection     | Purpose                 | Target Tables (preliminary)                                           | Notes                                                                             |
| -------------------- | ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `tenants`            | Tenant profiles         | `tenants`                                                             | `id (pk, UUID)`, `name`, `status`, `created_at`, `updated_at`.                    |
| `tenant_memberships` | Users↔tenants          | `tenant_memberships`                                                  | FKs to `users` & `tenants`, enum role, status, unique `(tenant_id, user_id)`.     |
| `users`              | Accounts, roles         | `users`, `user_scopes`                                                | Password hash, role, status. Scopes stored in join table.                         |
| `nekretnine`         | Properties              | `properties`, `property_contacts`                                     | Normalise contacts (KontaktOsoba).                                                |
| `property_units`     | Units within properties | `property_units`                                                      | FK to `properties`.                                                               |
| `zakupnici`          | Tenants/lessees         | `lessees`, `lessee_contacts`                                          | Consider mapping metadata JSON → structured tables where feasible or JSON column. |
| `ugovori`            | Contracts               | `contracts`, `contract_items`                                         | Handles leasing metadata, link to property/tenant/unit, store dates/amounts.      |
| `dokumenti`          | Uploaded docs           | `documents`, `document_metadata`                                      | Use JSON column for metadata if flexible.                                         |
| `podsjetnici`        | Reminders               | `reminders`                                                           | Keep scheduling fields, FK to contracts.                                          |
| `racuni`             | Invoices                | `invoices`, `consumption_items`                                       | Consumption items table for array payloads.                                       |
| `maintenance_tasks`  | Task management         | `maintenance_tasks`, `maintenance_activities`, `maintenance_comments` | Preserve audit trail + assignment.                                                |
| `activity_logs`      | Audit log               | `activity_logs`                                                       | Likely append-only, consider partitioning by date.                                |

> **UUID Strategy**: existing documents already provide `id` as UUID string — retain as primary keys to simplify data migration. Use MariaDB `CHAR(36)` with binary-safe collation or `BINARY(16)` + converters.

### Enumerations & Constants

- `TenantMembershipRole`, `TenantMembershipStatus`, contract statuses, maintenance statuses, etc. -> explicit SQL enums or constrained VARCHARs with CHECK constraints.
- Booleans remain `TINYINT(1)` or `BOOLEAN`.
- Monetary fields: use `DECIMAL(12,2)`; ensure currency handling remains consistent.

### JSON Fields

- For flexible metadata (`documents.metadata`, `contracts.additional_terms`, `maintenance_tasks.extra_fields`), use MariaDB JSON columns. Map to SQLAlchemy `JSON` with validators.

## 4. Architectural Changes

1. **Persistence package**: create `backend/persistence/` with:
   - `base.py` (engine/session creation, Alembic integration).
   - `models.py` (SQLAlchemy declarative models mirroring Pydantic schemas).
   - `repositories/` (transaction-aware CRUD abstractions).
2. **Dependency wiring**:
   - Replace direct Motor usage in `backend/server.py` with repository calls.
   - Inject tenant context via request-scoped session + custom query filters.
3. **Settings**:
   - New env vars: `DB_ENGINE=mariadb+asyncmy`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
   - Deprecate `USE_IN_MEMORY_DB` or provide sqlite test toggle.
4. **Lifecycle hooks**:
   - FastAPI startup ensures Alembic migrations run (if enabled) and verifies connection.
   - Shutdown closes engine.

## 5. Migration Strategy

1. **Data modeling spike** (in-progress doc) to finalise table schemas.
2. **Parallel data layer**:
   - Build SQLAlchemy models + repositories while keeping Mongo alive.
   - Feature-flag API endpoints to switch data providers (read-only mirroring first).
3. **Data export/import**:
   - Write scripts to dump Mongo collections (JSONLines).
   - Transform and load into MariaDB via bulk inserts (SQLAlchemy core).
   - Validate counts, checksums, sample business flows.
4. **Dual-write window** (optional):
   - During QA, run both Mongo and MariaDB writes to compare results.
5. **Cutover**:
   - Freeze writes, run final sync, switch env vars, deploy.
6. **Rollback plan**:
   - Snapshot MariaDB before go-live.
   - Keep Mongo in read-only standby until confirmed stable.

## 6. Work Breakdown Structure

1. **Analysis & Design**
   - Finalise relational schema ERD.
   - Map enums, indexes, constraints.
   - Document tenant scoping rules in SQL terms (row-level filters, partial indexes).
2. **Infrastructure**
   - Provision MariaDB dev instance (Docker Compose).
   - Add connection config, secrets handling for dev/prod.
   - Setup Alembic env & initial migration.
3. **Implementation (per domain)**
   1. Core (tenants, users, memberships).
   2. Properties & units.
   3. Contracts & documents.
   4. Reminders, invoices, maintenance.
   5. Activity logs & analytics.
4. **Integration**
   - Replace `db.*` usages with repositories, ensuring tenant context propagation.
   - Update background tasks, PDF workflows, AI helpers to new data layer.
5. **Testing**
   - Unit tests for repositories.
   - Integration tests hitting MariaDB (pytest fixtures, transaction rollbacks).
   - Regression API tests (`tests/`) against new backend.
6. **Data Migration Scripts**
   - Exporters (Mongo → JSON).
   - Transformers/loaders (JSON → MariaDB).
   - Verification tooling (row counts, referential checks, business-level smoke tests).
7. **Documentation & Training**
   - Update `README` / deployment docs (`render.yaml`, env tables).
   - Runbook for migration day + rollback.

## 7. Immediate Next Steps

1. Review this blueprint with stakeholders; confirm scope and sequencing.
2. Draft initial ERD and table DDLs (can be captured in `docs/persistence/erd.sql` or similar).
3. Create MariaDB Docker Compose service for developers.
4. Scaffold SQLAlchemy base + Alembic configuration (no API changes yet).
5. Implement `tenants`, `users`, `tenant_memberships` models and repositories as proof of concept.

Once the foundational layer is validated, proceed domain by domain while maintaining parity with the existing API responses.

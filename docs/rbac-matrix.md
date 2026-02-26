# RBAC Matrix and API Scope Mapping

## Stakeholder Roles

| Stakeholder Persona       | Role ID            | Description                                                         | Default Scopes                                                                                                                                         | Primary API Domains                                                                        |
| ------------------------- | ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Platform Operations       | `admin`            | Internal platform administrator with unrestricted access.           | `*` (all scopes)                                                                                                                                       | All APIs including `/api/users`, `/api/settings`, audit exports.                           |
| Automation / Integrations | `system`           | Non-interactive service accounts used by integrations.              | `*` (all scopes)                                                                                                                                       | Same as `admin`, typically authenticated via API token.                                    |
| Portfolio Leadership      | `owner_exec`       | Owner / asset manager focused on insights and governance.           | `kpi:read`, `properties:read`, `leases:read`, `tenants:read`, `financials:read`, `reports:read`, `users:assign`                                        | `/api/dashboard`, analytics, read-only entity APIs, reminder triage.                       |
| Property Management       | `property_manager` | Operates portfolio, edits entities, oversees maintenance execution. | `properties:*`, `tenants:*`, `leases:*`, `maintenance:*`, `documents:*`, `vendors:read`, `financials:read`, `reports:read`, `users:assign`, `kpi:read` | CRUD on properties, units, tenants, leases, documents, maintenance; dashboards; reminders. |
| Data Entry                | `unositelj`        | Data entry role for documents and basic record intake.              | `documents:read`, `documents:create`, `leases:read`, `properties:read`, `tenants:read`, `maintenance:read`, `maintenance:create`                       | `/api/dokumenti`, `/api/maintenance-tasks` (create), read-only entity APIs.                |
| Finance & Accounting      | `accountant`       | Handles billing, vendor payments, and financial reporting.          | `financials:*`, `tenants:read`, `leases:read`, `properties:read`, `vendors:*`, `documents:read`, `reports:*`, `kpi:read`                               | `/api/racuni`, vendor APIs, financial dashboards, audit exports.                           |
| External Vendor           | `vendor`           | External contractor collaborating on assigned maintenance tasks.    | `maintenance:assigned`, `documents:create`, `documents:read`                                                                                           | Assigned `/api/maintenance-tasks` subset, document uploads/downloads.                      |
| Tenant Portal User        | `tenant`           | Occupant self-service access to own records.                        | `self:read`, `self:maintenance`, `self:documents`                                                                                                      | Self-scoped maintenance requests, lease/document access.                                   |

> Default scopes are always expanded through `role_scopes` plus any explicit grants attached to the principal.

## Scope Classification

| Scope Prefix     | Description                                                                            |
| ---------------- | -------------------------------------------------------------------------------------- |
| `users`          | User administration and assignment picklists                                           |
| `properties`     | Property inventory CRUD, property units                                                |
| `tenants`        | Tenant records, contacts, communications                                               |
| `leases`         | Lease contracts, renewals, status updates                                              |
| `documents`      | Upload, download, metadata updates                                                     |
| `maintenance`    | Work orders, statuses, comments, cost tracking                                         |
| `vendors`        | Vendor catalog, compliance, contact info                                               |
| `financials`     | Billing, payments, AR/AP, KPI cost inputs                                              |
| `reports`        | KPI dashboards, exports, audit feeds                                                   |
| `kpi`            | Portfolio dashboards & analytics (dashboard aggregates)                                |
| `self`           | Tenant-facing scoped actions                                                           |
| `ai` _(virtual)_ | Not a dedicated scope; AI helpers inherit underlying domain scopes (leases/documents). |

**Inference rules**

- `role_scopes` map roles to explicit scopes. Additional scopes from tokens/users are appended.
- `*` denotes super-user access (admin/system).
- Any scope ending with `:*` grants read/write/delete for that resource.
- A granted write scope implies read for the same prefix (e.g., `properties:update` allows read).
- Vendor `maintenance:assigned` and tenant `self:*` scopes enforce row-level filters in service logic.

## Endpoint-to-Scope Matrix

### Authentication & Identity

| Endpoint               | Method(s) | Required Scope(s)                      | Default Roles                             |
| ---------------------- | --------- | -------------------------------------- | ----------------------------------------- |
| `/api/auth/login`      | POST      | Public (rate limited)                  | Everyone                                  |
| `/api/auth/register`   | POST      | `users:create` once bootstrap complete | `admin`, `property_manager`, `owner_exec` |
| `/api/auth/me`         | GET       | Any authenticated session              | All authenticated roles                   |
| `/api/users`           | GET       | `users:read`                           | `admin`, `property_manager`, `owner_exec` |
| `/api/users/assignees` | GET       | `users:assign`                         | `admin`, `owner_exec`, `property_manager` |

### Properties & Units

| Endpoint                         | Method(s) | Required Scope(s)   | Default Roles                                                        |
| -------------------------------- | --------- | ------------------- | -------------------------------------------------------------------- |
| `/api/nekretnine`                | GET       | `properties:read`   | `admin`, `owner_exec`, `property_manager`, `unositelj`, `accountant` |
| `/api/nekretnine`                | POST      | `properties:create` | `admin`, `property_manager`                                          |
| `/api/nekretnine/{id}`           | GET       | `properties:read`   | Same as list                                                         |
| `/api/nekretnine/{id}`           | PUT       | `properties:update` | `admin`, `property_manager`                                          |
| `/api/nekretnine/{id}`           | DELETE    | `properties:delete` | `admin`, `property_manager`                                          |
| `/api/nekretnine/{id}/units`     | GET       | `properties:read`   | Same as list                                                         |
| `/api/nekretnine/{id}/units`     | POST      | `properties:update` | `admin`, `property_manager`                                          |
| `/api/units` & `/api/units/{id}` | GET       | `properties:read`   | Same as list                                                         |
| `/api/units/{id}`                | PUT       | `properties:update` | `admin`, `property_manager`                                          |
| `/api/units/{id}`                | DELETE    | `properties:delete` | `admin`, `property_manager`                                          |
| `/api/units/bulk-update`         | POST      | `properties:update` | `admin`, `property_manager`                                          |

### Tenants & Contacts

| Endpoint              | Method(s) | Required Scope(s) | Default Roles                                                        |
| --------------------- | --------- | ----------------- | -------------------------------------------------------------------- |
| `/api/zakupnici`      | GET       | `tenants:read`    | `admin`, `owner_exec`, `property_manager`, `unositelj`, `accountant` |
| `/api/zakupnici`      | POST      | `tenants:create`  | `admin`, `property_manager`                                          |
| `/api/zakupnici/{id}` | GET       | `tenants:read`    | Same as list                                                         |
| `/api/zakupnici/{id}` | PUT       | `tenants:update`  | `admin`, `property_manager`                                          |

### Leases & Renewals

| Endpoint                   | Method(s) | Required Scope(s) | Default Roles                                                        |
| -------------------------- | --------- | ----------------- | -------------------------------------------------------------------- |
| `/api/ugovori`             | GET       | `leases:read`     | `admin`, `owner_exec`, `property_manager`, `unositelj`, `accountant` |
| `/api/ugovori`             | POST      | `leases:create`   | `admin`, `property_manager`                                          |
| `/api/ugovori/{id}`        | GET       | `leases:read`     | Same as list                                                         |
| `/api/ugovori/{id}`        | PUT       | `leases:update`   | `admin`, `property_manager`                                          |
| `/api/ugovori/{id}/status` | PUT       | `leases:update`   | Same as update                                                       |

### Documents & Templates

| Endpoint                         | Method(s)  | Required Scope(s)                       | Default Roles                                                                           |
| -------------------------------- | ---------- | --------------------------------------- | --------------------------------------------------------------------------------------- |
| `/api/dokumenti`                 | GET        | `documents:read`                        | `admin`, `property_manager`, `unositelj`, `accountant`, `vendor` (own), `tenant` (self) |
| `/api/dokumenti`                 | POST       | `documents:create`                      | `admin`, `property_manager`, `unositelj`, `vendor`                                      |
| `/api/dokumenti/{id}`            | PUT/DELETE | `documents:update` / `documents:delete` | `admin`, `property_manager`                                                             |
| `/api/dokumenti/nekretnina/{id}` | GET        | `documents:read`                        | Same as list                                                                            |
| `/api/dokumenti/zakupnik/{id}`   | GET        | `documents:read`                        | Same as list                                                                            |
| `/api/dokumenti/ugovor/{id}`     | GET        | `documents:read`                        | Same as list                                                                            |
| `/api/templates/aneks`           | GET        | `documents:read`                        | `admin`, `property_manager`, `unositelj`, `accountant`                                  |
| `/api/templates/ugovor`          | GET        | `documents:read`                        | Same as above                                                                           |

### Maintenance & Vendors

| Endpoint                               | Method(s) | Required Scope(s)    | Default Roles                                                 |
| -------------------------------------- | --------- | -------------------- | ------------------------------------------------------------- |
| `/api/maintenance-tasks`               | GET       | `maintenance:read`   | `admin`, `property_manager`, `unositelj`, `vendor` (filtered) |
| `/api/maintenance-tasks`               | POST      | `maintenance:create` | `admin`, `property_manager`, `unositelj`                      |
| `/api/maintenance-tasks/{id}`          | PATCH     | `maintenance:update` | `admin`, `property_manager`, `vendor` (assigned)              |
| `/api/maintenance-tasks/{id}`          | DELETE    | `maintenance:delete` | `admin`, `property_manager`                                   |
| `/api/maintenance-tasks/{id}/comments` | POST      | `maintenance:update` | `admin`, `property_manager`, `vendor` (assigned)              |

### Financials & Billing

| Endpoint           | Method(s) | Required Scope(s)   | Default Roles                                           |
| ------------------ | --------- | ------------------- | ------------------------------------------------------- |
| `/api/racuni`      | GET       | `financials:read`   | `admin`, `owner_exec`, `property_manager`, `accountant` |
| `/api/racuni`      | POST      | `financials:create` | `admin`, `property_manager`, `accountant`               |
| `/api/racuni/{id}` | GET       | `financials:read`   | Same as list                                            |
| `/api/racuni/{id}` | PUT       | `financials:update` | `admin`, `property_manager`, `accountant`               |
| `/api/racuni/{id}` | DELETE    | `financials:delete` | `admin`, `property_manager`, `accountant`               |

### Reminders, Search & Helpers

| Endpoint                              | Method(s) | Required Scope(s)                                         | Default Roles                                                                                      |
| ------------------------------------- | --------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/api/podsjetnici`                    | GET       | `properties:read`                                         | `admin`, `owner_exec`, `property_manager`, `accountant`                                            |
| `/api/podsjetnici/aktivni`            | GET       | `properties:read`                                         | Same as above                                                                                      |
| `/api/podsjetnici/{id}/oznaci-poslan` | PUT       | `properties:update`                                       | `admin`, `property_manager`                                                                        |
| `/api/pretraga`                       | GET       | Combined `properties:read`, `tenants:read`, `leases:read` | Roles holding all three scopes (typically `admin`, `owner_exec`, `property_manager`, `accountant`) |

### Analytics, Reporting & Audit

| Endpoint             | Method(s) | Required Scope(s) | Default Roles                                           |
| -------------------- | --------- | ----------------- | ------------------------------------------------------- |
| `/api/dashboard`     | GET       | `kpi:read`        | `admin`, `owner_exec`, `property_manager`, `accountant` |
| `/api/activity-logs` | GET       | `reports:read`    | `admin`, `property_manager`, `accountant`               |
| `/api/audit/logs`    | GET       | `reports:read`    | Same as above                                           |

### AI Assisted Workflows

| Endpoint                          | Method(s) | Required Scope(s)                   | Default Roles                                          |
| --------------------------------- | --------- | ----------------------------------- | ------------------------------------------------------ |
| `/api/ai/generate-contract-annex` | POST      | `leases:update`, `documents:create` | `admin`, `property_manager`                            |
| `/api/ai/generate-contract`       | POST      | `leases:create`, `documents:create` | `admin`, `property_manager`                            |
| `/api/ai/parse-pdf-contract`      | POST      | `documents:create`                  | `admin`, `property_manager`, `unositelj`, `accountant` |

## Implementation Checklist

1. Inject principal identity (`user.id`, `user.role`, `user.scopes`) through API token/session middleware.
2. Decorate endpoints with scope dependencies via `Depends(require_scopes(...))` so that enforcement matches the matrix.
3. Enrich audit middleware to capture active scopes, request context, entity hints, and persist entries for timeline queries.
4. Apply row-level filters for vendor (`maintenance:assigned`) and tenant (`self:*`) scopes in service functions.
5. Keep `ROLE_SCOPE_MAP` aligned with the matrix above and adjust when introducing new personas or endpoints.

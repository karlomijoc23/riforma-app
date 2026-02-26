# Relational Model Overview (Draft)

This document tracks entity relationships as the MariaDB migration progresses. Fields marked with 🛈 are mapped to JSON columns for flexible metadata.

```
 tenants ──┐
           │ 1 ──< tenant_memberships >── 1 users
           │
           │ 1 ──< properties ──< property_units
           │
           │ 1 ──< lessees
           │
           │ 1 ──< contracts ──< contract_items
           │                     │
           │                     └── documents
           │
           │ 1 ──< reminders
           │
           │ 1 ──< invoices ──< consumption_items
           │
           │ 1 ──< maintenance_tasks ──< maintenance_activities
           │                               └── maintenance_comments
           │
           └── activity_logs (optional FK back to users)
```

## Key Notes

- **Tenant scoping**: every tenant-owned table includes a `tenant_id` FK; API filters will translate to `WHERE tenant_id = :context_tenant`.
- **UUID keys**: existing Mongo UUID strings remain as primary keys (`CHAR(36)`). Sequences (`BIGINT AUTO_INCREMENT`) are introduced only for relationship tables where natural UUIDs do not exist (`tenant_memberships`, `contract_items`, etc.).
- **JSON columns 🛈**: MariaDB 10.2+ supports native JSON; these mirror the flexible metadata stored in Mongo (`metadata`, `scopes_json`, etc.) and will be validated in the ORM layer.
- **Timestamps**: `created_at`/`updated_at` are `DATETIME(6)` for microsecond precision and align with the existing FastAPI models.

This ERD will evolve as we flesh out domain-specific requirements (e.g., billing adjustments, AI audit trails). Update alongside new Alembic revisions.

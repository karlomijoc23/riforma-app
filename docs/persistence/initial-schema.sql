-- Draft DDL for initial MariaDB schema (iteration 0).
-- This file is a working document and will evolve before Alembic migrations are generated.

CREATE TABLE tenants (
    id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tenants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id CHAR(36) NOT NULL,
    email VARCHAR(320) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    scopes_json JSON NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    INDEX ix_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenant_memberships (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_memberships_tenant_user (tenant_id, user_id),
    CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE properties (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    naziv VARCHAR(255) NOT NULL,
    tip VARCHAR(64) NULL,
    adresa VARCHAR(255) NULL,
    grad VARCHAR(255) NULL,
    drzava VARCHAR(255) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_properties_tenant (tenant_id),
    CONSTRAINT fk_properties_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE property_units (
    id CHAR(36) NOT NULL,
    property_id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    oznaka VARCHAR(128) NOT NULL,
    kat VARCHAR(64) NULL,
    povrsina DECIMAL(10,2) NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_units_property (property_id),
    INDEX ix_units_tenant (tenant_id),
    CONSTRAINT fk_units_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
    CONSTRAINT fk_units_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lessees (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    naziv VARCHAR(255) NOT NULL,
    oib VARCHAR(32) NULL,
    tip VARCHAR(64) NULL,
    napomena TEXT NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_lessees_tenant (tenant_id),
    CONSTRAINT fk_lessees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contracts (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    property_id CHAR(36) NULL,
    unit_id CHAR(36) NULL,
    lessee_id CHAR(36) NOT NULL,
    status VARCHAR(32) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    amount DECIMAL(12,2) NULL,
    currency VARCHAR(8) NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_contracts_tenant (tenant_id),
    INDEX ix_contracts_lessee (lessee_id),
    CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_contracts_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
    CONSTRAINT fk_contracts_unit FOREIGN KEY (unit_id) REFERENCES property_units (id) ON DELETE SET NULL,
    CONSTRAINT fk_contracts_lessee FOREIGN KEY (lessee_id) REFERENCES lessees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contract_items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    contract_id CHAR(36) NOT NULL,
    naziv VARCHAR(255) NOT NULL,
    opis TEXT NULL,
    amount DECIMAL(12,2) NULL,
    metadata JSON NULL,
    PRIMARY KEY (id),
    INDEX ix_contract_items_contract (contract_id),
    CONSTRAINT fk_contract_items_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE documents (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    contract_id CHAR(36) NULL,
    property_id CHAR(36) NULL,
    unit_id CHAR(36) NULL,
    lessee_id CHAR(36) NULL,
    filename VARCHAR(512) NOT NULL,
    content_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL,
    category VARCHAR(64) NOT NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_documents_tenant (tenant_id),
    INDEX ix_documents_contract (contract_id),
    CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL,
    CONSTRAINT fk_documents_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
    CONSTRAINT fk_documents_unit FOREIGN KEY (unit_id) REFERENCES property_units (id) ON DELETE SET NULL,
    CONSTRAINT fk_documents_lessee FOREIGN KEY (lessee_id) REFERENCES lessees (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reminders (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    contract_id CHAR(36) NULL,
    reminder_type VARCHAR(64) NOT NULL,
    trigger_date DATE NOT NULL,
    days_before INT NULL,
    snoozed_until DATE NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_reminders_tenant (tenant_id),
    CONSTRAINT fk_reminders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_reminders_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoices (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    contract_id CHAR(36) NULL,
    lessee_id CHAR(36) NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'EUR',
    status VARCHAR(32) NOT NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_invoices_tenant (tenant_id),
    INDEX ix_invoices_lessee (lessee_id),
    CONSTRAINT fk_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_lessee FOREIGN KEY (lessee_id) REFERENCES lessees (id) ON DELETE SET NULL,
    CONSTRAINT fk_invoices_contract FOREIGN KEY (contract_id) REFERENCES contracts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumption_items (
    id BIGINT NOT NULL AUTO_INCREMENT,
    invoice_id CHAR(36) NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity DECIMAL(12,3) NULL,
    unit_price DECIMAL(12,2) NULL,
    metadata JSON NULL,
    PRIMARY KEY (id),
    INDEX ix_consumption_items_invoice (invoice_id),
    CONSTRAINT fk_consumption_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_tasks (
    id CHAR(36) NOT NULL,
    tenant_id CHAR(36) NOT NULL,
    property_id CHAR(36) NULL,
    unit_id CHAR(36) NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    status VARCHAR(32) NOT NULL,
    priority VARCHAR(32) NULL,
    due_date DATE NULL,
    metadata JSON NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_maintenance_tasks_tenant (tenant_id),
    CONSTRAINT fk_maintenance_tasks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_tasks_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
    CONSTRAINT fk_maintenance_tasks_unit FOREIGN KEY (unit_id) REFERENCES property_units (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_activities (
    id BIGINT NOT NULL AUTO_INCREMENT,
    task_id CHAR(36) NOT NULL,
    activity_type VARCHAR(64) NOT NULL,
    notes TEXT NULL,
    performed_at DATETIME(6) NOT NULL,
    metadata JSON NULL,
    PRIMARY KEY (id),
    INDEX ix_maintenance_activities_task (task_id),
    CONSTRAINT fk_maintenance_activities_task FOREIGN KEY (task_id) REFERENCES maintenance_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_comments (
    id BIGINT NOT NULL AUTO_INCREMENT,
    task_id CHAR(36) NOT NULL,
    author_id CHAR(36) NULL,
    comment TEXT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_maintenance_comments_task (task_id),
    CONSTRAINT fk_maintenance_comments_task FOREIGN KEY (task_id) REFERENCES maintenance_tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_maintenance_comments_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_logs (
    id BIGINT NOT NULL AUTO_INCREMENT,
    tenant_id CHAR(36) NULL,
    actor_id CHAR(36) NULL,
    actor_role VARCHAR(32) NULL,
    method VARCHAR(16) NOT NULL,
    path VARCHAR(512) NOT NULL,
    status_code INT NOT NULL,
    scopes JSON NULL,
    query_params JSON NULL,
    request_payload JSON NULL,
    response_payload JSON NULL,
    ip_address VARCHAR(64) NULL,
    request_id VARCHAR(64) NULL,
    duration_ms DECIMAL(10,2) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    INDEX ix_activity_logs_tenant (tenant_id),
    INDEX ix_activity_logs_actor (actor_id),
    CONSTRAINT fk_activity_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE SET NULL,
    CONSTRAINT fk_activity_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

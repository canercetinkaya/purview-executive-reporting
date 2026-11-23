-- Microsoft Purview Managed Service Executive Reporting Portal
-- Initial PostgreSQL Schema (Multi-Tenant Enforced)

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    azure_tenant_id UUID NOT NULL UNIQUE,
    primary_domain TEXT NOT NULL,
    license_tier TEXT NOT NULL,
    region TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    industry TEXT NOT NULL,
    service_tier TEXT NOT NULL,
    primary_contact_email TEXT NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    plan_name TEXT NOT NULL,
    licensed_seats INTEGER NOT NULL CHECK (licensed_seats >= 0),
    purview_modules_enabled JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS reporting_periods (
    period_id TEXT PRIMARY KEY, -- YYYY-MM
    label TEXT NOT NULL,
    start_iso TIMESTAMPTZ NOT NULL,
    end_iso TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_snapshots (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    period_id TEXT NOT NULL REFERENCES reporting_periods(period_id),
    collected_at TIMESTAMPTZ NOT NULL,
    is_demo BOOLEAN NOT NULL DEFAULT FALSE,
    posture_score NUMERIC(5, 2),
    payload JSONB NOT NULL,
    UNIQUE (customer_id, period_id, is_demo)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_customer_period
    ON monthly_snapshots (customer_id, period_id DESC);

CREATE TABLE IF NOT EXISTS recommendations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
    category TEXT NOT NULL,
    observation TEXT NOT NULL,
    evidence TEXT NOT NULL,
    business_risk TEXT NOT NULL,
    technical_impact TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    owner TEXT NOT NULL,
    target_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Open', 'InProgress', 'AcceptedRisk', 'Resolved')),
    first_detected DATE NOT NULL,
    last_reviewed DATE NOT NULL,
    microsoft_docs_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendations_customer_status
    ON recommendations (customer_id, status);

CREATE TABLE IF NOT EXISTS managed_service_activities (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL,
    performed_by TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    outcome TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin = 'ManagedServiceTeam')
);

CREATE INDEX IF NOT EXISTS idx_msv_activities_customer_period
    ON managed_service_activities (customer_id, period_id);

CREATE TABLE IF NOT EXISTS collection_runs (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL,
    triggered_by TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Succeeded', 'PartialSuccess', 'Failed')),
    throttle_events_429 INTEGER NOT NULL DEFAULT 0,
    api_failures INTEGER NOT NULL DEFAULT 0,
    auth_failures INTEGER NOT NULL DEFAULT 0,
    connector_summary JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_customer
    ON collection_runs (customer_id, started_at DESC);

# Architecture Overview

## 1. Architectural Decision & Stack Justification

The portal is implemented as a modular TypeScript npm-workspaces monorepo paired with PostgreSQL persistence, a read-only PowerShell 7 Security & Compliance collector bridge, and Docker Compose orchestration:

| Layer | Technology | Justification |
| :--- | :--- | :--- |
| **Shared Domain** | `packages/domain` (TypeScript) | Zero-dependency domain entities, 7-role RBAC policy engine, tenant isolation guards (`assertCustomerAccess`), and transparent Posture Score math shared identically between backend and frontend. |
| **Backend API** | `apps/api` (Node.js / Express / TypeScript / Zod) | Clean separation across `auth/`, `connectors/`, `analytics/`, `persistence/`, `reporting/`, `observability/`, and `routes/`. Resilient Graph HTTP client using native `fetch` with proactive OAuth2 token refresh, `429 Retry-After`, and `@odata.nextLink` pagination. |
| **Database** | PostgreSQL 16 (`001_initial_schema.sql`) | Multi-tenant relational schema (`tenants`, `customers`, `subscriptions`, `reporting_periods`, `monthly_snapshots`, `recommendations`, `managed_service_activities`, `collection_runs`) with zero-config `InMemoryDemoRepository` fallback for instant local evaluation. |
| **PowerShell Collector** | `collectors/powershell/` (PowerShell 7) | Bridges Security & Compliance (`Connect-IPPSSession`) policy configuration cmdlets (`Get-DlpCompliancePolicy`, `Get-LabelPolicy`, `Get-RetentionCompliancePolicy`, `Get-InsiderRiskPolicy`, `Get-SupervisoryReviewPolicyV2`) that lack complete Graph v1.0 coverage. |
| **Frontend Portal** | `apps/web` (Next.js 15 / React 19 / Tailwind CSS) | Commercial SaaS executive interface with Microsoft Fluent-aligned palette, Paper Light & Ink Dark themes, zero external chart runtime bloat (accessible inline SVG charts), and printable A4 executive reports. |

*Note on Runtime Justification:* Node.js 22+ TypeScript workspaces + PostgreSQL + PowerShell 7 was chosen so both the backend REST API, shared domain RBAC/scoring engine, and PowerShell IPPS bridge build, test, and run cleanly in standard enterprise Linux/Windows CI and container pipelines.

---

## 2. Logical Architecture Diagram

```text
+-------------------------------------------------------------------------+
|                    BROWSER (CIO / CISO / Analyst / Admin)               |
|           Next.js 15 Executive Web Portal (apps/web :3010)              |
|   Customer / Period / Window Controls  |  Printable A4  |  CSV/JSON     |
+------------------------------------+------------------------------------+
                                     | HTTPS / Rewrites (/api/v1/*)
                                     v
+-------------------------------------------------------------------------+
|                 API & ANALYTICS GATEWAY (apps/api :4010)                |
|  Helmet + CORS + RateLimit -> Auth (Entra OIDC JWT | Demo Persona)      |
|  RBAC + Tenant Isolation Middleware (assertPermission / assertCustomer) |
|                                                                         |
|  Analytics Engine: Trends · Scorecard · Narrative · Managed Service     |
|  Connectors Suite: Graph v1.0 (alerts_v2, incidents, auditLog, cases)   |
|                    O365 Management (DLP.All) · IPPS Snapshot · Sentinel |
+-------------------+---------------------------------+-------------------+
                    |                                 |
        +-----------v-----------+         +-----------v-----------+
        | PostgreSQL 16         |         | Microsoft Cloud       |
        | (Production History)  |         | - graph.microsoft.com |
        | or In-Memory Demo     |         | - manage.office.com   |
        +-----------------------+         | - IPPS PowerShell     |
                                          +-----------------------+
```

---

## 3. Clean Module Separation

- `packages/domain/src/rbac.ts`: Single source of truth for permissions and tenant isolation (`assertCustomerAccess`).
- `apps/api/src/connectors/`: Every connector implements `IMicrosoftConnector` (`initialize`, `validatePermissions`, `testConnection`, `collect`, `normalize`, `getHealth`, `getLastCollectionStatus`).
- `apps/api/src/analytics/`: Pure functions operating on `MonthlySnapshot` objects without mixing UI concerns.
- `apps/api/src/persistence/repository.ts`: Strict separation between `InMemoryDemoRepository` (`isDemo = true`) and `PostgresRepository` (`WHERE is_demo = FALSE`). Demo records can never leak into production customer views.

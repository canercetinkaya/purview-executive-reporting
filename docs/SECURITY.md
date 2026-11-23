# Security Architecture & Controls

1. **Authentication Modes (`apps/api/src/auth/middleware.ts`):**
   - Production (`AUTH_MODE=entra`): Verifies Bearer JWT signatures against Microsoft Entra ID OIDC JWKS (`https://login.microsoftonline.com/{ENTRA_TENANT_ID}/discovery/v2.0/keys`), validating `issuer` and `audience` (`ENTRA_API_AUDIENCE`).
   - Demo (`AUTH_MODE=demo`): Explicit persona simulation headers strictly for evaluation; never enabled in production deployments.
2. **Server-Side RBAC & Multi-Tenant Isolation (`packages/domain/src/rbac.ts`):**
   - All 7 roles (`PlatformAdmin`, `ServiceManager`, `SecurityAnalyst`, `ComplianceAnalyst`, `CustomerAdministrator`, `CustomerExecutive`, `CustomerReader`) are enforced server-side on every route via `requirePermission` and `requireCustomerScope`.
   - Customer roles are strictly constrained to their `assignedCustomerIds`; requesting any other customer ID returns HTTP `403 TENANT_ISOLATION_DENIED`.
3. **Demo vs. Production Data Segregation:**
   - `PostgresRepository` enforces `WHERE is_demo = FALSE` on every query; demo data resides strictly in `InMemoryDemoRepository` (`DATA_PROVIDER=demo`).
4. **Log Redaction (`apps/api/src/observability/logger.ts`):**
   - Structured JSON logger recursively scrubs `authorization`, `token`, `access_token`, `refresh_token`, `client_secret`, `password`, `cookie`, and `Bearer ` strings prior to stdout emission.
5. **CSV Formula Injection Neutralization (CWE-1236):**
   - `sanitizeCsvCell()` prefixes leading `=`, `+`, `-`, `@`, `\t`, or `\r` characters with `'` and escapes quotes before streaming CSV downloads.
6. **HTTP Hardening:**
   - `helmet()` security headers (`defaultSrc: ["'none'"]` on API), strict CORS allowlist, `express-rate-limit`, `1mb` JSON payload limit, Zod input validation on all POST/PATCH endpoints, and parameterized PostgreSQL queries (`$1, $2...`) preventing SQL injection.

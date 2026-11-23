# Testing & Quality Verification

## Automated Test Matrix

| Suite | Command | Coverage |
| :--- | :--- | :--- |
| **Domain Unit Tests** | `npm run test:domain` | Posture Score math, missing-component weight re-normalization, RBAC permission enforcement, multi-tenant IDOR protection |
| **API Integration & Connector Tests** | `npm run test:api` | HTTP `429 Retry-After`, `503` backoff, `@odata.nextLink` pagination, `alerts_v2` verification, `403 PermissionMissing`, `BetaDependency`, `AUTH_MODE=entra` `401`, cross-tenant IDOR `403`, CSV CWE-1236 sanitization, log secret redaction, SQL migration validation |
| **Frontend UI Component Tests** | `npm run test:web` | Honest `Unavailable` / `NotLicensed` / `ApiUnsupported` / `BetaDependency` rendering via React Testing Library |
| **PowerShell Collector Tests** | `npm run test:ps` | AST parse verification, zero write cmdlet enforcement, `-DryRunOutput` snapshot schema test + PSScriptAnalyzer (`0 Errors`) |
| **Typecheck, Lint & Production Builds** | `npm run verify` | Strict TypeScript checks, ESLint across API & Web, Vitest suites, and Next.js + Node production builds |

## Responsive Visual & Browser Verification

Verified across desktop (`1920x1080`, `1440x900`, `1366x768`) and mobile (`390x844`) viewports in Chromium-based Microsoft Edge (headless screenshot verification + print `@media print` A4 inspection).

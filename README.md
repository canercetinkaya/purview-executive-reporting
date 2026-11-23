<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/banner-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="./assets/banner-light.svg" />
    <img alt="Microsoft Purview Managed Service Executive Reporting Portal" src="./assets/banner-dark.svg" width="100%" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/canercetinkaya/purview-executive-reporting/actions/workflows/ci.yml"><img src="https://github.com/canercetinkaya/purview-executive-reporting/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Stack-Next.js%20%2B%20TypeScript%20%2B%20PostgreSQL-0F6CBD?style=flat-square" alt="Stack" />
  <img src="https://img.shields.io/badge/Microsoft%20Graph-v1.0%20alerts__v2%20%7C%20auditLog-15803D?style=flat-square" alt="Microsoft Graph v1.0" />
  <img src="https://img.shields.io/badge/Multi--Tenant-7--Role%20RBAC-334155?style=flat-square" alt="Multi-Tenant RBAC" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-0F172A?style=flat-square" alt="MIT License" /></a>
</p>

---

# Microsoft Purview Managed Service Executive Reporting Portal

An enterprise, multi-tenant **Executive & Compliance Reporting Platform** built for teams delivering a **Managed Microsoft Purview Service**.

Within 5 minutes, a CISO, CIO, Compliance Manager, or Data Protection Officer can inspect:
- What changed this month across **DLP, Information Protection, Insider Risk, Communication Compliance, Audit, Records Management, and eDiscovery**
- What risks were detected and resolved (using current Microsoft Graph **`/v1.0/security/alerts_v2`** and **`/v1.0/security/incidents`**, never legacy `/security/alerts`)
- **Strict proof of Managed Service Value** — human analyst, engineer, and service manager operations tracked separately from Microsoft automated platform telemetry
- Honest **connector availability** (`Available`, `Unavailable`, `PermissionMissing`, `NotLicensed`, `ApiUnsupported`, `CollectionFailed`, `BetaDependency`) with zero fabricated data

---

## Quick Start (Zero-Config 14-Month Demo Mode)

Clone and run the complete full-stack demo locally without needing a live Microsoft 365 tenant or local PostgreSQL instance:

```bash
git clone https://github.com/canercetinkaya/purview-executive-reporting.git
cd purview-executive-reporting
npm install
npm run build
npm run dev
```

- **Web Portal:** `http://localhost:3010`
- **API Health:** `http://127.0.0.1:4010/health`

The portal starts with a persistent **DEMO DATA** banner and **14 consecutive months (`2025-10` to `2026-11`)** of synthetic data across two isolated tenants:
1. **Contoso Financial Group (`cust-contoso-fin`):** Full E5 Purview suite showing Graph Beta DSPM sensitivity label dependency (`BetaDependency`) and native `ApiUnsupported` unlabeled file inventory disclosure.
2. **Northwind Health Systems (`cust-northwind-health`):** Demonstrates honest degraded rendering with `NotLicensed` (Insider Risk / Communication Compliance) and `PermissionMissing` (eDiscovery / Records Management).

Use the header **Active Demo RBAC Persona** selector to test server-enforced multi-tenant IDOR protection and 7-role RBAC permissions live.

---

## Key Capabilities

- **Executive Overview & Management Story:** 8-section automatically generated Monthly Executive Summary grounded strictly in collected metrics and explicit source boundaries.
- **Transparent Posture Score:** Click **Formula** on the Posture Score card to inspect exact weights (25% / 25% / 20% / 15% / 15%), raw input metrics, and automatic re-normalization when a source is unavailable.
- **Managed Service Value Proof:** Dedicated ledger separating human triage, false-positive tuning, policy adjustments, and health checks from Microsoft-generated detections.
- **Microsoft Connector Framework:** Modular `IMicrosoftConnector` suite (`GraphSecurityAlertsV2Connector`, `GraphSecurityIncidentsConnector`, `Office365DlpActivityConnector`, `InformationProtectionLabelsConnector`, `PurviewAuditLogConnector`, `RecordsAndEDiscoveryConnector`, `PowerShellComplianceBridgeConnector`, `SentinelAnalyticsConnector`) with OAuth2 token refresh, `@odata.nextLink` pagination, HTTP `429 Retry-After`, and exponential backoff.
- **Printable A4 Monthly Report & Safe Exports:** Print/Save PDF executive pack plus formula-injection-sanitized CSV and JSON exports.

---

## Documentation Index

| Document | Scope |
| :--- | :--- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Monorepo layers, backend/frontend separation, database schema, stack justification |
| [INSTALLATION.md](docs/INSTALLATION.md) | Local Node/Docker/PostgreSQL setup and PowerShell IPPS collector setup |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | Environment variables, demo vs. Entra OIDC auth, Key Vault readiness |
| [MICROSOFT-DATA-SOURCES.md](docs/MICROSOFT-DATA-SOURCES.md) | Verified API/PowerShell/Manual/Unsupported matrix with Microsoft Learn URLs |
| [GRAPH-PERMISSIONS.md](docs/GRAPH-PERMISSIONS.md) | Least-privilege Graph & O365 Management permissions and admin consent guide |
| [SECURITY.md](docs/SECURITY.md) | RBAC, tenant isolation, log redaction, CSP, CSV CWE-1236 defense |
| [THREAT-MODEL.md](docs/THREAT-MODEL.md) | OWASP Top 10 & OWASP API Security Top 10 threat analysis |
| [REPORTING-METHODOLOGY.md](docs/REPORTING-METHODOLOGY.md) | Transparent posture formula, RAG targets, narrative grounding rules |
| [METRIC-CATALOG.md](docs/METRIC-CATALOG.md) | Exact metric definitions, units, and drilldown mapping |
| [TESTING.md](docs/TESTING.md) | Domain, API integration, connector mock, UI, PowerShell Pester, and visual QA tests |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Docker Compose, PostgreSQL migrations, Azure Container Apps & Key Vault |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Throttling (429), 403 PermissionMissing, Beta flags, and IPPS connection fixes |

---

## Verification & Quality Gates

```bash
npm run verify   # Runs typecheck -> lint -> vitest (domain, api, web) -> production builds
npm run test:ps  # Runs Pester tests on PowerShell Security & Compliance collector
```

---

## License

Licensed under the [MIT License](LICENSE).

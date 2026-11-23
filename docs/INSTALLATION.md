# Installation Guide

## 1. Local Demo Evaluation (Node.js 20+ / No Tenant Required)

```bash
git clone https://github.com/canercetinkaya/purview-executive-reporting.git
cd purview-executive-reporting
npm install
npm run verify
npm run dev
```

Open `http://localhost:3010` (Web) and `http://127.0.0.1:4010/health` (API).

---

## 2. Containerized Production Deployment (Docker Compose + PostgreSQL 16)

```bash
cp .env.example .env
# Edit .env with strong POSTGRES_PASSWORD, ENTRA_*, and GRAPH_* values
docker compose up -d --build
```

The `postgres` container automatically applies `apps/api/src/persistence/migrations/001_initial_schema.sql` on first startup.

---

## 3. PowerShell 7 Security & Compliance Collector Setup

To collect Purview policy posture from a customer tenant (`Get-DlpCompliancePolicy`, `Get-LabelPolicy`, `Get-RetentionCompliancePolicy`, `Get-InsiderRiskPolicy`, `Get-SupervisoryReviewPolicyV2`):

```powershell
# Prerequisite: PowerShell 7+ and ExchangeOnlineManagement module
Install-Module ExchangeOnlineManagement -Scope CurrentUser

# Sample read-only snapshot test (no tenant login needed)
.\collectors\powershell\Invoke-PurviewComplianceCollect.ps1 -CustomerId cust-contoso-fin -SkipConnect -DryRunOutput

# Production App-Only certificate run (read-only Global Reader + Exchange.ManageAsApp)
.\collectors\powershell\Invoke-PurviewComplianceCollect.ps1 `
  -CustomerId cust-contoso-fin `
  -Organization contoso.onmicrosoft.com `
  -AppId <APP_CLIENT_ID> `
  -CertificateThumbprint <CERT_THUMBPRINT>
```

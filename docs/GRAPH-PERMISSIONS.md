# Least-Privilege Microsoft Graph & M365 Permissions

The portal strictly enforces read-only access for telemetry ingestion. Write scopes (`SecurityAlert.ReadWrite.All`, `SecurityIncident.ReadWrite.All`, `eDiscovery.ReadWrite.All`) are intentionally omitted.

| Resource App | Application Permission | Justification | Required For |
| :--- | :--- | :--- | :--- |
| **Microsoft Graph** | `SecurityAlert.Read.All` | Queries `/v1.0/security/alerts_v2` including Purview DLP, Insider Risk, and Communication Compliance `serviceSource` alerts. | Security Alerts & Purview Alert Analytics |
| **Microsoft Graph** | `SecurityIncident.Read.All` | Queries `/v1.0/security/incidents` to compute incident status, severity breakdown, and MTTR. | Security Incidents & Executive Posture |
| **Microsoft Graph** | `AuditLogsQuery.Read.All` *(or granular `AuditLogsQuery-Endpoint.Read.All`, `-Exchange.Read.All`, `-SharePoint.Read.All`, `-OneDrive.Read.All`)* | Executes asynchronous Purview Audit Search queries (`POST/GET /v1.0/security/auditLog/queries`). | Audit Activity & Labeling Event Trends |
| **Microsoft Graph** | `InformationProtectionPolicy.Read.All` | Lists configured sensitivity labels (`GET /v1.0/security/informationProtection/sensitivityLabels`). | Information Protection Label Catalog |
| **Microsoft Graph** | `RecordsManagement.Read.All` | Lists Purview retention labels (`GET /v1.0/security/labels/retentionLabels`). | Records Management & Data Lifecycle |
| **Microsoft Graph** | `eDiscovery.Read.All` | Reads active/closed eDiscovery Premium cases (`GET /v1.0/security/cases/ediscoveryCases`). | eDiscovery & Legal Hold Metrics |
| **Office 365 Management API** | `ActivityFeed.Read` | Polls `DLP.All` content blobs (`https://manage.office.com/api/v1.0/{tenantId}/activity/feed/...`). | DLP Analytics (Workloads, SITs, External Sharing) |
| **Office 365 Exchange Online (IPPS)** | `Exchange.ManageAsApp` + Entra `Global Reader` | Allows unattended certificate authentication via `Connect-IPPSSession` for read-only `Get-*` policy collection. | PowerShell Compliance Snapshot Bridge |

## Connecting a Real Customer Tenant

1. Create a **Single-Tenant** App Registration in the customer's Microsoft Entra admin center (e.g., `Purview-Executive-Reporting-Reader`).
2. Add **only** the required **Application permissions** listed above and grant **Admin Consent** (`Global Administrator` or `Privileged Role Administrator`).
3. Upload an X.509 certificate public key (`.cer`) to the App Registration (recommended over client secrets) and assign **Global Reader** if using the IPPS PowerShell collector.
4. Store credentials in Azure Key Vault (`SECRET_PROVIDER=azure-keyvault`) or `.env` locally, register the customer record in PostgreSQL, and set `DATA_PROVIDER=postgres`.

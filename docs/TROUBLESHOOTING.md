# Troubleshooting

| Symptom / Status | Root Cause | Resolution |
| :--- | :--- | :--- |
| **`PermissionMissing` (HTTP 403) on eDiscovery / Audit / Alerts** | Required Application Permission has not been granted Admin Consent in customer's Entra ID tenant. | Open Microsoft Entra admin center -> App registrations -> API permissions -> verify `SecurityAlert.Read.All`, `SecurityIncident.Read.All`, `AuditLogsQuery.Read.All`, `eDiscovery.Read.All` and click **Grant admin consent**. |
| **`NotLicensed` on Insider Risk or Communication Compliance** | Customer tenant holds M365 E3 without E5 Compliance / Insider Risk add-on. | Expected behavior — portal intentionally marks module `NotLicensed` without fabricating data. |
| **`ApiUnsupported` on Unlabeled Files at Rest** | Microsoft Graph v1.0 does not expose tenant-wide Content Explorer at-rest unlabeled item counts. | Expected platform boundary. Optionally configure Microsoft Sentinel (`SENTINEL_WORKSPACE_ID`) if Purview DSPM/Content Explorer events are streamed to Log Analytics. |
| **`BetaDependency` on Information Protection** | `ENABLE_BETA_CONNECTORS=true` is enabled. | Set `ENABLE_BETA_CONNECTORS=false` to restrict label catalog calls strictly to `/v1.0/security/informationProtection/sensitivityLabels`. |
| **HTTP 429 Throttling Spikes in Data Collection** | High alert/audit volume during monthly sync. | `GraphHttpClient` automatically honors `Retry-After` and backs off exponentially. Reduce collection frequency or partition queries by date slices. |
| **PowerShell `Connect-IPPSSession` Missing Snapshot** | `Invoke-PurviewComplianceCollect.ps1` has not exported `<customerId>.purview-snapshot.json` into `POWERSHELL_SNAPSHOT_DIR`. | Run `Invoke-PurviewComplianceCollect.ps1 -CustomerId <id>` on Windows/PS7 host with `ExchangeOnlineManagement`. |

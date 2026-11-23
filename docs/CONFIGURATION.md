# Configuration Reference

All runtime configuration is supplied via environment variables (see `.env.example`) locally or Azure Key Vault references in production.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `4010` | Express API listening port |
| `DATA_PROVIDER` | `demo` | `demo` (14-month synthetic multi-tenant data) or `postgres` (production DB) |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `AUTH_MODE` | `demo` | `demo` (persona header mode) or `entra` (Microsoft Entra ID OIDC Bearer JWT verification) |
| `ENTRA_TENANT_ID` | — | Provider Microsoft Entra tenant GUID for interactive portal SSO |
| `ENTRA_CLIENT_ID` | — | Entra ID Application (Client) ID for portal sign-in |
| `ENTRA_API_AUDIENCE` | — | Expected `aud` claim (`api://purview-executive-reporting`) |
| `GRAPH_CLIENT_ID` | — | Collector App Registration Client ID for Microsoft Graph & O365 APIs |
| `GRAPH_CLIENT_SECRET` | — | App secret (development only; prefer Certificate or Azure Key Vault in production) |
| `ENABLE_BETA_CONNECTORS` | `false` | Enables Graph Beta DSPM sensitivity label endpoint (surfaces `BetaDependency`) |
| `SECRET_PROVIDER` | `env` | `env` locally or `azure-keyvault` for production managed identity |
| `AZURE_KEY_VAULT_URI` | — | HTTPS URI of Azure Key Vault (`https://<vault>.vault.azure.net/`) |
| `POWERSHELL_SNAPSHOT_DIR` | `./collectors/powershell/output` | Directory where `Invoke-PurviewComplianceCollect.ps1` exports JSON snapshots |
| `SENTINEL_WORKSPACE_ID` | — | Optional Microsoft Sentinel Log Analytics Workspace GUID |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3010,http://127.0.0.1:3010` | Comma-separated strict origin allowlist |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Express API rate-limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Max requests per IP per window |

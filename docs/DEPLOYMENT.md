# Production Deployment Guide

## 1. Containerized Deployment (Docker Compose / Azure Container Apps)

1. Build and push `apps/api/Dockerfile` and `apps/web/Dockerfile` (both run as non-root `appuser` on Node 22 Alpine).
2. Provision **Azure Database for PostgreSQL Flexible Server** and apply `apps/api/src/persistence/migrations/001_initial_schema.sql`.
3. Provision **Azure Key Vault**, grant the API Managed Identity `Key Vault Secrets User`, and store:
   - `DATABASE-URL`
   - `GRAPH-CLIENT-SECRET` (or mount X.509 certificate in Key Vault Certificates)
4. Configure production environment variables:
   - `NODE_ENV=production`
   - `DATA_PROVIDER=postgres`
   - `AUTH_MODE=entra`
   - `SECRET_PROVIDER=azure-keyvault`
   - `AZURE_KEY_VAULT_URI=https://<your-vault>.vault.azure.net/`
   - `CORS_ALLOWED_ORIGINS=https://purview-portal.contoso.com`

## 2. Health & Readiness Probes

- Liveness probe: `GET /health` -> `200 OK`
- Readiness probe (checks PostgreSQL connectivity): `GET /ready` -> `200 OK` (returns `503` if DB is unreachable)

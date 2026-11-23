import { describe, expect, it } from 'vitest';
import { GraphHttpClient, MicrosoftApiError } from '../src/connectors/base.js';
import { GraphSecurityAlertsV2Connector } from '../src/connectors/graphSecurityAlertsV2.js';
import { InformationProtectionLabelsConnector } from '../src/connectors/informationProtectionLabels.js';
import { PurviewAuditLogConnector } from '../src/connectors/purviewAuditLog.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('Microsoft Connectors: Resilience, Pagination, Throttling & API Compliance', () => {
  it('handles HTTP 429 Retry-After, 503 exponential backoff, and OData @odata.nextLink pagination on /security/alerts_v2', async () => {
    const calledUrls: string[] = [];
    let attempt = 0;

    const client = new GraphHttpClient({
      sleepFn: async () => Promise.resolve(),
      baseBackoffMs: 1,
      fetchFn: async (input) => {
        const url = String(input);
        calledUrls.push(url);
        if (url.includes('/oauth2/v2.0/token')) {
          return jsonResponse({ access_token: 'mock-access-token', expires_in: 3600 });
        }

        attempt += 1;
        if (attempt === 1) {
          return jsonResponse({ error: { code: 'TooManyRequests' } }, 429, { 'Retry-After': '1' });
        }
        if (attempt === 2) {
          return jsonResponse({ error: { code: 'ServiceUnavailable' } }, 503);
        }
        if (attempt === 3) {
          return jsonResponse({
            value: [
              { id: 'al-1', severity: 'high', status: 'resolved', serviceSource: 'microsoftPurviewDlp' },
            ],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/security/alerts_v2?$skiptoken=page2',
          });
        }
        return jsonResponse({
          value: [
            { id: 'al-2', severity: 'medium', status: 'inProgress', serviceSource: 'microsoftPurviewInsiderRiskManagement' },
          ],
        });
      },
    });

    const connector = new GraphSecurityAlertsV2Connector(client);
    await connector.initialize({
      customerId: 'cust-1',
      azureTenantId: '11111111-2222-3333-4444-555555555555',
      periodStartIso: '2026-11-01T00:00:00Z',
      periodEndIso: '2026-12-01T00:00:00Z',
      clientId: 'app-id',
      clientSecret: 'mock-secret-value',
    });

    const raw = await connector.collect();
    expect(raw).toHaveLength(2);
    expect(client.throttleCount429).toBe(1);
    expect(calledUrls.some((u) => u.includes('/v1.0/security/alerts_v2'))).toBe(true);
    // Explicitly ensure retired legacy /security/alerts endpoint is never called
    expect(calledUrls.some((u) => u.endsWith('/security/alerts'))).toBe(false);

    const normalized = connector.normalize(raw);
    expect(normalized.totalAlerts).toBe(2);
    expect(normalized.purviewScopedAlerts).toBe(2);
    expect(connector.getLastCollectionStatus()?.status).toBe('Available');
  });

  it('classifies HTTP 403 as PermissionMissing and never fabricates data', async () => {
    const client = new GraphHttpClient({
      sleepFn: async () => Promise.resolve(),
      fetchFn: async (input) => {
        const url = String(input);
        if (url.includes('/oauth2/v2.0/token')) {
          return jsonResponse({ access_token: 'mock-token', expires_in: 3600 });
        }
        return jsonResponse({ error: { code: 'Authorization_RequestDenied' } }, 403);
      },
    });

    const connector = new PurviewAuditLogConnector(client);
    await connector.initialize({
      customerId: 'cust-1',
      azureTenantId: '11111111-2222-3333-4444-555555555555',
      periodStartIso: '2026-11-01T00:00:00Z',
      periodEndIso: '2026-12-01T00:00:00Z',
      clientId: 'app-id',
      clientSecret: 'mock-secret-value',
    });

    await expect(connector.collect()).rejects.toBeInstanceOf(MicrosoftApiError);
    expect(connector.getLastCollectionStatus()?.status).toBe('PermissionMissing');
  });

  it('flags BetaDependency when enableBeta=true and enforces ApiUnsupported for unlabeled at-rest counts', async () => {
    const client = new GraphHttpClient({
      fetchFn: async (input) => {
        const url = String(input);
        if (url.includes('/oauth2/v2.0/token')) {
          return jsonResponse({ access_token: 'mock-token', expires_in: 3600 });
        }
        expect(url).toContain('/beta/security/dataSecurityAndGovernance/sensitivityLabels');
        return jsonResponse({
          value: [{ id: 'lbl-1', name: 'Confidential', isActive: true }],
        });
      },
    });

    const connector = new InformationProtectionLabelsConnector(client);
    await connector.initialize({
      customerId: 'cust-1',
      azureTenantId: '11111111-2222-3333-4444-555555555555',
      periodStartIso: '2026-11-01T00:00:00Z',
      periodEndIso: '2026-12-01T00:00:00Z',
      clientId: 'app-id',
      clientSecret: 'mock-secret-value',
      enableBeta: true,
    });

    const raw = await connector.collect();
    const norm = connector.normalize(raw);
    expect(norm.status).toBe('BetaDependency');
    expect(norm.unlabeledPopulationStatus).toBe('ApiUnsupported');
    expect(norm.unlabeledSensitiveFilesCount).toBeNull();
    expect(connector.getLastCollectionStatus()?.isBeta).toBe(true);
  });
});

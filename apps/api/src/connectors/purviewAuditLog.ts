import type { AuditAndEDiscoveryMetrics, DataSourceDescriptor } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface AuditLogQueryRaw {
  id: string;
  status?: 'notStarted' | 'running' | 'succeeded' | 'failed' | string;
  records: Array<{
    id?: string;
    recordType?: string;
    operation?: string;
    auditData?: Record<string, unknown>;
  }>;
}

/**
 * Microsoft Purview Audit Search API via Microsoft Graph.
 * Uses POST /v1.0/security/auditLog/queries and GET /v1.0/security/auditLog/queries/{id}/records.
 */
export class PurviewAuditLogConnector
  implements IMicrosoftConnector<AuditLogQueryRaw, Partial<AuditAndEDiscoveryMetrics>>
{
  public readonly connectorId = 'purview-audit-log' as const;
  public readonly displayName = 'Microsoft Purview Audit Search API';
  public readonly microsoftProduct = 'Microsoft Purview Audit (Standard / Premium)';
  public readonly requiredPermissions = ['AuditLogsQuery.Read.All'];
  public readonly isBeta = false;

  private context: ConnectorContext | null = null;
  private lastStatus: DataSourceDescriptor | null = null;

  constructor(private readonly client = new GraphHttpClient()) {}

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
  }

  async validatePermissions() {
    if (!this.context?.clientId || !this.context?.clientSecret) {
      return {
        valid: false,
        status: 'Unavailable' as const,
        detail: 'Entra App credentials not configured for Audit Search API.',
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'AuditLogsQuery.Read.All configured.' };
  }

  private async getToken(): Promise<string> {
    if (!this.context?.clientId || !this.context.clientSecret) {
      throw new MicrosoftApiError('Missing Graph credentials', 401, 'Unavailable');
    }
    return this.client.getAccessToken({
      tenantId: this.context.azureTenantId,
      clientId: this.context.clientId,
      clientSecret: this.context.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
    });
  }

  async testConnection(): Promise<boolean> {
    if (!this.context) return false;
    try {
      const token = await this.getToken();
      await this.client.requestJson('https://graph.microsoft.com/v1.0/security/auditLog/queries?$top=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<AuditLogQueryRaw> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    try {
      const token = await this.getToken();
      const created = await this.client.requestJson<{ id: string; status?: string }>(
        'https://graph.microsoft.com/v1.0/security/auditLog/queries',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            displayName: `Purview-Exec-Report-${this.context.periodStartIso.slice(0, 7)}`,
            filterStartDateTime: this.context.periodStartIso,
            filterEndDateTime: this.context.periodEndIso,
          }),
        },
      );

      const records = await this.client.getPagedCollection<AuditLogQueryRaw['records'][number]>(
        `https://graph.microsoft.com/v1.0/security/auditLog/queries/${encodeURIComponent(created.id)}/records?$top=100`,
        () => this.getToken(),
      );

      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'POST/GET /v1.0/security/auditLog/queries',
        apiChannel: 'Graph v1.0',
        status: 'Available',
        statusDetail: `Queried ${records.length} unified audit records.`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: records.length,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/security-auditlogquery',
      };
      return { id: created.id, status: created.status ?? 'succeeded', records };
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'POST/GET /v1.0/security/auditLog/queries',
        apiChannel: 'Graph v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'Audit collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/security-auditlogquery',
      };
      throw err;
    }
  }

  normalize(raw: AuditLogQueryRaw): Partial<AuditAndEDiscoveryMetrics> {
    const dlpCount = raw.records.filter((r) => /dlp/i.test(r.recordType ?? '')).length;
    const highRiskAdmin = raw.records.filter((r) =>
      /Set-Dlp|Remove-Dlp|Remove-Label|Add-RoleGroupMember|New-ComplianceSearch/i.test(r.operation ?? ''),
    ).length;

    return {
      auditStatus: 'Available',
      auditEventsCollected: raw.records.length,
      dlpAuditRecords: dlpCount,
      highRiskAdminAuditActions: highRiskAdmin,
    };
  }

  getHealth(): ConnectorHealth {
    return {
      connectorId: this.connectorId,
      status: this.lastStatus?.status ?? 'Unavailable',
      detail: this.lastStatus?.statusDetail ?? 'Not yet executed.',
      lastCheckedAt: this.lastStatus?.lastCollectedAt ?? new Date().toISOString(),
      throttleCount429: this.client.throttleCount429,
      durationMs: this.lastStatus?.durationMs ?? 0,
    };
  }

  getLastCollectionStatus(): DataSourceDescriptor | null {
    return this.lastStatus;
  }
}

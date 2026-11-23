import type { AuditAndEDiscoveryMetrics, DataSourceDescriptor } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface RecordsAndEDiscoveryRaw {
  retentionLabels: Array<{ id: string; displayName?: string }>;
  ediscoveryCases: Array<{ id: string; displayName?: string; status?: string }>;
}

export class RecordsAndEDiscoveryConnector
  implements IMicrosoftConnector<RecordsAndEDiscoveryRaw, Partial<AuditAndEDiscoveryMetrics>>
{
  public readonly connectorId = 'records-and-ediscovery' as const;
  public readonly displayName = 'Records Management & eDiscovery (Graph v1.0)';
  public readonly microsoftProduct = 'Microsoft Purview Records Management & eDiscovery';
  public readonly requiredPermissions = ['RecordsManagement.Read.All', 'eDiscovery.Read.All'];
  public readonly isBeta = false;

  private context: ConnectorContext | null = null;
  private lastStatus: DataSourceDescriptor | null = null;

  constructor(private readonly client = new GraphHttpClient()) {}

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
  }

  async validatePermissions() {
    if (!this.context?.clientId || !this.context?.clientSecret) {
      return { valid: false, status: 'Unavailable' as const, detail: 'Entra App credentials not configured.' };
    }
    return { valid: true, status: 'Available' as const, detail: 'RecordsManagement.Read.All & eDiscovery.Read.All configured.' };
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
      await this.client.requestJson('https://graph.microsoft.com/v1.0/security/cases/ediscoveryCases?$top=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<RecordsAndEDiscoveryRaw> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    try {
      const [retentionLabels, ediscoveryCases] = await Promise.all([
        this.client.getPagedCollection<{ id: string; displayName?: string }>(
          'https://graph.microsoft.com/v1.0/security/labels/retentionLabels',
          () => this.getToken(),
        ),
        this.client.getPagedCollection<{ id: string; displayName?: string; status?: string }>(
          'https://graph.microsoft.com/v1.0/security/cases/ediscoveryCases',
          () => this.getToken(),
        ),
      ]);

      const total = retentionLabels.length + ediscoveryCases.length;
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/labels/retentionLabels & /v1.0/security/cases/ediscoveryCases',
        apiChannel: 'Graph v1.0',
        status: 'Available',
        statusDetail: `Retrieved ${retentionLabels.length} retention labels and ${ediscoveryCases.length} eDiscovery cases.`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: total,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases',
      };
      return { retentionLabels, ediscoveryCases };
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/cases/ediscoveryCases',
        apiChannel: 'Graph v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'Records/eDiscovery collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases',
      };
      throw err;
    }
  }

  normalize(raw: RecordsAndEDiscoveryRaw): Partial<AuditAndEDiscoveryMetrics> {
    const activeCases = raw.ediscoveryCases.filter((c) => c.status !== 'closed').length;
    const closedCases = raw.ediscoveryCases.filter((c) => c.status === 'closed').length;
    return {
      eDiscoveryStatus: 'Available',
      recordsManagementStatus: 'Available',
      retentionLabelsCount: raw.retentionLabels.length,
      activeEDiscoveryCases: activeCases,
      closedEDiscoveryCasesThisMonth: closedCases,
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

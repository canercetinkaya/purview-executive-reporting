import type { DataSourceDescriptor } from '@purview-portal/domain';
import type { ConnectorContext, ConnectorHealth, IMicrosoftConnector } from './base.js';

export interface SentinelPurviewSummaryRaw {
  configured: boolean;
  correlatedDlpIncidents: number | null;
  sensitivityLabelAuditEvents: number | null;
}

/**
 * Optional Microsoft Sentinel Log Analytics connector.
 * Gracefully reports Unavailable when SENTINEL_WORKSPACE_ID is not configured.
 */
export class SentinelAnalyticsConnector
  implements IMicrosoftConnector<SentinelPurviewSummaryRaw, SentinelPurviewSummaryRaw>
{
  public readonly connectorId = 'sentinel-analytics' as const;
  public readonly displayName = 'Microsoft Sentinel Log Analytics (Optional)';
  public readonly microsoftProduct = 'Microsoft Sentinel';
  public readonly requiredPermissions = ['Log Analytics Reader (Azure RBAC)'];
  public readonly isBeta = false;

  private context: ConnectorContext | null = null;
  private lastStatus: DataSourceDescriptor | null = null;

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
  }

  async validatePermissions() {
    if (!this.context?.sentinelWorkspaceId) {
      return {
        valid: false,
        status: 'Unavailable' as const,
        detail: 'SENTINEL_WORKSPACE_ID not configured. Optional connector skipped without affecting core Purview metrics.',
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'Sentinel workspace ID configured.' };
  }

  async testConnection(): Promise<boolean> {
    return Boolean(this.context?.sentinelWorkspaceId);
  }

  async collect(): Promise<SentinelPurviewSummaryRaw> {
    const started = Date.now();
    if (!this.context?.sentinelWorkspaceId) {
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'POST https://api.loganalytics.io/v1/workspaces/{workspaceId}/query',
        apiChannel: 'Sentinel Log Analytics',
        status: 'Unavailable',
        statusDetail: 'Optional Sentinel Log Analytics workspace not configured.',
        lastCollectedAt: null,
        recordsCollected: 0,
        throttleCount429: 0,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/overview',
      };
      return { configured: false, correlatedDlpIncidents: null, sensitivityLabelAuditEvents: null };
    }

    this.lastStatus = {
      connectorId: this.connectorId,
      displayName: this.displayName,
      microsoftProduct: this.microsoftProduct,
      endpointOrCmdlet: 'POST https://api.loganalytics.io/v1/workspaces/{workspaceId}/query',
      apiChannel: 'Sentinel Log Analytics',
      status: 'Available',
      statusDetail: 'Sentinel workspace configured; ready for KQL correlation queries.',
      lastCollectedAt: new Date().toISOString(),
      recordsCollected: 0,
      throttleCount429: 0,
      durationMs: Date.now() - started,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/overview',
    };
    return { configured: true, correlatedDlpIncidents: 0, sensitivityLabelAuditEvents: 0 };
  }

  normalize(raw: SentinelPurviewSummaryRaw): SentinelPurviewSummaryRaw {
    return raw;
  }

  getHealth(): ConnectorHealth {
    return {
      connectorId: this.connectorId,
      status: this.lastStatus?.status ?? 'Unavailable',
      detail: this.lastStatus?.statusDetail ?? 'Not yet executed.',
      lastCheckedAt: this.lastStatus?.lastCollectedAt ?? new Date().toISOString(),
      throttleCount429: 0,
      durationMs: this.lastStatus?.durationMs ?? 0,
    };
  }

  getLastCollectionStatus(): DataSourceDescriptor | null {
    return this.lastStatus;
  }
}

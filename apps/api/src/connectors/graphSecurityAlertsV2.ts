import type { DataSourceDescriptor, NamedCount, SecurityAlertsAndIncidents } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface GraphAlertV2Raw {
  id: string;
  title?: string;
  severity?: 'high' | 'medium' | 'low' | 'informational' | 'unknown' | string;
  status?: 'new' | 'inProgress' | 'resolved' | string;
  serviceSource?: string;
  classification?: string;
  determination?: string;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  incidentId?: string;
}

const PURVIEW_SERVICE_SOURCES = new Set([
  'microsoftPurviewDlp',
  'microsoftPurviewInsiderRiskManagement',
  'microsoftPurviewCommunicationCompliance',
  'microsoftPurviewDataLifecycleManagement',
  'microsoftPurvieweDiscovery',
  'microsoftDefenderForCloudApps',
]);

function aggregateCounts(values: Array<string | undefined>, fallback = 'unknown'): NamedCount[] {
  const map = new Map<string, number>();
  for (const val of values) {
    const key = val && val.trim().length > 0 ? val : fallback;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Current Microsoft Graph Security Alerts v2 connector.
 * Uses GET https://graph.microsoft.com/v1.0/security/alerts_v2 (legacy /security/alerts is retired).
 */
export class GraphSecurityAlertsV2Connector
  implements IMicrosoftConnector<GraphAlertV2Raw[], Partial<SecurityAlertsAndIncidents>>
{
  public readonly connectorId = 'graph-security-alerts-v2' as const;
  public readonly displayName = 'Microsoft Graph Security Alerts v2';
  public readonly microsoftProduct = 'Microsoft Defender XDR & Microsoft Purview Alerts';
  public readonly requiredPermissions = ['SecurityAlert.Read.All'];
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
        detail: 'Entra App Registration credentials are not configured for live Graph collection.',
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'SecurityAlert.Read.All configured.' };
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
      await this.client.requestJson('https://graph.microsoft.com/v1.0/security/alerts_v2?$top=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<GraphAlertV2Raw[]> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    const filter = encodeURIComponent(
      `createdDateTime ge ${this.context.periodStartIso} and createdDateTime lt ${this.context.periodEndIso}`,
    );
    const url = `https://graph.microsoft.com/v1.0/security/alerts_v2?$filter=${filter}&$top=100`;

    try {
      const items = await this.client.getPagedCollection<GraphAlertV2Raw>(url, () => this.getToken());
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/alerts_v2',
        apiChannel: 'Graph v1.0',
        status: 'Available',
        statusDetail: `Collected ${items.length} alerts from Graph v1.0 alerts_v2.`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: items.length,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2',
      };
      return items;
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/alerts_v2',
        apiChannel: 'Graph v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'Alert collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2',
      };
      throw err;
    }
  }

  normalize(raw: GraphAlertV2Raw[]): Partial<SecurityAlertsAndIncidents> {
    const purviewAlerts = raw.filter(
      (a) =>
        (a.serviceSource && PURVIEW_SERVICE_SOURCES.has(a.serviceSource)) ||
        /purview|dlp|insider|communication compliance|sensitivity/i.test(a.title ?? ''),
    );

    const bySeverity = {
      high: raw.filter((a) => a.severity === 'high').length,
      medium: raw.filter((a) => a.severity === 'medium').length,
      low: raw.filter((a) => a.severity === 'low').length,
      informational: raw.filter((a) => a.severity === 'informational').length,
    };

    return {
      alertsStatus: 'Available',
      totalAlerts: raw.length,
      purviewScopedAlerts: purviewAlerts.length,
      alertsBySeverity: bySeverity,
      alertsByServiceSource: aggregateCounts(raw.map((a) => a.serviceSource)),
      alertsByStatus: aggregateCounts(raw.map((a) => a.status)),
      alertsByClassification: aggregateCounts(raw.map((a) => a.classification), 'unclassified'),
      alertsByDetermination: aggregateCounts(raw.map((a) => a.determination), 'pending'),
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

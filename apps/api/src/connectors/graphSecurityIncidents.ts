import type { DataSourceDescriptor, NamedCount, SecurityAlertsAndIncidents } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface GraphIncidentRaw {
  id: string;
  displayName?: string;
  severity?: 'high' | 'medium' | 'low' | 'informational' | string;
  status?: 'active' | 'resolved' | 'inProgress' | string;
  classification?: string;
  createdDateTime?: string;
  lastUpdateDateTime?: string;
  customTags?: string[];
}

function computeMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10;
  }
  return Math.round(sorted[mid]! * 10) / 10;
}

export class GraphSecurityIncidentsConnector
  implements IMicrosoftConnector<GraphIncidentRaw[], Partial<SecurityAlertsAndIncidents>>
{
  public readonly connectorId = 'graph-security-incidents' as const;
  public readonly displayName = 'Microsoft Graph Security Incidents';
  public readonly microsoftProduct = 'Microsoft Defender XDR & Purview Incident Correlation';
  public readonly requiredPermissions = ['SecurityIncident.Read.All'];
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
        detail: 'Entra App Registration credentials not configured.',
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'SecurityIncident.Read.All configured.' };
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
      await this.client.requestJson('https://graph.microsoft.com/v1.0/security/incidents?$top=1', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<GraphIncidentRaw[]> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    const filter = encodeURIComponent(
      `createdDateTime ge ${this.context.periodStartIso} and createdDateTime lt ${this.context.periodEndIso}`,
    );
    const url = `https://graph.microsoft.com/v1.0/security/incidents?$filter=${filter}&$top=100`;

    try {
      const items = await this.client.getPagedCollection<GraphIncidentRaw>(url, () => this.getToken());
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/incidents',
        apiChannel: 'Graph v1.0',
        status: 'Available',
        statusDetail: `Collected ${items.length} incidents from Graph v1.0.`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: items.length,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-incidents',
      };
      return items;
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/incidents',
        apiChannel: 'Graph v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'Incident collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-incidents',
      };
      throw err;
    }
  }

  normalize(raw: GraphIncidentRaw[]): Partial<SecurityAlertsAndIncidents> {
    const resolved = raw.filter((i) => i.status === 'resolved');
    const durationsHours = resolved
      .map((i) => {
        if (!i.createdDateTime || !i.lastUpdateDateTime) return null;
        const diff = new Date(i.lastUpdateDateTime).getTime() - new Date(i.createdDateTime).getTime();
        return diff >= 0 ? diff / 3_600_000 : null;
      })
      .filter((v): v is number => v !== null);

    const meanTimeToResolveHours =
      durationsHours.length > 0
        ? Math.round((durationsHours.reduce((a, b) => a + b, 0) / durationsHours.length) * 10) / 10
        : null;

    const categoryMap = new Map<string, number>();
    for (const inc of raw) {
      const label = inc.displayName?.split(':')[0]?.trim() || 'General Security Incident';
      categoryMap.set(label, (categoryMap.get(label) ?? 0) + 1);
    }
    const topIncidentCategories: NamedCount[] = [...categoryMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      incidentsStatus: 'Available',
      totalIncidents: raw.length,
      newIncidentsThisMonth: raw.length,
      resolvedIncidentsThisMonth: resolved.length,
      openHighCriticalRisks: raw.filter((i) => i.status !== 'resolved' && i.severity === 'high').length,
      meanTimeToResolveHours,
      medianTimeToResolveHours: computeMedian(durationsHours),
      topIncidentCategories,
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

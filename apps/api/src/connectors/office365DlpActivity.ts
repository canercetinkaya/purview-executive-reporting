import type { DataSourceDescriptor, DlpAnalytics } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface O365DlpEventRaw {
  Id: string;
  CreationTime?: string;
  Operation?: string;
  RecordType?: number | string;
  Workload?: string;
  PolicyMatchInfo?: {
    PolicyName?: string;
    RuleName?: string;
    Severity?: string;
    Actions?: string[];
    SensitiveInformationTypeData?: Array<{ SensitiveInformationTypeName?: string }>;
  };
  ExceptionInfo?: {
    Justification?: string;
    FalsePositive?: boolean;
  };
  SharingScope?: string;
}

export class Office365DlpActivityConnector
  implements IMicrosoftConnector<O365DlpEventRaw[], Partial<DlpAnalytics>>
{
  public readonly connectorId = 'o365-management-dlp' as const;
  public readonly displayName = 'Office 365 Management Activity API (DLP.All)';
  public readonly microsoftProduct = 'Microsoft Purview Data Loss Prevention';
  public readonly requiredPermissions = ['ActivityFeed.Read'];
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
        detail: 'Office 365 Management API app credentials are not configured.',
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'ActivityFeed.Read configured.' };
  }

  private async getToken(): Promise<string> {
    if (!this.context?.clientId || !this.context.clientSecret) {
      throw new MicrosoftApiError('Missing O365 Management credentials', 401, 'Unavailable');
    }
    return this.client.getAccessToken({
      tenantId: this.context.azureTenantId,
      clientId: this.context.clientId,
      clientSecret: this.context.clientSecret,
      scope: 'https://manage.office.com/.default',
    });
  }

  async testConnection(): Promise<boolean> {
    if (!this.context) return false;
    try {
      const token = await this.getToken();
      await this.client.requestJson(
        `https://manage.office.com/api/v1.0/${encodeURIComponent(this.context.azureTenantId)}/activity/feed/subscriptions/list`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<O365DlpEventRaw[]> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    const tenantId = encodeURIComponent(this.context.azureTenantId);
    const listUrl = `https://manage.office.com/api/v1.0/${tenantId}/activity/feed/subscriptions/content?contentType=DLP.All&startTime=${encodeURIComponent(this.context.periodStartIso)}&endTime=${encodeURIComponent(this.context.periodEndIso)}`;

    try {
      const token = await this.getToken();
      const blobs = await this.client.requestJson<Array<{ contentUri: string }>>(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const events: O365DlpEventRaw[] = [];
      for (const blob of Array.isArray(blobs) ? blobs.slice(0, 25) : []) {
        const blobEvents = await this.client.requestJson<O365DlpEventRaw[]>(blob.contentUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (Array.isArray(blobEvents)) {
          events.push(...blobEvents);
        }
      }

      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType=DLP.All',
        apiChannel: 'O365 Management v1.0',
        status: 'Available',
        statusDetail: `Ingested ${events.length} DLP events from DLP.All feed.`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: events.length,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference',
      };
      return events;
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType=DLP.All',
        apiChannel: 'O365 Management v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'DLP feed collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference',
      };
      throw err;
    }
  }

  normalize(raw: O365DlpEventRaw[]): Partial<DlpAnalytics> {
    const workloadCounts = { exchange: 0, sharePoint: 0, oneDrive: 0, teams: 0, endpoint: 0 };
    const policyMap = new Map<string, { matches: number; highSeverity: number; primaryWorkload: string }>();
    const sitMap = new Map<string, number>();
    let high = 0;
    let medium = 0;
    let low = 0;
    let external = 0;
    let overrides = 0;
    let falsePositives = 0;

    for (const ev of raw) {
      const wl = (ev.Workload ?? String(ev.RecordType ?? '')).toLowerCase();
      let normalizedWl = 'Exchange';
      if (wl.includes('sharepoint')) {
        workloadCounts.sharePoint += 1;
        normalizedWl = 'SharePoint';
      } else if (wl.includes('onedrive')) {
        workloadCounts.oneDrive += 1;
        normalizedWl = 'OneDrive';
      } else if (wl.includes('teams')) {
        workloadCounts.teams += 1;
        normalizedWl = 'Teams';
      } else if (wl.includes('endpoint')) {
        workloadCounts.endpoint += 1;
        normalizedWl = 'Endpoint';
      } else {
        workloadCounts.exchange += 1;
      }

      const sev = (ev.PolicyMatchInfo?.Severity ?? 'Low').toLowerCase();
      if (sev === 'high') high += 1;
      else if (sev === 'medium') medium += 1;
      else low += 1;

      if (ev.SharingScope && /external|anonymous|anyone/i.test(ev.SharingScope)) external += 1;
      if (ev.ExceptionInfo?.Justification) overrides += 1;
      if (ev.ExceptionInfo?.FalsePositive) falsePositives += 1;

      const pol = ev.PolicyMatchInfo?.PolicyName ?? 'Unnamed DLP Policy';
      const cur = policyMap.get(pol) ?? { matches: 0, highSeverity: 0, primaryWorkload: normalizedWl };
      cur.matches += 1;
      if (sev === 'high') cur.highSeverity += 1;
      policyMap.set(pol, cur);

      for (const sit of ev.PolicyMatchInfo?.SensitiveInformationTypeData ?? []) {
        const name = sit.SensitiveInformationTypeName ?? 'Unknown SIT';
        sitMap.set(name, (sitMap.get(name) ?? 0) + 1);
      }
    }

    return {
      status: 'Available',
      totalEvents: raw.length,
      policyMatches: raw.length,
      ruleMatches: raw.length,
      highSeverityEvents: high,
      mediumSeverityEvents: medium,
      lowSeverityEvents: low,
      externalSharingIndicators: external,
      overrideCount: overrides,
      falsePositiveCount: falsePositives,
      workloadBreakdown: workloadCounts,
      topTriggeredPolicies: [...policyMap.entries()]
        .map(([policyName, val]) => ({ policyName, ...val }))
        .sort((a, b) => b.matches - a.matches)
        .slice(0, 8),
      topSensitiveInfoTypes: [...sitMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
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

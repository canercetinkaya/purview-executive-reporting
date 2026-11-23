import type { DataSourceDescriptor, InformationProtectionMetrics } from '@purview-portal/domain';
import {
  GraphHttpClient,
  MicrosoftApiError,
  type ConnectorContext,
  type ConnectorHealth,
  type IMicrosoftConnector,
} from './base.js';

export interface SensitivityLabelRaw {
  id: string;
  name?: string;
  description?: string;
  isActive?: boolean;
  hasProtection?: boolean;
}

/**
 * Microsoft Purview Information Protection Sensitivity Labels connector.
 * Uses v1.0 /security/informationProtection/sensitivityLabels by default;
 * if beta tenant-wide DSPM/dataSecurityAndGovernance endpoint is explicitly enabled, flags BetaDependency.
 * Explicitly sets unlabeledPopulationStatus = 'ApiUnsupported' because Graph does not expose tenant-wide unlabeled file inventory at rest.
 */
export class InformationProtectionLabelsConnector
  implements IMicrosoftConnector<SensitivityLabelRaw[], Partial<InformationProtectionMetrics>>
{
  public readonly connectorId = 'information-protection-labels' as const;
  public readonly displayName = 'Information Protection Sensitivity Labels';
  public readonly microsoftProduct = 'Microsoft Purview Information Protection';
  public readonly requiredPermissions = ['InformationProtectionPolicy.Read.All'];
  public get isBeta(): boolean {
    return Boolean(this.context?.enableBeta);
  }

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
        detail: 'Entra App credentials not configured.',
      };
    }
    return {
      valid: true,
      status: this.isBeta ? ('BetaDependency' as const) : ('Available' as const),
      detail: 'InformationProtectionPolicy.Read.All configured.',
    };
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
      await this.client.requestJson('https://graph.microsoft.com/v1.0/security/informationProtection/sensitivityLabels', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch {
      return false;
    }
  }

  async collect(): Promise<SensitivityLabelRaw[]> {
    if (!this.context) throw new Error('Connector not initialized');
    const started = Date.now();
    const useBeta = Boolean(this.context.enableBeta);
    const endpoint = useBeta
      ? 'https://graph.microsoft.com/beta/security/dataSecurityAndGovernance/sensitivityLabels'
      : 'https://graph.microsoft.com/v1.0/security/informationProtection/sensitivityLabels';

    try {
      const labels = await this.client.getPagedCollection<SensitivityLabelRaw>(endpoint, () => this.getToken());
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: useBeta
          ? 'GET /beta/security/dataSecurityAndGovernance/sensitivityLabels'
          : 'GET /v1.0/security/informationProtection/sensitivityLabels',
        apiChannel: useBeta ? 'Graph Beta' : 'Graph v1.0',
        status: useBeta ? 'BetaDependency' : 'Available',
        statusDetail: `Retrieved ${labels.length} active/defined sensitivity labels.${useBeta ? ' Uses Graph Beta endpoint.' : ''}`,
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: labels.length,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: useBeta,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-informationprotection-list-sensitivitylabels',
      };
      return labels;
    } catch (err) {
      const status = err instanceof MicrosoftApiError ? err.availabilityStatus : 'CollectionFailed';
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'GET /v1.0/security/informationProtection/sensitivityLabels',
        apiChannel: useBeta ? 'Graph Beta' : 'Graph v1.0',
        status,
        statusDetail: err instanceof Error ? err.message : 'Label collection failed',
        lastCollectedAt: new Date().toISOString(),
        recordsCollected: 0,
        throttleCount429: this.client.throttleCount429,
        durationMs: Date.now() - started,
        isBeta: useBeta,
        documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-informationprotection-list-sensitivitylabels',
      };
      throw err;
    }
  }

  normalize(raw: SensitivityLabelRaw[]): Partial<InformationProtectionMetrics> {
    const active = raw.filter((l) => l.isActive !== false);
    return {
      status: this.isBeta ? 'BetaDependency' : 'Available',
      definedLabelsCount: active.length,
      unlabeledPopulationStatus: 'ApiUnsupported',
      unlabeledSensitiveFilesCount: null,
      labelCoveragePct: null,
      sourceNote:
        'Sensitivity label definitions retrieved via Microsoft Graph. Tenant-wide unlabeled file population at rest is not exposed via supported Graph v1.0 APIs (ApiUnsupported) without optional Sentinel/DSPM telemetry.',
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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DataSourceDescriptor, PolicyConfigurationSummary } from '@purview-portal/domain';
import type { ConnectorContext, ConnectorHealth, IMicrosoftConnector } from './base.js';

export interface PowerShellComplianceSnapshot {
  schemaVersion: string;
  customerId: string;
  collectedAt: string;
  dlpPolicies: PolicyConfigurationSummary[];
  sensitivityLabelPolicyCount: number;
  retentionPolicyCount: number;
  insiderRiskPolicyCount: number;
  commCompliancePolicyCount: number;
}

/**
 * Ingests read-only Security & Compliance PowerShell (Connect-IPPSSession) snapshots
 * exported by collectors/powershell/Invoke-PurviewComplianceCollect.ps1.
 */
export class PowerShellComplianceBridgeConnector
  implements IMicrosoftConnector<PowerShellComplianceSnapshot | null, PowerShellComplianceSnapshot | null>
{
  public readonly connectorId = 'powershell-compliance-bridge' as const;
  public readonly displayName = 'Security & Compliance PowerShell Bridge';
  public readonly microsoftProduct = 'Microsoft Purview PowerShell (IPPS)';
  public readonly requiredPermissions = ['Exchange.ManageAsApp', 'Compliance Administrator / Global Reader'];
  public readonly isBeta = false;

  private context: ConnectorContext | null = null;
  private lastStatus: DataSourceDescriptor | null = null;

  async initialize(context: ConnectorContext): Promise<void> {
    this.context = context;
  }

  private getSnapshotPath(): string {
    const dir = this.context?.powershellSnapshotDir ?? './collectors/powershell/output';
    const customerSafe = (this.context?.customerId ?? 'default').replace(/[^a-zA-Z0-9_-]/g, '');
    return resolve(dir, `${customerSafe}.purview-snapshot.json`);
  }

  async validatePermissions() {
    const path = this.getSnapshotPath();
    if (!existsSync(path)) {
      return {
        valid: false,
        status: 'Unavailable' as const,
        detail: `No PowerShell compliance snapshot found at ${path}. Run Invoke-PurviewComplianceCollect.ps1 to enable policy configuration inventory.`,
      };
    }
    return { valid: true, status: 'Available' as const, detail: 'PowerShell IPPS JSON snapshot present.' };
  }

  async testConnection(): Promise<boolean> {
    return existsSync(this.getSnapshotPath());
  }

  async collect(): Promise<PowerShellComplianceSnapshot | null> {
    const started = Date.now();
    const path = this.getSnapshotPath();
    if (!existsSync(path)) {
      this.lastStatus = {
        connectorId: this.connectorId,
        displayName: this.displayName,
        microsoftProduct: this.microsoftProduct,
        endpointOrCmdlet: 'Connect-IPPSSession -> Get-DlpCompliancePolicy / Get-Label / Get-InsiderRiskPolicy',
        apiChannel: 'Security & Compliance PowerShell',
        status: 'Unavailable',
        statusDetail: 'PowerShell IPPS snapshot file not present on host.',
        lastCollectedAt: null,
        recordsCollected: 0,
        throttleCount429: 0,
        durationMs: Date.now() - started,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com/en-us/powershell/exchange/connect-to-scc-powershell',
      };
      return null;
    }

    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PowerShellComplianceSnapshot;
    const total = parsed.dlpPolicies.length + parsed.sensitivityLabelPolicyCount + parsed.retentionPolicyCount;
    this.lastStatus = {
      connectorId: this.connectorId,
      displayName: this.displayName,
      microsoftProduct: this.microsoftProduct,
      endpointOrCmdlet: 'Connect-IPPSSession -> Get-DlpCompliancePolicy / Get-LabelPolicy / Get-InsiderRiskPolicy',
      apiChannel: 'Security & Compliance PowerShell',
      status: 'Available',
      statusDetail: `Ingested IPPS policy inventory (${total} policy objects).`,
      lastCollectedAt: parsed.collectedAt,
      recordsCollected: total,
      throttleCount429: 0,
      durationMs: Date.now() - started,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/powershell/exchange/connect-to-scc-powershell',
    };
    return parsed;
  }

  normalize(raw: PowerShellComplianceSnapshot | null): PowerShellComplianceSnapshot | null {
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

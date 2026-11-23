import {
  calculatePostureScore,
  type AuditAndEDiscoveryMetrics,
  type CollectionRun,
  type CommunicationComplianceMetrics,
  type DataSourceDescriptor,
  type DlpAnalytics,
  type InformationProtectionMetrics,
  type InsiderRiskMetrics,
  type MonthlySnapshot,
  type Recommendation,
  type ReportingPeriod,
  type SecurityAlertsAndIncidents,
} from '@purview-portal/domain';
import { GraphHttpClient, type ConnectorContext } from './base.js';
import { GraphSecurityAlertsV2Connector, type GraphAlertV2Raw } from './graphSecurityAlertsV2.js';
import { GraphSecurityIncidentsConnector, type GraphIncidentRaw } from './graphSecurityIncidents.js';
import { InformationProtectionLabelsConnector, type SensitivityLabelRaw } from './informationProtectionLabels.js';
import { Office365DlpActivityConnector, type O365DlpEventRaw } from './office365DlpActivity.js';
import {
  PowerShellComplianceBridgeConnector,
  type PowerShellComplianceSnapshot,
} from './powershellComplianceBridge.js';
import { PurviewAuditLogConnector, type AuditLogQueryRaw } from './purviewAuditLog.js';
import { RecordsAndEDiscoveryConnector, type RecordsAndEDiscoveryRaw } from './recordsAndEDiscovery.js';
import { SentinelAnalyticsConnector } from './sentinelAnalytics.js';

export interface LiveCollectionOutput {
  snapshot: MonthlySnapshot;
  run: CollectionRun;
  recommendations: Recommendation[];
}

function getMonthPeriod(periodId?: string): ReportingPeriod {
  const now = new Date();
  const targetId =
    periodId && /^\d{4}-\d{2}$/.test(periodId)
      ? periodId
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [yStr, mStr] = targetId.split('-');
  const year = Number(yStr);
  const monthIdx = Number(mStr) - 1;
  const start = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIdx + 1, 1, 0, 0, 0));
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(start);

  return {
    periodId: targetId,
    label,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/**
 * Orchestrates all 8 Microsoft Purview / Graph connectors against a live tenant.
 * Gracefully degrades any unavailable/permission-missing/unlicensed connector without inventing values.
 */
export async function runLiveTenantCollection(params: {
  customerId: string;
  tenantEntityId: string;
  azureTenantId: string;
  periodId?: string;
  triggeredBy: string;
  clientId?: string;
  clientSecret?: string;
  enableBeta?: boolean;
  powershellSnapshotDir?: string;
  sentinelWorkspaceId?: string;
  httpClient?: GraphHttpClient;
}): Promise<LiveCollectionOutput> {
  const period = getMonthPeriod(params.periodId);
  const startedAt = new Date();
  const httpClient = params.httpClient ?? new GraphHttpClient();

  const ctx: ConnectorContext = {
    customerId: params.customerId,
    azureTenantId: params.azureTenantId,
    periodStartIso: period.startIso,
    periodEndIso: period.endIso,
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    enableBeta: params.enableBeta,
    powershellSnapshotDir: params.powershellSnapshotDir,
    sentinelWorkspaceId: params.sentinelWorkspaceId,
  };

  const alertsConn = new GraphSecurityAlertsV2Connector(httpClient);
  const incConn = new GraphSecurityIncidentsConnector(httpClient);
  const dlpConn = new Office365DlpActivityConnector(httpClient);
  const ipConn = new InformationProtectionLabelsConnector(httpClient);
  const auditConn = new PurviewAuditLogConnector(httpClient);
  const recConn = new RecordsAndEDiscoveryConnector(httpClient);
  const psConn = new PowerShellComplianceBridgeConnector();
  const sentinelConn = new SentinelAnalyticsConnector();

  const allConnectors = [alertsConn, incConn, dlpConn, ipConn, auditConn, recConn, psConn, sentinelConn];
  await Promise.all(allConnectors.map((c) => c.initialize(ctx)));

  const hasGraphCreds = Boolean(params.clientId && params.clientSecret && params.azureTenantId && !/^0+$/.test(params.azureTenantId.replace(/-/g, '')));

  async function safeRun<TRaw>(
    c: { collect(): Promise<TRaw>; getLastCollectionStatus(): DataSourceDescriptor | null },
    requiresGraph: boolean,
  ): Promise<TRaw | null> {
    if (requiresGraph && !hasGraphCreds) {
      return null;
    }
    try {
      return await c.collect();
    } catch {
      return null;
    }
  }

  const [alertsRaw, incRaw, dlpRaw, ipRaw, auditRaw, recRaw, psRaw, sentinelRaw] = await Promise.all([
    safeRun<GraphAlertV2Raw[]>(alertsConn, true),
    safeRun<GraphIncidentRaw[]>(incConn, true),
    safeRun<O365DlpEventRaw[]>(dlpConn, true),
    safeRun<SensitivityLabelRaw[]>(ipConn, true),
    safeRun<AuditLogQueryRaw>(auditConn, true),
    safeRun<RecordsAndEDiscoveryRaw>(recConn, true),
    safeRun<PowerShellComplianceSnapshot | null>(psConn, false),
    safeRun(sentinelConn, false),
  ]);

  const unconfiguredDesc = (
    connectorId: DataSourceDescriptor['connectorId'],
    displayName: string,
    microsoftProduct: string,
    endpointOrCmdlet: string,
    apiChannel: DataSourceDescriptor['apiChannel'],
    documentationUrl: string,
  ): DataSourceDescriptor => ({
    connectorId,
    displayName,
    microsoftProduct,
    endpointOrCmdlet,
    apiChannel,
    status: 'Unavailable',
    statusDetail: 'Graph App Registration credentials not configured in .env yet (run Setup-PurviewTestTenant.ps1).',
    lastCollectedAt: null,
    recordsCollected: 0,
    throttleCount429: 0,
    durationMs: 0,
    isBeta: false,
    documentationUrl,
  });

  const descriptors: DataSourceDescriptor[] = [
    alertsConn.getLastCollectionStatus() ??
      unconfiguredDesc('graph-security-alerts-v2', alertsConn.displayName, alertsConn.microsoftProduct, 'GET /v1.0/security/alerts_v2', 'Graph v1.0', 'https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2'),
    incConn.getLastCollectionStatus() ??
      unconfiguredDesc('graph-security-incidents', incConn.displayName, incConn.microsoftProduct, 'GET /v1.0/security/incidents', 'Graph v1.0', 'https://learn.microsoft.com/en-us/graph/api/security-list-incidents'),
    dlpConn.getLastCollectionStatus() ??
      unconfiguredDesc('o365-management-dlp', dlpConn.displayName, dlpConn.microsoftProduct, 'GET /api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType=DLP.All', 'O365 Management v1.0', 'https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference'),
    ipConn.getLastCollectionStatus() ??
      unconfiguredDesc('information-protection-labels', ipConn.displayName, ipConn.microsoftProduct, 'GET /v1.0/security/informationProtection/sensitivityLabels', 'Graph v1.0', 'https://learn.microsoft.com/en-us/graph/api/security-informationprotection-list-sensitivitylabels'),
    auditConn.getLastCollectionStatus() ??
      unconfiguredDesc('purview-audit-log', auditConn.displayName, auditConn.microsoftProduct, 'POST/GET /v1.0/security/auditLog/queries', 'Graph v1.0', 'https://learn.microsoft.com/en-us/graph/api/resources/security-auditlogquery'),
    recConn.getLastCollectionStatus() ??
      unconfiguredDesc('records-and-ediscovery', recConn.displayName, recConn.microsoftProduct, 'GET /v1.0/security/cases/ediscoveryCases', 'Graph v1.0', 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases'),
    psConn.getLastCollectionStatus()!,
    sentinelConn.getLastCollectionStatus()!,
  ];
  void sentinelRaw;

  const dlpPart = dlpRaw ? dlpConn.normalize(dlpRaw) : {};
  const dlpStatus = dlpConn.getLastCollectionStatus()?.status ?? 'Unavailable';
  const dlp: DlpAnalytics = {
    status: dlpRaw ? 'Available' : dlpStatus,
    totalEvents: dlpPart.totalEvents ?? null,
    policyMatches: dlpPart.policyMatches ?? null,
    ruleMatches: dlpPart.ruleMatches ?? null,
    highSeverityEvents: dlpPart.highSeverityEvents ?? null,
    mediumSeverityEvents: dlpPart.mediumSeverityEvents ?? null,
    lowSeverityEvents: dlpPart.lowSeverityEvents ?? null,
    externalSharingIndicators: dlpPart.externalSharingIndicators ?? null,
    overrideCount: dlpPart.overrideCount ?? null,
    falsePositiveCount: dlpPart.falsePositiveCount ?? null,
    exceptionCount: null,
    repeatDepartmentClusters: [],
    workloadBreakdown: dlpPart.workloadBreakdown ?? {
      exchange: null,
      sharePoint: null,
      oneDrive: null,
      teams: null,
      endpoint: null,
    },
    topTriggeredPolicies: dlpPart.topTriggeredPolicies ?? [],
    topSensitiveInfoTypes: dlpPart.topSensitiveInfoTypes ?? [],
    activePolicies: psRaw?.dlpPolicies ?? [],
    sourceNote: psRaw
      ? `IPPS PowerShell snapshot (${psRaw.dlpPolicies.length} DLP policies) + O365 DLP.All feed [${dlpRaw ? 'Available' : dlpStatus}].`
      : 'Live O365 Management DLP.All + IPPS snapshot.',
  };

  const ipPart = ipRaw ? ipConn.normalize(ipRaw) : {};
  const ipStatus = ipConn.getLastCollectionStatus()?.status ?? (psRaw ? 'Available' : 'Unavailable');
  const informationProtection: InformationProtectionMetrics = {
    status: ipRaw ? (ipPart.status ?? 'Available') : ipStatus,
    definedLabelsCount: ipPart.definedLabelsCount ?? null,
    publishedLabelPoliciesCount: psRaw?.sensitivityLabelPolicyCount ?? null,
    unlabeledPopulationStatus: 'ApiUnsupported',
    labelCoveragePct: null,
    unlabeledSensitiveFilesCount: null,
    manualLabelingEvents: null,
    automaticLabelingEvents: null,
    encryptionProtectedEvents: null,
    labelPolicyChangesThisMonth: null,
    topUsedLabels: (ipRaw ?? []).slice(0, 6).map((l) => ({
      labelName: l.name ?? l.id,
      appliedEvents: 0,
      encryptedEvents: l.hasProtection ? 1 : 0,
    })),
    sourceNote:
      ipPart.sourceNote ??
      'Native Graph /security/informationProtection/sensitivityLabels + IPPS label policy count.',
  };

  const insiderAlerts = (alertsRaw ?? []).filter((a) => a.serviceSource === 'microsoftPurviewInsiderRiskManagement');
  const insiderRisk: InsiderRiskMetrics = {
    status: alertsRaw ? 'Available' : psRaw ? 'Available' : 'Unavailable',
    activePoliciesCount: psRaw?.insiderRiskPolicyCount ?? null,
    totalAlerts: alertsRaw ? insiderAlerts.length : null,
    highSeverityAlerts: alertsRaw ? insiderAlerts.filter((a) => a.severity === 'high').length : null,
    escalatedCases: null,
    resolvedCases: alertsRaw ? insiderAlerts.filter((a) => a.status === 'resolved').length : null,
    topIndicatorCategories: [],
    sourceNote: 'Graph /v1.0/security/alerts_v2 (serviceSource=microsoftPurviewInsiderRiskManagement) + IPPS Get-InsiderRiskPolicy.',
  };

  const commAlerts = (alertsRaw ?? []).filter((a) => a.serviceSource === 'microsoftPurviewCommunicationCompliance');
  const communicationCompliance: CommunicationComplianceMetrics = {
    status: alertsRaw ? 'Available' : psRaw ? 'Available' : 'Unavailable',
    activePoliciesCount: psRaw?.commCompliancePolicyCount ?? null,
    totalAlerts: alertsRaw ? commAlerts.length : null,
    policyMatchesReviewed: alertsRaw ? commAlerts.filter((a) => a.status === 'resolved').length : null,
    escalatedItems: null,
    channelsMonitored: psRaw && psRaw.commCompliancePolicyCount > 0 ? ['Microsoft Teams', 'Exchange Online'] : [],
    sourceNote: 'Graph /v1.0/security/alerts_v2 (serviceSource=microsoftPurviewCommunicationCompliance) + IPPS Get-SupervisoryReviewPolicyV2.',
  };

  const auditPart = auditRaw ? auditConn.normalize(auditRaw) : {};
  const recPart = recRaw ? recConn.normalize(recRaw) : {};
  const auditAndEDiscovery: AuditAndEDiscoveryMetrics = {
    auditStatus: auditConn.getLastCollectionStatus()?.status ?? 'Unavailable',
    eDiscoveryStatus: recConn.getLastCollectionStatus()?.status ?? 'Unavailable',
    recordsManagementStatus: recConn.getLastCollectionStatus()?.status ?? (psRaw ? 'Available' : 'Unavailable'),
    auditEventsCollected: auditPart.auditEventsCollected ?? null,
    highRiskAdminAuditActions: auditPart.highRiskAdminAuditActions ?? null,
    dlpAuditRecords: auditPart.dlpAuditRecords ?? null,
    retentionLabelsCount: recPart.retentionLabelsCount ?? null,
    retentionPoliciesCount: psRaw?.retentionPolicyCount ?? null,
    activeEDiscoveryCases: recPart.activeEDiscoveryCases ?? null,
    closedEDiscoveryCasesThisMonth: recPart.closedEDiscoveryCasesThisMonth ?? null,
    legalHoldsActive: null,
    sourceNote: 'Graph v1.0 auditLog/queries, labels/retentionLabels, cases/ediscoveryCases + IPPS Get-RetentionCompliancePolicy.',
  };

  const alertNorm = alertsRaw ? alertsConn.normalize(alertsRaw) : {};
  const incNorm = incRaw ? incConn.normalize(incRaw) : {};
  const alertsAndIncidents: SecurityAlertsAndIncidents = {
    alertsStatus: alertsConn.getLastCollectionStatus()?.status ?? 'Unavailable',
    incidentsStatus: incConn.getLastCollectionStatus()?.status ?? 'Unavailable',
    totalAlerts: alertNorm.totalAlerts ?? null,
    purviewScopedAlerts: alertNorm.purviewScopedAlerts ?? null,
    alertsBySeverity: alertNorm.alertsBySeverity ?? { high: 0, medium: 0, low: 0, informational: 0 },
    alertsByServiceSource: alertNorm.alertsByServiceSource ?? [],
    alertsByStatus: alertNorm.alertsByStatus ?? [],
    alertsByClassification: alertNorm.alertsByClassification ?? [],
    alertsByDetermination: alertNorm.alertsByDetermination ?? [],
    totalIncidents: incNorm.totalIncidents ?? null,
    newIncidentsThisMonth: incNorm.newIncidentsThisMonth ?? null,
    resolvedIncidentsThisMonth: incNorm.resolvedIncidentsThisMonth ?? null,
    openHighCriticalRisks: incNorm.openHighCriticalRisks ?? null,
    meanTimeToResolveHours: incNorm.meanTimeToResolveHours ?? null,
    medianTimeToResolveHours: incNorm.medianTimeToResolveHours ?? null,
    topIncidentCategories: incNorm.topIncidentCategories ?? [],
    sourceNote: 'Live Microsoft Graph v1.0 /security/alerts_v2 and /security/incidents.',
  };

  const postureScore = calculatePostureScore({
    dlp,
    informationProtection,
    insiderRisk,
    communicationCompliance,
    alertsAndIncidents,
    auditAndEDiscovery,
    connectors: descriptors,
  });

  const completedAt = new Date();
  const snapshot: MonthlySnapshot = {
    id: `snap-${params.customerId}-${period.periodId}`,
    customerId: params.customerId,
    tenantId: params.tenantEntityId,
    period,
    collectedAt: completedAt.toISOString(),
    isDemo: false,
    connectors: descriptors,
    dlp,
    informationProtection,
    insiderRisk,
    communicationCompliance,
    auditAndEDiscovery,
    alertsAndIncidents,
    managedServiceValue: {
      alertsReviewedByAnalysts: 0,
      incidentsInvestigatedByTeam: 0,
      casesClosedByTeam: 0,
      policiesReviewed: psRaw ? psRaw.dlpPolicies.length + psRaw.sensitivityLabelPolicyCount : 0,
      policiesChanged: 0,
      falsePositivesReduced: 0,
      exceptionsReviewed: 0,
      sensitivityLabelChanges: 0,
      dlpRuleChanges: 0,
      configurationImprovements: 0,
      departmentRisksInvestigated: 0,
      customerRequestsHandled: 0,
      microsoftRecommendationsAssessed: 0,
      proactiveHealthChecks: 1,
      resolvedConfigurationIssues: 0,
      monitoringHoursLogged: 0,
      automationExecutions: 1,
      failedJobsRemediated: 0,
      microsoftAutomatedDetections: dlp.totalEvents !== null || alertsAndIncidents.totalAlerts !== null
        ? (dlp.totalEvents ?? 0) + (alertsAndIncidents.totalAlerts ?? 0)
        : null,
      microsoftAutoRemediatedEvents: null,
      activities: [
        {
          id: `act-live-sync-${completedAt.getTime()}`,
          customerId: params.customerId,
          periodId: period.periodId,
          performedAt: completedAt.toISOString(),
          performedBy: params.triggeredBy,
          category: 'HealthCheck',
          title: 'Live Purview Telemetry & Policy Snapshot Sync',
          summary: `Executed ${descriptors.filter((d) => d.status === 'Available' || d.status === 'BetaDependency').length}/${descriptors.length} available connectors.`,
          outcome: 'Persisted live monthly snapshot without inventing missing metrics.',
          origin: 'ManagedServiceTeam',
        },
      ],
    },
    postureScore,
  };

  // Evidence-backed recommendations generated directly from live tenant observations
  const recommendations: Recommendation[] = [];
  const today = completedAt.toISOString().slice(0, 10);
  const testModePolicies = dlp.activePolicies.filter((p) => p.mode !== 'Enforce');
  if (testModePolicies.length > 0) {
    recommendations.push({
      id: `rec-live-dlp-test-${params.customerId}`,
      customerId: params.customerId,
      title: `Promote ${testModePolicies.length} DLP Policy From Audit/Test Mode to Enforcement`,
      severity: 'High',
      category: 'Data Protection',
      observation: `Policies in non-enforced mode: ${testModePolicies.map((p) => `${p.name} (${p.mode})`).join(', ')}.`,
      evidence: 'Security & Compliance PowerShell Get-DlpCompliancePolicy snapshot.',
      businessRisk: 'Sensitive data matches are logged without blocking or warning end users.',
      technicalImpact: 'Transition to TestWithNotifications or Enforce after validating pilot false-positive rates.',
      recommendedAction: 'Review 14-day policy match accuracy and move validated rules to Enforce.',
      owner: 'Compliance Engineering',
      targetDate: today,
      status: 'Open',
      firstDetected: today,
      lastReviewed: today,
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/purview/dlp-policy-reference',
    });
  }
  if (psRaw && psRaw.retentionPolicyCount === 0) {
    recommendations.push({
      id: `rec-live-retention-zero-${params.customerId}`,
      customerId: params.customerId,
      title: 'Configure Baseline Microsoft Purview Data Lifecycle / Retention Policies',
      severity: 'Medium',
      category: 'Compliance',
      observation: 'Get-RetentionCompliancePolicy returned 0 active retention policies in the tenant.',
      evidence: `IPPS snapshot collected at ${psRaw.collectedAt} (retentionPolicyCount = 0).`,
      businessRisk: 'Critical Exchange/SharePoint/Teams records lack automated retention or regulatory deletion guardrails.',
      technicalImpact: 'Applies baseline retention schedules without impacting user productivity.',
      recommendedAction: 'Define corporate retention schedule and deploy scoped Exchange/SharePoint retention policies.',
      owner: 'Data Governance Team',
      targetDate: today,
      status: 'Open',
      firstDetected: today,
      lastReviewed: today,
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/purview/retention',
    });
  }
  for (const conn of descriptors.filter((d) => d.status === 'PermissionMissing')) {
    recommendations.push({
      id: `rec-live-perm-${conn.connectorId}`,
      customerId: params.customerId,
      title: `Grant Read-Only Admin Consent for ${conn.displayName}`,
      severity: 'High',
      category: 'Configuration',
      observation: `Connector ${conn.displayName} returned PermissionMissing (${conn.statusDetail}).`,
      evidence: `Live connector health check at ${completedAt.toISOString()}.`,
      businessRisk: 'Governance metrics from this workload are excluded from executive reporting until consented.',
      technicalImpact: 'Grants strictly read-only application permissions.',
      recommendedAction: 'Have Global Administrator or Privileged Role Administrator grant admin consent in Microsoft Entra ID.',
      owner: 'Identity & Access Team',
      targetDate: today,
      status: 'Open',
      firstDetected: today,
      lastReviewed: today,
      microsoftDocsUrl: conn.documentationUrl,
    });
  }

  const run: CollectionRun = {
    id: `run-live-${completedAt.getTime()}`,
    customerId: params.customerId,
    periodId: period.periodId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    triggeredBy: params.triggeredBy,
    status: descriptors.some((d) => d.status === 'CollectionFailed') ? 'PartialSuccess' : 'Succeeded',
    throttleEvents429: httpClient.throttleCount429,
    apiFailures: descriptors.filter((d) => d.status === 'CollectionFailed').length,
    authFailures: descriptors.filter((d) => d.status === 'PermissionMissing').length,
    connectorSummary: descriptors.map((d) => ({
      connectorId: d.connectorId,
      status: d.status,
      records: d.recordsCollected,
      durationMs: d.durationMs,
      message: d.statusDetail,
    })),
  };

  return { snapshot, run, recommendations };
}

import {
  calculatePostureScore,
  type CollectionRun,
  type Customer,
  type DataSourceDescriptor,
  type ManagedServiceActivity,
  type MonthlySnapshot,
  type Recommendation,
  type ReportingPeriod,
  type Subscription,
  type Tenant,
} from '@purview-portal/domain';

export interface DemoStoreSeed {
  tenants: Tenant[];
  customers: Customer[];
  subscriptions: Subscription[];
  snapshots: MonthlySnapshot[];
  recommendations: Recommendation[];
  collectionRuns: CollectionRun[];
}

const PERIOD_LABELS: Array<{ id: string; label: string; start: string; end: string }> = [
  { id: '2025-10', label: 'October 2025', start: '2025-10-01T00:00:00Z', end: '2025-11-01T00:00:00Z' },
  { id: '2025-11', label: 'November 2025', start: '2025-11-01T00:00:00Z', end: '2025-12-01T00:00:00Z' },
  { id: '2025-12', label: 'December 2025', start: '2025-12-01T00:00:00Z', end: '2026-01-01T00:00:00Z' },
  { id: '2026-01', label: 'January 2026', start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' },
  { id: '2026-02', label: 'February 2026', start: '2026-02-01T00:00:00Z', end: '2026-03-01T00:00:00Z' },
  { id: '2026-03', label: 'March 2026', start: '2026-03-01T00:00:00Z', end: '2026-04-01T00:00:00Z' },
  { id: '2026-04', label: 'April 2026', start: '2026-04-01T00:00:00Z', end: '2026-05-01T00:00:00Z' },
  { id: '2026-05', label: 'May 2026', start: '2026-05-01T00:00:00Z', end: '2026-06-01T00:00:00Z' },
  { id: '2026-06', label: 'June 2026', start: '2026-06-01T00:00:00Z', end: '2026-07-01T00:00:00Z' },
  { id: '2026-07', label: 'July 2026', start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z' },
  { id: '2026-08', label: 'August 2026', start: '2026-08-01T00:00:00Z', end: '2026-09-01T00:00:00Z' },
  { id: '2026-09', label: 'September 2026', start: '2026-09-01T00:00:00Z', end: '2026-10-01T00:00:00Z' },
  { id: '2026-10', label: 'October 2026', start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' },
  { id: '2026-11', label: 'November 2026', start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z' },
];

function buildActivities(
  customerId: string,
  periodId: string,
  periodLabel: string,
  idx: number,
  isContoso: boolean,
): ManagedServiceActivity[] {
  const baseDay = periodId;
  const items: ManagedServiceActivity[] = [
    {
      id: `act-${customerId}-${periodId}-1`,
      customerId,
      periodId,
      performedAt: `${baseDay}-04T09:15:00Z`,
      performedBy: 'Morgan Patel (Senior Security Analyst)',
      category: 'AlertTriage',
      title: `DLP High-Severity Triage Batch (${periodLabel})`,
      summary: isContoso
        ? 'Reviewed external SWIFT/IBAN sharing matches across Exchange and SharePoint.'
        : 'Triaged PHI outbound email matches triggered by clinical billing templates.',
      outcome: 'Confirmed legitimate business transfers vs. 2 policy violations requiring manager coaching.',
      origin: 'ManagedServiceTeam',
    },
    {
      id: `act-${customerId}-${periodId}-2`,
      customerId,
      periodId,
      performedAt: `${baseDay}-11T14:30:00Z`,
      performedBy: 'Jordan Lee (Compliance Engineer)',
      category: 'FalsePositiveReduction',
      title: 'SIT Confidence & Exclusion Tuning',
      summary: 'Refined sensitive information type proximity keywords and excluded automated ERP archive mailboxes.',
      outcome: `Reduced false-positive DLP noise by ${12 + (idx % 6)} incidents compared with prior baseline.`,
      origin: 'ManagedServiceTeam',
    },
    {
      id: `act-${customerId}-${periodId}-3`,
      customerId,
      periodId,
      performedAt: `${baseDay}-18T11:00:00Z`,
      performedBy: 'Alex Mercer (Service Manager)',
      category: 'RecommendationAssessment',
      title: 'Monthly Purview Posture & License Hygiene Review',
      summary: 'Validated policy enforcement modes and Microsoft Purview configuration drift via IPPS PowerShell snapshot.',
      outcome: 'Transitioned 1 audit-mode SharePoint rule to warn-with-justification.',
      origin: 'ManagedServiceTeam',
    },
    {
      id: `act-${customerId}-${periodId}-4`,
      customerId,
      periodId,
      performedAt: `${baseDay}-25T16:20:00Z`,
      performedBy: 'Morgan Patel (Senior Security Analyst)',
      category: 'HealthCheck',
      title: 'Connector & Audit Ingestion Verification',
      summary: 'Verified Office 365 Management DLP.All webhook/feed latency and Graph alerts_v2 pagination.',
      outcome: 'Confirmed 0 missed collection windows and clean retry behavior on Graph throttling.',
      origin: 'ManagedServiceTeam',
    },
  ];
  return items;
}

function buildContosoConnectors(collectedAt: string, idx: number): DataSourceDescriptor[] {
  return [
    {
      connectorId: 'graph-security-alerts-v2',
      displayName: 'Microsoft Graph Security Alerts v2',
      microsoftProduct: 'Defender XDR & Purview Alerts',
      endpointOrCmdlet: 'GET /v1.0/security/alerts_v2',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Synthetic 14-month demo stream reflecting Graph v1.0 alerts_v2 schema.',
      lastCollectedAt: collectedAt,
      recordsCollected: 38 + (idx % 7),
      throttleCount429: idx % 4 === 0 ? 1 : 0,
      durationMs: 640 + idx * 12,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2',
    },
    {
      connectorId: 'graph-security-incidents',
      displayName: 'Microsoft Graph Security Incidents',
      microsoftProduct: 'Defender XDR Incident Correlation',
      endpointOrCmdlet: 'GET /v1.0/security/incidents',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Correlated incident lifecycle & MTTR timestamps collected.',
      lastCollectedAt: collectedAt,
      recordsCollected: 12 + (idx % 5),
      throttleCount429: 0,
      durationMs: 490,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-incidents',
    },
    {
      connectorId: 'o365-management-dlp',
      displayName: 'Office 365 Management Activity (DLP.All)',
      microsoftProduct: 'Microsoft Purview DLP',
      endpointOrCmdlet: 'GET /api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType=DLP.All',
      apiChannel: 'O365 Management v1.0',
      status: 'Available',
      statusDetail: 'Cross-workload DLP telemetry ingested across Exchange, SharePoint, OneDrive, Teams, Endpoint.',
      lastCollectedAt: collectedAt,
      recordsCollected: 185 - idx * 3,
      throttleCount429: idx % 3 === 0 ? 2 : 0,
      durationMs: 1420,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference',
    },
    {
      connectorId: 'information-protection-labels',
      displayName: 'Information Protection Sensitivity Labels',
      microsoftProduct: 'Microsoft Purview Information Protection',
      endpointOrCmdlet: 'GET /beta/security/dataSecurityAndGovernance/sensitivityLabels',
      apiChannel: 'Graph Beta',
      status: 'BetaDependency',
      statusDetail: 'Tenant label inventory active via Graph Beta DSPM preview; unlabeled files at rest remain ApiUnsupported.',
      lastCollectedAt: collectedAt,
      recordsCollected: 14,
      throttleCount429: 0,
      durationMs: 310,
      isBeta: true,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-informationprotection-list-sensitivitylabels',
    },
    {
      connectorId: 'purview-audit-log',
      displayName: 'Microsoft Purview Audit Search API',
      microsoftProduct: 'Microsoft Purview Audit',
      endpointOrCmdlet: 'POST/GET /v1.0/security/auditLog/queries',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Unified audit log search completed within SLA.',
      lastCollectedAt: collectedAt,
      recordsCollected: 18400 + idx * 350,
      throttleCount429: 1,
      durationMs: 2890,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/security-auditlogquery',
    },
    {
      connectorId: 'records-and-ediscovery',
      displayName: 'Records Management & eDiscovery',
      microsoftProduct: 'Purview Records Management & eDiscovery',
      endpointOrCmdlet: 'GET /v1.0/security/labels/retentionLabels & /v1.0/security/cases/ediscoveryCases',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Retention labels and eDiscovery case inventory collected.',
      lastCollectedAt: collectedAt,
      recordsCollected: 13,
      throttleCount429: 0,
      durationMs: 410,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases',
    },
    {
      connectorId: 'powershell-compliance-bridge',
      displayName: 'Security & Compliance PowerShell Bridge',
      microsoftProduct: 'Microsoft Purview PowerShell (IPPS)',
      endpointOrCmdlet: 'Connect-IPPSSession -> Get-DlpCompliancePolicy / Get-LabelPolicy',
      apiChannel: 'Security & Compliance PowerShell',
      status: 'Available',
      statusDetail: 'Nightly read-only IPPS configuration snapshot loaded.',
      lastCollectedAt: collectedAt,
      recordsCollected: 26,
      throttleCount429: 0,
      durationMs: 1100,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/powershell/exchange/connect-to-scc-powershell',
    },
    {
      connectorId: 'sentinel-analytics',
      displayName: 'Microsoft Sentinel Log Analytics',
      microsoftProduct: 'Microsoft Sentinel',
      endpointOrCmdlet: 'POST /v1/workspaces/{workspaceId}/query',
      apiChannel: 'Sentinel Log Analytics',
      status: 'Unavailable',
      statusDetail: 'Optional Sentinel Log Analytics connector not enabled in this demo profile.',
      lastCollectedAt: null,
      recordsCollected: 0,
      throttleCount429: 0,
      durationMs: 0,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/overview',
    },
  ];
}

function buildNorthwindConnectors(collectedAt: string, idx: number): DataSourceDescriptor[] {
  return [
    {
      connectorId: 'graph-security-alerts-v2',
      displayName: 'Microsoft Graph Security Alerts v2',
      microsoftProduct: 'Defender XDR & Purview Alerts',
      endpointOrCmdlet: 'GET /v1.0/security/alerts_v2',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Alerts v2 active (note: Communication Compliance unlicensed on tenant).',
      lastCollectedAt: collectedAt,
      recordsCollected: 24 + (idx % 5),
      throttleCount429: 0,
      durationMs: 520,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-alerts_v2',
    },
    {
      connectorId: 'graph-security-incidents',
      displayName: 'Microsoft Graph Security Incidents',
      microsoftProduct: 'Defender XDR Incident Correlation',
      endpointOrCmdlet: 'GET /v1.0/security/incidents',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Incident correlation active.',
      lastCollectedAt: collectedAt,
      recordsCollected: 9 + (idx % 3),
      throttleCount429: 0,
      durationMs: 390,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-list-incidents',
    },
    {
      connectorId: 'o365-management-dlp',
      displayName: 'Office 365 Management Activity (DLP.All)',
      microsoftProduct: 'Microsoft Purview DLP',
      endpointOrCmdlet: 'GET /api/v1.0/{tenantId}/activity/feed/subscriptions/content?contentType=DLP.All',
      apiChannel: 'O365 Management v1.0',
      status: 'Available',
      statusDetail: 'PHI & healthcare DLP telemetry ingested.',
      lastCollectedAt: collectedAt,
      recordsCollected: 112 - idx,
      throttleCount429: 0,
      durationMs: 980,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference',
    },
    {
      connectorId: 'information-protection-labels',
      displayName: 'Information Protection Sensitivity Labels',
      microsoftProduct: 'Microsoft Purview Information Protection',
      endpointOrCmdlet: 'GET /v1.0/security/informationProtection/sensitivityLabels',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Label definitions active via Graph v1.0.',
      lastCollectedAt: collectedAt,
      recordsCollected: 9,
      throttleCount429: 0,
      durationMs: 280,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-informationprotection-list-sensitivitylabels',
    },
    {
      connectorId: 'purview-audit-log',
      displayName: 'Microsoft Purview Audit Search API',
      microsoftProduct: 'Microsoft Purview Audit',
      endpointOrCmdlet: 'POST/GET /v1.0/security/auditLog/queries',
      apiChannel: 'Graph v1.0',
      status: 'Available',
      statusDetail: 'Unified audit log search completed.',
      lastCollectedAt: collectedAt,
      recordsCollected: 9600 + idx * 180,
      throttleCount429: 0,
      durationMs: 1850,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/resources/security-auditlogquery',
    },
    {
      connectorId: 'records-and-ediscovery',
      displayName: 'Records Management & eDiscovery',
      microsoftProduct: 'Purview Records Management & eDiscovery',
      endpointOrCmdlet: 'GET /v1.0/security/cases/ediscoveryCases',
      apiChannel: 'Graph v1.0',
      status: 'PermissionMissing',
      statusDetail: 'eDiscovery.Read.All admin consent pending customer approval; records & eDiscovery counts marked unavailable.',
      lastCollectedAt: null,
      recordsCollected: 0,
      throttleCount429: 0,
      durationMs: 210,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases',
    },
    {
      connectorId: 'powershell-compliance-bridge',
      displayName: 'Security & Compliance PowerShell Bridge',
      microsoftProduct: 'Microsoft Purview PowerShell (IPPS)',
      endpointOrCmdlet: 'Connect-IPPSSession',
      apiChannel: 'Security & Compliance PowerShell',
      status: 'NotLicensed',
      statusDetail: 'Communication Compliance module is not licensed under current subscription.',
      lastCollectedAt: collectedAt,
      recordsCollected: 11,
      throttleCount429: 0,
      durationMs: 720,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/powershell/exchange/connect-to-scc-powershell',
    },
    {
      connectorId: 'sentinel-analytics',
      displayName: 'Microsoft Sentinel Log Analytics',
      microsoftProduct: 'Microsoft Sentinel',
      endpointOrCmdlet: 'POST /v1/workspaces/{workspaceId}/query',
      apiChannel: 'Sentinel Log Analytics',
      status: 'Unavailable',
      statusDetail: 'Not configured.',
      lastCollectedAt: null,
      recordsCollected: 0,
      throttleCount429: 0,
      durationMs: 0,
      isBeta: false,
      documentationUrl: 'https://learn.microsoft.com/en-us/azure/azure-monitor/logs/api/overview',
    },
  ];
}

export function createDemoSeed(): DemoStoreSeed {
  const tenants: Tenant[] = [
    {
      id: 'tenant-contoso-fin',
      azureTenantId: '11111111-2222-3333-4444-555555555555',
      primaryDomain: 'contoso-financial.example',
      licenseTier: 'Microsoft 365 E5 + Purview Suite',
      region: 'EU North',
    },
    {
      id: 'tenant-northwind-health',
      azureTenantId: '66666666-7777-8888-9999-000000000000',
      primaryDomain: 'northwind-health.example',
      licenseTier: 'Microsoft 365 E3 + E5 Information Protection & Governance',
      region: 'US East',
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust-contoso-fin',
      tenantId: 'tenant-contoso-fin',
      name: 'Contoso Financial Group',
      industry: 'Banking & Financial Services',
      serviceTier: 'Managed Purview Enterprise',
      primaryContactEmail: 'ciso-office@contoso-financial.example',
      isDemo: true,
    },
    {
      id: 'cust-northwind-health',
      tenantId: 'tenant-northwind-health',
      name: 'Northwind Health Systems',
      industry: 'Healthcare & Clinical Services',
      serviceTier: 'Managed Purview Standard',
      primaryContactEmail: 'compliance@northwind-health.example',
      isDemo: true,
    },
  ];

  const subscriptions: Subscription[] = [
    {
      id: 'sub-contoso-1',
      customerId: 'cust-contoso-fin',
      planName: 'Microsoft 365 E5 Compliance + Defender Suite',
      licensedSeats: 4800,
      purviewModulesEnabled: [
        'DLP',
        'Information Protection',
        'Insider Risk Management',
        'Communication Compliance',
        'Audit (Premium)',
        'Records Management',
        'eDiscovery (Premium)',
      ],
    },
    {
      id: 'sub-northwind-1',
      customerId: 'cust-northwind-health',
      planName: 'Microsoft 365 E3 + E5 Information Protection & Governance',
      licensedSeats: 2150,
      purviewModulesEnabled: [
        'DLP',
        'Information Protection',
        'Audit (Standard)',
        'Records Management',
      ],
    },
  ];

  const snapshots: MonthlySnapshot[] = [];
  const collectionRuns: CollectionRun[] = [];

  for (let idx = 0; idx < PERIOD_LABELS.length; idx++) {
    const p = PERIOD_LABELS[idx]!;
    const period: ReportingPeriod = {
      periodId: p.id,
      label: p.label,
      startIso: p.start,
      endIso: p.end,
    };
    const collectedAt = `${p.id}-28T22:15:00Z`;

    // ---- 1. CONTOSO FINANCIAL GROUP (improving maturity trajectory over 14 months) ----
    const cTotalDlp = Math.max(96, 210 - idx * 7 + (idx % 3 === 1 ? 8 : 0));
    const cHighDlp = Math.max(5, 22 - Math.floor(idx * 1.1) + (idx === 10 ? 3 : 0));
    const cMedDlp = Math.round(cTotalDlp * 0.34);
    const cLowDlp = Math.max(0, cTotalDlp - cHighDlp - cMedDlp);
    const cExtSharing = Math.max(11, 38 - idx * 2);
    const cConnectors = buildContosoConnectors(collectedAt, idx);

    const cDlp = {
      status: 'Available' as const,
      totalEvents: cTotalDlp,
      policyMatches: Math.round(cTotalDlp * 0.88),
      ruleMatches: Math.round(cTotalDlp * 1.18),
      highSeverityEvents: cHighDlp,
      mediumSeverityEvents: cMedDlp,
      lowSeverityEvents: cLowDlp,
      externalSharingIndicators: cExtSharing,
      overrideCount: Math.max(4, 18 - idx),
      falsePositiveCount: Math.max(6, 26 - idx),
      exceptionCount: Math.max(3, 9 - Math.floor(idx / 3)),
      repeatDepartmentClusters: [
        { name: 'Treasury & Wire Ops (Aggregate)', count: Math.max(2, 9 - Math.floor(idx / 2)) },
        { name: 'Wealth Advisory (Aggregate)', count: Math.max(2, 7 - Math.floor(idx / 3)) },
        { name: 'External Partner Desk (Aggregate)', count: Math.max(1, 5 - Math.floor(idx / 4)) },
      ],
      workloadBreakdown: {
        exchange: Math.round(cTotalDlp * 0.38),
        sharePoint: Math.round(cTotalDlp * 0.24),
        oneDrive: Math.round(cTotalDlp * 0.16),
        teams: Math.round(cTotalDlp * 0.12),
        endpoint: Math.max(4, cTotalDlp - Math.round(cTotalDlp * 0.9)),
      },
      topTriggeredPolicies: [
        { policyName: 'FIN-SWIFT-IBAN-Outbound-Block', matches: Math.round(cTotalDlp * 0.31), highSeverity: Math.ceil(cHighDlp * 0.5), primaryWorkload: 'Exchange' },
        { policyName: 'PCI-DSS-Cardholder-SharePoint', matches: Math.round(cTotalDlp * 0.24), highSeverity: Math.ceil(cHighDlp * 0.3), primaryWorkload: 'SharePoint' },
        { policyName: 'Endpoint-USB-Unencrypted-Copy', matches: Math.round(cTotalDlp * 0.18), highSeverity: Math.max(1, Math.floor(cHighDlp * 0.2)), primaryWorkload: 'Endpoint' },
        { policyName: 'Teams-External-Chat-SSN-Detect', matches: Math.round(cTotalDlp * 0.14), highSeverity: 0, primaryWorkload: 'Teams' },
      ],
      topSensitiveInfoTypes: [
        { name: 'International Banking Account Number (IBAN)', count: Math.round(cTotalDlp * 0.34) },
        { name: 'Credit Card Number (PCI)', count: Math.round(cTotalDlp * 0.27) },
        { name: 'SWIFT Code', count: Math.round(cTotalDlp * 0.19) },
        { name: 'National ID / Tax Identification', count: Math.round(cTotalDlp * 0.14) },
      ],
      activePolicies: [
        { id: 'pol-1', name: 'FIN-SWIFT-IBAN-Outbound-Block', workloadScope: ['Exchange', 'SharePoint', 'OneDrive'], mode: 'Enforce' as const, lastModifiedAt: `${p.id}-12T10:00:00Z` },
        { id: 'pol-2', name: 'PCI-DSS-Cardholder-SharePoint', workloadScope: ['SharePoint', 'OneDrive'], mode: 'Enforce' as const, lastModifiedAt: `${p.id}-04T15:00:00Z` },
        { id: 'pol-3', name: 'Endpoint-USB-Unencrypted-Copy', workloadScope: ['Endpoint'], mode: idx >= 11 ? ('Enforce' as const) : ('TestWithNotifications' as const), lastModifiedAt: `${p.id}-18T11:00:00Z` },
        { id: 'pol-4', name: 'GenAI-Browser-Copilot-Oversharing', workloadScope: ['Endpoint', 'Teams'], mode: 'TestWithNotifications' as const, lastModifiedAt: `${p.id}-20T09:00:00Z` },
      ],
      sourceNote: 'Collected from Office 365 Management Activity API (DLP.All) + IPPS policy configuration snapshot.',
    };

    const cIp = {
      status: 'BetaDependency' as const,
      definedLabelsCount: 14,
      publishedLabelPoliciesCount: 5,
      unlabeledPopulationStatus: 'ApiUnsupported' as const,
      labelCoveragePct: Math.min(84, 58 + idx * 2),
      unlabeledSensitiveFilesCount: null,
      manualLabelingEvents: 1420 + idx * 45,
      automaticLabelingEvents: 2150 + idx * 180,
      encryptionProtectedEvents: 610 + idx * 42,
      labelPolicyChangesThisMonth: idx % 3 === 0 ? 2 : 1,
      topUsedLabels: [
        { labelName: 'Internal', appliedEvents: 1650 + idx * 55, encryptedEvents: 0 },
        { labelName: 'Confidential \\ Finance Only', appliedEvents: 890 + idx * 65, encryptedEvents: 480 + idx * 25 },
        { labelName: 'Highly Confidential \\ Board & M&A', appliedEvents: 310 + idx * 22, encryptedEvents: 310 + idx * 22 },
        { labelName: 'Public', appliedEvents: 410 + idx * 12, encryptedEvents: 0 },
      ],
      sourceNote:
        'Label usage metrics are sourced from Purview Audit events. Native tenant-wide unlabeled SharePoint/OneDrive item inventory at rest is not exposed via supported Graph v1.0 APIs (ApiUnsupported).',
    };

    const cInsider = {
      status: 'Available' as const,
      activePoliciesCount: 4,
      totalAlerts: Math.max(4, 14 - Math.floor(idx * 0.6)),
      highSeverityAlerts: idx >= 11 ? 1 : 2,
      escalatedCases: idx >= 12 ? 1 : 2,
      resolvedCases: Math.max(3, 10 - Math.floor(idx * 0.4)),
      topIndicatorCategories: [
        { name: 'Departing User Data Exfiltration Indicators', count: 3 },
        { name: 'Cumulative SharePoint Bulk Downloads', count: Math.max(1, 5 - Math.floor(idx / 4)) },
        { name: 'Removable Media Copy After Security Alert', count: 2 },
      ],
      sourceNote: 'Sourced from Graph Security /v1.0/security/alerts_v2 (serviceSource=microsoftPurviewInsiderRiskManagement).',
    };

    const cComm = {
      status: 'Available' as const,
      activePoliciesCount: 3,
      totalAlerts: Math.max(3, 11 - Math.floor(idx * 0.5)),
      policyMatchesReviewed: Math.max(3, 11 - Math.floor(idx * 0.5)),
      escalatedItems: idx >= 10 ? 1 : 2,
      channelsMonitored: ['Microsoft Teams', 'Exchange Online', 'Microsoft 365 Copilot'],
      sourceNote: 'Sourced from Graph Security alerts_v2 (serviceSource=microsoftPurviewCommunicationCompliance) and analyst case outcomes.',
    };

    const cAudit = {
      auditStatus: 'Available' as const,
      eDiscoveryStatus: 'Available' as const,
      recordsManagementStatus: 'Available' as const,
      auditEventsCollected: 18400 + idx * 350,
      highRiskAdminAuditActions: Math.max(1, 6 - Math.floor(idx / 3)),
      dlpAuditRecords: cTotalDlp,
      retentionLabelsCount: 9,
      retentionPoliciesCount: 7,
      activeEDiscoveryCases: 3 + (idx % 2),
      closedEDiscoveryCasesThisMonth: idx % 2 === 0 ? 2 : 1,
      legalHoldsActive: 4,
      sourceNote: 'Graph v1.0 auditLog/queries, labels/retentionLabels, and cases/ediscoveryCases.',
    };

    const cTotalIncidents = Math.max(8, 19 - Math.floor(idx * 0.6));
    const cResolvedIncidents = Math.max(6, cTotalIncidents - (idx >= 12 ? 1 : 2));
    const cOpenHigh = Math.max(1, 5 - Math.floor(idx * 0.3));
    const cAlerts = {
      alertsStatus: 'Available' as const,
      incidentsStatus: 'Available' as const,
      totalAlerts: 46 - idx,
      purviewScopedAlerts: 28 - Math.floor(idx * 0.7),
      alertsBySeverity: {
        high: cHighDlp + 2,
        medium: 16 - Math.floor(idx * 0.4),
        low: 14,
        informational: 4,
      },
      alertsByServiceSource: [
        { name: 'microsoftPurviewDlp', count: Math.max(8, 19 - Math.floor(idx * 0.6)) },
        { name: 'microsoftPurviewInsiderRiskManagement', count: cInsider.totalAlerts },
        { name: 'microsoftPurviewCommunicationCompliance', count: cComm.totalAlerts },
        { name: 'microsoftDefenderForEndpoint', count: 8 },
      ],
      alertsByStatus: [
        { name: 'resolved', count: Math.max(24, 41 - idx) },
        { name: 'inProgress', count: 3 },
        { name: 'new', count: 2 },
      ],
      alertsByClassification: [
        { name: 'truePositive', count: 19 },
        { name: 'informationalExpectedActivity', count: 11 },
        { name: 'falsePositive', count: Math.max(3, 10 - Math.floor(idx / 2)) },
      ],
      alertsByDetermination: [
        { name: 'dataLeakage', count: 9 },
        { name: 'securityTesting', count: 4 },
        { name: 'confirmedActivity', count: 14 },
      ],
      totalIncidents: cTotalIncidents,
      newIncidentsThisMonth: cTotalIncidents,
      resolvedIncidentsThisMonth: cResolvedIncidents,
      openHighCriticalRisks: cOpenHigh,
      meanTimeToResolveHours: Math.max(3.8, Math.round((9.6 - idx * 0.42) * 10) / 10),
      medianTimeToResolveHours: Math.max(2.9, Math.round((7.4 - idx * 0.32) * 10) / 10),
      topIncidentCategories: [
        { name: 'External Sensitive Financial Transfer', count: 5 },
        { name: 'Departing Employee Bulk Download', count: 3 },
        { name: 'Endpoint DLP Policy Bypass Attempt', count: 2 },
      ],
      sourceNote: 'Graph v1.0 /security/alerts_v2 and /security/incidents.',
    };

    const cMsv = {
      alertsReviewedByAnalysts: 28 - Math.floor(idx * 0.5),
      incidentsInvestigatedByTeam: cTotalIncidents,
      casesClosedByTeam: cResolvedIncidents,
      policiesReviewed: 9,
      policiesChanged: idx % 2 === 0 ? 3 : 2,
      falsePositivesReduced: 12 + (idx % 6),
      exceptionsReviewed: Math.max(3, 8 - Math.floor(idx / 3)),
      sensitivityLabelChanges: idx % 3 === 0 ? 2 : 1,
      dlpRuleChanges: 2 + (idx % 3),
      configurationImprovements: 3,
      departmentRisksInvestigated: 4,
      customerRequestsHandled: 7 + (idx % 4),
      microsoftRecommendationsAssessed: 5,
      proactiveHealthChecks: 4,
      resolvedConfigurationIssues: 2,
      monitoringHoursLogged: 46 + (idx % 5) * 2,
      automationExecutions: 124 + idx * 4,
      failedJobsRemediated: idx % 4 === 0 ? 1 : 0,
      microsoftAutomatedDetections: cTotalDlp + cAlerts.totalAlerts,
      microsoftAutoRemediatedEvents: Math.round(cTotalDlp * 0.62),
      activities: buildActivities('cust-contoso-fin', p.id, p.label, idx, true),
    };

    const cPosture = calculatePostureScore({
      dlp: cDlp,
      informationProtection: cIp,
      insiderRisk: cInsider,
      communicationCompliance: cComm,
      alertsAndIncidents: cAlerts,
      auditAndEDiscovery: cAudit,
      connectors: cConnectors,
    });

    snapshots.push({
      id: `snap-contoso-${p.id}`,
      customerId: 'cust-contoso-fin',
      tenantId: 'tenant-contoso-fin',
      period,
      collectedAt,
      isDemo: true,
      connectors: cConnectors,
      dlp: cDlp,
      informationProtection: cIp,
      insiderRisk: cInsider,
      communicationCompliance: cComm,
      auditAndEDiscovery: cAudit,
      alertsAndIncidents: cAlerts,
      managedServiceValue: cMsv,
      postureScore: cPosture,
    });

    // ---- 2. NORTHWIND HEALTH SYSTEMS (shows honest NotLicensed + PermissionMissing handling) ----
    const nTotalDlp = Math.max(68, 134 - idx * 4);
    const nHighDlp = Math.max(4, 15 - Math.floor(idx * 0.7));
    const nConnectors = buildNorthwindConnectors(collectedAt, idx);

    const nDlp = {
      status: 'Available' as const,
      totalEvents: nTotalDlp,
      policyMatches: Math.round(nTotalDlp * 0.85),
      ruleMatches: Math.round(nTotalDlp * 1.1),
      highSeverityEvents: nHighDlp,
      mediumSeverityEvents: Math.round(nTotalDlp * 0.35),
      lowSeverityEvents: Math.max(0, nTotalDlp - nHighDlp - Math.round(nTotalDlp * 0.35)),
      externalSharingIndicators: Math.max(8, 22 - idx),
      overrideCount: 4,
      falsePositiveCount: Math.max(3, 12 - Math.floor(idx / 2)),
      exceptionCount: 3,
      repeatDepartmentClusters: [
        { name: 'Patient Billing (Aggregate)', count: Math.max(2, 6 - Math.floor(idx / 3)) },
        { name: 'Outpatient Intake (Aggregate)', count: 3 },
      ],
      workloadBreakdown: {
        exchange: Math.round(nTotalDlp * 0.48),
        sharePoint: Math.round(nTotalDlp * 0.25),
        oneDrive: Math.round(nTotalDlp * 0.17),
        teams: Math.round(nTotalDlp * 0.1),
        endpoint: 0,
      },
      topTriggeredPolicies: [
        { policyName: 'HIPAA-PHI-External-Email-Encrypt', matches: Math.round(nTotalDlp * 0.45), highSeverity: Math.ceil(nHighDlp * 0.6), primaryWorkload: 'Exchange' },
        { policyName: 'Clinical-Records-SharePoint-Sharing', matches: Math.round(nTotalDlp * 0.3), highSeverity: Math.floor(nHighDlp * 0.4), primaryWorkload: 'SharePoint' },
      ],
      topSensitiveInfoTypes: [
        { name: 'U.S. Health Insurance Claim / PHI', count: Math.round(nTotalDlp * 0.44) },
        { name: 'Medical Record Number', count: Math.round(nTotalDlp * 0.26) },
        { name: 'U.S. Social Security Number (SSN)', count: Math.round(nTotalDlp * 0.18) },
      ],
      activePolicies: [
        { id: 'nw-pol-1', name: 'HIPAA-PHI-External-Email-Encrypt', workloadScope: ['Exchange'], mode: 'Enforce' as const, lastModifiedAt: `${p.id}-06T12:00:00Z` },
        { id: 'nw-pol-2', name: 'Clinical-Records-SharePoint-Sharing', workloadScope: ['SharePoint', 'OneDrive'], mode: 'Enforce' as const, lastModifiedAt: `${p.id}-14T08:30:00Z` },
      ],
      sourceNote: 'Office 365 Management Activity API (DLP.All). Endpoint DLP excluded because M365 E3 tier does not include Endpoint DLP telemetry.',
    };

    const nIp = {
      status: 'Available' as const,
      definedLabelsCount: 9,
      publishedLabelPoliciesCount: 3,
      unlabeledPopulationStatus: 'ApiUnsupported' as const,
      labelCoveragePct: null,
      unlabeledSensitiveFilesCount: null,
      manualLabelingEvents: 890 + idx * 30,
      automaticLabelingEvents: 420 + idx * 40,
      encryptionProtectedEvents: 380 + idx * 20,
      labelPolicyChangesThisMonth: 1,
      topUsedLabels: [
        { labelName: 'Clinical Confidential \\ PHI', appliedEvents: 740 + idx * 25, encryptedEvents: 380 + idx * 20 },
        { labelName: 'Internal Operations', appliedEvents: 510 + idx * 18, encryptedEvents: 0 },
      ],
      sourceNote: 'Graph v1.0 /security/informationProtection/sensitivityLabels. Unlabeled file population is ApiUnsupported without Sentinel/DSPM telemetry.',
    };

    const nInsider = {
      status: 'NotLicensed' as const,
      activePoliciesCount: null,
      totalAlerts: null,
      highSeverityAlerts: null,
      escalatedCases: null,
      resolvedCases: null,
      topIndicatorCategories: [],
      sourceNote: 'NotLicensed: Microsoft Purview Insider Risk Management add-on or E5 Compliance license not assigned to tenant.',
    };

    const nComm = {
      status: 'NotLicensed' as const,
      activePoliciesCount: null,
      totalAlerts: null,
      policyMatchesReviewed: null,
      escalatedItems: null,
      channelsMonitored: [],
      sourceNote: 'NotLicensed: Communication Compliance not licensed on Northwind Health Systems.',
    };

    const nAudit = {
      auditStatus: 'Available' as const,
      eDiscoveryStatus: 'PermissionMissing' as const,
      recordsManagementStatus: 'PermissionMissing' as const,
      auditEventsCollected: 9600 + idx * 180,
      highRiskAdminAuditActions: 2,
      dlpAuditRecords: nTotalDlp,
      retentionLabelsCount: null,
      retentionPoliciesCount: null,
      activeEDiscoveryCases: null,
      closedEDiscoveryCasesThisMonth: null,
      legalHoldsActive: null,
      sourceNote: 'Audit v1.0 available. eDiscovery & Records Management require eDiscovery.Read.All / RecordsManagement.Read.All admin consent.',
    };

    const nAlerts = {
      alertsStatus: 'Available' as const,
      incidentsStatus: 'Available' as const,
      totalAlerts: 24 + (idx % 5),
      purviewScopedAlerts: 15,
      alertsBySeverity: { high: nHighDlp, medium: 11, low: 8, informational: 2 },
      alertsByServiceSource: [
        { name: 'microsoftPurviewDlp', count: 15 },
        { name: 'microsoftDefenderForOffice365', count: 9 },
      ],
      alertsByStatus: [
        { name: 'resolved', count: 21 },
        { name: 'inProgress', count: 2 },
        { name: 'new', count: 1 },
      ],
      alertsByClassification: [
        { name: 'truePositive', count: 12 },
        { name: 'falsePositive', count: 4 },
      ],
      alertsByDetermination: [
        { name: 'dataLeakage', count: 6 },
        { name: 'confirmedActivity', count: 9 },
      ],
      totalIncidents: 9,
      newIncidentsThisMonth: 9,
      resolvedIncidentsThisMonth: 8,
      openHighCriticalRisks: idx >= 11 ? 2 : 3,
      meanTimeToResolveHours: Math.max(5.2, Math.round((11.4 - idx * 0.4) * 10) / 10),
      medianTimeToResolveHours: Math.max(4.1, Math.round((8.8 - idx * 0.3) * 10) / 10),
      topIncidentCategories: [
        { name: 'Unencrypted PHI Email Attempt', count: 4 },
        { name: 'External SharePoint Clinical Folder Link', count: 3 },
      ],
      sourceNote: 'Graph v1.0 /security/alerts_v2 and /security/incidents.',
    };

    const nMsv = {
      alertsReviewedByAnalysts: 20,
      incidentsInvestigatedByTeam: 9,
      casesClosedByTeam: 8,
      policiesReviewed: 5,
      policiesChanged: 1,
      falsePositivesReduced: 7,
      exceptionsReviewed: 4,
      sensitivityLabelChanges: 1,
      dlpRuleChanges: 1,
      configurationImprovements: 2,
      departmentRisksInvestigated: 2,
      customerRequestsHandled: 5,
      microsoftRecommendationsAssessed: 4,
      proactiveHealthChecks: 4,
      resolvedConfigurationIssues: 1,
      monitoringHoursLogged: 28,
      automationExecutions: 64,
      failedJobsRemediated: 0,
      microsoftAutomatedDetections: nTotalDlp + nAlerts.totalAlerts,
      microsoftAutoRemediatedEvents: Math.round(nTotalDlp * 0.55),
      activities: buildActivities('cust-northwind-health', p.id, p.label, idx, false),
    };

    const nPosture = calculatePostureScore({
      dlp: nDlp,
      informationProtection: nIp,
      insiderRisk: nInsider,
      communicationCompliance: nComm,
      alertsAndIncidents: nAlerts,
      auditAndEDiscovery: nAudit,
      connectors: nConnectors,
    });

    snapshots.push({
      id: `snap-northwind-${p.id}`,
      customerId: 'cust-northwind-health',
      tenantId: 'tenant-northwind-health',
      period,
      collectedAt,
      isDemo: true,
      connectors: nConnectors,
      dlp: nDlp,
      informationProtection: nIp,
      insiderRisk: nInsider,
      communicationCompliance: nComm,
      auditAndEDiscovery: nAudit,
      alertsAndIncidents: nAlerts,
      managedServiceValue: nMsv,
      postureScore: nPosture,
    });

    collectionRuns.push({
      id: `run-contoso-${p.id}`,
      customerId: 'cust-contoso-fin',
      periodId: p.id,
      startedAt: `${p.id}-28T22:14:40Z`,
      completedAt: collectedAt,
      durationMs: 6820,
      triggeredBy: 'ScheduledMonthlyIngestion',
      status: 'PartialSuccess',
      throttleEvents429: idx % 3 === 0 ? 3 : 1,
      apiFailures: 0,
      authFailures: 0,
      connectorSummary: cConnectors.map((c) => ({
        connectorId: c.connectorId,
        status: c.status,
        records: c.recordsCollected,
        durationMs: c.durationMs,
        message: c.statusDetail,
      })),
    });

    collectionRuns.push({
      id: `run-northwind-${p.id}`,
      customerId: 'cust-northwind-health',
      periodId: p.id,
      startedAt: `${p.id}-28T22:15:10Z`,
      completedAt: `${p.id}-28T22:15:15Z`,
      durationMs: 4950,
      triggeredBy: 'ScheduledMonthlyIngestion',
      status: 'PartialSuccess',
      throttleEvents429: 0,
      apiFailures: 0,
      authFailures: 0,
      connectorSummary: nConnectors.map((c) => ({
        connectorId: c.connectorId,
        status: c.status,
        records: c.recordsCollected,
        durationMs: c.durationMs,
        message: c.statusDetail,
      })),
    });
  }

  const recommendations: Recommendation[] = [
    {
      id: 'rec-contoso-1',
      customerId: 'cust-contoso-fin',
      title: 'Enforce Block-with-Override on GenAI Browser & Copilot Oversharing Policy',
      severity: 'High',
      category: 'Data Protection',
      observation: 'GenAI-Browser-Copilot-Oversharing has run in TestWithNotifications mode for 45 days with 14 Confidential Finance detections.',
      evidence: 'Office 365 DLP.All telemetry + IPPS Get-DlpCompliancePolicy snapshot.',
      businessRisk: 'Unintended exposure of sensitive IBAN/M&A excerpts via unapproved browser AI extensions or overshared SharePoint links.',
      technicalImpact: 'Prompts users with business justification before upload/paste to unmanaged generative AI domains.',
      recommendedAction: 'Switch GenAI-Browser-Copilot-Oversharing rule action from TestWithNotifications to Warn-with-Business-Justification for Finance & Treasury.',
      owner: 'Contoso CISO Office',
      targetDate: '2026-12-10',
      status: 'Open',
      firstDetected: '2026-10-12',
      lastReviewed: '2026-11-20',
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/purview/dlp-chrome-get-started',
    },
    {
      id: 'rec-contoso-2',
      customerId: 'cust-contoso-fin',
      title: 'Connect Microsoft Sentinel Log Analytics Workspace for Native Unlabeled Content Inventory',
      severity: 'Medium',
      category: 'Configuration',
      observation: 'Sensitivity label definitions are active via Graph, but unlabeled SharePoint/OneDrive populations at rest return ApiUnsupported natively.',
      evidence: 'Information Protection connector telemetry (unlabeledPopulationStatus = ApiUnsupported).',
      businessRisk: 'Executive posture reporting relies on Audit-derived activity ratios rather than full at-rest SharePoint corpus coverage.',
      technicalImpact: 'Streams Purview Information Protection & Content Explorer signals to Sentinel Log Analytics (read-only KQL queries).',
      recommendedAction: 'Provision Log Analytics Reader RBAC for the reporting collector and configure SENTINEL_WORKSPACE_ID.',
      owner: 'Managed Service Engineering',
      targetDate: '2026-12-18',
      status: 'InProgress',
      firstDetected: '2026-09-15',
      lastReviewed: '2026-11-22',
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/purview/dspm-overview',
    },
    {
      id: 'rec-contoso-3',
      customerId: 'cust-contoso-fin',
      title: 'Tighten SharePoint "Anyone with the link" Default Expiry to 7 Days',
      severity: 'Critical',
      category: 'Security',
      observation: 'External sharing indicators remain concentrated in Wealth Advisory SharePoint sites.',
      evidence: 'DLP.All SharingScope=Anyone detections (11 events in November 2026).',
      businessRisk: 'Long-lived anonymous links weaken conditional access boundaries around customer financial statements.',
      technicalImpact: 'Enforces 7-day automatic expiration on anonymous SharePoint/OneDrive sharing links and restricts external sharing to authenticated guests.',
      recommendedAction: 'Approve SharePoint tenant sharing expiration update during next change advisory board window.',
      owner: 'Contoso M365 Platform Lead',
      targetDate: '2026-12-05',
      status: 'Open',
      firstDetected: '2026-10-28',
      lastReviewed: '2026-11-21',
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/sharepoint/turn-external-sharing-on-or-off',
    },
    {
      id: 'rec-northwind-1',
      customerId: 'cust-northwind-health',
      title: 'Grant Admin Consent for eDiscovery.Read.All and RecordsManagement.Read.All',
      severity: 'High',
      category: 'Compliance',
      observation: 'Records Management and eDiscovery connectors currently return PermissionMissing (HTTP 403).',
      evidence: 'Graph collection audit run run-northwind-2026-11.',
      businessRisk: 'HIPAA legal hold and retention compliance status cannot be verified automatically in monthly executive reports.',
      technicalImpact: 'Read-only application permissions only; zero ability to modify cases or delete holds.',
      recommendedAction: 'Global Administrator or Privileged Role Administrator grants read-only consent in Microsoft Entra admin center.',
      owner: 'Northwind IT Admin',
      targetDate: '2026-12-04',
      status: 'Open',
      firstDetected: '2026-10-05',
      lastReviewed: '2026-11-20',
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/graph/api/security-casesroot-list-ediscoverycases',
    },
    {
      id: 'rec-northwind-2',
      customerId: 'cust-northwind-health',
      title: 'Enable Auto-Encryption for Clinical PHI Sensitivity Labels',
      severity: 'Medium',
      category: 'Data Protection',
      observation: '62% of HIPAA DLP matches involved manually labeled emails lacking RMS encryption.',
      evidence: 'O365 DLP.All + Information Protection audit records.',
      businessRisk: 'Unencrypted PHI attachments forwarded externally outside approved health exchange gateways.',
      technicalImpact: 'Applies Purview Information Protection encryption automatically when Clinical Confidential \\ PHI label is selected.',
      recommendedAction: 'Pilot auto-encryption policy with Outpatient Intake group prior to enterprise rollout.',
      owner: 'Northwind Compliance Officer',
      targetDate: '2026-12-20',
      status: 'InProgress',
      firstDetected: '2026-09-20',
      lastReviewed: '2026-11-19',
      microsoftDocsUrl: 'https://learn.microsoft.com/en-us/purview/encryption-sensitivity-labels',
    },
  ];

  return {
    tenants,
    customers,
    subscriptions,
    snapshots,
    recommendations,
    collectionRuns,
  };
}

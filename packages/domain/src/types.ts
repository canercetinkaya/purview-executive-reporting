export type ConnectorAvailabilityStatus =
  | 'Available'
  | 'Unavailable'
  | 'PermissionMissing'
  | 'NotLicensed'
  | 'ApiUnsupported'
  | 'CollectionFailed'
  | 'BetaDependency';

export type ConnectorId =
  | 'graph-security-alerts-v2'
  | 'graph-security-incidents'
  | 'purview-audit-log'
  | 'o365-management-dlp'
  | 'information-protection-labels'
  | 'records-and-ediscovery'
  | 'powershell-compliance-bridge'
  | 'sentinel-analytics';

export type RagStatus = 'Green' | 'Amber' | 'Red' | 'Unavailable';
export type TrendDirection = 'up' | 'down' | 'flat' | 'na';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type TrendWindow = 'MoM' | '3M' | '6M' | '12M' | 'QoQ' | 'YoY';

export type ApplicationRole =
  | 'PlatformAdmin'
  | 'ServiceManager'
  | 'SecurityAnalyst'
  | 'ComplianceAnalyst'
  | 'CustomerAdministrator'
  | 'CustomerExecutive'
  | 'CustomerReader';

export interface AuthenticatedPrincipal {
  userId: string;
  displayName: string;
  email: string;
  role: ApplicationRole;
  /** Non-empty for customer-scoped roles; null/empty only for multi-customer provider staff. */
  assignedCustomerIds: string[];
  authMethod: 'entra' | 'demo';
}

export interface Tenant {
  id: string;
  azureTenantId: string;
  primaryDomain: string;
  licenseTier: string;
  region: string;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  industry: string;
  serviceTier: 'Managed Purview Enterprise' | 'Managed Purview Standard';
  primaryContactEmail: string;
  isDemo: boolean;
}

export interface Subscription {
  id: string;
  customerId: string;
  planName: string;
  licensedSeats: number;
  purviewModulesEnabled: string[];
}

export interface DataSourceDescriptor {
  connectorId: ConnectorId;
  displayName: string;
  microsoftProduct: string;
  endpointOrCmdlet: string;
  apiChannel: 'Graph v1.0' | 'Graph Beta' | 'O365 Management v1.0' | 'Security & Compliance PowerShell' | 'Sentinel Log Analytics' | 'Manual / Operations';
  status: ConnectorAvailabilityStatus;
  statusDetail: string;
  lastCollectedAt: string | null;
  recordsCollected: number;
  throttleCount429: number;
  durationMs: number;
  isBeta: boolean;
  documentationUrl: string;
}

export interface ReportingPeriod {
  periodId: string; // YYYY-MM
  label: string;
  startIso: string;
  endIso: string;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface PolicyConfigurationSummary {
  id: string;
  name: string;
  workloadScope: string[];
  mode: 'Enforce' | 'TestWithNotifications' | 'TestWithoutNotifications' | 'Disabled';
  lastModifiedAt: string;
}

export interface DlpAnalytics {
  status: ConnectorAvailabilityStatus;
  totalEvents: number | null;
  policyMatches: number | null;
  ruleMatches: number | null;
  highSeverityEvents: number | null;
  mediumSeverityEvents: number | null;
  lowSeverityEvents: number | null;
  externalSharingIndicators: number | null;
  overrideCount: number | null;
  falsePositiveCount: number | null;
  exceptionCount: number | null;
  /** Operational repeat count aggregated only by anonymized team/department unit (privacy-preserving). */
  repeatDepartmentClusters: NamedCount[];
  workloadBreakdown: {
    exchange: number | null;
    sharePoint: number | null;
    oneDrive: number | null;
    teams: number | null;
    endpoint: number | null;
  };
  topTriggeredPolicies: Array<{
    policyName: string;
    matches: number;
    highSeverity: number;
    primaryWorkload: string;
  }>;
  topSensitiveInfoTypes: NamedCount[];
  activePolicies: PolicyConfigurationSummary[];
  sourceNote: string;
}

export interface InformationProtectionMetrics {
  status: ConnectorAvailabilityStatus;
  definedLabelsCount: number | null;
  publishedLabelPoliciesCount: number | null;
  /** Explicit API limitation flag when unlabeled files at rest cannot be enumerated natively. */
  unlabeledPopulationStatus: ConnectorAvailabilityStatus;
  /** Null unless Sentinel / DSPM / PowerShell export provides verified coverage data. */
  labelCoveragePct: number | null;
  unlabeledSensitiveFilesCount: number | null;
  manualLabelingEvents: number | null;
  automaticLabelingEvents: number | null;
  encryptionProtectedEvents: number | null;
  labelPolicyChangesThisMonth: number | null;
  topUsedLabels: Array<{
    labelName: string;
    appliedEvents: number;
    encryptedEvents: number;
  }>;
  sourceNote: string;
}

export interface InsiderRiskMetrics {
  status: ConnectorAvailabilityStatus;
  activePoliciesCount: number | null;
  totalAlerts: number | null;
  highSeverityAlerts: number | null;
  escalatedCases: number | null;
  resolvedCases: number | null;
  topIndicatorCategories: NamedCount[];
  sourceNote: string;
}

export interface CommunicationComplianceMetrics {
  status: ConnectorAvailabilityStatus;
  activePoliciesCount: number | null;
  totalAlerts: number | null;
  policyMatchesReviewed: number | null;
  escalatedItems: number | null;
  channelsMonitored: string[];
  sourceNote: string;
}

export interface AuditAndEDiscoveryMetrics {
  auditStatus: ConnectorAvailabilityStatus;
  eDiscoveryStatus: ConnectorAvailabilityStatus;
  recordsManagementStatus: ConnectorAvailabilityStatus;
  auditEventsCollected: number | null;
  highRiskAdminAuditActions: number | null;
  dlpAuditRecords: number | null;
  retentionLabelsCount: number | null;
  retentionPoliciesCount: number | null;
  activeEDiscoveryCases: number | null;
  closedEDiscoveryCasesThisMonth: number | null;
  legalHoldsActive: number | null;
  sourceNote: string;
}

export interface SecurityAlertsAndIncidents {
  alertsStatus: ConnectorAvailabilityStatus;
  incidentsStatus: ConnectorAvailabilityStatus;
  totalAlerts: number | null;
  purviewScopedAlerts: number | null;
  alertsBySeverity: Record<'high' | 'medium' | 'low' | 'informational', number>;
  alertsByServiceSource: NamedCount[];
  alertsByStatus: NamedCount[];
  alertsByClassification: NamedCount[];
  alertsByDetermination: NamedCount[];
  totalIncidents: number | null;
  newIncidentsThisMonth: number | null;
  resolvedIncidentsThisMonth: number | null;
  openHighCriticalRisks: number | null;
  meanTimeToResolveHours: number | null;
  medianTimeToResolveHours: number | null;
  topIncidentCategories: NamedCount[];
  sourceNote: string;
}

export type ManagedActivityCategory =
  | 'AlertTriage'
  | 'IncidentInvestigation'
  | 'CaseClosure'
  | 'PolicyTuning'
  | 'DlpRuleChange'
  | 'SensitivityLabelChange'
  | 'FalsePositiveReduction'
  | 'ExceptionReview'
  | 'RecommendationAssessment'
  | 'HealthCheck'
  | 'CustomerRequest'
  | 'AutomationRemediation';

export interface ManagedServiceActivity {
  id: string;
  customerId: string;
  periodId: string;
  performedAt: string;
  performedBy: string;
  category: ManagedActivityCategory;
  title: string;
  summary: string;
  outcome: string;
  origin: 'ManagedServiceTeam';
}

export interface ManagedServiceValueSummary {
  /** Strictly tracked Managed Service Team activity — NEVER Microsoft automated counts. */
  alertsReviewedByAnalysts: number;
  incidentsInvestigatedByTeam: number;
  casesClosedByTeam: number;
  policiesReviewed: number;
  policiesChanged: number;
  falsePositivesReduced: number;
  exceptionsReviewed: number;
  sensitivityLabelChanges: number;
  dlpRuleChanges: number;
  configurationImprovements: number;
  departmentRisksInvestigated: number;
  customerRequestsHandled: number;
  microsoftRecommendationsAssessed: number;
  proactiveHealthChecks: number;
  resolvedConfigurationIssues: number;
  monitoringHoursLogged: number;
  automationExecutions: number;
  failedJobsRemediated: number;
  /** Separate reference counts of Microsoft-automated detections for strict transparency. */
  microsoftAutomatedDetections: number | null;
  microsoftAutoRemediatedEvents: number | null;
  activities: ManagedServiceActivity[];
}

export type RecommendationCategory =
  | 'Security'
  | 'Compliance'
  | 'Data Protection'
  | 'Operational'
  | 'Configuration'
  | 'Optimization';

export type RecommendationStatus = 'Open' | 'InProgress' | 'AcceptedRisk' | 'Resolved';

export interface Recommendation {
  id: string;
  customerId: string;
  title: string;
  severity: Severity;
  category: RecommendationCategory;
  observation: string;
  evidence: string;
  businessRisk: string;
  technicalImpact: string;
  recommendedAction: string;
  owner: string;
  targetDate: string;
  status: RecommendationStatus;
  firstDetected: string;
  lastReviewed: string;
  microsoftDocsUrl: string;
}

export interface ScorecardRow {
  id: string;
  metric: string;
  currentMonth: number | null;
  previousMonth: number | null;
  unit: string;
  changePct: number | null;
  trend: TrendDirection;
  targetLabel: string;
  status: RagStatus;
  source: string;
  drilldownHref: string;
  higherIsBetter: boolean;
}

export interface PostureScoreComponent {
  id: string;
  name: string;
  weight: number;
  effectiveWeight: number;
  score: number | null;
  status: ConnectorAvailabilityStatus;
  sourceMetrics: string;
  calculationDetail: string;
}

export interface PostureScoreBreakdown {
  overallScore: number | null;
  rating: 'Strong' | 'Moderate' | 'NeedsAttention' | 'InsufficientData';
  formula: string;
  unavailableNote: string | null;
  components: PostureScoreComponent[];
}

export interface ExecutiveNarrative {
  periodId: string;
  generatedAt: string;
  isDemo: boolean;
  overallStatus: string;
  whatChangedThisMonth: string;
  topRisks: string[];
  positiveImprovements: string[];
  managedServiceActions: string;
  businessImpact: string;
  itemsRequiringCustomerDecision: string[];
  nextMonthPriorities: string[];
  dataLimitationsNote: string | null;
}

export interface CollectionRun {
  id: string;
  customerId: string;
  periodId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  triggeredBy: string;
  status: 'Succeeded' | 'PartialSuccess' | 'Failed';
  throttleEvents429: number;
  apiFailures: number;
  authFailures: number;
  connectorSummary: Array<{
    connectorId: ConnectorId;
    status: ConnectorAvailabilityStatus;
    records: number;
    durationMs: number;
    message: string;
  }>;
}

export interface MonthlySnapshot {
  id: string;
  customerId: string;
  tenantId: string;
  period: ReportingPeriod;
  collectedAt: string;
  isDemo: boolean;
  connectors: DataSourceDescriptor[];
  dlp: DlpAnalytics;
  informationProtection: InformationProtectionMetrics;
  insiderRisk: InsiderRiskMetrics;
  communicationCompliance: CommunicationComplianceMetrics;
  auditAndEDiscovery: AuditAndEDiscoveryMetrics;
  alertsAndIncidents: SecurityAlertsAndIncidents;
  managedServiceValue: ManagedServiceValueSummary;
  postureScore: PostureScoreBreakdown;
}

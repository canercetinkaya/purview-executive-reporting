import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  assertCustomerAccess,
  assertPermission,
  calculatePostureScore,
  hasPermission,
} from '../src/index.js';
import type { AuthenticatedPrincipal } from '../src/index.js';
import type { PostureScoreInputs } from '../src/scoring.js';

function makePrincipal(overrides: Partial<AuthenticatedPrincipal>): AuthenticatedPrincipal {
  return {
    userId: 'usr-1',
    displayName: 'Test User',
    email: 'test@contoso.com',
    role: 'CustomerReader',
    assignedCustomerIds: ['cust-contoso-fin'],
    authMethod: 'demo',
    ...overrides,
  };
}

function makeScoreInputs(): PostureScoreInputs {
  return {
    dlp: {
      status: 'Available',
      totalEvents: 100,
      policyMatches: 85,
      ruleMatches: 112,
      highSeverityEvents: 8,
      mediumSeverityEvents: 34,
      lowSeverityEvents: 58,
      externalSharingIndicators: 14,
      overrideCount: 5,
      falsePositiveCount: 7,
      exceptionCount: 4,
      repeatDepartmentClusters: [],
      workloadBreakdown: { exchange: 40, sharePoint: 30, oneDrive: 15, teams: 10, endpoint: 5 },
      topTriggeredPolicies: [],
      topSensitiveInfoTypes: [],
      activePolicies: [],
      sourceNote: 'test',
    },
    informationProtection: {
      status: 'Available',
      definedLabelsCount: 12,
      publishedLabelPoliciesCount: 4,
      unlabeledPopulationStatus: 'ApiUnsupported',
      labelCoveragePct: 74,
      unlabeledSensitiveFilesCount: null,
      manualLabelingEvents: 500,
      automaticLabelingEvents: 1200,
      encryptionProtectedEvents: 350,
      labelPolicyChangesThisMonth: 1,
      topUsedLabels: [],
      sourceNote: 'test',
    },
    insiderRisk: {
      status: 'Available',
      activePoliciesCount: 3,
      totalAlerts: 6,
      highSeverityAlerts: 1,
      escalatedCases: 1,
      resolvedCases: 5,
      topIndicatorCategories: [],
      sourceNote: 'test',
    },
    communicationCompliance: {
      status: 'Available',
      activePoliciesCount: 2,
      totalAlerts: 4,
      policyMatchesReviewed: 4,
      escalatedItems: 1,
      channelsMonitored: ['Teams', 'Exchange'],
      sourceNote: 'test',
    },
    alertsAndIncidents: {
      alertsStatus: 'Available',
      incidentsStatus: 'Available',
      totalAlerts: 40,
      purviewScopedAlerts: 18,
      alertsBySeverity: { high: 5, medium: 15, low: 15, informational: 5 },
      alertsByServiceSource: [],
      alertsByStatus: [],
      alertsByClassification: [],
      alertsByDetermination: [],
      totalIncidents: 12,
      newIncidentsThisMonth: 12,
      resolvedIncidentsThisMonth: 10,
      openHighCriticalRisks: 2,
      meanTimeToResolveHours: 6.5,
      medianTimeToResolveHours: 5.0,
      topIncidentCategories: [],
      sourceNote: 'test',
    },
    auditAndEDiscovery: {
      auditStatus: 'Available',
      eDiscoveryStatus: 'Available',
      recordsManagementStatus: 'Available',
      auditEventsCollected: 12500,
      highRiskAdminAuditActions: 3,
      dlpAuditRecords: 100,
      retentionLabelsCount: 8,
      retentionPoliciesCount: 4,
      activeEDiscoveryCases: 2,
      closedEDiscoveryCasesThisMonth: 1,
      legalHoldsActive: 2,
      sourceNote: 'test',
    },
    connectors: [
      {
        connectorId: 'graph-security-alerts-v2',
        displayName: 'Alerts v2',
        microsoftProduct: 'Defender XDR / Purview',
        endpointOrCmdlet: '/v1.0/security/alerts_v2',
        apiChannel: 'Graph v1.0',
        status: 'Available',
        statusDetail: 'OK',
        lastCollectedAt: '2026-11-23T00:00:00Z',
        recordsCollected: 40,
        throttleCount429: 0,
        durationMs: 320,
        isBeta: false,
        documentationUrl: 'https://learn.microsoft.com',
      },
    ],
  };
}

describe('RBAC & Multi-Tenant Isolation', () => {
  it('denies cross-tenant access for CustomerExecutive and CustomerReader (IDOR protection)', () => {
    const contosoExec = makePrincipal({
      role: 'CustomerExecutive',
      assignedCustomerIds: ['cust-contoso-fin'],
    });
    expect(() => assertCustomerAccess(contosoExec, 'cust-contoso-fin')).not.toThrow();
    expect(() => assertCustomerAccess(contosoExec, 'cust-northwind-health')).toThrow(AuthorizationError);
  });

  it('allows multi-customer access for ServiceManager but enforces write restrictions for CustomerReader', () => {
    const serviceMgr = makePrincipal({ role: 'ServiceManager', assignedCustomerIds: [] });
    expect(() => assertCustomerAccess(serviceMgr, 'cust-northwind-health')).not.toThrow();
    expect(hasPermission('ServiceManager', 'managed_service:write')).toBe(true);

    const reader = makePrincipal({ role: 'CustomerReader', assignedCustomerIds: ['cust-contoso-fin'] });
    expect(() => assertPermission(reader, 'managed_service:write')).toThrow(AuthorizationError);
    expect(() => assertPermission(reader, 'reports:export')).toThrow(AuthorizationError);
  });
});

describe('Transparent Posture Score Engine', () => {
  it('computes formula-backed score with component weights summing to 1.0', () => {
    const result = calculatePostureScore(makeScoreInputs());
    expect(result.overallScore).not.toBeNull();
    expect(result.overallScore!).toBeGreaterThan(50);
    expect(result.overallScore!).toBeLessThanOrEqual(100);
    const weightSum = result.components.reduce((acc, c) => acc + c.effectiveWeight, 0);
    expect(Math.round(weightSum * 100)).toBe(100);
    expect(result.unavailableNote).toBeNull();
  });

  it('excludes unavailable components and re-normalizes weights without inventing data', () => {
    const inputs = makeScoreInputs();
    inputs.dlp.status = 'PermissionMissing';
    inputs.dlp.highSeverityEvents = null;
    inputs.dlp.totalEvents = null;

    const result = calculatePostureScore(inputs);
    const dlpComp = result.components.find((c) => c.id === 'dlp-risk-control');
    expect(dlpComp?.score).toBeNull();
    expect(dlpComp?.effectiveWeight).toBe(0);
    expect(result.unavailableNote).toContain('DLP Risk Control (PermissionMissing)');
    const weightSum = result.components.reduce((acc, c) => acc + c.effectiveWeight, 0);
    expect(Math.round(weightSum * 100)).toBe(100);
  });
});

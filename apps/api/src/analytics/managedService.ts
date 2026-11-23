import type { ManagedServiceActivity, ManagedServiceValueSummary } from '@purview-portal/domain';

export interface ManagedServiceBreakdown {
  summary: ManagedServiceValueSummary;
  separationGuarantee: string;
  teamWorkTotals: {
    totalHumanOperations: number;
    triageAndInvestigations: number;
    engineeringAndTuningActions: number;
    governanceAndHealthChecks: number;
  };
  microsoftAutomationReference: {
    microsoftAutomatedDetections: number | null;
    microsoftAutoRemediatedEvents: number | null;
    note: string;
  };
}

/**
 * Computes Managed Service Value strictly separating human / managed-team operational work
 * from Microsoft-automated policy triggers or platform detections.
 */
export function buildManagedServiceBreakdown(
  summary: ManagedServiceValueSummary,
): ManagedServiceBreakdown {
  const triageAndInvestigations =
    summary.alertsReviewedByAnalysts +
    summary.incidentsInvestigatedByTeam +
    summary.casesClosedByTeam +
    summary.departmentRisksInvestigated;

  const engineeringAndTuningActions =
    summary.policiesChanged +
    summary.falsePositivesReduced +
    summary.sensitivityLabelChanges +
    summary.dlpRuleChanges +
    summary.configurationImprovements +
    summary.resolvedConfigurationIssues +
    summary.failedJobsRemediated;

  const governanceAndHealthChecks =
    summary.policiesReviewed +
    summary.exceptionsReviewed +
    summary.customerRequestsHandled +
    summary.microsoftRecommendationsAssessed +
    summary.proactiveHealthChecks;

  const totalHumanOperations =
    triageAndInvestigations + engineeringAndTuningActions + governanceAndHealthChecks;

  return {
    summary,
    separationGuarantee:
      'Strict Activity Separation Enforced: Managed Service metrics reflect only logged analyst, compliance engineer, and service manager actions. Microsoft automated detections are reported separately as platform telemetry.',
    teamWorkTotals: {
      totalHumanOperations,
      triageAndInvestigations,
      engineeringAndTuningActions,
      governanceAndHealthChecks,
    },
    microsoftAutomationReference: {
      microsoftAutomatedDetections: summary.microsoftAutomatedDetections,
      microsoftAutoRemediatedEvents: summary.microsoftAutoRemediatedEvents,
      note: 'Automated Purview policy matches and Defender XDR correlations generated natively by Microsoft cloud services (excluded from Managed Service effort totals).',
    },
  };
}

export function applyNewActivityToSummary(
  summary: ManagedServiceValueSummary,
  activity: ManagedServiceActivity,
): ManagedServiceValueSummary {
  const updated: ManagedServiceValueSummary = {
    ...summary,
    activities: [activity, ...summary.activities],
  };

  switch (activity.category) {
    case 'AlertTriage':
      updated.alertsReviewedByAnalysts += 1;
      break;
    case 'IncidentInvestigation':
      updated.incidentsInvestigatedByTeam += 1;
      break;
    case 'CaseClosure':
      updated.casesClosedByTeam += 1;
      break;
    case 'PolicyTuning':
      updated.policiesReviewed += 1;
      updated.policiesChanged += 1;
      break;
    case 'DlpRuleChange':
      updated.dlpRuleChanges += 1;
      break;
    case 'SensitivityLabelChange':
      updated.sensitivityLabelChanges += 1;
      break;
    case 'FalsePositiveReduction':
      updated.falsePositivesReduced += 1;
      break;
    case 'ExceptionReview':
      updated.exceptionsReviewed += 1;
      break;
    case 'RecommendationAssessment':
      updated.microsoftRecommendationsAssessed += 1;
      break;
    case 'HealthCheck':
      updated.proactiveHealthChecks += 1;
      break;
    case 'CustomerRequest':
      updated.customerRequestsHandled += 1;
      break;
    case 'AutomationRemediation':
      updated.failedJobsRemediated += 1;
      break;
  }

  return updated;
}

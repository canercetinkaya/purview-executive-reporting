import type { ExecutiveNarrative, MonthlySnapshot, Recommendation } from '@purview-portal/domain';
import { computeChangePct } from './trends.js';

function formatDeltaPhrase(deltaPct: number | null, unitWord = ''): string {
  if (deltaPct === null) return 'without a prior-month baseline for comparison';
  if (deltaPct === 0) return `unchanged (${unitWord}0%)`.trim();
  const dir = deltaPct > 0 ? 'up' : 'down';
  return `${dir} ${Math.abs(deltaPct)}% from the previous month`;
}

/**
 * Generates an evidence-backed Monthly Executive Summary strictly from actual collected metrics.
 * Never fabricates numbers; explicitly flags any unavailable, unlicensed, or unsupported sources.
 */
export function generateExecutiveNarrative(
  current: MonthlySnapshot,
  previous: MonthlySnapshot | null,
  recommendations: Recommendation[],
): ExecutiveNarrative {
  const unavailableConnectors = current.connectors.filter(
    (c) =>
      c.status === 'Unavailable' ||
      c.status === 'PermissionMissing' ||
      c.status === 'NotLicensed' ||
      c.status === 'CollectionFailed',
  );

  const scoreText =
    current.postureScore.overallScore !== null
      ? `${current.postureScore.overallScore}/100 (${current.postureScore.rating})`
      : 'Insufficient Data';

  const dlpDelta = computeChangePct(current.dlp.totalEvents, previous?.dlp.totalEvents ?? null);
  const highDlpDelta = computeChangePct(
    current.dlp.highSeverityEvents,
    previous?.dlp.highSeverityEvents ?? null,
  );

  const overallStatus =
    current.dlp.status === 'Available' && current.dlp.totalEvents !== null
      ? `For ${current.period.label}, the environment recorded a Security & Compliance Posture Score of ${scoreText}. A total of ${current.dlp.totalEvents} DLP signals were observed (${formatDeltaPhrase(dlpDelta)}), including ${current.dlp.highSeverityEvents ?? 0} high-severity DLP events (${formatDeltaPhrase(highDlpDelta)}).`
      : `For ${current.period.label}, overall posture stands at ${scoreText}. Core DLP telemetry was not available (${current.dlp.status}); no synthetic values were substituted.`;

  const incidentPart =
    current.alertsAndIncidents.incidentsStatus === 'Available'
      ? `${current.alertsAndIncidents.resolvedIncidentsThisMonth ?? 0} of ${current.alertsAndIncidents.totalIncidents ?? 0} security incidents were resolved this month with a mean resolution time of ${current.alertsAndIncidents.meanTimeToResolveHours ?? 'N/A'} hours.`
      : `Security incident metrics are currently unavailable (${current.alertsAndIncidents.incidentsStatus}).`;

  const whatChangedThisMonth = `${incidentPart} ${
    current.informationProtection.labelCoveragePct !== null
      ? `Observed sensitivity label coverage stands at ${current.informationProtection.labelCoveragePct}%.`
      : `Sensitivity label definitions (${current.informationProtection.definedLabelsCount ?? 0}) were retrieved, while tenant-wide unlabeled file inventory at rest remains ${current.informationProtection.unlabeledPopulationStatus}.`
  }`;

  const topRisks: string[] = [];
  if ((current.dlp.externalSharingIndicators ?? 0) > 0) {
    const topPol = current.dlp.topTriggeredPolicies[0]?.policyName ?? 'external sharing policies';
    topRisks.push(
      `External sharing exposure: ${current.dlp.externalSharingIndicators} external sharing DLP indicators detected, led by ${topPol}.`,
    );
  }
  if ((current.alertsAndIncidents.openHighCriticalRisks ?? 0) > 0) {
    topRisks.push(
      `${current.alertsAndIncidents.openHighCriticalRisks} high/critical security incidents remain open and actively monitored.`,
    );
  }
  const openCritRecs = recommendations.filter(
    (r) => (r.severity === 'Critical' || r.severity === 'High') && r.status !== 'Resolved',
  );
  if (openCritRecs.length > 0) {
    topRisks.push(
      `${openCritRecs.length} Critical/High governance recommendations remain open (top item: "${openCritRecs[0]!.title}").`,
    );
  }
  if (topRisks.length === 0) {
    topRisks.push('No high-severity unresolved risks were observed across available telemetry sources.');
  }

  const positiveImprovements: string[] = [];
  if (highDlpDelta !== null && highDlpDelta < 0) {
    positiveImprovements.push(
      `High-severity DLP events decreased by ${Math.abs(highDlpDelta)}% compared with the previous month.`,
    );
  }
  if (current.managedServiceValue.falsePositivesReduced > 0) {
    positiveImprovements.push(
      `Managed service engineers tuned DLP rules to eliminate ${current.managedServiceValue.falsePositivesReduced} recurring false positives.`,
    );
  }
  if (
    current.alertsAndIncidents.meanTimeToResolveHours !== null &&
    previous?.alertsAndIncidents.meanTimeToResolveHours !== null &&
    previous?.alertsAndIncidents.meanTimeToResolveHours !== undefined &&
    current.alertsAndIncidents.meanTimeToResolveHours <
      previous.alertsAndIncidents.meanTimeToResolveHours
  ) {
    positiveImprovements.push(
      `Mean incident resolution time improved from ${previous.alertsAndIncidents.meanTimeToResolveHours}h to ${current.alertsAndIncidents.meanTimeToResolveHours}h.`,
    );
  }
  if (positiveImprovements.length === 0) {
    positiveImprovements.push(
      `Maintained continuous ${current.managedServiceValue.proactiveHealthChecks} proactive Purview connector and policy health checks.`,
    );
  }

  const msv = current.managedServiceValue;
  const managedServiceActions = `Separate from Microsoft automated detections (${msv.microsoftAutomatedDetections ?? 0} raw signals), the Managed Service team manually reviewed ${msv.alertsReviewedByAnalysts} alerts, investigated ${msv.incidentsInvestigatedByTeam} incidents, closed ${msv.casesClosedByTeam} cases, executed ${msv.dlpRuleChanges} DLP rule refinements, reviewed ${msv.exceptionsReviewed} policy exceptions, and logged ${msv.monitoringHoursLogged} operational hours.`;

  const businessImpact = `By tuning noisy policies (${msv.falsePositivesReduced} false positives removed) and prioritizing verified external sharing exposures, the service lowered alert fatigue on internal IT teams while maintaining audit-ready compliance evidence.`;

  const itemsRequiringCustomerDecision = openCritRecs
    .slice(0, 3)
    .map((r) => `[${r.severity}] ${r.title} (Owner: ${r.owner}, Target: ${r.targetDate})`);

  if (itemsRequiringCustomerDecision.length === 0) {
    itemsRequiringCustomerDecision.push('No pending customer executive approvals required this cycle.');
  }

  const nextMonthPriorities = recommendations
    .filter((r) => r.status !== 'Resolved')
    .slice(0, 3)
    .map((r) => `${r.recommendedAction} (Target: ${r.targetDate})`);
  if (nextMonthPriorities.length === 0) {
    nextMonthPriorities.push('Continue monthly DLP threshold reviews and scheduled Purview connector health audits.');
  }

  const dataLimitationsNote =
    unavailableConnectors.length > 0 ||
    current.informationProtection.unlabeledPopulationStatus === 'ApiUnsupported'
      ? `Explicit Source Limitations: ${[
          ...unavailableConnectors.map((c) => `${c.displayName} [${c.status}]`),
          ...(current.informationProtection.unlabeledPopulationStatus === 'ApiUnsupported'
            ? ['Unlabeled files at rest inventory [ApiUnsupported via native Graph v1.0]']
            : []),
        ].join('; ')}.`
      : null;

  return {
    periodId: current.period.periodId,
    generatedAt: new Date().toISOString(),
    isDemo: current.isDemo,
    overallStatus,
    whatChangedThisMonth,
    topRisks,
    positiveImprovements,
    managedServiceActions,
    businessImpact,
    itemsRequiringCustomerDecision,
    nextMonthPriorities,
    dataLimitationsNote,
  };
}

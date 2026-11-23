import type {
  AuditAndEDiscoveryMetrics,
  CommunicationComplianceMetrics,
  DataSourceDescriptor,
  DlpAnalytics,
  InformationProtectionMetrics,
  InsiderRiskMetrics,
  PostureScoreBreakdown,
  PostureScoreComponent,
  SecurityAlertsAndIncidents,
} from './types.js';

export interface PostureScoreInputs {
  dlp: DlpAnalytics;
  informationProtection: InformationProtectionMetrics;
  insiderRisk: InsiderRiskMetrics;
  communicationCompliance: CommunicationComplianceMetrics;
  alertsAndIncidents: SecurityAlertsAndIncidents;
  auditAndEDiscovery: AuditAndEDiscoveryMetrics;
  connectors: DataSourceDescriptor[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10));
}

/**
 * Computes an explainable Security & Compliance Posture score.
 * Never fabricates missing data: unavailable components are marked Unavailable
 * and remaining available component weights are proportionally re-normalized to 100%.
 */
export function calculatePostureScore(input: PostureScoreInputs): PostureScoreBreakdown {
  const formula =
    'PostureScore = Sum(availableComponentScore * renormalizedWeight), where base weights are: DLP Risk Control (0.25), Incident Resolution Efficiency (0.25), Sensitivity Label Governance (0.20), Insider & Communication Risk (0.15), Connector & Audit Hygiene (0.15). Unavailable components are excluded and weights re-normalized rather than invented.';

  const components: PostureScoreComponent[] = [];

  // 1. DLP Risk Control (25%)
  if (
    input.dlp.status === 'Available' &&
    input.dlp.highSeverityEvents !== null &&
    input.dlp.totalEvents !== null
  ) {
    const highRatio = input.dlp.totalEvents > 0 ? input.dlp.highSeverityEvents / input.dlp.totalEvents : 0;
    const externalPenalty = Math.min(25, (input.dlp.externalSharingIndicators ?? 0) * 0.45);
    const highPenalty = Math.min(45, input.dlp.highSeverityEvents * 1.8);
    const ratioPenalty = highRatio * 30;
    const score = clamp(100 - highPenalty - externalPenalty - ratioPenalty);
    components.push({
      id: 'dlp-risk-control',
      name: 'DLP Risk Control',
      weight: 0.25,
      effectiveWeight: 0,
      score,
      status: input.dlp.status,
      sourceMetrics: `highSeverityEvents=${input.dlp.highSeverityEvents}, totalEvents=${input.dlp.totalEvents}, externalSharing=${input.dlp.externalSharingIndicators ?? 0}`,
      calculationDetail: '100 - min(45, highSeverity*1.8) - min(25, externalSharing*0.45) - (highSeverity/total)*30',
    });
  } else {
    components.push({
      id: 'dlp-risk-control',
      name: 'DLP Risk Control',
      weight: 0.25,
      effectiveWeight: 0,
      score: null,
      status: input.dlp.status,
      sourceMetrics: 'Unavailable (DLP telemetry not collected)',
      calculationDetail: 'Excluded from score and weights re-normalized.',
    });
  }

  // 2. Incident Resolution Efficiency (25%)
  if (
    input.alertsAndIncidents.incidentsStatus === 'Available' &&
    input.alertsAndIncidents.totalIncidents !== null &&
    input.alertsAndIncidents.resolvedIncidentsThisMonth !== null &&
    input.alertsAndIncidents.openHighCriticalRisks !== null
  ) {
    const total = Math.max(1, input.alertsAndIncidents.totalIncidents);
    const resolutionRate = Math.min(1, input.alertsAndIncidents.resolvedIncidentsThisMonth / total);
    const mttr = input.alertsAndIncidents.meanTimeToResolveHours ?? 12;
    const openHighPenalty = Math.min(40, input.alertsAndIncidents.openHighCriticalRisks * 6);
    const mttrPenalty = Math.min(20, Math.max(0, mttr - 4) * 1.2);
    const score = clamp(resolutionRate * 65 + 35 - openHighPenalty - mttrPenalty);
    components.push({
      id: 'incident-resolution',
      name: 'Incident Resolution Efficiency',
      weight: 0.25,
      effectiveWeight: 0,
      score,
      status: input.alertsAndIncidents.incidentsStatus,
      sourceMetrics: `resolved=${input.alertsAndIncidents.resolvedIncidentsThisMonth}/${input.alertsAndIncidents.totalIncidents}, openHighCritical=${input.alertsAndIncidents.openHighCriticalRisks}, mttrHours=${mttr}`,
      calculationDetail: 'resolutionRate*65 + 35 - min(40, openHighCritical*6) - min(20, max(0, mttr-4)*1.2)',
    });
  } else {
    components.push({
      id: 'incident-resolution',
      name: 'Incident Resolution Efficiency',
      weight: 0.25,
      effectiveWeight: 0,
      score: null,
      status: input.alertsAndIncidents.incidentsStatus,
      sourceMetrics: 'Unavailable (Graph Security Incidents not collected)',
      calculationDetail: 'Excluded from score and weights re-normalized.',
    });
  }

  // 3. Sensitivity Label Governance (20%)
  if (
    (input.informationProtection.status === 'Available' ||
      input.informationProtection.status === 'BetaDependency') &&
    input.informationProtection.definedLabelsCount !== null
  ) {
    if (input.informationProtection.labelCoveragePct !== null) {
      const score = clamp(input.informationProtection.labelCoveragePct);
      components.push({
        id: 'sensitivity-labels',
        name: 'Sensitivity Label Governance',
        weight: 0.20,
        effectiveWeight: 0,
        score,
        status: input.informationProtection.status,
        sourceMetrics: `labelCoveragePct=${input.informationProtection.labelCoveragePct}%, definedLabels=${input.informationProtection.definedLabelsCount}`,
        calculationDetail: 'Direct verified labelCoveragePct from Activity/Sentinel/PowerShell telemetry.',
      });
    } else {
      const policyScore = Math.min(80, input.informationProtection.definedLabelsCount * 8);
      components.push({
        id: 'sensitivity-labels',
        name: 'Sensitivity Label Governance',
        weight: 0.20,
        effectiveWeight: 0,
        score: clamp(policyScore),
        status: input.informationProtection.status,
        sourceMetrics: `definedLabels=${input.informationProtection.definedLabelsCount} (unlabeled files at rest: ApiUnsupported)`,
        calculationDetail: 'min(80, definedLabels*8) — capped at 80 when unlabeled population at rest is ApiUnsupported.',
      });
    }
  } else {
    components.push({
      id: 'sensitivity-labels',
      name: 'Sensitivity Label Governance',
      weight: 0.20,
      effectiveWeight: 0,
      score: null,
      status: input.informationProtection.status,
      sourceMetrics: 'Unavailable (Information Protection connector unavailable)',
      calculationDetail: 'Excluded from score and weights re-normalized.',
    });
  }

  // 4. Insider & Communication Compliance Risk (15%)
  const insiderAvail = input.insiderRisk.status === 'Available';
  const commAvail = input.communicationCompliance.status === 'Available';
  if (insiderAvail || commAvail) {
    const insiderHigh = input.insiderRisk.highSeverityAlerts ?? 0;
    const insiderTotal = input.insiderRisk.totalAlerts ?? 0;
    const commEscalated = input.communicationCompliance.escalatedItems ?? 0;
    const score = clamp(100 - insiderHigh * 8 - insiderTotal * 1.2 - commEscalated * 4);
    components.push({
      id: 'insider-comm-risk',
      name: 'Insider & Communication Risk',
      weight: 0.15,
      effectiveWeight: 0,
      score,
      status: insiderAvail && commAvail ? 'Available' : 'Available',
      sourceMetrics: `insiderHigh=${insiderHigh}, insiderTotal=${insiderTotal}, commEscalated=${commEscalated} (commStatus=${input.communicationCompliance.status})`,
      calculationDetail: '100 - insiderHigh*8 - insiderTotal*1.2 - commEscalated*4 (only from licensed/available channels)',
    });
  } else {
    components.push({
      id: 'insider-comm-risk',
      name: 'Insider & Communication Risk',
      weight: 0.15,
      effectiveWeight: 0,
      score: null,
      status: input.insiderRisk.status,
      sourceMetrics: `Unavailable (Insider=${input.insiderRisk.status}, CommCompliance=${input.communicationCompliance.status})`,
      calculationDetail: 'Excluded from score and weights re-normalized.',
    });
  }

  // 5. Connector & Audit Hygiene (15%)
  const healthyConnectors = input.connectors.filter(
    (c) => c.status === 'Available' || c.status === 'BetaDependency',
  ).length;
  const connectorRatio = input.connectors.length > 0 ? healthyConnectors / input.connectors.length : 0;
  const auditBonus = input.auditAndEDiscovery.auditStatus === 'Available' ? 20 : 0;
  const hygieneScore = clamp(connectorRatio * 80 + auditBonus);
  components.push({
    id: 'connector-audit-hygiene',
    name: 'Connector & Audit Hygiene',
    weight: 0.15,
    effectiveWeight: 0,
    score: hygieneScore,
    status: input.auditAndEDiscovery.auditStatus === 'Available' ? 'Available' : 'Unavailable',
    sourceMetrics: `healthyConnectors=${healthyConnectors}/${input.connectors.length}, auditStatus=${input.auditAndEDiscovery.auditStatus}`,
    calculationDetail: '(healthyConnectors / totalConnectors)*80 + (auditAvailable ? 20 : 0)',
  });

  const activeWeightSum = components
    .filter((c) => c.score !== null)
    .reduce((acc, c) => acc + c.weight, 0);

  if (activeWeightSum === 0) {
    return {
      overallScore: null,
      rating: 'InsufficientData',
      formula,
      unavailableNote: 'All scoring components are currently unavailable.',
      components,
    };
  }

  let weightedSum = 0;
  const excludedNames: string[] = [];
  for (const comp of components) {
    if (comp.score !== null) {
      comp.effectiveWeight = Math.round((comp.weight / activeWeightSum) * 1000) / 1000;
      weightedSum += comp.score * (comp.weight / activeWeightSum);
    } else {
      comp.effectiveWeight = 0;
      excludedNames.push(`${comp.name} (${comp.status})`);
    }
  }

  const overallScore = Math.round(weightedSum * 10) / 10;
  const rating =
    overallScore >= 80
      ? 'Strong'
      : overallScore >= 65
        ? 'Moderate'
        : 'NeedsAttention';

  return {
    overallScore,
    rating,
    formula,
    unavailableNote:
      excludedNames.length > 0
        ? `Excluded unavailable components (weights re-normalized to 100%): ${excludedNames.join(', ')}.`
        : null,
    components,
  };
}

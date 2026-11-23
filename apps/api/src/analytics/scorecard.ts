import type { MonthlySnapshot, RagStatus, ScorecardRow } from '@purview-portal/domain';
import { computeChangePct, getTrendDirection } from './trends.js';

function evaluateRag(
  current: number | null,
  target: number,
  higherIsBetter: boolean,
  amberMarginPct = 0.25,
): RagStatus {
  if (current === null) return 'Unavailable';
  if (higherIsBetter) {
    if (current >= target) return 'Green';
    if (current >= target * (1 - amberMarginPct)) return 'Amber';
    return 'Red';
  }
  if (current <= target) return 'Green';
  if (current <= target * (1 + amberMarginPct)) return 'Amber';
  return 'Red';
}

export function buildMonthlyScorecard(
  current: MonthlySnapshot,
  previous: MonthlySnapshot | null,
): ScorecardRow[] {
  const mkRow = (params: {
    id: string;
    metric: string;
    curVal: number | null;
    prevVal: number | null;
    unit: string;
    target: number;
    targetLabel: string;
    higherIsBetter: boolean;
    source: string;
    drilldownHref: string;
  }): ScorecardRow => {
    const changePct = computeChangePct(params.curVal, params.prevVal);
    return {
      id: params.id,
      metric: params.metric,
      currentMonth: params.curVal,
      previousMonth: params.prevVal,
      unit: params.unit,
      changePct,
      trend: getTrendDirection(changePct),
      targetLabel: params.targetLabel,
      status: evaluateRag(params.curVal, params.target, params.higherIsBetter),
      source: params.source,
      drilldownHref: params.drilldownHref,
      higherIsBetter: params.higherIsBetter,
    };
  };

  return [
    mkRow({
      id: 'sc-posture',
      metric: 'Security & Compliance Posture Score',
      curVal: current.postureScore.overallScore,
      prevVal: previous?.postureScore.overallScore ?? null,
      unit: '/100',
      target: 80,
      targetLabel: '>= 80',
      higherIsBetter: true,
      source: 'Composite Weighted Formula (Transparent Breakdown)',
      drilldownHref: '/',
    }),
    mkRow({
      id: 'sc-high-dlp',
      metric: 'High Severity DLP Events',
      curVal: current.dlp.highSeverityEvents,
      prevVal: previous?.dlp.highSeverityEvents ?? null,
      unit: 'events',
      target: 10,
      targetLabel: '<= 10',
      higherIsBetter: false,
      source: 'O365 Management Activity API (DLP.All)',
      drilldownHref: '/purview/dlp',
    }),
    mkRow({
      id: 'sc-ext-sharing',
      metric: 'External Sensitive Sharing Indicators',
      curVal: current.dlp.externalSharingIndicators,
      prevVal: previous?.dlp.externalSharingIndicators ?? null,
      unit: 'events',
      target: 15,
      targetLabel: '<= 15',
      higherIsBetter: false,
      source: 'O365 Management Activity API (DLP.All)',
      drilldownHref: '/purview/dlp',
    }),
    mkRow({
      id: 'sc-open-risks',
      metric: 'Open High/Critical Security Risks',
      curVal: current.alertsAndIncidents.openHighCriticalRisks,
      prevVal: previous?.alertsAndIncidents.openHighCriticalRisks ?? null,
      unit: 'incidents',
      target: 2,
      targetLabel: '<= 2',
      higherIsBetter: false,
      source: 'Microsoft Graph v1.0 /security/incidents',
      drilldownHref: '/incidents',
    }),
    mkRow({
      id: 'sc-mttr',
      metric: 'Incident Mean Time to Resolve (MTTR)',
      curVal: current.alertsAndIncidents.meanTimeToResolveHours,
      prevVal: previous?.alertsAndIncidents.meanTimeToResolveHours ?? null,
      unit: 'hrs',
      target: 6,
      targetLabel: '<= 6 hrs',
      higherIsBetter: false,
      source: 'Microsoft Graph v1.0 /security/incidents',
      drilldownHref: '/incidents',
    }),
    mkRow({
      id: 'sc-label-cov',
      metric: 'Sensitivity Label Coverage',
      curVal: current.informationProtection.labelCoveragePct,
      prevVal: previous?.informationProtection.labelCoveragePct ?? null,
      unit: '%',
      target: 75,
      targetLabel: '>= 75%',
      higherIsBetter: true,
      source: 'Purview Audit / Graph Information Protection',
      drilldownHref: '/purview/information-protection',
    }),
    mkRow({
      id: 'sc-insider-high',
      metric: 'Insider Risk High-Severity Alerts',
      curVal: current.insiderRisk.highSeverityAlerts,
      prevVal: previous?.insiderRisk.highSeverityAlerts ?? null,
      unit: 'alerts',
      target: 2,
      targetLabel: '<= 2',
      higherIsBetter: false,
      source: 'Microsoft Graph v1.0 /security/alerts_v2',
      drilldownHref: '/purview/insider-risk',
    }),
    mkRow({
      id: 'sc-fp-reduced',
      metric: 'False Positives Reduced by Service Team',
      curVal: current.managedServiceValue.falsePositivesReduced,
      prevVal: previous?.managedServiceValue.falsePositivesReduced ?? null,
      unit: 'tuned',
      target: 5,
      targetLabel: '>= 5 / mo',
      higherIsBetter: true,
      source: 'Managed Service Activity Ledger',
      drilldownHref: '/managed-service',
    }),
  ];
}

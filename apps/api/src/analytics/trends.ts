import type { MonthlySnapshot, TrendDirection, TrendWindow } from '@purview-portal/domain';

export interface TrendComparisonPoint {
  periodId: string;
  label: string;
  postureScore: number | null;
  totalDlpEvents: number | null;
  highSeverityDlpEvents: number | null;
  externalSharingIndicators: number | null;
  openHighCriticalRisks: number | null;
  resolvedIncidents: number | null;
  labelCoveragePct: number | null;
  managedServiceActions: number;
}

export interface PeriodDeltaSummary {
  window: TrendWindow;
  baselinePeriodId: string | null;
  dlpEventsDeltaPct: number | null;
  highDlpDeltaPct: number | null;
  openRisksDeltaPct: number | null;
  postureScoreDelta: number | null;
  mttrDeltaHours: number | null;
}

export function computeChangePct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function getTrendDirection(delta: number | null): TrendDirection {
  if (delta === null) return 'na';
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'flat';
}

export function sliceTrendHistory(
  orderedSnapshots: MonthlySnapshot[],
  currentPeriodId: string,
  window: TrendWindow,
): MonthlySnapshot[] {
  const idx = orderedSnapshots.findIndex((s) => s.period.periodId === currentPeriodId);
  if (idx < 0) return [];
  const countMap: Record<TrendWindow, number> = {
    MoM: 2,
    QoQ: 4,
    '3M': 3,
    '6M': 6,
    '12M': 12,
    YoY: 13,
  };
  const take = countMap[window];
  const start = Math.max(0, idx - take + 1);
  return orderedSnapshots.slice(start, idx + 1);
}

export function toTrendSeries(snapshots: MonthlySnapshot[]): TrendComparisonPoint[] {
  return snapshots.map((s) => ({
    periodId: s.period.periodId,
    label: s.period.label,
    postureScore: s.postureScore.overallScore,
    totalDlpEvents: s.dlp.totalEvents,
    highSeverityDlpEvents: s.dlp.highSeverityEvents,
    externalSharingIndicators: s.dlp.externalSharingIndicators,
    openHighCriticalRisks: s.alertsAndIncidents.openHighCriticalRisks,
    resolvedIncidents: s.alertsAndIncidents.resolvedIncidentsThisMonth,
    labelCoveragePct: s.informationProtection.labelCoveragePct,
    managedServiceActions:
      s.managedServiceValue.alertsReviewedByAnalysts +
      s.managedServiceValue.incidentsInvestigatedByTeam +
      s.managedServiceValue.policiesChanged +
      s.managedServiceValue.falsePositivesReduced,
  }));
}

export function computePeriodDelta(
  orderedSnapshots: MonthlySnapshot[],
  currentPeriodId: string,
  window: TrendWindow,
): PeriodDeltaSummary {
  const idx = orderedSnapshots.findIndex((s) => s.period.periodId === currentPeriodId);
  if (idx < 0) {
    return {
      window,
      baselinePeriodId: null,
      dlpEventsDeltaPct: null,
      highDlpDeltaPct: null,
      openRisksDeltaPct: null,
      postureScoreDelta: null,
      mttrDeltaHours: null,
    };
  }
  const offsetMap: Record<TrendWindow, number> = {
    MoM: 1,
    QoQ: 3,
    '3M': 2,
    '6M': 5,
    '12M': 11,
    YoY: 12,
  };
  const baseIdx = idx - offsetMap[window];
  if (baseIdx < 0) {
    return {
      window,
      baselinePeriodId: null,
      dlpEventsDeltaPct: null,
      highDlpDeltaPct: null,
      openRisksDeltaPct: null,
      postureScoreDelta: null,
      mttrDeltaHours: null,
    };
  }

  const cur = orderedSnapshots[idx]!;
  const base = orderedSnapshots[baseIdx]!;
  const postureDelta =
    cur.postureScore.overallScore !== null && base.postureScore.overallScore !== null
      ? Math.round((cur.postureScore.overallScore - base.postureScore.overallScore) * 10) / 10
      : null;
  const mttrDelta =
    cur.alertsAndIncidents.meanTimeToResolveHours !== null &&
    base.alertsAndIncidents.meanTimeToResolveHours !== null
      ? Math.round(
          (cur.alertsAndIncidents.meanTimeToResolveHours -
            base.alertsAndIncidents.meanTimeToResolveHours) *
            10,
        ) / 10
      : null;

  return {
    window,
    baselinePeriodId: base.period.periodId,
    dlpEventsDeltaPct: computeChangePct(cur.dlp.totalEvents, base.dlp.totalEvents),
    highDlpDeltaPct: computeChangePct(cur.dlp.highSeverityEvents, base.dlp.highSeverityEvents),
    openRisksDeltaPct: computeChangePct(
      cur.alertsAndIncidents.openHighCriticalRisks,
      base.alertsAndIncidents.openHighCriticalRisks,
    ),
    postureScoreDelta: postureDelta,
    mttrDeltaHours: mttrDelta,
  };
}

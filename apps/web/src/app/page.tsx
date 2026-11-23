'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import type {
  Customer,
  ExecutiveNarrative,
  MonthlySnapshot,
  ReportingPeriod,
  ScorecardRow,
  Subscription,
  Tenant,
} from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { PostureScoreModal } from '@/components/PostureScoreModal';
import { ScorecardTable } from '@/components/ScorecardTable';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { TrendLineChart } from '@/components/TrendChart';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface OverviewPayload {
  isDemo: boolean;
  customer: Customer;
  tenant: Tenant;
  subscription: Subscription;
  period: ReportingPeriod;
  previousPeriod: ReportingPeriod | null;
  window: string;
  history: Array<{
    periodId: string;
    postureScore: number | null;
    totalDlpEvents: number | null;
    highSeverityDlpEvents: number | null;
    externalSharingIndicators: number | null;
    openHighCriticalRisks: number | null;
    resolvedIncidents: number | null;
    managedServiceActions: number;
  }>;
  snapshot: MonthlySnapshot;
  scorecard: ScorecardRow[];
  narrative: ExecutiveNarrative;
  openRecommendationsCount: number;
}

export default function OverviewPage() {
  const buildPath = useCallback(
    (cid: string, pid: string, win: string) =>
      `/api/v1/customers/${cid}/overview?period=${encodeURIComponent(pid)}&window=${encodeURIComponent(win)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<OverviewPayload>(buildPath);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);

  if (loading && !data) {
    return <div className="surface-card p-8 text-sm">Loading executive overview...</div>;
  }
  if (error || !data) {
    return (
      <div className="surface-card border-rose-300 p-6 text-sm text-rose-800">
        {error ?? 'No overview data available.'}
      </div>
    );
  }

  const s = data.snapshot;
  const prevRow = (id: string) => data.scorecard.find((r) => r.id === id)?.previousMonth ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Executive Landing View · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.customer.name}</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {data.tenant?.licenseTier} · {data.subscription?.licensedSeats.toLocaleString()} seats · Domain: {data.tenant?.primaryDomain}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/executive-summary"
            className="rounded-lg border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
          >
            Read Management Story →
          </Link>
          <Link
            href="/reports"
            className="rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}
          >
            Monthly Report &amp; Export
          </Link>
        </div>
      </div>

      {/* Executive Management Story Highlight */}
      <section className="surface-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Monthly Executive Snapshot</h2>
          <Link href="/executive-summary" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent-primary)' }}>
            Full 8-Section Summary →
          </Link>
        </div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {data.narrative.overallStatus}
        </p>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          <strong>Managed Service Effort:</strong> {data.narrative.managedServiceActions}
        </p>
        {data.narrative.dataLimitationsNote ? (
          <div className="mt-3 rounded-lg border border-amber-300/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {data.narrative.dataLimitationsNote}
          </div>
        ) : null}
      </section>

      {/* Primary KPI Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Posture Score"
          value={s.postureScore.overallScore}
          unit="/ 100"
          currentNumeric={s.postureScore.overallScore}
          previousValue={prevRow('sc-posture')}
          higherIsBetter={true}
          rag={
            s.postureScore.overallScore === null
              ? 'Unavailable'
              : s.postureScore.overallScore >= 80
                ? 'Green'
                : s.postureScore.overallScore >= 65
                  ? 'Amber'
                  : 'Red'
          }
          source="Transparent Weighted Model"
          tooltip="Formula-backed composite across DLP, Incidents, Labels, Insider/Comm Compliance, and Audit Hygiene."
          onInspect={() => setScoreModalOpen(true)}
        />
        <KpiCard
          title="Open High/Critical Risks"
          value={s.alertsAndIncidents.openHighCriticalRisks}
          currentNumeric={s.alertsAndIncidents.openHighCriticalRisks}
          previousValue={prevRow('sc-open-risks')}
          rag={
            s.alertsAndIncidents.openHighCriticalRisks === null
              ? 'Unavailable'
              : s.alertsAndIncidents.openHighCriticalRisks <= 2
                ? 'Green'
                : 'Amber'
          }
          availability={s.alertsAndIncidents.incidentsStatus}
          source="Graph v1.0 /security/incidents"
          tooltip="Active or in-progress high-severity security incidents requiring resolution."
        />
        <KpiCard
          title="DLP Events (Total / High)"
          value={s.dlp.totalEvents !== null ? `${s.dlp.totalEvents} (${s.dlp.highSeverityEvents ?? 0} high)` : null}
          currentNumeric={s.dlp.totalEvents}
          previousValue={null}
          availability={s.dlp.status}
          rag={
            s.dlp.highSeverityEvents === null
              ? 'Unavailable'
              : s.dlp.highSeverityEvents <= 10
                ? 'Green'
                : 'Amber'
          }
          source="O365 Management DLP.All"
          tooltip="Cross-workload Purview DLP matches across Exchange, SharePoint, OneDrive, Teams, and Endpoint."
        />
        <KpiCard
          title="External Sharing Indicators"
          value={s.dlp.externalSharingIndicators}
          currentNumeric={s.dlp.externalSharingIndicators}
          previousValue={prevRow('sc-ext-sharing')}
          availability={s.dlp.status}
          rag={
            s.dlp.externalSharingIndicators === null
              ? 'Unavailable'
              : s.dlp.externalSharingIndicators <= 15
                ? 'Green'
                : 'Amber'
          }
          source="O365 Management DLP.All"
          tooltip="Sensitive data policy hits involving external recipients or anonymous sharing links."
        />
        <KpiCard
          title="Insider Risk Alerts"
          value={s.insiderRisk.totalAlerts}
          availability={s.insiderRisk.status}
          source="Graph /v1.0/security/alerts_v2"
          tooltip="Microsoft Purview Insider Risk Management alerts correlated via Graph Security alerts_v2."
        />
        <KpiCard
          title="Comm Compliance Alerts"
          value={s.communicationCompliance.totalAlerts}
          availability={s.communicationCompliance.status}
          source="Graph alerts_v2 / IPPS"
          tooltip="Communication Compliance policy alerts across Teams, Exchange, and Copilot interactions."
        />
        <KpiCard
          title="Sensitivity Label Coverage"
          value={s.informationProtection.labelCoveragePct}
          unit="%"
          currentNumeric={s.informationProtection.labelCoveragePct}
          previousValue={prevRow('sc-label-cov')}
          higherIsBetter={true}
          availability={
            s.informationProtection.labelCoveragePct !== null
              ? s.informationProtection.status
              : s.informationProtection.unlabeledPopulationStatus
          }
          source="Audit / Graph Information Protection"
          tooltip="Observed labeled share from Audit events; native at-rest unlabeled file counts are ApiUnsupported."
        />
        <KpiCard
          title="Managed Service Actions"
          value={
            s.managedServiceValue.alertsReviewedByAnalysts +
            s.managedServiceValue.incidentsInvestigatedByTeam +
            s.managedServiceValue.policiesChanged +
            s.managedServiceValue.falsePositivesReduced
          }
          unit="human ops"
          higherIsBetter={true}
          rag="Green"
          source={`${s.managedServiceValue.monitoringHoursLogged} hrs logged`}
          tooltip="Tracked human analyst, engineer, and service manager operations — strictly separated from Microsoft automation."
        />
      </section>

      {/* Trend Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <TrendLineChart
          title={`DLP Risk & External Exposure Trend (${data.window})`}
          subtitle="Total DLP signals vs. high-severity and external sharing indicators"
          labels={data.history.map((h) => h.periodId)}
          series={[
            { label: 'Total DLP Events', color: '#0F6CBD', values: data.history.map((h) => h.totalDlpEvents) },
            { label: 'External Sharing', color: '#D97706', values: data.history.map((h) => h.externalSharingIndicators) },
            { label: 'High-Severity DLP', color: '#DC2626', values: data.history.map((h) => h.highSeverityDlpEvents) },
          ]}
        />
        <TrendLineChart
          title={`Posture Score & Resolved Incidents (${data.window})`}
          subtitle="Posture progression alongside resolved incidents and open high risks"
          labels={data.history.map((h) => h.periodId)}
          series={[
            { label: 'Posture Score', color: '#059669', values: data.history.map((h) => h.postureScore) },
            { label: 'Resolved Incidents', color: '#0F6CBD', values: data.history.map((h) => h.resolvedIncidents) },
            { label: 'Open High Risks', color: '#DC2626', values: data.history.map((h) => h.openHighCriticalRisks) },
          ]}
        />
      </section>

      {/* Scorecard */}
      <ScorecardTable rows={data.scorecard} />

      {/* Connector Availability Summary */}
      <section className="surface-card p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Microsoft Connector Health ({s.connectors.length} Sources)</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Unavailable, Permission Missing, Not Licensed, and Beta dependencies are surfaced explicitly.
            </p>
          </div>
          <Link href="/data-collection" className="text-xs font-semibold hover:underline" style={{ color: 'var(--accent-primary)' }}>
            Inspect Telemetry &amp; Runs →
          </Link>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {s.connectors.map((c) => (
            <div
              key={c.connectorId}
              className="rounded-lg border p-3 text-xs"
              style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate" title={c.displayName}>{c.displayName}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <ConnectorStatusBadge status={c.status} />
                <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {c.recordsCollected.toLocaleString()} rec
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PostureScoreModal
        breakdown={s.postureScore}
        open={scoreModalOpen}
        onClose={() => setScoreModalOpen(false)}
      />
    </div>
  );
}

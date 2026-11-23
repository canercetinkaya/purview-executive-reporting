'use client';

import { useCallback } from 'react';
import type { Customer, DlpAnalytics, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { HorizontalDistributionList, TrendLineChart } from '@/components/TrendChart';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface DlpPayload {
  customer: Customer;
  period: ReportingPeriod;
  dlp: DlpAnalytics;
  previousDlp: DlpAnalytics | null;
  history: Array<{
    periodId: string;
    totalDlpEvents: number | null;
    highSeverityDlpEvents: number | null;
    externalSharingIndicators: number | null;
  }>;
}

export default function DlpPage() {
  const buildPath = useCallback(
    (cid: string, pid: string, win: string) =>
      `/api/v1/customers/${cid}/purview/dlp?period=${encodeURIComponent(pid)}&window=${encodeURIComponent(win)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<DlpPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading DLP analytics...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const { dlp, previousDlp } = data;
  const workloads = [
    { name: 'Exchange Online', count: dlp.workloadBreakdown.exchange },
    { name: 'SharePoint', count: dlp.workloadBreakdown.sharePoint },
    { name: 'OneDrive', count: dlp.workloadBreakdown.oneDrive },
    { name: 'Microsoft Teams', count: dlp.workloadBreakdown.teams },
    { name: 'Endpoint DLP', count: dlp.workloadBreakdown.endpoint },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Microsoft Purview DLP · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Data Loss Prevention Analytics</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Privacy-preserving operational &amp; executive DLP telemetry. Individual employee identities are omitted from executive reporting.
          </p>
        </div>
        <ConnectorStatusBadge status={dlp.status} />
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total DLP Events"
          value={dlp.totalEvents}
          currentNumeric={dlp.totalEvents}
          previousValue={previousDlp?.totalEvents ?? null}
          availability={dlp.status}
          source="O365 DLP.All"
          tooltip="Total policy and rule match signals across workloads."
        />
        <KpiCard
          title="High Severity DLP"
          value={dlp.highSeverityEvents}
          currentNumeric={dlp.highSeverityEvents}
          previousValue={previousDlp?.highSeverityEvents ?? null}
          availability={dlp.status}
          rag={(dlp.highSeverityEvents ?? 99) <= 10 ? 'Green' : 'Amber'}
          source="O365 DLP.All"
          tooltip="High-severity DLP events requiring analyst triage."
        />
        <KpiCard
          title="External Sharing"
          value={dlp.externalSharingIndicators}
          currentNumeric={dlp.externalSharingIndicators}
          previousValue={previousDlp?.externalSharingIndicators ?? null}
          availability={dlp.status}
          source="O365 DLP.All"
          tooltip="Sensitive data matches involving external domains or anonymous links."
        />
        <KpiCard
          title="Overrides / False Positives"
          value={dlp.overrideCount !== null ? `${dlp.overrideCount} / ${dlp.falsePositiveCount ?? 0}` : null}
          availability={dlp.status}
          source="DLP.All + Analyst Outcomes"
          tooltip="Business justification overrides alongside analyst-confirmed false positives."
        />
      </section>

      <TrendLineChart
        title="DLP Volume, High-Severity & External Sharing Trend"
        labels={data.history.map((h) => h.periodId)}
        series={[
          { label: 'Total DLP Events', color: '#0F6CBD', values: data.history.map((h) => h.totalDlpEvents) },
          { label: 'External Sharing', color: '#D97706', values: data.history.map((h) => h.externalSharingIndicators) },
          { label: 'High Severity', color: '#DC2626', values: data.history.map((h) => h.highSeverityDlpEvents) },
        ]}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <HorizontalDistributionList title="Workload Distribution" items={workloads} barColor="#0F6CBD" />
        <HorizontalDistributionList title="Top Sensitive Information Types" items={dlp.topSensitiveInfoTypes} barColor="#0284C7" />
        <HorizontalDistributionList
          title="Repeat Activity by Department Unit (Anonymized)"
          items={dlp.repeatDepartmentClusters}
          barColor="#D97706"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card overflow-hidden">
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">Top Triggered DLP Policies</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-4 py-2 font-semibold">Policy Name</th>
                <th className="px-4 py-2 font-semibold">Workload</th>
                <th className="px-4 py-2 text-right font-semibold">Matches</th>
                <th className="px-4 py-2 text-right font-semibold">High</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {dlp.topTriggeredPolicies.map((pol) => (
                <tr key={pol.policyName}>
                  <td className="px-4 py-2.5 font-medium">{pol.policyName}</td>
                  <td className="px-4 py-2.5">{pol.primaryWorkload}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pol.matches}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-rose-700 dark:text-rose-400">
                    {pol.highSeverity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">Active Policy Posture (IPPS Snapshot)</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-4 py-2 font-semibold">Policy</th>
                <th className="px-4 py-2 font-semibold">Scope</th>
                <th className="px-4 py-2 font-semibold">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {dlp.activePolicies.map((pol) => (
                <tr key={pol.id}>
                  <td className="px-4 py-2.5 font-medium">{pol.name}</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                    {pol.workloadScope.join(', ')}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{pol.mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

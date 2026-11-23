'use client';

import { useCallback, useState } from 'react';
import type {
  Customer,
  ExecutiveNarrative,
  MonthlySnapshot,
  Recommendation,
  ScorecardRow,
} from '@purview-portal/domain';
import { Download, Printer } from 'lucide-react';
import { ScorecardTable } from '@/components/ScorecardTable';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { usePortal } from '@/components/PortalContext';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface ReportOverviewPayload {
  isDemo: boolean;
  customer: Customer;
  snapshot: MonthlySnapshot;
  scorecard: ScorecardRow[];
  narrative: ExecutiveNarrative;
}

interface RecsPayload {
  recommendations: Recommendation[];
}

export default function ReportsPage() {
  const { permissions, personaId, selectedCustomerId, selectedPeriodId } = usePortal();
  const buildOverview = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/overview?period=${encodeURIComponent(pid)}&window=6M`,
    [],
  );
  const buildRecs = useCallback((cid: string) => `/api/v1/customers/${cid}/recommendations`, []);

  const overview = usePortalEndpoint<ReportOverviewPayload>(buildOverview);
  const recs = usePortalEndpoint<RecsPayload>(buildRecs);
  const [exportErr, setExportErr] = useState<string | null>(null);

  const canExport = permissions.includes('reports:export');

  async function handleDownload(format: 'csv' | 'json') {
    setExportErr(null);
    try {
      const resp = await fetch(
        `/api/v1/customers/${selectedCustomerId}/reports/export?period=${encodeURIComponent(selectedPeriodId)}&format=${format}`,
        { headers: { 'x-demo-persona': personaId } },
      );
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: `Export failed (${resp.status})` }));
        throw new Error(err.message);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `purview-report-${selectedCustomerId}-${selectedPeriodId}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportErr(err instanceof Error ? err.message : 'Export failed');
    }
  }

  if (overview.loading && !overview.data) {
    return <div className="surface-card p-8 text-sm">Preparing Printable Monthly Executive Report...</div>;
  }
  if (overview.error || !overview.data) {
    return <div className="surface-card p-6 text-sm text-rose-700">{overview.error ?? 'Unavailable'}</div>;
  }

  const { customer, snapshot: s, scorecard, narrative } = overview.data;
  const recList = recs.data?.recommendations ?? [];

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Monthly Executive Report Pack · {s.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Printable A4 Report &amp; Exports</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={() => void handleDownload('csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-45"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
          >
            <Download className="h-4 w-4" />
            Export Scorecard CSV
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={() => void handleDownload('json')}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-45"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
          >
            <Download className="h-4 w-4" />
            Export Full JSON
          </button>
        </div>
      </div>

      {exportErr ? <p className="no-print text-xs text-rose-700">{exportErr}</p> : null}

      {/* Full 12-Section Printable Report */}
      <article className="surface-card p-6 space-y-6">
        <header className="border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">{customer.name} — Monthly Purview Executive Report</h2>
            {overview.data.isDemo ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">DEMO DATA</span>
            ) : null}
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Reporting Period: {s.period.label} ({s.period.periodId}) · Posture Score: {s.postureScore.overallScore ?? 'Insufficient Data'}/100 · Collected: {s.collectedAt}
          </p>
        </header>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">1. Executive Summary &amp; Service Health</h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{narrative.overallStatus}</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{narrative.whatChangedThisMonth}</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">2. Security &amp; Compliance Highlights (Scorecard)</h3>
          <ScorecardTable rows={scorecard} />
        </section>

        <section className="grid gap-4 md:grid-cols-2 print-break-before">
          <div className="rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">3. Data Loss Prevention (DLP)</h3>
            <p className="mt-2">Total Events: <strong>{s.dlp.totalEvents ?? 'Unavailable'}</strong> · High Severity: <strong>{s.dlp.highSeverityEvents ?? 'Unavailable'}</strong></p>
            <p className="mt-1">External Sharing Indicators: <strong>{s.dlp.externalSharingIndicators ?? 'Unavailable'}</strong> · Overrides: <strong>{s.dlp.overrideCount ?? 'Unavailable'}</strong></p>
          </div>
          <div className="rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">4. Information Protection</h3>
            <p className="mt-2">Defined Labels: <strong>{s.informationProtection.definedLabelsCount ?? 'Unavailable'}</strong> · Manual/Auto: <strong>{s.informationProtection.manualLabelingEvents ?? 0} / {s.informationProtection.automaticLabelingEvents ?? 0}</strong></p>
            <p className="mt-1">Unlabeled Inventory Status: <strong>{s.informationProtection.unlabeledPopulationStatus}</strong></p>
          </div>
          <div className="rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">5. Alerts &amp; Incidents</h3>
            <p className="mt-2">Total Alerts (alerts_v2): <strong>{s.alertsAndIncidents.totalAlerts ?? 'Unavailable'}</strong> · Resolved Incidents: <strong>{s.alertsAndIncidents.resolvedIncidentsThisMonth ?? 0}/{s.alertsAndIncidents.totalIncidents ?? 0}</strong></p>
            <p className="mt-1">MTTR: <strong>{s.alertsAndIncidents.meanTimeToResolveHours ?? 'N/A'} hrs</strong> · Open High Risks: <strong>{s.alertsAndIncidents.openHighCriticalRisks ?? 0}</strong></p>
          </div>
          <div className="rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
            <h3 className="text-sm font-semibold">6. Managed Service Activities vs. Microsoft Automation</h3>
            <p className="mt-2">{narrative.managedServiceActions}</p>
            <p className="mt-1" style={{ color: 'var(--text-muted)' }}>Microsoft automated platform detections (excluded from team effort): {s.managedServiceValue.microsoftAutomatedDetections ?? 0}</p>
          </div>
        </section>

        <section className="space-y-2 text-xs">
          <h3 className="text-sm font-semibold">7. Recommendations &amp; Next Month Priorities</h3>
          <ul className="list-disc space-y-1 pl-4" style={{ color: 'var(--text-secondary)' }}>
            {recList.map((r) => (
              <li key={r.id}><strong>[{r.severity} · {r.status}]</strong> {r.title} — {r.recommendedAction}</li>
            ))}
          </ul>
          <p className="pt-1"><strong>Next Month Priorities:</strong> {narrative.nextMonthPriorities.join(' | ')}</p>
        </section>

        <section className="space-y-2 text-xs">
          <h3 className="text-sm font-semibold">8. Data Collection Health &amp; Appendix / Data Sources</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.connectors.map((c) => (
              <div key={c.connectorId} className="flex items-center justify-between rounded border px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <div>
                  <p className="font-semibold">{c.displayName}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{c.endpointOrCmdlet}</p>
                </div>
                <ConnectorStatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}

'use client';

import { useCallback } from 'react';
import type { Customer, ExecutiveNarrative, PostureScoreBreakdown, ReportingPeriod } from '@purview-portal/domain';
import { Printer } from 'lucide-react';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface ExecSummaryPayload {
  isDemo: boolean;
  customer: Customer;
  period: ReportingPeriod;
  postureScore: PostureScoreBreakdown;
  narrative: ExecutiveNarrative;
}

export default function ExecutiveSummaryPage() {
  const buildPath = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/executive-summary?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<ExecSummaryPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Generating management story...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const n = data.narrative;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Management Story · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Monthly Executive Summary — {data.customer.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
        >
          <Printer className="h-4 w-4" />
          Print Executive Summary
        </button>
      </div>

      {n.dataLimitationsNote ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Transparent Source Boundaries:</strong> {n.dataLimitationsNote}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">1. Overall Status</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {n.overallStatus}
          </p>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">2. What Changed This Month</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {n.whatChangedThisMonth}
          </p>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">3. Top Risks</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {n.topRisks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">4. Positive Improvements</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {n.positiveImprovements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">5. Managed Service Actions (Team Effort)</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {n.managedServiceActions}
          </p>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">6. Business Impact</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {n.businessImpact}
          </p>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">7. Items Requiring Customer Decision</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {n.itemsRequiringCustomerDecision.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold">8. Next Month Priorities</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {n.nextMonthPriorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

'use client';

import { useCallback } from 'react';
import type { Customer, InsiderRiskMetrics, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { HorizontalDistributionList } from '@/components/TrendChart';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface InsiderPayload {
  customer: Customer;
  period: ReportingPeriod;
  insiderRisk: InsiderRiskMetrics;
}

export default function InsiderRiskPage() {
  const buildPath = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/purview/insider-risk?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<InsiderPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Insider Risk Management...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const ir = data.insiderRisk;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Microsoft Purview Insider Risk Management · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Insider Risk Analytics</h1>
        </div>
        <ConnectorStatusBadge status={ir.status} />
      </div>

      <div className="surface-card p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <strong>Source Note:</strong> {ir.sourceNote}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Active Policies" value={ir.activePoliciesCount} availability={ir.status} source="IPPS Get-InsiderRiskPolicy" tooltip="Active Insider Risk policies." />
        <KpiCard title="Total Insider Alerts" value={ir.totalAlerts} availability={ir.status} source="Graph alerts_v2" tooltip="Insider risk alerts generated this period." />
        <KpiCard title="High-Severity Alerts" value={ir.highSeverityAlerts} availability={ir.status} source="Graph alerts_v2" tooltip="High-severity insider risk signals." />
        <KpiCard title="Escalated / Resolved Cases" value={ir.escalatedCases !== null ? `${ir.escalatedCases} / ${ir.resolvedCases ?? 0}` : null} availability={ir.status} source="Purview Case Triage" tooltip="Escalated vs. closed insider risk cases." />
      </section>

      <HorizontalDistributionList
        title="Top Insider Risk Indicator Categories (Aggregated)"
        items={ir.topIndicatorCategories}
        barColor="#D97706"
      />
    </div>
  );
}

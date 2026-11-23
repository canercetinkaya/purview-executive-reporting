'use client';

import { useCallback } from 'react';
import type { Customer, InformationProtectionMetrics, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { HorizontalDistributionList, TrendLineChart } from '@/components/TrendChart';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface IpPayload {
  customer: Customer;
  period: ReportingPeriod;
  informationProtection: InformationProtectionMetrics;
  history: Array<{ periodId: string; labelCoveragePct: number | null }>;
}

export default function InformationProtectionPage() {
  const buildPath = useCallback(
    (cid: string, pid: string) =>
      `/api/v1/customers/${cid}/purview/information-protection?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<IpPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Information Protection...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const ip = data.informationProtection;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Microsoft Purview Information Protection · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Sensitivity Labels &amp; Encryption Adoption</h1>
        </div>
        <div className="flex items-center gap-2">
          <ConnectorStatusBadge status={ip.status} />
          <ConnectorStatusBadge status={ip.unlabeledPopulationStatus} />
        </div>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-xs text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
        <strong>Microsoft API Transparency Notice:</strong> {ip.sourceNote}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Defined Sensitivity Labels"
          value={ip.definedLabelsCount}
          availability={ip.status}
          source="Graph sensitivityLabels"
          tooltip="Active sensitivity labels configured in Microsoft Purview."
        />
        <KpiCard
          title="Manual vs Auto Labeling"
          value={
            ip.manualLabelingEvents !== null
              ? `${ip.manualLabelingEvents} / ${ip.automaticLabelingEvents ?? 0}`
              : null
          }
          source="Purview Audit Search API"
          tooltip="Monthly label application events split by user-applied vs. service auto-labeling."
        />
        <KpiCard
          title="Encrypted Labeling Events"
          value={ip.encryptionProtectedEvents}
          source="Purview Audit / MIP"
          tooltip="Label applications enforcing RMS encryption and rights protection."
        />
        <KpiCard
          title="Unlabeled Files at Rest"
          value={ip.unlabeledSensitiveFilesCount}
          availability={ip.unlabeledPopulationStatus}
          source="Native Graph v1.0 Unsupported"
          tooltip="Tenant-wide unlabeled file population at rest cannot be queried directly via supported Graph v1.0 APIs."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <HorizontalDistributionList
          title="Top Used Sensitivity Labels"
          items={ip.topUsedLabels.map((l) => ({ name: l.labelName, count: l.appliedEvents }))}
          barColor="#0F6CBD"
        />
        <TrendLineChart
          title="Observed Label Coverage Trend (%)"
          subtitle="Available when Audit/Sentinel adoption pipeline is enabled; otherwise marked Unavailable."
          labels={data.history.map((h) => h.periodId)}
          series={[{ label: 'Label Coverage %', color: '#059669', values: data.history.map((h) => h.labelCoveragePct) }]}
        />
      </div>
    </div>
  );
}

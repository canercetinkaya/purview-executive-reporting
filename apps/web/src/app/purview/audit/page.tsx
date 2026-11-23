'use client';

import { useCallback } from 'react';
import type { AuditAndEDiscoveryMetrics, Customer, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface AuditPayload {
  customer: Customer;
  period: ReportingPeriod;
  auditAndEDiscovery: AuditAndEDiscoveryMetrics;
}

export default function AuditAndEDiscoveryPage() {
  const buildPath = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/purview/audit?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<AuditPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Audit, Records &amp; eDiscovery...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const a = data.auditAndEDiscovery;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Audit, Lifecycle &amp; eDiscovery · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Audit Search, Retention Labels &amp; eDiscovery</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConnectorStatusBadge status={a.auditStatus} />
          <ConnectorStatusBadge status={a.recordsManagementStatus} />
          <ConnectorStatusBadge status={a.eDiscoveryStatus} />
        </div>
      </div>

      <div className="surface-card p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <strong>Microsoft Graph Sources:</strong> {a.sourceNote}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Audit Events Collected" value={a.auditEventsCollected?.toLocaleString() ?? null} availability={a.auditStatus} source="Graph auditLog/queries" tooltip="Unified audit records queried for this reporting cycle." />
        <KpiCard title="High-Risk Admin Actions" value={a.highRiskAdminAuditActions} availability={a.auditStatus} source="Graph auditLog/queries" tooltip="DLP, label, or role-group administrative changes." />
        <KpiCard title="Retention Labels / Policies" value={a.retentionLabelsCount !== null ? `${a.retentionLabelsCount} / ${a.retentionPoliciesCount ?? 0}` : null} availability={a.recordsManagementStatus} source="Graph retentionLabels" tooltip="Published Microsoft Purview retention labels and policies." />
        <KpiCard title="Active eDiscovery Cases (Holds)" value={a.activeEDiscoveryCases !== null ? `${a.activeEDiscoveryCases} (${a.legalHoldsActive ?? 0} holds)` : null} availability={a.eDiscoveryStatus} source="Graph ediscoveryCases" tooltip="Active eDiscovery Premium cases and legal holds." />
      </section>
    </div>
  );
}

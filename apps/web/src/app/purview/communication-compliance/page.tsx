'use client';

import { useCallback } from 'react';
import type { CommunicationComplianceMetrics, Customer, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface CommPayload {
  customer: Customer;
  period: ReportingPeriod;
  communicationCompliance: CommunicationComplianceMetrics;
}

export default function CommunicationCompliancePage() {
  const buildPath = useCallback(
    (cid: string, pid: string) =>
      `/api/v1/customers/${cid}/purview/communication-compliance?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<CommPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Communication Compliance...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const cc = data.communicationCompliance;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Microsoft Purview Communication Compliance · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Communication Compliance</h1>
        </div>
        <ConnectorStatusBadge status={cc.status} />
      </div>

      <div className="surface-card p-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <strong>Availability &amp; Licensing Status:</strong> {cc.sourceNote}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Active Policies" value={cc.activePoliciesCount} availability={cc.status} source="IPPS Get-SupervisoryReviewPolicyV2" tooltip="Active Communication Compliance policies." />
        <KpiCard title="Alerts Generated" value={cc.totalAlerts} availability={cc.status} source="Graph alerts_v2" tooltip="Communication Compliance alerts." />
        <KpiCard title="Matches Reviewed" value={cc.policyMatchesReviewed} availability={cc.status} source="Analyst Outcomes" tooltip="Items reviewed by compliance analysts." />
        <KpiCard title="Escalated Items" value={cc.escalatedItems} availability={cc.status} source="Analyst Outcomes" tooltip="Items escalated for HR/Compliance review." />
      </section>

      <div className="surface-card p-5">
        <h2 className="text-sm font-semibold">Monitored Communication Channels</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {cc.channelsMonitored.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No channels monitored ({cc.status}).
            </p>
          ) : (
            cc.channelsMonitored.map((ch) => (
              <span
                key={ch}
                className="rounded-md border px-2.5 py-1 text-xs font-medium"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-subtle)' }}
              >
                {ch}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

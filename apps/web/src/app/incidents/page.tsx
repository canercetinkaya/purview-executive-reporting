'use client';

import { useCallback } from 'react';
import type { Customer, ReportingPeriod, SecurityAlertsAndIncidents } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { HorizontalDistributionList } from '@/components/TrendChart';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface IncidentsPayload {
  customer: Customer;
  period: ReportingPeriod;
  alertsAndIncidents: SecurityAlertsAndIncidents;
}

export default function IncidentsPage() {
  const buildPath = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/incidents?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error } = usePortalEndpoint<IncidentsPayload>(buildPath);

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Graph Security alerts_v2 &amp; incidents...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const ai = data.alertsAndIncidents;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Microsoft Graph Security API (v1.0) · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Alerts v2 &amp; Security Incidents</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Uses current <code>/v1.0/security/alerts_v2</code> and <code>/v1.0/security/incidents</code> (legacy /security/alerts is retired).
          </p>
        </div>
        <div className="flex gap-2">
          <ConnectorStatusBadge status={ai.alertsStatus} />
          <ConnectorStatusBadge status={ai.incidentsStatus} />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Alerts (Purview Scoped)" value={ai.totalAlerts !== null ? `${ai.totalAlerts} (${ai.purviewScopedAlerts ?? 0} Purview)` : null} availability={ai.alertsStatus} source="Graph alerts_v2" tooltip="All alerts from Graph v1.0 /security/alerts_v2 with Purview subset highlighted." />
        <KpiCard title="Incidents (Resolved / Total)" value={ai.totalIncidents !== null ? `${ai.resolvedIncidentsThisMonth ?? 0} / ${ai.totalIncidents}` : null} availability={ai.incidentsStatus} source="Graph incidents" tooltip="Resolved incidents vs. total incidents created during the period." />
        <KpiCard title="Mean Time to Resolve (MTTR)" value={ai.meanTimeToResolveHours} unit="hrs" availability={ai.incidentsStatus} source="Graph incidents" tooltip="Mean time between createdDateTime and lastUpdateDateTime for resolved incidents." />
        <KpiCard title="Median Time to Resolve" value={ai.medianTimeToResolveHours} unit="hrs" availability={ai.incidentsStatus} source="Graph incidents" tooltip="Median resolution time in hours." />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <HorizontalDistributionList title="Alerts by Service Source (alerts_v2)" items={ai.alertsByServiceSource} barColor="#0F6CBD" />
        <HorizontalDistributionList title="Alerts by Classification" items={ai.alertsByClassification} barColor="#059669" />
        <HorizontalDistributionList title="Alerts by Determination" items={ai.alertsByDetermination} barColor="#D97706" />
        <HorizontalDistributionList title="Top Incident Categories" items={ai.topIncidentCategories} barColor="#DC2626" />
      </section>
    </div>
  );
}

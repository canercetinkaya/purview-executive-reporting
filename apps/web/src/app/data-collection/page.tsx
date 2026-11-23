'use client';

import { useCallback, useState } from 'react';
import type { CollectionRun, Customer, DataSourceDescriptor, ReportingPeriod } from '@purview-portal/domain';
import { RefreshCw } from 'lucide-react';
import { ConnectorStatusBadge } from '@/components/StatusBadges';
import { usePortal } from '@/components/PortalContext';
import { fetchPortalJson } from '@/lib/apiClient';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface ConnectorsPayload {
  customer: Customer;
  period: ReportingPeriod;
  connectors: DataSourceDescriptor[];
  runs: CollectionRun[];
}

export default function DataCollectionPage() {
  const { permissions, personaId, selectedCustomerId, selectedPeriodId } = usePortal();
  const buildPath = useCallback(
    (cid: string, pid: string) =>
      `/api/v1/customers/${cid}/observability/connectors?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error, reload } = usePortalEndpoint<ConnectorsPayload>(buildPath);
  const [triggering, setTriggering] = useState(false);

  const canTrigger = permissions.includes('collection:trigger');

  async function handleTrigger() {
    setTriggering(true);
    try {
      await fetchPortalJson(
        `/api/v1/customers/${selectedCustomerId}/collection/trigger?period=${encodeURIComponent(selectedPeriodId)}`,
        { method: 'POST', personaId },
      );
      await reload();
    } finally {
      setTriggering(false);
    }
  }

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading connector observability...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Connector Health &amp; Telemetry · {data.period.label}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Data Collection Observability</h1>
        </div>
        <button
          type="button"
          disabled={!canTrigger || triggering}
          onClick={() => void handleTrigger()}
          className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-45"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}
        >
          <RefreshCw className={`h-4 w-4 ${triggering ? 'animate-spin' : ''}`} />
          {triggering ? 'Running Audit...' : 'Run Collection Verification'}
        </button>
      </div>

      <section className="surface-card overflow-hidden">
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-sm font-semibold">Microsoft Connectors Matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-4 py-2.5 font-semibold">Connector</th>
                <th className="px-4 py-2.5 font-semibold">Channel</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">Records</th>
                <th className="px-4 py-2.5 text-right font-semibold">429s</th>
                <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
                <th className="px-4 py-2.5 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {data.connectors.map((c) => (
                <tr key={c.connectorId}>
                  <td className="px-4 py-2.5 font-medium">
                    <div>{c.displayName}</div>
                    <div className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {c.endpointOrCmdlet}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{c.apiChannel}</td>
                  <td className="px-4 py-2.5"><ConnectorStatusBadge status={c.status} /></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.recordsCollected.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.throttleCount429}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.durationMs} ms</td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{c.statusDetail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-sm font-semibold">Collection Run History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-4 py-2.5 font-semibold">Run ID</th>
                <th className="px-4 py-2.5 font-semibold">Period</th>
                <th className="px-4 py-2.5 font-semibold">Triggered By</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 text-right font-semibold">429 Throttles</th>
                <th className="px-4 py-2.5 text-right font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {data.runs.slice(0, 10).map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-2 font-mono">{run.id}</td>
                  <td className="px-4 py-2 tabular-nums">{run.periodId}</td>
                  <td className="px-4 py-2">{run.triggeredBy}</td>
                  <td className="px-4 py-2 font-semibold">{run.status}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.throttleEvents429}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{run.durationMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

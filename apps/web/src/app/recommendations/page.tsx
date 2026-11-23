'use client';

import { useCallback, useState } from 'react';
import type { Customer, Recommendation, RecommendationStatus } from '@purview-portal/domain';
import { SeverityBadge } from '@/components/StatusBadges';
import { usePortal } from '@/components/PortalContext';
import { fetchPortalJson } from '@/lib/apiClient';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface RecsPayload {
  customer: Customer;
  recommendations: Recommendation[];
}

export default function RecommendationsPage() {
  const { permissions, personaId, selectedCustomerId } = usePortal();
  const buildPath = useCallback((cid: string) => `/api/v1/customers/${cid}/recommendations`, []);
  const { data, loading, error, reload } = usePortalEndpoint<RecsPayload>(buildPath);
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const canWrite = permissions.includes('recommendations:write');

  async function handleStatusChange(recId: string, status: RecommendationStatus) {
    setUpdatingId(recId);
    try {
      await fetchPortalJson(`/api/v1/customers/${selectedCustomerId}/recommendations/${recId}`, {
        method: 'PATCH',
        personaId,
        body: { status },
      });
      await reload();
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading recommendations...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const visible = data.recommendations.filter(
    (r) => filterSeverity === 'All' || r.severity === filterSeverity,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
            Evidence-Backed Governance Actions
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Recommendations — {data.customer.name}</h1>
        </div>
        <select
          aria-label="Filter by severity"
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-xs font-medium"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
        >
          <option value="All">All Severities ({data.recommendations.length})</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div className="space-y-4">
        {visible.map((rec) => (
          <article key={rec.id} className="surface-card p-5 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={rec.severity} />
                  <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--bg-subtle)' }}>
                    {rec.category}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Status: <strong>{rec.status}</strong> · Owner: {rec.owner} · Target: {rec.targetDate}
                  </span>
                </div>
                <h2 className="text-base font-semibold">{rec.title}</h2>
              </div>

              {canWrite ? (
                <select
                  aria-label={`Update status for ${rec.title}`}
                  value={rec.status}
                  disabled={updatingId === rec.id}
                  onChange={(e) => void handleStatusChange(rec.id, e.target.value as RecommendationStatus)}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
                >
                  <option value="Open">Open</option>
                  <option value="InProgress">InProgress</option>
                  <option value="AcceptedRisk">AcceptedRisk</option>
                  <option value="Resolved">Resolved</option>
                </select>
              ) : null}
            </div>

            <div className="grid gap-3 text-xs md:grid-cols-2" style={{ color: 'var(--text-secondary)' }}>
              <div><strong>Observation:</strong> {rec.observation}</div>
              <div><strong>Evidence:</strong> {rec.evidence}</div>
              <div><strong>Business Risk:</strong> {rec.businessRisk}</div>
              <div><strong>Technical Impact:</strong> {rec.technicalImpact}</div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
              <span><strong>Recommended Action:</strong> {rec.recommendedAction}</span>
              <a
                href={rec.microsoftDocsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold hover:underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                Microsoft Learn Docs ↗
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useState } from 'react';
import type { Customer, ManagedActivityCategory, ManagedServiceValueSummary, ReportingPeriod } from '@purview-portal/domain';
import { KpiCard } from '@/components/KpiCard';
import { usePortal } from '@/components/PortalContext';
import { fetchPortalJson } from '@/lib/apiClient';
import { usePortalEndpoint } from '@/lib/usePortalData';

interface ManagedServicePayload {
  customer: Customer;
  period: ReportingPeriod;
  summary: ManagedServiceValueSummary;
  separationGuarantee: string;
  teamWorkTotals: {
    totalHumanOperations: number;
    triageAndInvestigations: number;
    engineeringAndTuningActions: number;
    governanceAndHealthChecks: number;
  };
  microsoftAutomationReference: {
    microsoftAutomatedDetections: number | null;
    microsoftAutoRemediatedEvents: number | null;
    note: string;
  };
}

export default function ManagedServicePage() {
  const { permissions, personaId, selectedCustomerId, selectedPeriodId } = usePortal();
  const buildPath = useCallback(
    (cid: string, pid: string) => `/api/v1/customers/${cid}/managed-service?period=${encodeURIComponent(pid)}`,
    [],
  );
  const { data, loading, error, reload } = usePortalEndpoint<ManagedServicePayload>(buildPath);

  const [category, setCategory] = useState<ManagedActivityCategory>('DlpRuleChange');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const canWrite = permissions.includes('managed_service:write');

  async function handleAddActivity(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      await fetchPortalJson(`/api/v1/customers/${selectedCustomerId}/managed-service/activities`, {
        method: 'POST',
        personaId,
        body: { periodId: selectedPeriodId, category, title, summary, outcome },
      });
      setTitle('');
      setSummary('');
      setOutcome('');
      setSubmitMsg('Managed Service activity recorded and KPI totals updated.');
      await reload();
    } catch (err) {
      setSubmitMsg(err instanceof Error ? err.message : 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) return <div className="surface-card p-8 text-sm">Loading Managed Service Value...</div>;
  if (error || !data) return <div className="surface-card p-6 text-sm text-rose-700">{error ?? 'Unavailable'}</div>;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <div className="border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
          Managed Service Value · {data.period.label}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Operational Delivery &amp; Service Proof — {data.customer.name}</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {data.separationGuarantee}
        </p>
      </div>

      {/* Strict Separation Banner */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card border-emerald-300/70 p-5 dark:border-emerald-800/70">
          <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            MANAGED SERVICE TEAM ACTIVITY (VERIFIED HUMAN EFFORT)
          </span>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="tabular-nums text-3xl font-semibold">{data.teamWorkTotals.totalHumanOperations}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              operations · {s.monitoringHoursLogged} monitoring hours logged
            </span>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            Triage &amp; Investigations: {data.teamWorkTotals.triageAndInvestigations} · Engineering &amp; Tuning:{' '}
            {data.teamWorkTotals.engineeringAndTuningActions} · Governance &amp; Health Checks:{' '}
            {data.teamWorkTotals.governanceAndHealthChecks}
          </p>
        </div>

        <div className="surface-card p-5">
          <span className="inline-block rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            MICROSOFT AUTOMATED PLATFORM TELEMETRY (EXCLUDED FROM TEAM EFFORT)
          </span>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="tabular-nums text-3xl font-semibold">
              {data.microsoftAutomationReference.microsoftAutomatedDetections ?? 'Unavailable'}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              automated detections ({data.microsoftAutomationReference.microsoftAutoRemediatedEvents ?? 0} auto-mitigated by M365)
            </span>
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {data.microsoftAutomationReference.note}
          </p>
        </div>
      </section>

      {/* Granular Metrics */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Alerts Reviewed (Analysts)" value={s.alertsReviewedByAnalysts} higherIsBetter={true} source="Service Ledger" tooltip="Alerts manually triaged by SOC/Purview analysts." />
        <KpiCard title="Incidents Investigated / Closed" value={`${s.incidentsInvestigatedByTeam} / ${s.casesClosedByTeam}`} higherIsBetter={true} source="Service Ledger" tooltip="Incidents investigated and cases closed by the service team." />
        <KpiCard title="Policies Reviewed / Changed" value={`${s.policiesReviewed} / ${s.policiesChanged}`} higherIsBetter={true} source="Service Ledger" tooltip="DLP, IP, and Insider policies audited and updated." />
        <KpiCard title="False Positives Reduced" value={s.falsePositivesReduced} higherIsBetter={true} rag="Green" source="Service Ledger" tooltip="Recurring noise eliminated via SIT/keyword/exclusion tuning." />
        <KpiCard title="Exceptions & Label Changes" value={`${s.exceptionsReviewed} exc / ${s.sensitivityLabelChanges} lbl`} source="Service Ledger" tooltip="Policy exception reviews and sensitivity label adjustments." />
        <KpiCard title="DLP Rule & Config Fixes" value={`${s.dlpRuleChanges} rules / ${s.resolvedConfigurationIssues} fixes`} source="Service Ledger" tooltip="Direct DLP rule changes and configuration drift remediation." />
        <KpiCard title="Health Checks & MS Recs" value={`${s.proactiveHealthChecks} checks / ${s.microsoftRecommendationsAssessed} recs`} source="Service Ledger" tooltip="Scheduled connector health checks and Microsoft recommendations assessed." />
        <KpiCard title="Customer Requests & Jobs" value={`${s.customerRequestsHandled} req / ${s.automationExecutions} auto`} source="Service Ledger" tooltip="Customer service requests handled and collection automation runs." />
      </section>

      {/* Activity Ledger + Add Form */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Verified Managed Service Activity Log</h2>
          <div className="mt-4 space-y-3">
            {s.activities.map((act) => (
              <div key={act.id} className="rounded-lg border p-3.5 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{act.title}</span>
                  <span className="rounded px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent-primary)' }}>
                    {act.category}
                  </span>
                </div>
                <p className="mt-1.5" style={{ color: 'var(--text-secondary)' }}>{act.summary}</p>
                <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
                  <strong>Outcome:</strong> {act.outcome} · <em>{act.performedBy}</em>
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="text-sm font-semibold">Log Service Delivery Activity</h2>
          {!canWrite ? (
            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              Your active RBAC role lacks <code>managed_service:write</code> permission. Switch to ServiceManager, PlatformAdmin, SecurityAnalyst, or ComplianceAnalyst to record operational work.
            </p>
          ) : (
            <form onSubmit={handleAddActivity} className="mt-3 space-y-3 text-xs">
              <div>
                <label className="block font-medium mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ManagedActivityCategory)}
                  className="w-full rounded-md border px-2.5 py-1.5"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
                >
                  <option value="DlpRuleChange">DlpRuleChange</option>
                  <option value="FalsePositiveReduction">FalsePositiveReduction</option>
                  <option value="AlertTriage">AlertTriage</option>
                  <option value="IncidentInvestigation">IncidentInvestigation</option>
                  <option value="PolicyTuning">PolicyTuning</option>
                  <option value="ExceptionReview">ExceptionReview</option>
                  <option value="HealthCheck">HealthCheck</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Title</label>
                <input
                  required
                  minLength={4}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Tuned PCI SharePoint exclusion"
                  className="w-full rounded-md border px-2.5 py-1.5"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Summary</label>
                <textarea
                  required
                  minLength={10}
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-md border px-2.5 py-1.5"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Measured Outcome</label>
                <input
                  required
                  minLength={6}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g. Reduced false alerts by 11/wk"
                  className="w-full rounded-md border px-2.5 py-1.5"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-canvas)' }}
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md px-3 py-2 font-semibold"
                style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}
              >
                {submitting ? 'Saving...' : 'Record Activity'}
              </button>
              {submitMsg ? <p className="text-[11px]" style={{ color: 'var(--accent-primary)' }}>{submitMsg}</p> : null}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}

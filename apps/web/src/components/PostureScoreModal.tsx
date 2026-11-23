'use client';

import type { PostureScoreBreakdown } from '@purview-portal/domain';
import { X } from 'lucide-react';
import { ConnectorStatusBadge } from './StatusBadges';

export function PostureScoreModal({
  breakdown,
  open,
  onClose,
}: {
  breakdown: PostureScoreBreakdown | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !breakdown) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Security & Compliance Posture Score Breakdown"
    >
      <div className="surface-card max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent-primary)' }}>
              Transparent Scoring Methodology
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              Security &amp; Compliance Posture Score:{' '}
              <span className="tabular-nums">{breakdown.overallScore ?? 'Insufficient Data'} / 100</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-800"
            aria-label="Close breakdown"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-lg border p-3 text-xs leading-relaxed" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-subtle)' }}>
          <strong>Formula:</strong> {breakdown.formula}
        </div>

        {breakdown.unavailableNote ? (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Re-normalization Notice:</strong> {breakdown.unavailableNote}
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {breakdown.components.map((comp) => (
            <div
              key={comp.id}
              className="rounded-lg border p-3.5"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{comp.name}</span>
                  <ConnectorStatusBadge status={comp.status} />
                </div>
                <div className="tabular-nums text-sm font-semibold">
                  {comp.score !== null ? `${comp.score}/100` : 'Excluded'} · Weight{' '}
                  {Math.round(comp.effectiveWeight * 100)}% (base {Math.round(comp.weight * 100)}%)
                </div>
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <strong>Source Metrics:</strong> {comp.sourceMetrics}
              </p>
              <p className="mt-1 font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {comp.calculationDetail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

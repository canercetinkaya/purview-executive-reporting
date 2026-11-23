'use client';

import type { ConnectorAvailabilityStatus, RagStatus } from '@purview-portal/domain';
import { HelpCircle } from 'lucide-react';
import { ConnectorStatusBadge, RagBadge } from './StatusBadges';

export interface KpiCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  previousValue?: number | null;
  currentNumeric?: number | null;
  higherIsBetter?: boolean;
  rag?: RagStatus;
  availability?: ConnectorAvailabilityStatus;
  source: string;
  tooltip: string;
  onInspect?: () => void;
}

export function KpiCard({
  title,
  value,
  unit,
  previousValue,
  currentNumeric,
  higherIsBetter = false,
  rag,
  availability = 'Available',
  source,
  tooltip,
  onInspect,
}: KpiCardProps) {
  let deltaText: string | null = null;
  let deltaPositive = false;
  if (
    currentNumeric !== null &&
    currentNumeric !== undefined &&
    previousValue !== null &&
    previousValue !== undefined &&
    previousValue !== 0
  ) {
    const pct = Math.round(((currentNumeric - previousValue) / previousValue) * 1000) / 10;
    const sign = pct > 0 ? '+' : '';
    deltaText = `${sign}${pct}% MoM`;
    deltaPositive = higherIsBetter ? pct >= 0 : pct <= 0;
  }

  const isUnavailable = value === null || (availability !== 'Available' && availability !== 'BetaDependency');

  return (
    <div className="surface-card flex flex-col justify-between p-4 transition-colors">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              {title}
            </span>
            <span title={`${tooltip} (Source: ${source})`} className="cursor-help" style={{ color: 'var(--text-muted)' }}>
              <HelpCircle className="h-3.5 w-3.5" aria-label={tooltip} />
            </span>
          </div>
          {rag && !isUnavailable ? <RagBadge status={rag} /> : null}
          {isUnavailable ? <ConnectorStatusBadge status={availability} /> : null}
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="tabular-nums text-2xl font-semibold tracking-tight">
            {isUnavailable ? 'Unavailable' : value}
          </span>
          {!isUnavailable && unit ? (
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {unit}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
        <span className="truncate" style={{ color: 'var(--text-muted)' }} title={source}>
          {source}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {deltaText && !isUnavailable ? (
            <span
              className={`tabular-nums font-semibold ${
                deltaPositive
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {deltaText}
            </span>
          ) : null}
          {onInspect ? (
            <button
              type="button"
              onClick={onInspect}
              className="font-semibold underline underline-offset-2"
              style={{ color: 'var(--accent-primary)' }}
            >
              Formula
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

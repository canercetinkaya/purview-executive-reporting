'use client';

import type { ScorecardRow } from '@purview-portal/domain';
import Link from 'next/link';
import { RagBadge } from './StatusBadges';

export function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="border-b px-5 py-3.5" style={{ borderColor: 'var(--border-subtle)' }}>
        <h3 className="text-sm font-semibold">Monthly Service Scorecard</h3>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Every KPI traces directly to its verified Microsoft data source and supports drilldown inspection.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead style={{ backgroundColor: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
            <tr>
              <th className="px-4 py-2.5 font-semibold">Metric</th>
              <th className="px-4 py-2.5 font-semibold text-right">Current</th>
              <th className="px-4 py-2.5 font-semibold text-right">Previous</th>
              <th className="px-4 py-2.5 font-semibold text-right">Change</th>
              <th className="px-4 py-2.5 font-semibold">Target</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Technical Source</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {rows.map((row) => {
              const arrow =
                row.trend === 'up' ? '↑' : row.trend === 'down' ? '↓' : row.trend === 'flat' ? '→' : '—';
              const isGoodDirection =
                row.changePct === null
                  ? true
                  : row.higherIsBetter
                    ? row.changePct >= 0
                    : row.changePct <= 0;

              return (
                <tr key={row.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={row.drilldownHref}
                      className="hover:underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      {row.metric}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    {row.currentMonth !== null ? `${row.currentMonth} ${row.unit}` : 'Unavailable'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {row.previousMonth !== null ? `${row.previousMonth}` : '—'}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                      row.changePct === null
                        ? 'text-slate-400'
                        : isGoodDirection
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {row.changePct !== null ? `${arrow} ${row.changePct > 0 ? '+' : ''}${row.changePct}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                    {row.targetLabel}
                  </td>
                  <td className="px-4 py-2.5">
                    <RagBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                    {row.source}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

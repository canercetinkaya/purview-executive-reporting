import type { MonthlySnapshot, ScorecardRow } from '@purview-portal/domain';

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) and escapes CSV quotes.
 */
export function sanitizeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '""';
  let str = String(raw).replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function exportScorecardToCsv(
  customerName: string,
  snapshot: MonthlySnapshot,
  scorecard: ScorecardRow[],
): string {
  const header = [
    'Customer',
    'Period',
    'IsDemoData',
    'Metric',
    'CurrentMonth',
    'PreviousMonth',
    'Unit',
    'ChangePct',
    'Trend',
    'Target',
    'Status',
    'Source',
  ]
    .map(sanitizeCsvCell)
    .join(',');

  const lines = scorecard.map((row) =>
    [
      customerName,
      snapshot.period.periodId,
      snapshot.isDemo ? 'DEMO' : 'PRODUCTION',
      row.metric,
      row.currentMonth ?? 'Unavailable',
      row.previousMonth ?? 'N/A',
      row.unit,
      row.changePct ?? 'N/A',
      row.trend,
      row.targetLabel,
      row.status,
      row.source,
    ]
      .map(sanitizeCsvCell)
      .join(','),
  );

  return [header, ...lines].join('\r\n');
}

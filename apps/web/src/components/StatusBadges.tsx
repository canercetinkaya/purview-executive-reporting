'use client';

import type {
  ConnectorAvailabilityStatus,
  RagStatus,
  Severity,
} from '@purview-portal/domain';

const CONNECTOR_BADGE_MAP: Record<ConnectorAvailabilityStatus, { bg: string; label: string }> = {
  Available: {
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    label: 'Available',
  },
  Unavailable: {
    bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    label: 'Unavailable',
  },
  PermissionMissing: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    label: 'Permission Missing',
  },
  NotLicensed: {
    bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    label: 'Not Licensed',
  },
  ApiUnsupported: {
    bg: 'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    label: 'API Unsupported',
  },
  CollectionFailed: {
    bg: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    label: 'Collection Failed',
  },
  BetaDependency: {
    bg: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
    label: 'Beta Dependency',
  },
};

export function ConnectorStatusBadge({ status }: { status: ConnectorAvailabilityStatus }) {
  const cfg = CONNECTOR_BADGE_MAP[status] ?? CONNECTOR_BADGE_MAP.Unavailable;
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

const RAG_MAP: Record<RagStatus, string> = {
  Green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  Amber: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  Red: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  Unavailable: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

export function RagBadge({ status }: { status: RagStatus }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${RAG_MAP[status]}`}>
      {status}
    </span>
  );
}

const SEVERITY_MAP: Record<Severity, string> = {
  Critical: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800',
  High: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
  Medium: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  Low: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${SEVERITY_MAP[severity]}`}>
      {severity}
    </span>
  );
}

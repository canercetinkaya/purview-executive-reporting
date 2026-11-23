'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckSquare,
  Database,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  Lock,
  Menu,
  MessageSquareWarning,
  Moon,
  Printer,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import type { TrendWindow } from '@purview-portal/domain';
import { usePortal } from './PortalContext';

interface NavGroup {
  label?: string;
  items: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/executive-summary', label: 'Executive Summary', icon: FileText },
    ],
  },
  {
    label: 'Microsoft Purview',
    items: [
      { href: '/purview/dlp', label: 'Data Loss Prevention', icon: ShieldAlert },
      { href: '/purview/information-protection', label: 'Information Protection', icon: Lock },
      { href: '/purview/insider-risk', label: 'Insider Risk', icon: UserCheck },
      { href: '/purview/communication-compliance', label: 'Comm Compliance', icon: MessageSquareWarning },
      { href: '/purview/audit', label: 'Audit & eDiscovery', icon: Activity },
    ],
  },
  {
    label: 'Operations & Governance',
    items: [
      { href: '/incidents', label: 'Security Incidents', icon: AlertTriangle },
      { href: '/managed-service', label: 'Managed Service Value', icon: BarChart3 },
      { href: '/recommendations', label: 'Recommendations', icon: CheckSquare },
      { href: '/reports', label: 'Reports & Print', icon: Printer },
      { href: '/data-collection', label: 'Data Collection', icon: Database },
      { href: '/administration', label: 'Administration', icon: Settings },
    ],
  },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    demoMode,
    principal,
    personas,
    personaId,
    setPersonaId,
    customers,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedPeriodId,
    setSelectedPeriodId,
    trendWindow,
    setTrendWindow,
    theme,
    toggleTheme,
    error,
  } = usePortal();

  const [mobileOpen, setMobileOpen] = useState(false);

  const activeCustomer = customers.find((c) => c.id === selectedCustomerId) ?? customers[0];
  const periods = activeCustomer?.availablePeriods ?? [];

  const navContent = (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="flex items-center gap-2.5 border-b pb-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-text)' }}
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Purview Executive</p>
            <p className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Managed Service Portal
            </p>
          </div>
        </div>

        <nav className="mt-4 space-y-5" aria-label="Portal Navigation">
          {NAV_GROUPS.map((group, idx) => (
            <div key={group.label ?? `group-${idx}`}>
              {group.label ? (
                <p
                  className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {group.label}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'font-semibold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
                        }`}
                        style={
                          active
                            ? {
                                backgroundColor: 'var(--accent-soft)',
                                color: 'var(--accent-primary)',
                              }
                            : { color: 'var(--text-secondary)' }
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {principal ? (
        <div
          className="mt-6 rounded-lg border p-3 text-xs"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-subtle)' }}
        >
          <p className="font-semibold truncate">{principal.displayName}</p>
          <p className="mt-0.5 text-[11px]" style={{ color: 'var(--accent-primary)' }}>
            Role: {principal.role}
          </p>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {principal.assignedCustomerIds.length > 0
              ? `Tenant Scope: ${principal.assignedCustomerIds.join(', ')}`
              : 'Scope: Multi-Customer Provider'}
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {demoMode ? (
        <div className="no-print border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          <span className="mr-2 inline-block rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">
            DEMO DATA
          </span>
          Deterministic synthetic 14-month Managed Purview telemetry is active. Demo records are never mixed with live tenant snapshots.
        </div>
      ) : null}

      <div className="flex flex-1 min-w-0">
        {/* Desktop Sidebar */}
        <aside
          className="no-print hidden w-64 shrink-0 border-r lg:block"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {navContent}
        </aside>

        {/* Mobile Drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
            <div
              className="relative z-10 w-68 max-w-[85vw] overflow-y-auto border-r"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-3 rounded p-1.5"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
              {navContent}
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Global Control Header */}
          <header
            className="no-print sticky top-0 z-30 border-b px-4 py-3 lg:px-6"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="rounded-md border p-2 lg:hidden"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <FileBarChart2 className="hidden h-4 w-4 sm:block" style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                    {activeCustomer?.serviceTier ?? 'Managed Purview Service'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <label className="sr-only" htmlFor="customer-select">Customer</label>
                <select
                  id="customer-select"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="max-w-full rounded-md border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor="period-select">Reporting Month</label>
                <select
                  id="period-select"
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="max-w-full rounded-md border px-2.5 py-1.5 text-xs font-medium tabular-nums"
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  {[...periods].reverse().map((p) => (
                    <option key={p.periodId} value={p.periodId}>
                      {p.label}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor="window-select">Trend Window</label>
                <select
                  id="window-select"
                  value={trendWindow}
                  onChange={(e) => setTrendWindow(e.target.value as TrendWindow)}
                  className="max-w-full rounded-md border px-2.5 py-1.5 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-canvas)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <option value="MoM">MoM (2M)</option>
                  <option value="3M">3-Month Trend</option>
                  <option value="6M">6-Month Trend</option>
                  <option value="12M">12-Month Trend</option>
                </select>

                {personas.length > 0 ? (
                  <select
                    aria-label="Active Demo RBAC Persona"
                    value={personaId}
                    onChange={(e) => setPersonaId(e.target.value)}
                    className="w-full sm:w-auto max-w-full truncate rounded-md border px-2.5 py-1.5 text-xs font-medium"
                    style={{
                      backgroundColor: 'var(--bg-canvas)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} [{p.role}]
                      </option>
                    ))}
                  </select>
                ) : null}

                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-md border p-1.5"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  aria-label="Toggle color theme"
                >
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
            {error ? (
              <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                <strong>Portal API Warning:</strong> {error}
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

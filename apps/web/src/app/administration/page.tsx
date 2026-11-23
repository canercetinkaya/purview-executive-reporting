'use client';

import { useEffect, useState } from 'react';
import { usePortal } from '@/components/PortalContext';
import { fetchPortalJson } from '@/lib/apiClient';

interface AdminRolesPayload {
  roles: Array<{
    role: string;
    permissions: string[];
    tenantScoped: boolean;
  }>;
}

export default function AdministrationPage() {
  const { customers, permissions, personaId, principal } = usePortal();
  const [rolesData, setRolesData] = useState<AdminRolesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canReadAdmin = permissions.includes('admin:read');

  useEffect(() => {
    if (!canReadAdmin) {
      setRolesData(null);
      return;
    }
    fetchPortalJson<AdminRolesPayload>('/api/v1/administration/roles', { personaId })
      .then(setRolesData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load RBAC matrix'));
  }, [canReadAdmin, personaId]);

  return (
    <div className="space-y-6">
      <div className="border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-primary)' }}>
          Multi-Tenant Isolation &amp; RBAC Governance
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Administration</h1>
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          Server-side RBAC enforcement and customer-scoped tenant isolation.
        </p>
      </div>

      <section className="surface-card p-5 text-xs space-y-2">
        <h2 className="text-sm font-semibold">Active Session Principal</h2>
        <p><strong>User:</strong> {principal?.displayName} ({principal?.email})</p>
        <p><strong>Role:</strong> {principal?.role} · <strong>Auth Mode:</strong> {principal?.authMethod}</p>
        <p><strong>Granted Permissions:</strong> {permissions.join(', ')}</p>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <h2 className="text-sm font-semibold">Authorized Customer Tenants ({customers.length})</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <tr>
              <th className="px-4 py-2 font-semibold">Customer</th>
              <th className="px-4 py-2 font-semibold">Customer ID</th>
              <th className="px-4 py-2 font-semibold">Service Tier</th>
              <th className="px-4 py-2 font-semibold">Industry</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {customers.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5 font-semibold">{c.name}</td>
                <td className="px-4 py-2.5 font-mono">{c.id}</td>
                <td className="px-4 py-2.5">{c.serviceTier}</td>
                <td className="px-4 py-2.5">{c.industry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!canReadAdmin ? (
        <div className="surface-card border-amber-300 p-5 text-xs text-amber-900 dark:border-amber-800 dark:text-amber-200">
          Your active role (<strong>{principal?.role}</strong>) does not hold <code>admin:read</code> permission. The RBAC role matrix endpoint returns HTTP 403 for this role.
        </div>
      ) : error ? (
        <div className="surface-card p-5 text-xs text-rose-700">{error}</div>
      ) : rolesData ? (
        <section className="surface-card overflow-hidden">
          <div className="border-b px-5 py-3" style={{ borderColor: 'var(--border-subtle)' }}>
            <h2 className="text-sm font-semibold">Server-Enforced RBAC Matrix (7 Roles)</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <tr>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Tenant Isolation</th>
                <th className="px-4 py-2 font-semibold">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {rolesData.roles.map((r) => (
                <tr key={r.role}>
                  <td className="px-4 py-2.5 font-semibold">{r.role}</td>
                  <td className="px-4 py-2.5">{r.tenantScoped ? 'Single Assigned Customer Only' : 'Cross-Customer Provider'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{r.permissions.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthenticatedPrincipal, Customer, TrendWindow } from '@purview-portal/domain';
import { fetchPortalJson } from '@/lib/apiClient';

export interface CustomerOption extends Customer {
  availablePeriods: Array<{ periodId: string; label: string }>;
}

export interface DemoPersonaOption {
  id: string;
  displayName: string;
  email: string;
  role: string;
  assignedCustomerIds: string[];
  description: string;
}

interface PortalState {
  ready: boolean;
  demoMode: boolean;
  principal: AuthenticatedPrincipal | null;
  permissions: string[];
  personas: DemoPersonaOption[];
  personaId: string;
  customers: CustomerOption[];
  selectedCustomerId: string;
  selectedPeriodId: string;
  trendWindow: TrendWindow;
  theme: 'light' | 'dark';
  error: string | null;
  setPersonaId: (id: string) => void;
  setSelectedCustomerId: (id: string) => void;
  setSelectedPeriodId: (id: string) => void;
  setTrendWindow: (w: TrendWindow) => void;
  toggleTheme: () => void;
  refreshSession: () => Promise<void>;
}

const PortalContext = createContext<PortalState | null>(null);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [principal, setPrincipal] = useState<AuthenticatedPrincipal | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [personas, setPersonas] = useState<DemoPersonaOption[]>([]);
  const [personaId, setPersonaId] = useState('persona-service-manager');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('cust-contoso-fin');
  const [selectedPeriodId, setSelectedPeriodId] = useState('2026-11');
  const [trendWindow, setTrendWindow] = useState<TrendWindow>('6M');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState<string | null>(null);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next === 'dark');
      }
      return next;
    });
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      setError(null);
      const [meRes, custRes] = await Promise.all([
        fetchPortalJson<{
          principal: AuthenticatedPrincipal;
          permissions: string[];
          demoMode: boolean;
          availableDemoPersonas: DemoPersonaOption[];
        }>('/api/v1/me', { personaId }),
        fetchPortalJson<{
          demoMode: boolean;
          customers: CustomerOption[];
        }>('/api/v1/customers', { personaId }),
      ]);

      setPrincipal(meRes.principal);
      setPermissions(meRes.permissions);
      setDemoMode(meRes.demoMode);
      setPersonas(meRes.availableDemoPersonas ?? []);
      setCustomers(custRes.customers);

      if (custRes.customers.length > 0) {
        const stillValid = custRes.customers.some((c) => c.id === selectedCustomerId);
        const activeCustomer = stillValid
          ? custRes.customers.find((c) => c.id === selectedCustomerId)!
          : custRes.customers[0]!;
        if (!stillValid) {
          setSelectedCustomerId(activeCustomer.id);
        }
        const periods = activeCustomer.availablePeriods;
        if (periods.length > 0 && !periods.some((p) => p.periodId === selectedPeriodId)) {
          setSelectedPeriodId(periods[periods.length - 1]!.periodId);
        }
      }
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize portal session.');
      setReady(true);
    }
  }, [personaId, selectedCustomerId, selectedPeriodId]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  return (
    <PortalContext.Provider
      value={{
        ready,
        demoMode,
        principal,
        permissions,
        personas,
        personaId,
        customers,
        selectedCustomerId,
        selectedPeriodId,
        trendWindow,
        theme,
        error,
        setPersonaId,
        setSelectedCustomerId,
        setSelectedPeriodId,
        setTrendWindow,
        toggleTheme,
        refreshSession,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal(): PortalState {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside PortalProvider');
  return ctx;
}

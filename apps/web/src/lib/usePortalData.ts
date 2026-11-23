'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePortal } from '@/components/PortalContext';
import { fetchPortalJson } from '@/lib/apiClient';

export function usePortalEndpoint<T>(pathBuilder: (customerId: string, periodId: string, window: string) => string) {
  const { ready, selectedCustomerId, selectedPeriodId, trendWindow, personaId } = usePortal();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready || !selectedCustomerId) return;
    setLoading(true);
    setError(null);
    try {
      const path = pathBuilder(selectedCustomerId, selectedPeriodId, trendWindow);
      const res = await fetchPortalJson<T>(path, { personaId });
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load view data');
    } finally {
      setLoading(false);
    }
  }, [ready, selectedCustomerId, selectedPeriodId, trendWindow, personaId, pathBuilder]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}

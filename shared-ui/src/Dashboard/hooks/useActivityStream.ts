/**
 * useDashboardMetrics Hook
 * Fetches and caches dashboard metrics from the API
 */

import { useEffect, useState, useCallback } from 'react';
import { DashboardMetrics } from '../types/dashboard';

interface UseDashboardMetricsProps {
  apiEndpoint: string;
  refreshInterval?: number; // milliseconds
  onError?: (error: string) => void;
}

export const useDashboardMetrics = ({
  apiEndpoint,
  refreshInterval = 1000, // Default 1 second
  onError,
}: UseDashboardMetricsProps) => {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    threatsBlocked: 0,
    dataExposure: 0,
    networkTraffic: '0 GB',
    lastUpdate: Date.now(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(apiEndpoint);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setMetrics({
        ...data,
        lastUpdate: Date.now(),
      });
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      if (onError) onError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [apiEndpoint, onError]);

  useEffect(() => {
    // Initial fetch
    fetchMetrics();

    // Set up refresh interval
    const intervalId = setInterval(fetchMetrics, refreshInterval);

    return () => clearInterval(intervalId);
  }, [fetchMetrics, refreshInterval]);

  return {
    metrics,
    isLoading,
    error,
    refetch: fetchMetrics,
  };
};

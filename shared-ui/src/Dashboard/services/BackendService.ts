/**
 * Backend API Integration Service
 * Connects to HaloGuard backend API for scan results and data
 */

import { ScanResult, TierResult, ActivityEntry, DashboardMetrics } from '../types/dashboard';

interface BackendConfig {
  apiUrl: string;
  apiKey?: string;
  timeout?: number;
}

export class BackendService {
  private apiUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor({ apiUrl, apiKey, timeout = 5000 }: BackendConfig) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  /**
   * Fetch metrics from backend API
   */
  async getMetrics(): Promise<DashboardMetrics> {
    try {
      const response = await this.fetch('/api/v1/dashboard/metrics', {
        method: 'GET',
      });
      return response.json();
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      throw err;
    }
  }

  /**
   * Fetch recent scan results
   */
  async getScanResults(): Promise<ScanResult | null> {
    try {
      const response = await this.fetch('/api/v1/analysis/recent', {
        method: 'GET',
      });

      if (response.status === 404) {
        return null;
      }

      return response.json();
    } catch (err) {
      console.error('Failed to fetch scan results:', err);
      return null;
    }
  }

  /**
   * Trigger a new scan on the current page
   */
  async triggerScan(url: string, content?: string): Promise<ScanResult> {
    try {
      const response = await this.fetch('/api/v1/analysis/scan', {
        method: 'POST',
        body: JSON.stringify({ url, content }),
      });
      return response.json();
    } catch (err) {
      console.error('Failed to trigger scan:', err);
      throw err;
    }
  }

  /**
   * Get activity history
   */
  async getActivityHistory(limit: number = 20): Promise<ActivityEntry[]> {
    try {
      const response = await this.fetch(`/api/v1/activity/history?limit=${limit}`, {
        method: 'GET',
      });
      return response.json();
    } catch (err) {
      console.error('Failed to fetch activity history:', err);
      return [];
    }
  }

  /**
   * Get scan result by ID
   */
  async getScanResultById(scanId: string): Promise<ScanResult> {
    try {
      const response = await this.fetch(`/api/v1/analysis/${scanId}`, {
        method: 'GET',
      });
      return response.json();
    } catch (err) {
      console.error('Failed to fetch scan result:', err);
      throw err;
    }
  }

  /**
   * Get user quota information
   */
  async getQuota() {
    try {
      const response = await this.fetch('/api/v1/user/quota', {
        method: 'GET',
      });
      return response.json();
    } catch (err) {
      console.error('Failed to fetch quota:', err);
      throw err;
    }
  }

  /**
   * Save scan result for later review
   */
  async saveScanResult(scanId: string): Promise<void> {
    try {
      await this.fetch(`/api/v1/analysis/${scanId}/save`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to save scan result:', err);
      throw err;
    }
  }

  /**
   * Report scan result as false positive
   */
  async reportFalsePositive(scanId: string, feedback: string): Promise<void> {
    try {
      await this.fetch(`/api/v1/analysis/${scanId}/report`, {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      });
    } catch (err) {
      console.error('Failed to report false positive:', err);
      throw err;
    }
  }

  /**
   * Internal fetch wrapper with timeout and headers
   */
  private fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.apiUrl}${endpoint}`;
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    // Merge existing headers
    if (options.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers.set(key, value);
        });
      } else if (typeof options.headers === 'object') {
        Object.entries(options.headers).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            headers.set(key, String(value));
          }
        });
      }
    }

    if (this.apiKey) {
      headers.set('Authorization', `Bearer ${this.apiKey}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    return fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        throw error;
      });
  }
}

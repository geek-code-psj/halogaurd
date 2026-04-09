/**
 * HaloGuard - Storage & Caching Layer
 */

import { CachedResult, DetectionResponse } from '../types';

export class StorageManager {
  private readonly CACHE_PREFIX = 'haloguard_cache_';
  private readonly SESSION_KEY = 'haloguard_session';
  private readonly SETTINGS_KEY = 'haloguard_settings';
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Save cached result
   */
  async saveCachedResult(contentHash: string, result: DetectionResponse): Promise<void> {
    const cached: CachedResult = {
      contentHash,
      response: result,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL,
    };

    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [this.CACHE_PREFIX + contentHash]: cached },
        () => resolve()
      );
    });
  }

  /**
   * Get cached result if valid
   */
  async getCachedResult(contentHash: string): Promise<CachedResult | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.CACHE_PREFIX + contentHash, (items) => {
        const cached = items[this.CACHE_PREFIX + contentHash] as CachedResult | undefined;

        if (!cached) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() - cached.timestamp > cached.ttl) {
          chrome.storage.local.remove(this.CACHE_PREFIX + contentHash);
          resolve(null);
          return;
        }

        resolve(cached);
      });
    });
  }

  /**
   * Save session
   */
  async saveSession(sessionData: any): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        {
          [this.SESSION_KEY]: sessionData,
        },
        () => resolve()
      );
    });
  }

  /**
   * Get session
   */
  async getSession(): Promise<any | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.SESSION_KEY, (items) => {
        resolve(items[this.SESSION_KEY] || null);
      });
    });
  }

  /**
   * Save settings
   */
  async saveSettings(settings: Record<string, any>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [this.SETTINGS_KEY]: settings }, () => resolve());
    });
  }

  /**
   * Get settings
   */
  async getSettings(): Promise<Record<string, any>> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.SETTINGS_KEY, (items) => {
        resolve(
          items[this.SETTINGS_KEY] || {
            enabled: true,
            autoAnalyze: true,
            showBadge: true,
            darkMode: false,
            threshold: 50,
          }
        );
      });
    });
  }

  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const keysToDelete = Object.keys(items).filter((key) =>
          key.startsWith(this.CACHE_PREFIX)
        );
        if (keysToDelete.length > 0) {
          chrome.storage.local.remove(keysToDelete, () => resolve());
        } else {
          resolve();
        }
      });
    });
  }
}

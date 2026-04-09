/**
 * HaloGuard - Platform Detection
 */

import { PLATFORMS, PLATFORM_DOMAINS } from './constants';

export interface DetectedPlatform {
  id: string;
  name: string;
  domain: string;
}

export class PlatformDetector {
  /**
   * Detect current AI platform from URL
   */
  static detect(): DetectedPlatform | null {
    const url = window.location.href;

    for (const [platformId, domains] of Object.entries(PLATFORM_DOMAINS)) {
      const domainList = Array.isArray(domains) ? domains : [domains];
      for (const domain of domainList) {
        if (url.includes(domain)) {
          return {
            id: platformId,
            name: PLATFORMS[platformId as keyof typeof PLATFORMS] || platformId,
            domain: domain,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if we're on a supported AI platform
   */
  static isSupported(): boolean {
    return this.detect() !== null;
  }

  /**
   * Get current platform ID safely
   */
  static getPlatformId(): string | null {
    return this.detect()?.id || null;
  }
}

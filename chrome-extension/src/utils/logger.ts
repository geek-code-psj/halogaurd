/**
 * HaloGuard - Logger Utility
 */

export class Logger {
  static info(message: string, data?: any): void {
    console.log(`[HaloGuard] ℹ️ ${message}`, data || '');
  }

  static warn(message: string, data?: any): void {
    console.warn(`[HaloGuard] ⚠️ ${message}`, data || '');
  }

  static error(message: string, error?: any): void {
    console.error(`[HaloGuard] ❌ ${message}`, error || '');
  }

  static success(message: string, data?: any): void {
    console.log(`[HaloGuard] ✅ ${message}`, data || '');
  }

  static debug(message: string, data?: any): void {
    // Skip debug in production (check URL for dev mode)
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      console.debug(`[HaloGuard] 🐛 ${message}`, data || '');
    }
  }
}

/**
 * HaloGuard - Crypto & Hash Utilities
 */

export class CryptoUtils {
  /**
   * Generate SHA-256 hash of content
   */
  static async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Generate unique request ID
   */
  static generateRequestId(): string {
    return `hg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Truncate content for logging
   */
  static truncate(text: string, length: number = 100): string {
    return text.length > length ? text.substring(0, length) + '...' : text;
  }
}

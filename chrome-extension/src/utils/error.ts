/**
 * HaloGuard - Error Handling & Retry Logic
 */

import { Logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

export class ErrorHandler {
  /**
   * Retry function with exponential backoff
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelayMs = 1000,
      backoffMultiplier = 2,
      maxDelayMs = 10000,
    } = options;

    let lastError: any;
    let delayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        Logger.warn(
          `Attempt ${attempt}/${maxAttempts} failed: ${String(error)}`
        );

        if (attempt < maxAttempts) {
          const actualDelay = Math.min(delayMs, maxDelayMs);
          await this.delay(actualDelay);
          delayMs *= backoffMultiplier;
        }
      }
    }

    throw lastError;
  }

  /**
   * Delay for specified milliseconds
   */
  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle API errors gracefully
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return (error as any).message;
    }
    return 'An unknown error occurred';
  }

  /**
   * Check if error is network-related
   */
  static isNetworkError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout') ||
      message.includes('connection')
    );
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverable(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return (
      this.isNetworkError(error) ||
      message.includes('temporarily unavailable') ||
      message.includes('429') ||
      message.includes('503')
    );
  }
}

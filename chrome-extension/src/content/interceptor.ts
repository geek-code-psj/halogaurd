/**
 * HaloGuard - Fetch Interceptor
 * Intercepts fetch requests to detect AI responses
 * ENHANCED: Multi-turn conversation tracking with sycophancy & fact-checking
 */

import { DetectionRequest, DetectionResponse } from '../types';
import { CryptoUtils } from '../utils/crypto';
import { Logger } from '../utils/logger';
import { PlatformDetector } from '../utils/platform';

export class FetchInterceptor {
  private static originalFetch = window.fetch;
  private static isInitialized = false;
  private static conversationHistory: Map<string, any[]> = new Map();
  private static turnNumbers: Map<string, number> = new Map();
  private static USER_ID = CryptoUtils.generateRequestId(); // Stable user tracking

  /**
   * Initialize fetch interception
   */
  static init(): void {
    if (this.isInitialized) return;

    window.fetch = this.createInterceptedFetch();
    this.isInitialized = true;
    Logger.success('Fetch interception initialized');
  }

  /**
   * Create intercepted fetch function
   */
  private static createInterceptedFetch() {
    return async (
      resource: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      // Call original fetch
      const response = await this.originalFetch(resource, init);

      // Only intercept successful responses
      if (response.ok && response.status === 200) {
        try {
          // Clone response to avoid consuming it
          const cloned = response.clone();

          // Try to detect if this is an AI response
          this.processResponse(cloned, resource.toString());
        } catch (error) {
          // Don't break fetch on error
          Logger.debug(`Intercept error: ${error}`);
        }
      }

      return response;
    };
  }

  /**
   * Process response for AI-generated content
   */
  private static async processResponse(
    response: Response,
    url: string
  ): Promise<void> {
    try {
      const platform = PlatformDetector.detect();
      if (!platform) return;

      // Only process JSON responses typically from AI APIs
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) return;

      const data = await response.json();
      const responseText = this.extractResponseText(data);

      if (!responseText || responseText.length < 50) return;

      // Send to background script for analysis
      this.sendForAnalysis(responseText, platform.id);
    } catch (error) {
      Logger.debug(`Response processing error: ${error}`);
    }
  }

  /**
   * Extract text from various API response formats
   */
  private static extractResponseText(data: any): string {
    if (typeof data === 'string') return data;
    if (data.content) return data.content;
    if (data.message) return data.message;
    if (data.text) return data.text;
    if (data.choices?.[0]?.message?.content)
      return data.choices[0].message.content;
    if (data.choices?.[0]?.text) return data.choices[0].text;

    return '';
  }

  /**
   * Send content to background script for analysis
   */
  private static async sendForAnalysis(
    content: string,
    platformId: string
  ): Promise<void> {
    try {
      const contentHash = await CryptoUtils.hashContent(content);
      const requestId = CryptoUtils.generateRequestId();

      const request: DetectionRequest = {
        requestId,
        content,
        contentHash,
        platform: platformId,
        timestamp: Date.now(),
        sourceUrl: window.location.href,
      };

      // Send message to background script
      chrome.runtime.sendMessage(
        {
          type: 'ANALYZE_CONTENT',
          payload: request,
        },
        (response: any) => {
          if (chrome.runtime.lastError)
            Logger.debug(
              `Message error: ${chrome.runtime.lastError.message}`
            );
          else Logger.debug(`Analysis sent: ${requestId}`);
        }
      );
    } catch (error) {
      Logger.debug(`Send analysis error: ${error}`);
    }
  }
}

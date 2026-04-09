/**
 * HaloGuard - API Communication Layer
 */

import { DetectionRequest, DetectionResponse, SessionData } from '../types';

const BACKEND_URL = 'https://haloguard-production.up.railway.app';
const API_TIMEOUT = 10000; // 10 seconds

export class HaloGuardAPI {
  private baseUrl: string;
  private sessionId: string | null = null;

  constructor(customUrl?: string) {
    this.baseUrl = customUrl || BACKEND_URL;
  }

  /**
   * Create or get session
   */
  async getOrCreateSession(platform: string, tabId?: number): Promise<SessionData> {
    try {
      const response = await this.fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          tabId: tabId || Math.floor(Math.random() * 100000),
        }),
      });

      const data = await response.json();
      this.sessionId = data.session_id;

      return {
        sessionId: data.session_id,
        platform,
        createdAt: data.created_at,
        analysisCount: 0,
      };
    } catch (error) {
      console.error('[HaloGuard API] Failed to get session:', error);
      throw new Error('Failed to create session with backend');
    }
  }

  /**
   * Analyze content
   */
  async analyze(request: DetectionRequest): Promise<DetectionResponse> {
    if (!this.sessionId) {
      throw new Error('No session ID available');
    }

    try {
      const response = await this.fetch('/api/v1/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...request,
          sessionId: this.sessionId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Analysis failed');
      }

      return await response.json();
    } catch (error) {
      console.error('[HaloGuard API] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async health(): Promise<{ ok: boolean }> {
    try {
      const response = await this.fetch('/health', { method: 'GET' });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Private fetch wrapper with timeout
   */
  private async fetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }
}

export const api = new HaloGuardAPI();

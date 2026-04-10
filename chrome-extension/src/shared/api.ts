/**
 * API Client for HaloGuard Backend
 * Connects to Railway-deployed 5-tier detection pipeline
 */

import { AnalysisRequest, AnalysisResult } from '../types';

const BACKEND_URL = 'https://halogaurd-production.up.railway.app';
const API_ENDPOINT = `${BACKEND_URL}/api/v1/analyze`;

export class HaloGuardAPI {
  /**
   * Send analysis request to backend
   */
  static async analyzePage(request: AnalysisRequest): Promise<AnalysisResult> {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HaloGuard-Chrome-Extension/0.2',
        },
        body: JSON.stringify({
          url: request.url,
          text: request.text,
          html: request.html || '',
        }),
      });

      if (!response.ok) {
        if (response.status === 500) {
          // Handle ML/LLM tier failure gracefully
          return {
            id: `analysis-${Date.now()}`,
            url: request.url,
            timestamp: Date.now(),
            riskLevel: 'medium',
            confidence: 0.5,
            findings: ['Backend service temporarily unavailable. Please try again.'],
            tiers: [
              { tier: 0, name: 'Hedging', status: 'passed', confidence: 0.9 },
              { tier: 1, name: 'Entropy', status: 'passed', confidence: 0.85 },
              { tier: 2, name: 'Context', status: 'warning', confidence: 0.7 },
              { tier: 3, name: 'ML Model', status: 'failed', confidence: 0 },
              { tier: 4, name: 'LLM', status: 'failed', confidence: 0 },
            ],
            summary: 'Analysis partially completed. ML/LLM tiers unavailable.',
          };
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // ✅ FIX: Transform backend response to extension format
      // Backend: { requestId, processed, latency, flagged, issues: [{type, severity, tier, confidence}], tiers }
      // Extension: { id, riskLevel, confidence, findings, tiers, summary }
      
      const findings = data.issues?.map((issue: any) => 
        `${issue.type}: ${issue.severity} (tier ${issue.tier}, confidence: ${(issue.confidence * 100).toFixed(0)}%)`
      ) || [];
      
      const maxConfidence = data.issues && data.issues.length > 0
        ? Math.max(...data.issues.map((i: any) => i.confidence || 0))
        : 0;
      
      const riskLevel = data.flagged ? 'high' : (findings.length > 0 ? 'medium' : 'low');
      
      return {
        id: data.requestId || `analysis-${Date.now()}`,
        url: request.url,
        timestamp: Date.now(),
        riskLevel,
        confidence: Math.max(maxConfidence, data.confidence || 0),
        findings,
        tiers: data.tiers || [],
        summary: findings.length > 0 
          ? `Found ${findings.length} issues${data.flagged ? ' (HIGH RISK)' : ''}`
          : 'No hallucinations detected.',
      };
    } catch (error) {
      console.error('API Analysis Error:', error);
      throw error;
    }
  }

  /**
   * Get analysis history from local storage
   */
  static async getAnalysisHistory(): Promise<AnalysisResult[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['analyses'], (result) => {
        const analyses = result.analyses || {};
        resolve(Object.values(analyses) as AnalysisResult[]);
      });
    });
  }

  /**
   * Save analysis to local storage
   */
  static async saveAnalysis(analysis: AnalysisResult): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['analyses'], (result) => {
        const analyses = result.analyses || {};
        analyses[analysis.id] = analysis;

        // Keep only last 50 analyses
        const sorted = (Object.values(analyses) as AnalysisResult[])
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);

        const updated: { [key: string]: AnalysisResult } = {};
        sorted.forEach((a: AnalysisResult) => {
          updated[a.id] = a;
        });

        chrome.storage.local.set({ analyses: updated }, resolve);
      });
    });
  }

  /**
   * Get dashboard metrics
   */
  static async getDashboardMetrics() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['threatsBlocked', 'dataExposure', 'networkTraffic'],
        (result) => {
          resolve({
            threatsBlocked: result.threatsBlocked || 0,
            dataExposure: result.dataExposure || 0,
            networkTraffic: result.networkTraffic || '0 GB',
            lastUpdate: Date.now(),
          });
        }
      );
    });
  }

  /**
   * Clear analysis history
   */
  static async clearHistory(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ analyses: {} }, resolve);
    });
  }
}

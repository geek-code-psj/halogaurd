/**
 * HaloGuard Chrome Extension - Type Definitions
 */

export interface DetectionRequest {
  requestId: string;
  content: string;
  contentHash: string;
  platform: string;
  timestamp: number;
  sourceUrl: string;
  model?: string;
  context?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata?: {
    platform?: string;
    language?: string;
    userId?: string;
  };
}

export interface DetectionIssue {
  id: string;
  type: 'hedging' | 'sycophancy' | 'factual_error' | 'ood_prediction' | 'semantic_drift' | 'context_insensitivity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  tier: 0 | 1 | 2 | 3 | 4;
  score: number;
  confidence: number;
  description: string;
  message?: string;
  evidence?: {
    text?: string;
    fact?: string;
    source?: string;
    nliScore?: number;
  };
  suggestions?: string[];
}

export interface DetectionResponse {
  requestId: string;
  processed: boolean;
  latency: number;
  issues: DetectionIssue[];
  overallScore: number;
  flagged: boolean;
  syncProcessed: boolean;
  asyncRemaining?: string[];
}

// Phase 1 Dashboard Types
export interface AnalysisRequest {
  url: string;
  text: string;
  html?: string;
}

export interface TierResult {
  tier: number;
  name: string;
  status: 'passed' | 'warning' | 'failed' | 'processing';
  confidence: number;
}

export interface AnalysisResult {
  id: string;
  url: string;
  timestamp: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  findings: string[];
  tiers: TierResult[];
  summary: string;
}

export interface DashboardMetrics {
  threatsBlocked: number;
  dataExposure: number;
  networkTraffic: string;
  lastUpdate?: number;
}

export interface PageContent {
  url: string;
  title?: string;
  text: string;
  html?: string;
  selectedText?: string;
}

export interface ExtensionMessage {
  type: 'SCAN_PAGE' | 'GET_ANALYSIS_HISTORY' | 'GET_METRICS' | 'CLEAR_HISTORY' | 'GET_PAGE_CONTENT' | 'HIGHLIGHT_ISSUES' | 'ANALYSIS_COMPLETE' | 'TRIGGER_AUTO_SCAN' | string;
  payload?: any;
}

export interface SessionData {
  sessionId: string;
  platform: string;
  createdAt: string;
  analysisCount: number;
}

export interface CachedResult {
  contentHash: string;
  response: DetectionResponse;
  timestamp: number;
  ttl: number;
}



export interface AnalysisOverlay {
  issueCount: number;
  score: number;
  flagged: boolean;
  issues: DetectionIssue[];
}

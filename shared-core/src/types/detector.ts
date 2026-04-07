/**
 * Core type definitions for HaloGuard detection pipeline
 */

export interface DetectionRequest {
  id: string;
  content: string;
  model?: string;
  timestamp: number;
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
  type:
    | "hedging"
    | "sycophancy"
    | "factual_error"
    | "ood_prediction"
    | "semantic_drift"
    | "context_insensitivity";
  severity: "low" | "medium" | "high" | "critical";
  tier: 0 | 1 | 2 | 3 | 4;
  score: number;
  confidence: number;
  message: string;
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
  asyncRemaining: string[];
}

export interface HallucinationMetrics {
  totalDetected: number;
  byType: Record<string, number>;
  byTier: Record<number, number>;
  avgConfidence: number;
  avgLatency: number;
}

export type DetectorFunction = (
  request: DetectionRequest
) => Promise<DetectionIssue[]>;

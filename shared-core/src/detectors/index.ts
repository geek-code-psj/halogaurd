/**
 * Detection pipeline orchestrator
 * Runs all 5 tiers and aggregates results
 */

import { detectTier0 } from "./tier0";
import { detectTier1 } from "./tier1";
import { detectTier2 } from "./tier2";
import { detectTier3 } from "./tier3";
import { detectTier4 } from "./tier4";
import { DetectionRequest, DetectionResponse, DetectionIssue } from "../types/detector";

/**
 * Main detection pipeline
 * Runs Tiers 0-3 synchronously (85-115ms budget)
 * Queues Tier 4 (async) for later processing
 */
export async function runDetectionPipeline(
  request: DetectionRequest
): Promise<DetectionResponse> {
  const startTime = Date.now();
  const issues: DetectionIssue[] = [];
  const asyncTasks: string[] = [];

  try {
    // TIER 0 (sync, 10ms) - Hedging/Regex
    const tier0Issues = await detectTier0(request);
    issues.push(...tier0Issues);

    const latencyAfterTier0 = Date.now() - startTime;
    if (latencyAfterTier0 > 100) {
      console.warn(`Tier 0 exceeded budget: ${latencyAfterTier0}ms`);
    }

    // TIER 1 (sync, 50ms) - Heuristics
    const tier1Issues = await detectTier1(request);
    issues.push(...tier1Issues);

    const latencyAfterTier1 = Date.now() - startTime;
    if (latencyAfterTier1 > 100) {
      // Skip slower tiers if we're running behind
      console.warn(`Tier 1 exceeded budget: ${latencyAfterTier1}ms`);
    } else {
      // TIER 2 (sync, 200-400ms) - Fact-checking
      const tier2Issues = await Promise.race([
        detectTier2(request),
        new Promise<DetectionIssue[]>((resolve) =>
          setTimeout(() => resolve([]), 250)
        ),
      ]);
      issues.push(...tier2Issues);

      const latencyAfterTier2 = Date.now() - startTime;
      if (latencyAfterTier2 < 100) {
        // TIER 3 (sync, 300-600ms) - NLI
        const tier3Issues = await Promise.race([
          detectTier3(request),
          new Promise<DetectionIssue[]>((resolve) =>
            setTimeout(() => resolve([]), 250)
          ),
        ]);
        issues.push(...tier3Issues);
      }
    }

    // TIER 4 (async) - Semantic analysis
    // Queue but don't wait
    asyncTasks.push("tier4_semantic_analysis");

    const totalLatency = Date.now() - startTime;

    // Calculate severity aggregation
    const overallScore = calculateOverallScore(issues);

    return {
      requestId: request.id,
      processed: true,
      latency: totalLatency,
      issues,
      overallScore,
      flagged: overallScore > 0.5,
      syncProcessed: true,
      asyncRemaining: asyncTasks,
    };
  } catch (error) {
    console.error("Detection pipeline error:", error);
    return {
      requestId: request.id,
      processed: false,
      latency: Date.now() - startTime,
      issues: [],
      overallScore: 0,
      flagged: false,
      syncProcessed: false,
      asyncRemaining: [],
    };
  }
}

/**
 * Calculate weighted overall hallucination score
 */
function calculateOverallScore(issues: DetectionIssue[]): number {
  if (issues.length === 0) return 0;

  const weights: Record<DetectionIssue["severity"], number> = {
    low: 0.25,
    medium: 0.5,
    high: 0.85,
    critical: 1.0,
  };

  const weightedSum = issues.reduce(
    (sum, issue) => sum + (issue.confidence * weights[issue.severity]),
    0
  );

  return Math.min(weightedSum / issues.length, 1.0);
}

/**
 * Process queued async tasks (for background worker)
 */
export async function processAsyncDetection(
  request: DetectionRequest
): Promise<DetectionIssue[]> {
  try {
    return await detectTier4(request);
  } catch (error) {
    console.error("Async detection error:", error);
    return [];
  }
}

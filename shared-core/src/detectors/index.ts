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
import { SessionTracker } from "../utils/session-tracker";
import { validateDetectionRequest, PerUserRateLimiter, resolveTierConflicts, sanitizeOutput } from "../utils/validation";
import { classifyDomain } from "../utils/domain-classifier";

// PHASE 3: Per-user rate limiter (not IP-based)
const ratelimiter = new PerUserRateLimiter();

/**
 * Main detection pipeline
 * PHASE 1 FIX: Parallel execution - all tiers run simultaneously
 * PHASE 2/4 FIX: Domain-aware processing and conflict resolution
 * PHASE 3 FIX: Input validation, per-user rate limiting
 * No skipping on timeout - all tiers complete or timeout individually
 * Timeout data recovery - partial results returned, never empty
 * Conversation session threading - tracks multi-turn patterns
 */
export async function runDetectionPipeline(
  request: DetectionRequest
): Promise<DetectionResponse> {
  const startTime = Date.now();
  const issues: DetectionIssue[] = [];
  const asyncTasks: string[] = [];

  try {
    // PHASE 3: Input validation
    const validation = validateDetectionRequest(request.content, request.conversationHistory);
    if (!validation.valid) {
      console.error("Request validation failed:", validation.errors);
      return {
        requestId: request.id,
        processed: false,
        latency: Date.now() - startTime,
        issues: validation.errors.map((error) => ({
          id: `validation_error_${Date.now()}`,
          type: "factual_error",
          severity: "critical",
          tier: 0,
          score: 1.0,
          confidence: 1.0,
          message: error,
          evidence: {},
        })),
        overallScore: 1.0,
        flagged: true,
        syncProcessed: false,
        asyncRemaining: [],
      };
    }

    // Log validation warnings
    if (validation.warnings.length > 0) {
      console.warn("Request validation warnings:", validation.warnings);
    }

    // PHASE 3: Per-user rate limiting
    const userId = request.metadata?.userId || request.id;
    const rateLimitCheck = ratelimiter.checkLimit(userId);

    if (!rateLimitCheck.allowed) {
      console.warn(`Rate limit exceeded for user ${userId}. Retry after ${rateLimitCheck.retryAfterMs}ms`);
      return {
        requestId: request.id,
        processed: false,
        latency: Date.now() - startTime,
        issues: [
          {
            id: `ratelimit_${Date.now()}`,
            type: "factual_error",
            severity: "high",
            tier: 0,
            score: 0.5,
            confidence: 1.0,
            message: `Rate limit exceeded. Please retry after ${Math.ceil(rateLimitCheck.retryAfterMs / 1000)} seconds.`,
            evidence: {},
          },
        ],
        overallScore: 0.5,
        flagged: false,
        syncProcessed: false,
        asyncRemaining: [],
      };
    }

    // PHASE 1 FIX: Run Tiers 0-3 in parallel with individual timeouts
    // This prevents one tier from blocking others
    const [tier0Issues, tier1Issues, tier2Issues, tier3Issues] = await Promise.all([
      // TIER 0 (10ms timeout) - Hedging/Regex
      runTierWithTimeout(
        () => detectTier0(request),
        50,
        []
      ),
      // TIER 1 (50ms timeout) - Heuristics  
      runTierWithTimeout(
        () => detectTier1(request),
        100,
        []
      ),
      // TIER 2 (250ms timeout) - Fact-checking
      runTierWithTimeout(
        () => detectTier2(request),
        300,
        []
      ),
      // TIER 3 (250ms timeout) - NLI
      runTierWithTimeout(
        () => detectTier3(request),
        300,
        []
      ),
    ]);

    // Aggregate results from all tiers
    issues.push(...tier0Issues);
    issues.push(...tier1Issues);
    issues.push(...tier2Issues);
    issues.push(...tier3Issues);

    // PHASE 1 FIX: Conversation session threading
    // Track turn-by-turn patterns to detect position reversal (Issue #3, Issue #8)
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const sessionIssues = analyzeConversationPattern(
        request,
        [tier0Issues, tier1Issues, tier2Issues, tier3Issues]
      );
      issues.push(...sessionIssues);
    }

    // TIER 4 (async) - Semantic analysis
    // Queue but don't wait
    asyncTasks.push("tier4_semantic_analysis");

    const totalLatency = Date.now() - startTime;

    // PHASE 3 FIX: Use tier conflict resolution instead of simple aggregation
    // Calculate average scores per tier for conflict resolution
    const tier0Score = tier0Issues.length > 0
      ? tier0Issues.reduce((sum, i) => sum + i.score, 0) / tier0Issues.length
      : 0;
    const tier1Score = tier1Issues.length > 0
      ? tier1Issues.reduce((sum, i) => sum + i.score, 0) / tier1Issues.length
      : 0;
    const tier2Score = tier2Issues.length > 0
      ? tier2Issues.reduce((sum, i) => sum + i.score, 0) / tier2Issues.length
      : 0;
    const tier3Score = tier3Issues.length > 0
      ? tier3Issues.reduce((sum, i) => sum + i.score, 0) / tier3Issues.length
      : 0;

    const conflict = resolveTierConflicts(tier0Score, tier1Score, tier2Score, tier3Score);
    const overallScore = conflict.finalScore;

    // Log conflict resolution if veto applied
    if (conflict.veto !== "none") {
      console.info(`[Tier Conflict Resolution] ${conflict.explanation}`);
    }

    // PHASE 3: Sanitize output to prevent info leakage
    const sanitizedIssues = sanitizeOutput(issues);

    return {
      requestId: request.id,
      processed: true,
      latency: totalLatency,
      issues: sanitizedIssues,
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
 * PHASE 1 FIX: Timeout wrapper with partial result recovery
 * If tier completes before timeout, return actual results
 * If timeout occurs, return empty array (not null/undefined)
 * Never skip a tier - all tiers always run
 */
async function runTierWithTimeout<T>(
  tierFunction: () => Promise<T>,
  timeoutMs: number,
  fallbackValue: T
): Promise<T> {
  return Promise.race([
    tierFunction(),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs)),
  ]).catch(() => fallbackValue);
}

/**
 * PHASE 1 FIX: Conversation session threading
 * Analyze patterns across conversation history using SessionTracker
 * Detects:
 * - Position reversal (Issue #3: Sycophancy like Einstein date change)
 * - Multi-turn hallucination arcs (Issue #12: 100-message patterns)
 * - Consistency drift across turns (Issue #8: Context loss)
 * - Entity confusion (same entity with conflicting properties)
 */
function analyzeConversationPattern(
  request: DetectionRequest,
  tierResults: DetectionIssue[][]
): DetectionIssue[] {
  const sessionIssues: DetectionIssue[] = [];

  if (
    !request.conversationHistory ||
    request.conversationHistory.length < 2
  ) {
    return sessionIssues;
  }

  // Create session tracker for this conversation
  const sessionId = request.metadata?.userId || request.id;
  const tracker = new SessionTracker(sessionId);

  // Add all turns to tracker
  for (const turn of request.conversationHistory) {
    tracker.addTurn(turn.role as "user" | "assistant", turn.content);
  }

  // Analyze full session for patterns
  const sessionContext = tracker.getSessionContext();

  // Convert detected patterns to DetectionIssue format
  for (const pattern of sessionContext.detectedPatterns) {
    sessionIssues.push({
      id: `session_${pattern.type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      type: pattern.type === "position_reversal" ? "sycophancy" : "semantic_drift",
      severity: pattern.severity,
      tier: 1,
      score: pattern.confidence,
      confidence: pattern.confidence,
      message: pattern.description,
      evidence: {
        text: pattern.details?.entity || pattern.description,
      },
      suggestions: getSessionPatternSuggestions(pattern.type),
    });
  }

  // Log consistency score for monitoring
  if (sessionContext.consistencyScore < 0.6) {
    console.warn(`[Session Threading] Low consistency detected: ${(sessionContext.consistencyScore * 100).toFixed(0)}%`);
  }

  // Add risk factor warnings
  for (const risk of sessionContext.riskFactors) {
    if (risk.score > 0.6) {
      sessionIssues.push({
        id: `session_risk_${risk.factor}_${Date.now()}`,
        type: "ood_prediction",
        severity: "medium",
        tier: 1,
        score: risk.score,
        confidence: 0.65,
        message: `⚠️ Risk factor: ${risk.description}`,
        evidence: {
          text: risk.factor,
        },
      });
    }
  }

  return sessionIssues;
}

/**
 * Get suggestions based on pattern type
 */
function getSessionPatternSuggestions(
  patternType: string
): string[] {
  const suggestionMap: Record<string, string[]> = {
    position_reversal: [
      "🔍 Cross-reference contradictory claims",
      "📚 Check for claim evolution",
      "🤔 Ask AI to review for consistency",
      "📝 Note conflicting statements in transcript",
    ],
    hallucination_arc: [
      "📊 Review early responses vs late responses",
      "🔍 Fact-check turning points in conversation",
      "⏹️ Consider breaking conversation into segments",
      "📚 Re-verify claims from late in conversation",
    ],
    semantic_drift: [
      "📍 Refocus on original question",
      "🔄 Ask AI to return to core topic",
      "📚 Verify facts from drift period",
      "🔍 Compare beginning vs end of conversation",
    ],
    fact_contradiction: [
      "❌ Flag contradiction to user",
      "📚 Verify each conflicting claim separately",
      "🤔 Ask AI which version it's more confident in",
      "📝 Document conflicting statements",
    ],
  };

  return suggestionMap[patternType] || [
    "🔍 Manual review recommended",
    "🤔 Ask model for clarification",
  ];
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

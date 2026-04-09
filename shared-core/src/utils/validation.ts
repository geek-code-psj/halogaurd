/**
 * PHASE 3: Input Validation and Content Safety
 * Prevents injection attacks, size-bomb attacks, and malformed input
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    contentLength: number;
    claimsCount: number;
    conversationDepth: number;
    memoryUsage: number;
  };
}

/**
 * Validate detection request
 */
export function validateDetectionRequest(
  content: string,
  conversationHistory?: Array<{ role: string; content: string }>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const metrics = {
    contentLength: content.length,
    claimsCount: estimateClaimsCount(content),
    conversationDepth: conversationHistory?.length || 0,
    memoryUsage: estimateMemoryUsage(content, conversationHistory),
  };

  // Rule 1: Maximum content size (100KB)
  if (content.length > 100000) {
    errors.push(`Content exceeds maximum 100KB limit (actual: ${Math.round(content.length / 1024)}KB)`);
  }

  // Rule 2: Minimum content size (5 characters)
  if (content.length < 5) {
    errors.push("Content must be at least 5 characters long");
  }

  // Rule 3: Maximum conversation depth (500 turns)
  if (conversationHistory && conversationHistory.length > 500) {
    errors.push(`Conversation exceeds maximum 500 turns (actual: ${conversationHistory.length})`);
  }

  // Rule 4: Check for injection patterns
  const injectionPatterns = [
    /\${.*}/g, // Template injection
    /\$\{.*\}/g, // Expression injection
    /<script/gi, // HTML/JS injection
    /sql/gi, // SQL keywords (basic check)
    /eval\s*\(/gi, // Code injection
    /exec\s*\(/gi, // Execution injection
    /system\s*\(/gi, // System execution
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(content)) {
      warnings.push(`Potential injection pattern detected: ${pattern.source}`);
    }
  }

  // Rule 5: Check for excessive special characters
  const specialCharCount = (content.match(/[!@#$%^&*()_+=\-\[\]{};:'"<>,.?/\\|`~]/g) || []).length;
  const specialCharRatio = specialCharCount / content.length;

  if (specialCharRatio > 0.3) {
    warnings.push(
      `High special character ratio (${(specialCharRatio * 100).toFixed(1)}%). May indicate spam or attack.`
    );
  }

  // Rule 6: Check for extremely long words (>50 chars = suspicious)
  const words = content.split(/\s+/);
  const longWords = words.filter((w) => w.length > 50);

  if (longWords.length > words.length * 0.1) {
    warnings.push(`${longWords.length} extremely long words detected. May be malformed input.`);
  }

  // Rule 7: Check for excessive repetition
  const lines = content.split(/\n+/);
  const uniqueLines = new Set(lines);
  const repetitionRatio = 1 - uniqueLines.size / lines.length;

  if (repetitionRatio > 0.5) {
    warnings.push(`High repetition detected (${(repetitionRatio * 100).toFixed(0)}%). May be spam attack.`);
  }

  // Rule 8: Validate conversation history format
  if (conversationHistory) {
    for (let i = 0; i < conversationHistory.length; i++) {
      const turn = conversationHistory[i];

      if (!turn.role || !turn.content) {
        errors.push(`Invalid turn at index ${i}: missing role or content`);
      }

      if (turn.role !== "user" && turn.role !== "assistant") {
        errors.push(`Invalid role at turn ${i}: must be 'user' or 'assistant'`);
      }

      if (typeof turn.content !== "string") {
        errors.push(`Invalid content type at turn ${i}: must be string`);
      }

      if (turn.content.length > 50000) {
        errors.push(`Turn ${i} exceeds 50KB limit`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics,
  };
}

/**
 * Estimate number of claims in content
 */
function estimateClaimsCount(content: string): number {
  const sentences = content.match(/[.!?]+/g) || [];
  // Assume ~70% of sentences contain claims
  return Math.ceil(sentences.length * 0.7);
}

/**
 * Estimate memory usage
 */
function estimateMemoryUsage(
  content: string,
  conversationHistory?: Array<{ role: string; content: string }>
): number {
  // Rough estimate: each character ~2 bytes + overhead
  let bytes = content.length * 2;

  if (conversationHistory) {
    for (const turn of conversationHistory) {
      bytes += turn.content.length * 2;
    }
  }

  // Add overhead for object structures
  bytes += 10000;

  return bytes;
}

/**
 * Rate limiter for per-user (not IP-based)
 */
export class PerUserRateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number = 60000; // 1 minute window
  private readonly maxRequests: number = 30; // 30 requests per minute

  /**
   * Check if user is rate limited
   */
  checkLimit(userId: string): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();

    // Get user's recent requests
    let userRequests = this.requests.get(userId) || [];

    // Remove old requests outside window
    userRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);

    if (userRequests.length >= this.maxRequests) {
      // Rate limited
      const oldestRequest = Math.min(...userRequests);
      const retryAfterMs = this.windowMs - (now - oldestRequest);
      return { allowed: false, retryAfterMs };
    }

    // Allowed
    userRequests.push(now);
    this.requests.set(userId, userRequests);

    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * Reset user's rate limit
   */
  reset(userId: string): void {
    this.requests.delete(userId);
  }

  /**
   * Get stats for monitoring
   */
  getStats(userId: string): { requestsInWindow: number; resetAtMs: number } {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    const validRequests = userRequests.filter((ts) => now - ts < this.windowMs);

    const oldestValid = Math.min(...validRequests, now);
    const resetAtMs = oldestValid + this.windowMs;

    return {
      requestsInWindow: validRequests.length,
      resetAtMs,
    };
  }
}

/**
 * Tier conflict resolver
 * When tiers disagree, hierarchical veto system
 */
export function resolveTierConflicts(
  tier0Issues: number, // hedging/sycophancy score
  tier1Issues: number, // heuristic score
  tier2Issues: number, // fact-check score
  tier3Issues: number // NLI score
): { finalScore: number; veto: "none" | "tier2" | "tier3"; explanation: string } {
  // Tier 3 (NLI) can veto Tier 0-1 (faster tiers may be wrong)
  // If Tier 3 shows logical consistency, override hedging concerns
  if (tier3Issues < 0.3 && (tier0Issues > 0.5 || tier1Issues > 0.5)) {
    return {
      finalScore: Math.max(tier3Issues, (tier0Issues + tier1Issues) / 2 * 0.3), // Weighted down
      veto: "tier3",
      explanation: "Tier 3 NLI verification overrides Tier 0-1 concerns (logical consistency OK)",
    };
  }

  // Tier 2 (Fact-check) can veto Tier 1 (heuristics may be wrong)
  // If Tier 2 verifies facts clearly, override heuristic concerns
  if (tier2Issues < 0.3 && tier1Issues > 0.5) {
    return {
      finalScore: Math.max(tier2Issues, (tier0Issues + tier1Issues) / 2 * 0.4),
      veto: "tier2",
      explanation: "Tier 2 fact-checking overrides Tier 1 heuristic concerns (claims verified)",
    };
  }

  // No veto - aggregate scores with weights
  // Higher tiers get higher weight (more reliable)
  const finalScore =
    tier0Issues * 0.1 + tier1Issues * 0.2 + tier2Issues * 0.35 + tier3Issues * 0.35;

  return {
    finalScore: Math.min(finalScore, 1.0),
    veto: "none",
    explanation: "No tier veto applied - weighted aggregation",
  };
}

/**
 * Sanitize output to prevent information leakage
 */
export function sanitizeOutput(issues: any[]): any[] {
  return issues.map((issue) => ({
    ...issue,
    evidence: {
      ...issue.evidence,
      text: (issue.evidence?.text || "").substring(0, 200), // Truncate evidence
    },
  }));
}

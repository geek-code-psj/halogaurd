/**
 * TIER 3: NLI (Natural Language Inference) Verification (300-600ms)
 * Uses DeBERTa-v3-small model for entailment checking
 * Falls back to local heuristics if Python service unavailable
 */

import axios from "axios";
import { DetectionIssue, DetectionRequest } from "../types/detector";

interface NLIPair {
  premise: string;
  hypothesis: string;
}

/**
 * Extract hypothesis/premise pairs from context
 * Limits to 2 pairs max to stay within latency budget
 */
function extractNLIPairs(request: DetectionRequest): NLIPair[] {
  const pairs: NLIPair[] = [];
  const { content, conversationHistory, context } = request;

  // Pair 1: Current response vs context
  if (context) {
    pairs.push({
      premise: context,
      hypothesis: content,
    });
  }

  // Pair 2: Current response vs previous turn
  if (conversationHistory && conversationHistory.length >= 2) {
    const lastUserMsg = conversationHistory
      .reverse()
      .find((m) => m.role === "user")?.content;

    if (lastUserMsg) {
      pairs.push({
        premise: lastUserMsg,
        hypothesis: content,
      });
    }
  }

  return pairs.slice(0, 2); // Max 2 pairs
}

/**
 * Call Python NLI service (FastAPI running on localhost:8000)
 * Falls back to heuristic if service unavailable
 * Implements 200ms timeout with graceful degradation
 */
async function callNLIService(
  pairs: NLIPair[]
): Promise<{
  entailment_scores: number[];
  contradiction_scores: number[];
  neutral_scores: number[];
}> {
  try {
    const response = await axios.post(
      process.env.NLI_SERVICE_URL || "http://localhost:8000/nli",
      {
        pairs,
        timeout: 5000, // Strict timeout for entire request
      },
      { timeout: 200 } // 200ms timeout for HTTP layer
    );

    return response.data;
  } catch (error) {
    // Fallback: heuristic NLI scoring using local computation
    console.warn("NLI service unavailable, using heuristic fallback", String(error));
    
    // Use local heuristics for each pair
    const entailment_scores: number[] = [];
    const contradiction_scores: number[] = [];
    const neutral_scores: number[] = [];

    for (const pair of pairs) {
      const score = heuristicNLI(pair.premise, pair.hypothesis);
      entailment_scores.push(score);
      
      // Estimate contradiction (inverse of entailment with some noise)
      const contradictionScore = Math.max(0, 0.7 - score);
      contradiction_scores.push(contradictionScore);
      
      // Neutral is middle ground
      neutral_scores.push(1 - score - contradictionScore);
    }

    return {
      entailment_scores,
      contradiction_scores,
      neutral_scores,
    };
  }
}

/**
 * Heuristic NLI: check for logical contradictions
 */
function heuristicNLI(premise: string, hypothesis: string): number {
  const premiseTokens = new Set(premise.toLowerCase().split(/\s+/));
  const hypothesisTokens = hypothesis.toLowerCase().split(/\s+/);

  // Count contradictory patterns
  const negationWords = ["not", "no", "neither", "none"];
  const premiseHasNegation = negationWords.some((w) => premiseTokens.has(w));
  const hypothesisHasNegation = negationWords.some((w) =>
    hypothesisTokens.includes(w)
  );

  // If both have negation, likely neutral
  if (premiseHasNegation && hypothesisHasNegation) return 0.5;

  // Check word overlap (simple entailment heuristic)
  const overlap = hypothesisTokens.filter((t) => premiseTokens.has(t)).length;
  const overlapRatio = overlap / hypothesisTokens.length;

  return Math.min(overlapRatio, 1.0);
}

export async function detectTier3(request: DetectionRequest): Promise<DetectionIssue[]> {
  const issues: DetectionIssue[] = [];
  const pairs = extractNLIPairs(request);

  if (pairs.length === 0) return issues;

  try {
    // PHASE 1 FIX: Track if timeout occurred
    let timedOut = false;
    const nliResults = await Promise.race([
      callNLIService(pairs),
      new Promise((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve({
            entailment_scores: pairs.map(() => 0.5),
            contradiction_scores: pairs.map(() => 0.3),
            neutral_scores: pairs.map(() => 0.2),
            _timedOut: true,
          });
        }, 500)
      ),
    ]);

    const results = nliResults as any;
    const { entailment_scores, contradiction_scores } = results;

    // PHASE 1 FIX: If NLI timed out, return uncertain flag instead of using defaults
    if (timedOut || results._timedOut) {
      console.warn("[Tier3 Timeout] NLI service unavailable - returning partial recovery");
      issues.push({
        id: `tier3_nli_timeout_${Date.now()}`,
        type: "ood_prediction",
        severity: "low",
        tier: 3,
        score: 0.3,
        confidence: 0.4, // Lower confidence for timeout recovery
        message: `⏱️ TIMEOUT - NLI verification inconclusive for logical consistency check`,
        evidence: {
          nliScore: 0.5,
          text: "NLI service did not respond in time. Treat as uncertain.",
        },
        suggestions: [
          "🤔 Manual review of logical consistency",
          "📚 Cross-reference with external sources",
        ],
      });
      return issues;
    }

    // Check each pair
    for (let i = 0; i < pairs.length; i++) {
      const contradiction_score = contradiction_scores[i] || 0.3;
      const entailment_score = entailment_scores[i] || 0.5;

      // High contradiction = hallucination risk
      if (contradiction_score > 0.7) {
        issues.push({
          id: `tier3_nli_${Date.now()}_${i}`,
          type: "factual_error",
          severity: contradiction_score > 0.85 ? "critical" : "high",
          tier: 3,
          score: contradiction_score,
          confidence: 0.82,
          message: `Logical contradiction detected (NLI score: ${contradiction_score.toFixed(2)})`,
          evidence: {
            nliScore: contradiction_score,
          },
          suggestions: [
            "Request clarification on logical consistency",
            "Ask model to review premises",
            "Verify via alternative sources",
          ],
        });
      }

      // Low entailment + high question specificity = hallucination
      if (entailment_score < 0.3 && pairs[i].premise.length > 50) {
        issues.push({
          id: `tier3_entailment_${Date.now()}_${i}`,
          type: "ood_prediction",
          severity: "medium",
          tier: 3,
          score: 1 - entailment_score,
          confidence: 0.75,
          message: `Low entailment with context (score: ${entailment_score.toFixed(2)})`,
          suggestions: [
            "Request more specific evidence",
            "Ask for intermediate reasoning steps",
          ],
        });
      }
    }
  } catch (error) {
    // PHASE 1 FIX: Timeout data recovery on exception
    console.error("Tier 3 NLI detection error:", error);
    
    // Return uncertain flag instead of empty array
    if (pairs.length > 0) {
      issues.push({
        id: `tier3_error_recovery_${Date.now()}`,
        type: "ood_prediction",
        severity: "low",
        tier: 3,
        score: 0.25,
        confidence: 0.35,
        message: `⚠️ ERROR RECOVERY - NLI verification failed`,
        evidence: {
          text: `NLI analysis encountered an error. Claim marked as uncertain for manual review.`,
        },
        suggestions: [
          "🔍 Manual verification of logical consistency",
        ],
      });
    }
  }

  return issues;
}

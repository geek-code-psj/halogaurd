/**
 * TIER 0: Fast Regex + Hedging Language Detection (10ms)
 * Detects linguistic markers of uncertainty and hedging language
 */

import { DetectionIssue, DetectionRequest } from "../types/detector";

// Hedging language patterns (research-backed)
const HEDGING_PATTERNS = {
  weak_assertions: /\b(might|could|may|seems|appears|possibly|probably|perhaps|allegedly)\b/gi,
  uncertainty_markers: /\b(I think|I believe|it seems|in my view|arguably)\b/gi,
  qualifiers: /\b(somewhat|kind of|sort of|relatively|fairly|rather|quite)\b/gi,
  absence_of_certainty: /\bnot\s+(certain|sure|clear|known|confirmed)\b/gi,
};

// Sycophancy markers (excessive agreement)
const SYCOPHANCY_PATTERNS = {
  excessive_praise: /\b(brilliantly|perfectly|absolutely|genius|amazing|incredible|fantastic|wonderful|excellent|outstanding)\b/gi,
  overconfidence: /\b(definitely|absolutely|certainly|without doubt|for sure)\b/gi,
  agreement_tokens: /\b(you.?re?|you are)?\s*(right|correct|agrees?|exactly|precisely)\b/gi,
};

// Factual hedging (absence of assertive language)
const ASSERTIVE_PATTERNS = /\b(is|was|are|being|been|fact|confirmed|proven|established)\b/gi;

export async function detectTier0(request: DetectionRequest): Promise<DetectionIssue[]> {
  const issues: DetectionIssue[] = [];
  const content = request.content;
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];

  let hedgingScore = 0;
  let sycophancyScore = 0;
  let assertivenessScore = 0;
  let totalHedgingMarkers = 0;

  for (const sentence of sentences) {
    // Count hedging markers
    const hedgingMatches = sentence.match(HEDGING_PATTERNS.weak_assertions) || [];
    const uncertaintyMatches = sentence.match(HEDGING_PATTERNS.uncertainty_markers) || [];
    const qualifierMatches = sentence.match(HEDGING_PATTERNS.qualifiers) || [];
    const certaintyCounts = sentence.match(HEDGING_PATTERNS.absence_of_certainty) || [];

    totalHedgingMarkers += hedgingMatches.length + uncertaintyMatches.length + qualifierMatches.length + certaintyCounts.length;

    hedgingScore +=
      hedgingMatches.length * 0.2 +
      uncertaintyMatches.length * 0.3 +
      qualifierMatches.length * 0.15 +
      certaintyCounts.length * 0.25;

    // Count sycophancy markers
    const praiseMatches = sentence.match(SYCOPHANCY_PATTERNS.excessive_praise) || [];
    const overconfidenceMatches = sentence.match(SYCOPHANCY_PATTERNS.overconfidence) || [];
    const agreementMatches = sentence.match(SYCOPHANCY_PATTERNS.agreement_tokens) || [];

    sycophancyScore +=
      praiseMatches.length * 0.3 + overconfidenceMatches.length * 0.2 + agreementMatches.length * 0.25;

    // Count assertiveness (baseline for comparison)
    const assertiveMatches = sentence.match(ASSERTIVE_PATTERNS) || [];
    assertivenessScore += assertiveMatches.length / sentence.split(/\s+/).length;
  }

  // Normalize scores
  const avgHedgingScore = Math.min(hedgingScore / sentences.length, 1.0);
  const avgSycophancyScore = Math.min(sycophancyScore / sentences.length, 1.0);
  const assertivenessRatio = assertivenessScore / sentences.length;

  // If low assertiveness + high hedging = potential hallucination masking
  if (avgHedgingScore > 0.3 && assertivenessRatio < 0.1) {
    issues.push({
      id: `tier0_hedging_${Date.now()}`,
      type: "hedging",
      severity: avgHedgingScore > 0.6 ? "high" : "medium",
      tier: 0,
      score: avgHedgingScore,
      confidence: Math.min(avgHedgingScore * 0.9, 0.95),
      message: `High hedging language detected. ${totalHedgingMarkers} uncertainty markers found.`,
      evidence: {
        text: content.substring(0, 100),
      },
      suggestions: [
        "Request specific facts with clear claims",
        "Ask model to provide sources for assertions",
        "Verify claims through independent search",
      ],
    });
  }

  // If high sycophancy + excessive agreement = dangerous pattern
  if (avgSycophancyScore > 0.2) {
    issues.push({
      id: `tier0_sycophancy_${Date.now()}`,
      type: "sycophancy",
      severity: avgSycophancyScore > 0.25 ? "high" : "medium",
      tier: 0,
      score: avgSycophancyScore,
      confidence: Math.min(avgSycophancyScore * 0.85, 0.9),
      message: `Excessive agreement/praise detected. May indicate sycophancy bias.`,
      suggestions: [
        "Question the analysis - ask for counterpoints",
        "Request critical evaluation",
        "Compare with multiple sources",
      ],
    });
  }

  return issues;
}

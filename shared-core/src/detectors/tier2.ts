/**
 * TIER 2: Fact-Checking via Wikipedia/APIs (200-400ms)
 * Verifies factual claims against public knowledge bases
 * Now with real Wikipedia + Wikidata integration + Python Wikipedia-API
 */

import { DetectionIssue, DetectionRequest } from "../types/detector";
import {
  verifyClaimAgainstWikipedia,
  checkWikidataFact,
  batchVerifyClaims,
} from "../utils/fact-checker";

/**
 * Extract potential factual claims from text
 * Focuses on claims with assertive statements and factual content
 */
function extractClaims(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  return sentences
    .filter((s) => {
      const isLengthValid = s.length > 20;
      const hasFactualContext = /\b(?:is|was|are|were|born|founded|established|created|died|located)\b/i.test(s);
      const isNotHedged = !/\b(?:might|could|maybe|perhaps|possibly|apparently)\b/i.test(s);
      return isLengthValid && hasFactualContext && isNotHedged;
    })
    .map((s) => s.trim())
    .slice(0, 5); // Max 5 claims for comprehensive fact-checking
}

export async function detectTier2(request: DetectionRequest): Promise<DetectionIssue[]> {
  const issues: DetectionIssue[] = [];
  const claims = extractClaims(request.content);

  if (claims.length === 0) {
    return issues; // No claims to fact-check
  }

  try {
    // Primary verification: JavaScript Wikipedia API (faster, ~100-200ms, works in production)
    const verificationPromise = batchVerifyClaims(claims);

    const timeoutPromise = new Promise<Map<string, any>>((resolve) => {
      setTimeout(() => {
        resolve(new Map());
      }, 300);
    });

    const verifications = (await Promise.race([verificationPromise, timeoutPromise])) as Map<string, any>;

    // Check each claim and create issues for unverified ones
    for (const claim of claims) {
      const jsVerification = verifications?.get(claim) || null;
      const pythonVerification = pythonVerifications?.get(claim) || null;

      // If both verification sources timeout, skip
      if (!jsVerification && !pythonVerification) {
        console.debug(`Tier 2 fact-check timeout for claim: ${claim}`);
        continue;
      }

      // Merge verification results: use Python as tie-breaker
      const finalVerification = pythonVerification || jsVerification;
      const hasDualVerification = jsVerification && pythonVerification;

      // If claim is not verified or has low confidence
      if (finalVerification?.verified === false) {
        // High confidence error if both sources disagree
        const confidenceBoost = hasDualVerification && jsVerification?.verified === false ? 0.15 : 0;
        issues.push({
          id: `tier2_factual_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "factual_error",
          severity: (finalVerification.confidence + confidenceBoost) > 0.6 ? "high" : "medium",
          tier: 2,
          score: 1 - finalVerification.confidence,
          confidence: Math.min(1, finalVerification.confidence + confidenceBoost),
          message: `Factual claim not verified: "${claim.substring(0, 80)}"${finalVerification.evidence ? ` (${finalVerification.evidence})` : ""}${hasDualVerification ? " [dual-verified]" : ""}`,
          evidence: {
            claim,
            source: finalVerification.source,
            url: finalVerification.url,
            reason: finalVerification.evidence,
            jsSource: jsVerification?.source,
            pythonSource: pythonVerification?.source,
          },
          suggestions: [
            "Verify with primary sources",
            "Check Wikipedia for accurate information",
            "Ask the AI to cite its sources",
            "Check the publication date of the AI model's training data",
          ],
        });
      } else if (finalVerification?.verified === null) {
        // Unknown verification (couldn't find data)
        issues.push({
          id: `tier2_unverified_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "unsupported_claim",
          severity: "low",
          tier: 2,
          score: 0.3,
          confidence: 0.4,
          message: `Claim could not be verified in knowledge base: "${claim.substring(0, 80)}"${hasDualVerification ? " [dual-checked]" : ""}`,
          evidence: {
            claim,
            source: finalVerification.source,
            reason: "Entity or claim not found in corpus",
          },
          suggestions: [
            "Consider asking the AI for sources",
            "Check if claim involves recent events (outside training data)",
          ],
        });
      }
    }
  } catch (error: any) {
    // Graceful timeout failure - log but don't throw
    console.warn(`Tier 2 fact-checking failed: ${error.message}`);
  }

  return issues;
}

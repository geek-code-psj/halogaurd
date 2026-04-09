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
    // Dual verification strategy: Wikipedia API + Wikidata
    // Both run in parallel with timeout protection
    const jsVerificationPromise = batchVerifyClaims(claims);
    
    const wikidataPromise = Promise.all(
      claims.map(async (claim) => {
        try {
          const result = await checkWikidataFact(claim);
          return { claim, result };
        } catch (e) {
          return { claim, result: null };
        }
      })
    );

    const timeoutPromise = new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve(null);
      }, 300);
    });

    // Get both verifications in parallel with timeout
    const jsVerifications = (await Promise.race([
      jsVerificationPromise,
      timeoutPromise,
    ])) as Map<string, any> | null;

    const wikidataResults = await Promise.race([
      wikidataPromise,
      timeoutPromise,
    ]);

    // Build Wikidata lookup map
    const wikidataMap = new Map<string, any>();
    if (wikidataResults && Array.isArray(wikidataResults)) {
      for (const { claim, result } of wikidataResults) {
        if (result) wikidataMap.set(claim, result);
      }
    }

    // PHASE 1 FIX: Timeout data recovery
    // Never return completely empty results - always return something
    // This prevents FALSE NEGATIVES from cascade timeouts
    let anyTimeoutEncountered = false;

    // Check each claim and create issues for unverified ones
    for (const claim of claims) {
      const jsVerification = jsVerifications?.get(claim) || null;
      const wikidataVerification = wikidataMap?.get(claim) || null;

      // PHASE 1 FIX: If both sources timeout, flag as uncertain instead of skipping
      if (!jsVerification && !wikidataVerification) {
        anyTimeoutEncountered = true;
        console.warn(`Tier 2 fact-check TIMEOUT for claim: "${claim}" - creating uncertain flag`);
        
        // Return uncertain issue instead of skipping completely
        // This ensures claim is tracked as "needs manual review" not "verified safe"
        issues.push({
          id: `tier2_timeout_recovery_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "ood_prediction",
          severity: "medium",
          tier: 2,
          score: 0.4,
          confidence: 0.5, // Lower confidence due to timeout
          message: `⏱️ TIMEOUT - Fact-check inconclusive for claim: "${claim.substring(0, 80)}"`,
          evidence: {
            fact: claim,
            source: "Timeout Recovery (Partial Result)",
            text: "Fact-check did not complete within time budget. Treat as UNCERTAIN.",
          },
          suggestions: [
            "🔍 Manual verification recommended",
            "⏱️ Offline fact-check if user requests sources",
            "🤔 Ask AI model to verify its own claims",
          ],
        });
        continue;
      }

      // Use most confident verification (prefer high confidence from either source)
      let finalVerification = null;
      let hasDualVerification = false;

      if (jsVerification && wikidataVerification) {
        hasDualVerification = true;
        // Use the one with higher confidence
        finalVerification = (jsVerification.confidence >= wikidataVerification.confidence)
          ? { ...jsVerification, multiSource: true, sources: ['wikipedia', 'wikidata'] }
          : { ...wikidataVerification, multiSource: true, sources: ['wikidata', 'wikipedia'] };
      } else {
        finalVerification = jsVerification || wikidataVerification;
      }

      // If claim is not verified or has low confidence
      if (finalVerification?.verified === false) {
        // High confidence error if both sources disagree
        const confidenceBoost = hasDualVerification ? 0.1 : 0;
        issues.push({
          id: `tier2_factual_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "factual_error",
          severity: (finalVerification.confidence + confidenceBoost) > 0.6 ? "high" : "medium",
          tier: 2,
          score: 1 - finalVerification.confidence,
          confidence: Math.min(1, finalVerification.confidence + confidenceBoost),
          message: `❌ Factual claim NOT verified: "${claim.substring(0, 80)}"${hasDualVerification ? " [dual-source verified]" : ""}`,
          evidence: {
            fact: claim,
            source: hasDualVerification ? 'Wikipedia + Wikidata' : finalVerification.source,
            text: finalVerification.evidence || 'Claim not found in knowledge bases',
            nliScore: finalVerification.confidence,
          },
          suggestions: [
            "🔍 Verify with primary sources",
            "📚 Check Wikipedia for accurate information",
            "🤔 Ask the AI model to cite its sources",
            "📅 Check if claim involves recent events (training data cutoff)",
          ],
        });
      } else if (finalVerification?.verified === null) {
        // Unknown verification (couldn't find data)
        issues.push({
          id: `tier2_unverified_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          type: "ood_prediction",
          severity: "low",
          tier: 2,
          score: 0.3,
          confidence: 0.4,
          message: `⚠️ Claim could not be verified in knowledge bases: "${claim.substring(0, 80)}"`,
          evidence: {
            fact: claim,
            source: hasDualVerification ? 'Wikipedia + Wikidata' : finalVerification?.source,
            text: "Entity or claim not found in Wikipedia/Wikidata corpus",
          },
          suggestions: [
            "🤔 Ask the AI model for sources",
            "📅 Check if claim involves recent events (outside training data)",
            "🔍 Search for the entity directly on Wikipedia",
          ],
        });
      } else if (finalVerification?.verified === true) {
        // Log verified facts for confidence tracking
        console.debug(`[Tier2] ✅ VERIFIED claim: "${claim.substring(0, 60)}..." | Confidence: ${(finalVerification.confidence * 100).toFixed(0)}% | Sources: ${hasDualVerification ? 'Wikipedia + Wikidata' : finalVerification.source}`);
      }
    }

    // PHASE 1 FIX: Timeout metrics logging
    if (anyTimeoutEncountered) {
      console.warn(`[Tier2 Timeout Recovery] Some fact-checks timed out but returned partial results instead of empty array`);
    }
  } catch (error: any) {
    // Graceful timeout failure - log but don't throw
    console.warn(`Tier 2 fact-checking failed: ${error.message}`);
  }

  return issues;
}

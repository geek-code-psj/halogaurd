/**
 * Claim Extraction Engine
 * Breaks unstructured text into individual verifiable claims
 * 
 * Example: "Einstein invented relativity and won the Nobel Prize in 1921"
 * →  Claim 1: "Einstein invented relativity"
 *     Claim 2: "Einstein won the Nobel Prize in 1921"
 */

import { logger } from '../utils/logger.js';

export interface Claim {
  id: string;
  text: string;
  subject: string; // Who/what is being referenced
  predicate: string; // What is being claimed
  object: string; // The claim about the subject
  confidence: number; // 0-1, how confident we are this is a claim
  source_span: { start: number; end: number }; // Position in original text
  claim_type: 'factual' | 'causal' | 'comparative' | 'normative';
}

export class ClaimExtractor {
  /**
   * Extract individual claims from text
   */
  static extract(text: string): Claim[] {
    const claims: Claim[] = [];
    let claim_id = 1;

    // Early exit: skip extraction for short responses (performance optimization)
    if (text.length < 100) {
      return claims;
    }

    // Pattern 1: Subject-Verb-Object patterns (factual claims)
    const svo_patterns = [
      /([\w\s]+)\s+(invented|discovered|created|founded|won|achieved|wrote|published)\s+([^,.!?]+)/gi,
      /([\w\s]+)\s+(is|was|are|were)\s+(?:a\s+)?([^,.!?]+)/gi,
      /([\w\s]+)\s+(has|have)\s+([^,.!?]+)/gi,
      /([\w\s]+)\s+(died|born|lived)\s+(in|on|at|around)\s+([^,.!?]+)/gi,
    ];

    for (const pattern of svo_patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const subject = match[1].trim();
        const predicate = match[2].trim();
        const object = match[3] ? match[3].trim() : match[4]?.trim() || '';

        if (subject.length > 2 && object.length > 2) {
          claims.push({
            id: `claim_${claim_id++}`,
            text: match[0].trim(),
            subject,
            predicate,
            object,
            confidence: 0.85,
            source_span: {
              start: match.index,
              end: match.index + match[0].length,
            },
            claim_type: 'factual',
          });
        }
      }
    }

    // Pattern 2: Numerical claims (need verification)
    const numerical_pattern = /([^.]*?)(\d+)\s+(million|billion|%|year|century|people|participants|deaths)([^.]*?)[.!?]/gi;
    let match: RegExpExecArray | null = numerical_pattern.exec(text);
    while (match !== null) {
      const context = match[0].trim();
      claims.push({
        id: `claim_${claim_id++}`,
        text: context,
        subject: 'Numerical',
        predicate: match[2],
        object: `${match[2]} ${match[3]}`,
        confidence: 0.75,
        source_span: {
          start: match.index,
          end: match.index + match[0].length,
        },
        claim_type: 'factual',
      });
      match = numerical_pattern.exec(text);
    }

    // Pattern 3: Causal claims
    const causal_pattern = /([^.]*?)(?:because|due\s+to|caused\s+by|results?\s+in|leads?\s+to)([^.!?]+)[.!?]/gi;
    while ((match = causal_pattern.exec(text)) !== null) {
      claims.push({
        id: `claim_${claim_id++}`,
        text: match[0].trim(),
        subject: match[1].trim(),
        predicate: 'causes/results in',
        object: match[2].trim(),
        confidence: 0.70,
        source_span: {
          start: match.index,
          end: match.index + match[0].length,
        },
        claim_type: 'causal',
      });
    }

    // Pattern 4: Comparative claims
    const comparative_pattern = /([^.]*?)(?:more|less|better|worse|greater|smaller)\s+than([^.!?]+)[.!?]/gi;
    while ((match = comparative_pattern.exec(text)) !== null) {
      claims.push({
        id: `claim_${claim_id++}`,
        text: match[0].trim(),
        subject: match[1].trim(),
        predicate: 'compared to',
        object: match[2].trim(),
        confidence: 0.72,
        source_span: {
          start: match.index,
          end: match.index + match[0].length,
        },
        claim_type: 'comparative',
      });
    }

    // Remove duplicates
    const seen = new Set<string>();
    const unique_claims = claims.filter(claim => {
      const key = `${claim.subject}|${claim.predicate}|${claim.object}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logger.info(`[ClaimExtractor] Extracted ${unique_claims.length} unique claims from ${text.length} chars`);
    return unique_claims;
  }

  /**
   * Filter claims for verification importance
   * Returns only claims that are verifiable and important
   */
  static filterImportant(claims: Claim[], topN = 5): Claim[] {
    return claims
      .filter(c => c.confidence > 0.65 && c.text.length > 10)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topN);
  }
}

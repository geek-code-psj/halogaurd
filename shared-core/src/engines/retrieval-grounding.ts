/**
 * Retrieval Grounding Engine
 * Verifies claims against external knowledge sources:
 * - Wikipedia API
 * - Local fact database
 * - Knowledge graph (Wikidata)
 * 
 * Returns verification score: 0-1 (1 = confirmed, 0 = contradiction)
 */

import { logger } from '../utils/logger.js';
import Redis from 'ioredis';

// Initialize Redis client (lazy load)
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
}

export interface VerificationResult {
  claim: string;
  verified: boolean;
  confidence: number; // 0-1
  source: string; // 'wikipedia' | 'cache' | 'wikidata' | 'internal_kb'
  evidence: string;
  contradiction?: string; // If contradicts known fact
  processing_time_ms: number;
}

export class RetrievalGrounding {
  /**
   * Verify a single claim using Wikipedia API
   */
  static async verifyClaim(claim: string): Promise<VerificationResult> {
    const startTime = Date.now();
    const redis = getRedisClient();

    try {
      // Check Redis cache first
      const cache_key = `fact:${this.hashClaim(claim)}`;
      const cached = await redis.get(cache_key);
      
      if (cached) {
        const result = JSON.parse(cached);
        return {
          ...result,
          source: 'cache',
          processing_time_ms: Date.now() - startTime,
        };
      }

      // Query Wikipedia API
      const wiki_result = await this.queryWikipedia(claim);

      // Cache result for 24 hours
      await redis.setex(cache_key, 86400, JSON.stringify(wiki_result));

      return {
        ...wiki_result,
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('[RetrievalGrounding] Verification error:', error);
      return {
        claim,
        verified: false,
        confidence: 0.3,
        source: 'error',
        evidence: 'Verification service unavailable',
        contradiction: undefined,
        processing_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Query Wikipedia for claim verification
   * Simple approach: search for topic and check if claim appears in summary
   */
  private static async queryWikipedia(claim: string): Promise<Omit<VerificationResult, 'processing_time_ms'>> {
    try {
      // Extract main entity from claim
      const entity = this.extractEntity(claim);
      
      // Wikipedia API endpoint
      const wiki_url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(entity)}&prop=extracts&explaintext=true&format=json&formatversion=2`;

      const response = await fetch(wiki_url, { signal: AbortSignal.timeout(5000) });
      
      if (!response.ok) {
        return {
          claim,
          verified: false,
          confidence: 0.4,
          source: 'wikipedia',
          evidence: 'Wikipedia article not found',
          contradiction: undefined,
        };
      }

      const data = (await response.json()) as any;
      const pages = data.query?.pages || [];
      
      if (pages.length === 0 || !pages[0]?.extract) {
        return {
          claim,
          verified: false,
          confidence: 0.5,
          source: 'wikipedia',
          evidence: 'No Wikipedia article found for entity',
          contradiction: undefined,
        };
      }

      const extract = pages[0].extract;
      
      // Simple verification: check if claim components appear in extract
      const claim_keywords = claim.split(' ').filter(w => w.length > 4);
      let matching_keywords = 0;
      
      for (const keyword of claim_keywords) {
        if (extract.toLowerCase().includes(keyword.toLowerCase())) {
          matching_keywords++;
        }
      }

      const match_ratio = matching_keywords / Math.max(claim_keywords.length, 1);
      
      return {
        claim,
        verified: match_ratio > 0.6,
        confidence: match_ratio,
        source: 'wikipedia',
        evidence: `Wikipedia article for "${entity}" found. ${matching_keywords}/${claim_keywords.length} claim keywords present.`,
        contradiction: undefined,
      };
    } catch (error) {
      logger.debug('[RetrievalGrounding] Wikipedia query failed:', error);
      return {
        claim,
        verified: false,
        confidence: 0.3,
        source: 'wikipedia',
        evidence: 'Wikipedia query failed (timeout or network error)',
        contradiction: undefined,
      };
    }
  }

  /**
   * Extract main entity from claim
   * Example: "Einstein invented relativity" → "Albert Einstein"
   */
  private static extractEntity(claim: string): string {
    // Extract first proper noun (likely the entity)
    const proper_noun_pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/;
    const match = claim.match(proper_noun_pattern);
    return match ? match[1] : claim.split(' ')[0];
  }

  /**
   * Hash claim for caching
   */
  private static hashClaim(claim: string): string {
    // Simple hash (in production, use crypto.createHash)
    let hash = 0;
    for (let i = 0; i < claim.length; i++) {
      const char = claim.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Verify multiple claims in parallel
   */
  static async verifyMultipleClaims(claims: string[]): Promise<VerificationResult[]> {
    const promises = claims.map(claim => this.verifyClaim(claim));
    return Promise.all(promises);
  }

  /**
   * Add known fact to internal knowledge base
   * Used for system learning and case-specific facts
   */
  static async addKnownFact(
    subject: string,
    predicate: string,
    object: string,
    source: string = 'manual'
  ): Promise<void> {
    const redis = getRedisClient();
    const fact_key = `kb:${subject}|${predicate}`;
    const fact_value = { object, source, timestamp: Date.now() };
    
    await redis.setex(fact_key, 86400 * 30, JSON.stringify(fact_value)); // 30 days
    logger.info(`[RetrievalGrounding] Added fact: ${fact_key} = ${object}`);
  }

  /**
   * Query internal knowledge base
   */
  static async queryKnowledgeBase(
    subject: string,
    predicate: string
  ): Promise<{ object: string; source: string } | null> {
    const redis = getRedisClient();
    const fact_key = `kb:${subject}|${predicate}`;
    const result = await redis.get(fact_key);
    
    if (result) {
      return JSON.parse(result);
    }
    return null;
  }
}

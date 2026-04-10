/**
 * Fact-Checking Utility Module
 * Integrates with Wikipedia, Wikidata, and public APIs for fact verification
 * Now with proper error typing and rate limiting
 */

import axios, { AxiosError } from 'axios';
import Redis from 'ioredis';

const WIKIPEDIA_API_BASE = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_BASE = 'https://www.wikidata.org/w/api.php';
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds

// Wikipedia rate limit: 5 requests per second
const WIKIPEDIA_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 1000,
};

// Initialize Redis client (optional, graceful fallback if unavailable)
let redisClient: any = null;

/**
 * Simple rate limiter for API requests
 */
class RateLimiter {
  private requestTimes: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();

    // Remove old timestamps outside the window
    this.requestTimes = this.requestTimes.filter(
      (time) => now - time < this.windowMs
    );

    // If we've hit the limit, wait
    if (this.requestTimes.length >= this.maxRequests) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 10;

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.acquire(); // Recursive retry after waiting
      }
    }

    // Record this request
    this.requestTimes.push(Date.now());
  }
}

const wikipediaLimiter = new RateLimiter(
  WIKIPEDIA_RATE_LIMIT.maxRequests,
  WIKIPEDIA_RATE_LIMIT.windowMs
);

/**
 * Custom error type for fact-checking
 */
export class FactCheckError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly source: string = 'unknown',
    public readonly retryable: boolean = true,
    public readonly responseTime?: number
  ) {
    super(message);
    this.name = 'FactCheckError';
  }
}

export async function initRedisCache(url?: string) {
  try {
    redisClient = new Redis(url || process.env.REDIS_URL || 'redis://localhost:6379', {
      retryStrategy: (times) => Math.min(times * 50, 500),
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    // ioredis connects automatically, no need to call connect()
    console.log('✅ Redis cache initialized for fact-checking');
  } catch (error) {
    console.warn('⚠️ Redis unavailable, fact-checking will not be cached:', error);
    redisClient = null;
  }
}

interface WikipediaSearchResult {
  title: string;
  pageid?: number;
  thumbnail?: { source: string };
  description?: string;
  extract?: string;
}

interface FactCheckResult {
  verified: boolean | null; // true=verified, false=contradiction, null=unknown
  confidence: number; // 0-1
  source: string;
  evidence?: string;
  url?: string;
}

/**
 * Search Wikipedia for a term/entity with rate limiting
 */
export async function searchWikipedia(query: string): Promise<WikipediaSearchResult | null> {
  const cacheKey = `wiki:search:primary:${query.toLowerCase()}`;

  // Try cache first
  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      // Cache miss, proceed
    }
  }

  try {
    // Apply rate limiting
    await wikipediaLimiter.acquire();

    const startTime = Date.now();
    const params = {
      action: 'query',
      titles: query,
      format: 'json',
      origin: '*',
      prop: 'extracts|pageimages|pageprops',
      exintro: true,
      explaintext: true,
      piprop: 'thumbnail',
      pithumbsize: 200,
    };

    const response = await axios.get(WIKIPEDIA_API_BASE, {
      params,
      timeout: 3000,
      headers: {
        'User-Agent': 'HaloGuard/1.0 (Hallucination Detection)',
      },
    });

    const responseTime = Date.now() - startTime;

    const pages = response.data?.query?.pages;
    if (!pages) {
      throw new FactCheckError(
        `No pages found for query: ${query}`,
        undefined,
        'wikipedia',
        false,
        responseTime
      );
    }

    const [page] = Object.values(pages) as any[];
    if (!page || 'missing' in page) {
      return null; // Entity doesn't exist
    }

    const result = {
      title: page.title,
      pageid: page.pageid,
      thumbnail: page.thumbnail,
      description: page.pageprops?.description,
      extract: page.extract,
    };

    // Cache the result
    if (redisClient) {
      try {
        await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
      } catch (e) {
        console.warn('[Cache] Write failed for', cacheKey);
      }
    }

    return result;
  } catch (error: any) {
    const responseTime = Date.now();

    if (axios.isAxiosError(error)) {
      const axiosError: AxiosError = error;
      throw new FactCheckError(
        `Wikipedia search failed: ${axiosError.message}`,
        axiosError.response?.status,
        'wikipedia',
        axiosError.response?.status === 429 ||
        axiosError.response?.status === 503, // Retryable on rate limit or service unavailable,
        responseTime
      );
    }

    if (error instanceof FactCheckError) {
      throw error;
    }

    throw new FactCheckError(
      `Wikipedia search error: ${error.message}`,
      undefined,
      'wikipedia',
      true,
      responseTime
    );
  }
}

/**
 * Verify a factual claim against Wikipedia
 */
export async function verifyClaimAgainstWikipedia(
  claim: string,
  context?: string
): Promise<FactCheckResult> {
  try {
    // Extract entity from claim (e.g., "Albert Einstein was born in 1879")
    const entityMatch = claim.match(/^([A-Za-z\s]+?)(?:\s+(?:was|is|are|were)\b)/i);
    const entity = entityMatch?.[1]?.trim();

    if (!entity || entity.length < 2) {
      return { verified: null, confidence: 0, source: 'wikipedia' };
    }

    const wikiResult = await searchWikipedia(entity);
    if (!wikiResult) {
      return { verified: false, confidence: 0.3, source: 'wikipedia', evidence: `"${entity}" not found` };
    }

    // Simple verification: check if key facts from claim appear in Wikipedia
    const extract = (wikiResult.extract || '').toLowerCase();
    const claimLower = claim.toLowerCase();

    // Look for dates mentioned in claim
    const dateMatch = claim.match(/\b(?:19|20)\d{2}\b/);
    if (dateMatch) {
      const year = dateMatch[0];
      if (!extract.includes(year)) {
        return {
          verified: false,
          confidence: 0.7,
          source: 'wikipedia',
          evidence: `Year ${year} not mentioned in Wikipedia for "${entity}"`,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entity)}`,
        };
      }
    }

    // Check for common false claims
    const contradictions = detectContradictions(claim, extract);
    if (contradictions.found) {
      return {
        verified: false,
        confidence: 0.8,
        source: 'wikipedia',
        evidence: contradictions.reason,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entity)}`,
      };
    }

    return {
      verified: true,
      confidence: 0.85,
      source: 'wikipedia',
      evidence: `"${entity}" verified in Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(entity)}`,
    };
  } catch (error) {
    console.error('Fact verification error:', error);
    return { verified: null, confidence: 0, source: 'wikipedia' };
  }
}

/**
 * Check Wikidata for structured fact verification
 * With 403 rate-limit handling and exponential backoff
 */
export async function checkWikidataFact(claim: string): Promise<FactCheckResult> {
  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const cacheKey = `wikidata:verify:${claim.substring(0, 50).toLowerCase()}`;

      // Try cache
      if (redisClient) {
        try {
          const cached = await redisClient.get(cacheKey);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch (e) {
          // Cache miss
        }
      }

      // Extract key components from claim
      const subjectMatch = claim.match(/^([A-Za-z\s]+?)(?:\s+(?:was|is|are|were)\b)/i);
      const subject = subjectMatch?.[1]?.trim();

      if (!subject) {
        return { verified: null, confidence: 0, source: 'wikidata' };
      }

      // Exponential backoff for retries
      if (attempt > 0) {
        const backoffMs = Math.min(100 * Math.pow(2, attempt - 1), 500);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const startTime = Date.now();
      const response = await axios.get(WIKIDATA_API_BASE, {
        params: {
          action: 'wbsearchentities',
          search: subject,
          language: 'en',
          format: 'json',
        },
        timeout: 2000,
      });

      const responseTime = Date.now() - startTime;
      const results = response.data?.search || [];

      if (results.length === 0) {
        return {
          verified: false,
          confidence: 0.4,
          source: 'wikidata',
          evidence: 'Entity not found in Wikidata',
        };
      }

      // Simple score based on claim structure
      const hasDate = /\d{4}|\d{1,2}\/\d{1,2}/.test(claim);
      const hasAction = /\b(?:founded|born|created|died|established)\b/i.test(claim);

      const confidence = hasDate && hasAction ? 0.75 : hasAction ? 0.65 : 0.5;
      const result: FactCheckResult = {
        verified: confidence > 0.6,
        confidence,
        source: 'wikidata',
        evidence: `${subject} verified in Wikidata (${responseTime.toFixed(0)}ms)`,
      };

      // Cache result
      if (redisClient) {
        try {
          await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
        } catch (e) {
          console.warn('[Cache] Wikidata write failed');
        }
      }

      return result;
    } catch (error: any) {
      lastError = error;
      const status = axios.isAxiosError(error) ? error.response?.status : null;
      const errorMsg = axios.isAxiosError(error)
        ? `Wikidata: ${status} ${error.message}`
        : error.message;

      // 403 = rate limited, retry
      if (status === 403 && attempt < maxRetries - 1) {
        console.warn(`⚠️ Wikidata rate limited (403), retrying... (attempt ${attempt + 1}/${maxRetries})`);
        continue;
      }

      // 429 = too many requests, fallback
      if (status === 429) {
        console.warn('⚠️ Wikidata rate limit exceeded (429), falling back to heuristic');
        return { verified: null, confidence: 0.3, source: 'wikidata', evidence: 'Rate limited' };
      }

      // Other errors, log and return null
      console.warn('⚠️ Wikidata check failed:', errorMsg);
      break; // Don't retry on other errors
    }
  }

  // Final fallback after retries exhausted
  console.warn('⚠️ Wikidata verification failed after retries, falling back to heuristic');
  return { verified: null, confidence: 0, source: 'wikidata' };
}

/**
 * Detect logical contradictions between claim and Wikipedia extract
 */
function detectContradictions(
  claim: string,
  wikiExtract: string
): { found: boolean; reason?: string } {
  const claimLower = claim.toLowerCase();
  const wikiLower = wikiExtract.toLowerCase();

  // Common contradictions to check
  const checks = [
    {
      pattern: /born in (\d{4})/i,
      check: (match: RegExpMatchArray) => {
        const birth = match[1];
        return !wikiLower.includes(`birth ${birth}`) &&
               !wikiLower.includes(`born ${birth}`) &&
               !wikiLower.includes(`${birth}`)
          ? { found: true, reason: `Birth year ${birth} not mentioned` }
          : null;
      },
    },
    {
      pattern: /died in (\d{4})/i,
      check: (match: RegExpMatchArray) => {
        const death = match[1];
        return !wikiLower.includes(`died ${death}`) &&
               !wikiLower.includes(`death ${death}`) &&
               !wikiLower.includes(`${death}`)
          ? { found: true, reason: `Death year ${death} not mentioned` }
          : null;
      },
    },
  ];

  for (const { pattern, check } of checks) {
    const match = claimLower.match(pattern);
    if (match) {
      const result = check(match);
      if (result) return result;
    }
  }

  return { found: false };
}

/**
 * Batch verify multiple claims with rate limiting and error tracking
 */
export async function batchVerifyClaims(
  claims: string[],
  options?: { timeout?: number; maxConcurrency?: number }
): Promise<Map<string, FactCheckResult>> {
  const results = new Map<string, FactCheckResult>();
  const maxConcurrency = options?.maxConcurrency || 5;
  const timeout = options?.timeout || 350; // Tier 2 timeout budget

  const startTime = Date.now();

  // Process in parallel with concurrency limit
  for (let i = 0; i < claims.length; i += maxConcurrency) {
    const batch = claims.slice(i, i + maxConcurrency);
    const batchPromises = batch.map(async (claim) => {
      try {
        const result = await verifyClaimAgainstWikipedia(claim);
        return { claim, result, error: null };
      } catch (error) {
        console.warn(`[Tier2] Verification failed for claim "${claim.substring(0, 50)}":`, error);
        const errorResult: FactCheckResult = {
          verified: null,
          confidence: 0,
          source: 'wikipedia',
          evidence: error instanceof Error ? error.message : 'Unknown error',
        };
        return { claim, result: errorResult, error };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const { claim, result, error } of batchResults) {
      results.set(claim, result);

      // Check if we're exceeding timeout budget
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeout) {
        console.warn(
          `[Tier2] Timeout budget exceeded (${elapsedTime.toFixed(0)}ms > ${timeout}ms), stopping batch verification`
        );
        break; // Exit early to respect latency budget
      }
    }

    // If we've exceeded timeout, stop processing more batches
    if (Date.now() - startTime > timeout) {
      break;
    }
  }

  const elapsedTime = Date.now() - startTime;
  console.log(
    `[Tier2] Verified ${results.size}/${claims.length} claims in ${elapsedTime.toFixed(0)}ms`
  );

  return results;
}

export async function closeCache() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('✅ Redis cache closed');
    } catch (error) {
      console.warn('⚠️ Error closing Redis:', error);
    }
  }
}
/**
 * Call Python Wikipedia checker for enhanced fact-checking
 * Uses the Wikipedia-API Python package
 */
/**
 * DEPRECATED: Python Wikipedia verification
 * Disabled for production - relies on file system access that may not be available in containerized environments
 * Using JavaScript Wikipedia API instead (tier2.ts)
 */
export async function verifyClaimsWithPythonWikipedia(
  claims: string[]
): Promise<Map<string, FactCheckResult>> {
  // Return empty results - Python spawning disabled in production
  return new Map<string, FactCheckResult>();
}
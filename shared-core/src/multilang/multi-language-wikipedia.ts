/**
 * PHASE 3 EPIC 1: Multi-Language Wikipedia API Integration
 * 
 * Extends fact-checker to support multi-language Wikipedia searches
 * Handles language-specific API calls and claim extraction
 */

import { SupportedLanguageCode } from './language-detector';
import { getWikipediaConfig, getClaimPatterns } from './language-config';

interface MultiLanguageSearchOptions {
  language?: SupportedLanguageCode;
  timeout?: number;
  maxResults?: number;
}

/**
 * Search Wikipedia in a specific language
 * @param query - Search term
 * @param language - Target language (defaults to 'en')
 * @param timeout - Search timeout in ms (defaults to 3000)
 * @returns Wikipedia article summary and URL
 */
export async function searchWikipediaMultiLang(
  query: string,
  options: MultiLanguageSearchOptions = {}
): Promise<{
  title: string;
  summary: string;
  url: string;
  language: SupportedLanguageCode;
} | null> {
  const {
    language = 'en',
    timeout = 3000,
    maxResults = 5,
  } = options;

  try {
    const config = getWikipediaConfig(language);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const params = new URLSearchParams({
      action: 'query',
      srsearch: query,
      srnamespace: '0',
      srlimit: String(maxResults),
      format: 'json',
      origin: '*', // CORS
    });

    const url = `${config.baseUrl}?${params.toString()}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Wikipedia API error: ${response.statusText}`);
    }

    const data = await response.json() as any;

    // Handle search results - type guard
    if (data?.query?.search && Array.isArray(data.query.search) && data.query.search.length > 0) {
      const result = data.query.search[0] as any;

      // Fetch full article content
      const contentParams = new URLSearchParams({
        action: 'query',
        titles: result.title,
        prop: 'extracts',
        exintro: 'true',
        explaintext: 'true',
        format: 'json',
        origin: '*',
      });

      const contentUrl = `${config.baseUrl}?${contentParams.toString()}`;
      const contentResponse = await fetch(contentUrl, {
        headers: { 'Content-Type': 'application/json' },
      });

      const contentData = await contentResponse.json() as any;
      const pages = contentData?.query?.pages || {};
      const page = Object.values(pages)[0] as any;

      if (page?.extract) {
        return {
          title: result.title,
          summary: page.extract.substring(0, 500), // First 500 chars
          url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
          language,
        };
      }
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`Wikipedia search timeout for query: "${query}" (${language})`);
    } else {
      console.error('Wikipedia search error:', error);
    }
    return null;
  }
}

/**
 * Verify a claim against Wikipedia in the user's language
 * @param claim - Claim to verify
 * @param language - User's language preference
 * @returns Verification result with confidence score
 */
export async function verifyClaimMultiLang(
  claim: string,
  language: SupportedLanguageCode = 'en'
): Promise<{
  verified: boolean;
  confidence: number;
  source: string;
  detail: string;
}> {
  try {
    // Extract key entities from claim
    const entities = extractEntitiesFromClaim(claim, language);

    if (entities.length === 0) {
      return {
        verified: false,
        confidence: 0,
        source: 'system',
        detail: 'No verifiable entities found in claim',
      };
    }

    // Search for entities in Wikipedia
    let bestMatch: any = null;
    let bestConfidence = 0;

    for (const entity of entities) {
      const result = await searchWikipediaMultiLang(entity, { language });

      if (result) {
        // Simple confidence: if entity is in summary = high confidence
        const found = result.summary.toLowerCase().includes(entity.toLowerCase());
        if (found && bestConfidence < 0.8) {
          bestMatch = result;
          bestConfidence = 0.8;
        }
      }
    }

    if (bestMatch) {
      return {
        verified: true,
        confidence: bestConfidence,
        source: bestMatch.url,
        detail: `Found evidence in ${language} Wikipedia: ${bestMatch.title}`,
      };
    }

    return {
      verified: false,
      confidence: 0.3,
      source: `wikipedia-${language}`,
      detail: `No Wikipedia evidence found for claim (language: ${language})`,
    };
  } catch (error) {
    return {
      verified: false,
      confidence: 0,
      source: 'system',
      detail: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract verifiable entities/facts from claim using language-specific patterns
 */
export function extractEntitiesFromClaim(
  claim: string,
  language: SupportedLanguageCode
): string[] {
  const entities: string[] = [];

  // Use language-specific patterns
  const patterns = getClaimPatterns(language);
  const matches = claim.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];

  for (const match of matches) {
    if (match.length > 2) {
      entities.push(match);
    }
  }

  // Also try pattern matching
  for (const pattern of patterns) {
    const patternMatches = claim.match(pattern);
    if (patternMatches) {
      for (const m of patternMatches) {
        if (m.length > 3) {
          entities.push(m);
        }
      }
    }
  }

  return [...new Set(entities)]; // Remove duplicates
}

/**
 * Batch verify claims in a specific language
 */
export async function batchVerifyClaimsMultiLang(
  claims: string[],
  language: SupportedLanguageCode = 'en',
  timeout: number = 350 // Per-batch timeout
): Promise<Array<{
  claim: string;
  result: Awaited<ReturnType<typeof verifyClaimMultiLang>>;
}>> {
  const startTime = Date.now();
  const results: Array<{
    claim: string;
    result: Awaited<ReturnType<typeof verifyClaimMultiLang>>;
  }> = [];

  for (const claim of claims) {
    // Check if we've exceeded timeout budget
    if (Date.now() - startTime > timeout) {
      console.warn(
        `[MultiLang] Batch verification timeout (${Date.now() - startTime}ms > ${timeout}ms), stopping batch`
      );
      break;
    }

    try {
      const result = await verifyClaimMultiLang(claim, language);
      results.push({ claim, result });
    } catch (error) {
      results.push({
        claim,
        result: {
          verified: false,
          confidence: 0,
          source: 'system',
          detail: `Error verifying claim: ${error instanceof Error ? error.message : 'Unknown'}`,
        },
      });
    }
  }

  return results;
}

export { getClaimPatterns };

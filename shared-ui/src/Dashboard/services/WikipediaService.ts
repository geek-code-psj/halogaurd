/**
 * Wikipedia API Integration Service
 * Integrates Wikipedia for fact-checking and context in tier 2 detection
 */

import { TierResult } from '../types/dashboard';

interface WikipediaSearchResult {
  title: string;
  snippet: string;
  url: string;
  confidence: number;
}

interface FactCheckResult {
  claim: string;
  wikipediaMatch: WikipediaSearchResult | null;
  verified: boolean;
  confidence: number;
  details: string;
}

export class WikipediaService {
  private wikipediaApiUrl = 'https://en.wikipedia.org/w/api.php';
  private timeout = 3000;

  /**
   * Search Wikipedia for relevant information
   */
  async searchArticle(query: string): Promise<WikipediaSearchResult | null> {
    try {
      const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        origin: '*', // CORS
      });

      const response = await this.fetchWithTimeout(
        `${this.wikipediaApiUrl}?${params}`,
        this.timeout
      );

      const data = await response.json();

      if (data.query?.search && data.query.search.length > 0) {
        const result = data.query.search[0];
        return {
          title: result.title,
          snippet: result.snippet.replace(/<[^>]*>/g, ''), // Remove HTML tags
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
          confidence: 0.8, // Base confidence for Wikipedia match
        };
      }

      return null;
    } catch (err) {
      console.error('Wikipedia search failed:', err);
      return null;
    }
  }

  /**
   * Extract and verify facts from claim
   */
  async verifyFact(claim: string): Promise<FactCheckResult> {
    // Extract key entities/claims from the statement
    const keywords = this.extractKeywords(claim);

    if (!keywords || keywords.length === 0) {
      return {
        claim,
        wikipediaMatch: null,
        verified: false,
        confidence: 0,
        details: 'Could not extract verifiable facts from claim',
      };
    }

    // Search for the main keyword on Wikipedia
    const match = await this.searchArticle(keywords[0]);

    if (!match) {
      return {
        claim,
        wikipediaMatch: null,
        verified: false,
        confidence: 0.1,
        details: `No Wikipedia article found for "${keywords[0]}"`,
      };
    }

    // Simple verification: check if claim keywords appear in Wikipedia snippet
    const claimLower = claim.toLowerCase();
    const snippetLower = match.snippet.toLowerCase();
    const keywordsInSnippet = keywords.filter((kw) =>
      snippetLower.includes(kw.toLowerCase())
    );

    const matchPercentage = keywordsInSnippet.length / keywords.length;
    const verified = matchPercentage > 0.5;
    const confidence = Math.min(matchPercentage * 0.9 + 0.1, 1.0);

    return {
      claim,
      wikipediaMatch: match,
      verified,
      confidence,
      details: verified
        ? `Claim appears consistent with Wikipedia article: "${match.title}"`
        : `Claim may contradict Wikipedia information on "${match.title}"`,
    };
  }

  /**
   * Get Wikipedia context for NLI tier evaluation
   */
  async getContextForNLI(premise: string, hypothesis: string): Promise<{
    premiseContext: WikipediaSearchResult | null;
    hypothesisContext: WikipediaSearchResult | null;
    analysis: string;
  }> {
    const [premiseMatch, hypothesisMatch] = await Promise.all([
      this.searchArticle(premise),
      this.searchArticle(hypothesis),
    ]);

    let analysis = '';

    if (premiseMatch && hypothesisMatch) {
      analysis = `Both premise and hypothesis have supporting Wikipedia articles. Check for contradiction between "${premiseMatch.title}" and "${hypothesisMatch.title}".`;
    } else if (premiseMatch) {
      analysis = `Premise matches Wikipedia article "${premiseMatch.title}". Hypothesis not found on Wikipedia - may be novel or erroneous.`;
    } else if (hypothesisMatch) {
      analysis = `Hypothesis matches Wikipedia article "${hypothesisMatch.title}". Premise not found on Wikipedia - verify factuality.`;
    } else {
      analysis = 'Neither premise nor hypothesis found on Wikipedia. Cannot verify through external sources.';
    }

    return {
      premiseContext: premiseMatch,
      hypothesisContext: hypothesisMatch,
      analysis,
    };
  }

  /**
   * Extract keywords from text for searching
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction: remove common words and get longest phrases
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
    ]);

    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(
        (word) =>
          !commonWords.has(word) && word.length > 3 && /^[a-z]+$/i.test(word)
      )
      .slice(0, 3); // Top 3 keywords

    if (words.length === 0) {
      // Fallback: try to extract phrases
      const phrases = text.match(/\b\w+\b/g) || [];
      return phrases.slice(0, 1);
    }

    return words;
  }

  /**
   * Fetch with timeout
   */
  private fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId)
    );
  }
}

/**
 * Integration helper: Convert Wikipedia analysis to TierResult
 */
export class WikipediaIntegration {
  static async enhanceTierResult(
    tier: TierResult,
    wikipediaService: WikipediaService
  ): Promise<TierResult> {
    if (tier.tier !== 2) {
      // Only enhance tier 2 (Wikipedia tier)
      return tier;
    }

    if (!tier.details) {
      return tier;
    }

    try {
      const factCheck = await wikipediaService.verifyFact(tier.details);

      return {
        ...tier,
        confidence: Math.max(tier.confidence, factCheck.confidence),
        status: factCheck.verified ? 'passed' : tier.status,
        details: factCheck.details,
      };
    } catch (err) {
      console.error('Failed to enhance tier result with Wikipedia:', err);
      return tier;
    }
  }
}

/**
 * TIER 1: Heuristic Scoring + Sycophancy Pattern Matching (50ms)
 * Implements token entropy analysis and cosine similarity checks
 */

import { DetectionIssue, DetectionRequest } from "../types/detector.ts";

/**
 * Calculate Shannon entropy of token distribution
 * Low entropy = repetitive, high entropy = diverse
 * GPT-generated text often has specific entropy pattern
 */
function calculateTokenEntropy(text: string): number {
  const tokens = text.toLowerCase().split(/\s+/);
  const tokenFreq = new Map<string, number>();

  for (const token of tokens) {
    tokenFreq.set(token, (tokenFreq.get(token) || 0) + 1);
  }

  let entropy = 0;
  const total = tokens.length;

  for (const count of tokenFreq.values()) {
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  }

  return entropy;
}

/**
 * Detect n-gram patterns that indicate sycophancy
 * Research: Turn N vs Turn N-2 similarity <0.60 suggests sycophancy
 */
function calculateNgramSimilarity(
  current: string,
  previous: string
): number {
  const getNgrams = (text: string, n: number = 2) => {
    const tokens = text.toLowerCase().split(/\s+/);
    const ngrams = new Set<string>();
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.add(tokens.slice(i, i + n).join(" "));
    }
    return ngrams;
  };

  const currentNgrams = getNgrams(current);
  const previousNgrams = getNgrams(previous);

  let overlap = 0;
  for (const ngram of currentNgrams) {
    if (previousNgrams.has(ngram)) {
      overlap++;
    }
  }

  const union = Math.max(currentNgrams.size, previousNgrams.size);
  return union === 0 ? 0 : overlap / union;
}

/**
 * Cosine similarity for sycophancy detection
 * Threshold: <0.60 indicates distinct positions (healthy discourse)
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * (vec2[i] || 0), 0);
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Simple vectorizer: convert text to frequency vector
 */
function textToVector(text: string): number[] {
  const tokens = text.toLowerCase().split(/\s+/);
  const vocab = new Set(tokens);
  const vector: number[] = [];

  for (const word of vocab) {
    const count = tokens.filter((t) => t === word).length;
    vector.push(count);
  }

  return vector;
}

export async function detectTier1(request: DetectionRequest): Promise<DetectionIssue[]> {
  const issues: DetectionIssue[] = [];
  const { content, conversationHistory } = request;

  // Calculate token entropy
  const entropy = calculateTokenEntropy(content);
  const expectedHumanEntropy = 4.5; // Typical human text
  const expectedGPTEntropy = 5.2; // GPT text often higher

  // Token entropy anomaly detection
  if (entropy > expectedGPTEntropy * 1.1) {
    issues.push({
      id: `tier1_entropy_${Date.now()}`,
      type: "ood_prediction",
      severity: "low",
      tier: 1,
      score: Math.min((entropy - expectedHumanEntropy) / 2, 1.0),
      confidence: 0.65,
      message: `Token entropy anomaly (${entropy.toFixed(2)}). May indicate model-generated or obfuscated content.`,
      suggestions: ["Request rephrasing in simpler terms", "Cross-reference claims"],
    });
  }

  // Sycophancy detection using conversation history
  if (conversationHistory && conversationHistory.length >= 2) {
    const lastAssistantMsg = conversationHistory
      .reverse()
      .find((m) => m.role === "assistant")?.content;
    const secondLastAssistantMsg = conversationHistory
      .slice(0, -2)
      .reverse()
      .find((m) => m.role === "assistant")?.content;

    if (lastAssistantMsg && secondLastAssistantMsg) {
      // Check n-gram similarity (Turn N vs N-2)
      const ngramSim = calculateNgramSimilarity(content, lastAssistantMsg);

      // Check cosine similarity
      const vec1 = textToVector(content);
      const vec2 = textToVector(lastAssistantMsg);
      const cosSim = cosineSimilarity(vec1, vec2);

      // Research threshold: <0.60 = healthy disagreement
      if (cosSim > 0.75) {
        issues.push({
          id: `tier1_sycophancy_${Date.now()}`,
          type: "sycophancy",
          severity: cosSim > 0.85 ? "high" : "medium",
          tier: 1,
          score: Math.min(cosSim, 1.0),
          confidence: 0.78,
          message: `High text similarity to previous turn (cosine: ${cosSim.toFixed(2)}). May indicate sycophancy or pattern repetition.`,
          evidence: {
            nliScore: cosSim,
          },
          suggestions: [
            "Ask for alternative perspectives",
            "Request critical analysis",
            "Prompt for contradicting viewpoints",
          ],
        });
      }
    }
  }

  return issues;
}

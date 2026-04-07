/**
 * TIER 4: Semantic Memory + Context Drift Detection (Async)
 * Uses FAISS for semantic similarity and detects context drift over time
 */

import { DetectionIssue, DetectionRequest } from "../types/detector";

interface SemanticMemory {
  id: string;
  embedding: number[];
  text: string;
  timestamp: number;
  source: "user" | "assistant";
  conversationId: string;
}

/**
 * Simple embedding simulator (in prod, use actual embedding model)
 * Would use: sentence-transformers/all-MiniLM-L6-v2 via Python service
 */
function createSimpleEmbedding(text: string, dim: number = 384): number[] {
  const tokens = text.toLowerCase().split(/\s+/);
  const embedding: number[] = new Array(dim).fill(0);

  // Hash tokens into embedding dimensions
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit
    }
    const idx = Math.abs(hash) % dim;
    embedding[idx] += 1 / tokens.length;
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return norm > 0 ? embedding.map((v) => v / norm) : embedding;
}

/**
 * Calculate cosine similarity between embeddings
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * (vec2[i] || 0), 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  return mag1 * mag2 > 0 ? dotProduct / (mag1 * mag2) : 0;
}

/**
 * Detect context drift: conversation drifting away from original topic
 */
function detectContextDrift(
  conversationHistory: Array<{ role: string; content: string }>,
  currentResponse: string
): { drifted: boolean; score: number } {
  if (conversationHistory.length < 3) {
    return { drifted: false, score: 0 };
  }

  const firstUserMsg = conversationHistory.find((m) => m.role === "user")?.content || "";
  const currentEmbedding = createSimpleEmbedding(currentResponse);
  const initialEmbedding = createSimpleEmbedding(firstUserMsg);

  const similarity = cosineSimilarity(currentEmbedding, initialEmbedding);

  // If similarity drops below 0.4, significant drift occurred
  return {
    drifted: similarity < 0.4,
    score: 1 - similarity,
  };
}

/**
 * Detect semantic inconsistency: contradictions within conversation
 */
function detectSemanticInconsistency(
  conversationHistory: Array<{ role: string; content: string }>
): { inconsistent: boolean; score: number } {
  const assistantMessages = conversationHistory
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .slice(-3); // Last 3 assistant messages

  if (assistantMessages.length < 2) {
    return { inconsistent: false, score: 0 };
  }

  let totalSimilarity = 0;
  for (let i = 0; i < assistantMessages.length - 1; i++) {
    const emb1 = createSimpleEmbedding(assistantMessages[i]);
    const emb2 = createSimpleEmbedding(assistantMessages[i + 1]);
    totalSimilarity += cosineSimilarity(emb1, emb2);
  }

  const avgSimilarity = totalSimilarity / (assistantMessages.length - 1);

  // Very high or very low similarity can indicate inconsistency
  return {
    inconsistent: avgSimilarity < 0.3 || avgSimilarity > 0.95,
    score: avgSimilarity < 0.3 ? 1 - avgSimilarity : avgSimilarity - 0.95,
  };
}

export async function detectTier4(request: DetectionRequest): Promise<DetectionIssue[]> {
  const issues: DetectionIssue[] = [];
  const { conversationHistory, content } = request;

  if (!conversationHistory || conversationHistory.length < 3) {
    return issues; // Not enough history for semantic analysis
  }

  // Detect context drift
  const drift = detectContextDrift(conversationHistory, content);
  if (drift.drifted && drift.score > 0.4) {
    issues.push({
      id: `tier4_drift_${Date.now()}`,
      type: "semantic_drift",
      severity: drift.score > 0.6 ? "medium" : "low",
      tier: 4,
      score: drift.score,
      confidence: 0.7,
      message: `Conversation semantic drift detected (${(drift.score * 100).toFixed(0)}% deviation from topic).`,
      suggestions: [
        "Redirect to original question",
        "Ask for focus on primary topic",
        "Request summary of key points",
      ],
    });
  }

  // Detect semantic inconsistency
  const inconsistency = detectSemanticInconsistency(conversationHistory);
  if (inconsistency.inconsistent && inconsistency.score > 0.3) {
    issues.push({
      id: `tier4_inconsistency_${Date.now()}`,
      type: "context_insensitivity",
      severity: "medium",
      tier: 4,
      score: inconsistency.score,
      confidence: 0.72,
      message: `Semantic inconsistency detected across conversation turns.`,
      suggestions: [
        "Ask for clarification on contradictions",
        "Request consistent reasoning",
        "Review previous statements",
      ],
    });
  }

  return issues;
}

/**
 * Conversation Store - PostgreSQL-backed persistent storage
 * Replaces sliding Redis window with full history + semantic checkpoints
 */

import { prisma } from '../db';

// Simple logger
const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: (msg: string, data?: any) => console.debug(`[DEBUG] ${msg}`, data || ''),
};

export interface ConversationTurn {
  id?: number;
  conversation_id: string;
  turn_number: number;
  user_message: string;
  ai_response: string;
  entities_mentioned: string[];
  confidence_score: number;
  timestamp: Date;
  semantic_triples?: any[];
}

export interface SemanticCheckpoint {
  id?: number;
  conversation_id: string;
  checkpoint_number: number;
  start_turn: number;
  end_turn: number;
  summary_claims: string[];
  summary_embeddings: any[];
  created_at?: Date;
}

/**
 * Load full conversation history with checkpoints
 * Returns: recent turns (detailed) + checkpoint summaries (compressed)
 */
export async function loadConversationHistory(
  conversation_id: string,
  context_window: number = 25
) {
  try {
    // Get recent detailed turns
    const recent_turns = await prisma.conversationTurns.findMany({
      where: { conversation_id },
      orderBy: { turn_number: 'desc' },
      take: context_window,
    }) as any[];

    // Get extended history (beyond context window)
    const extended_turns = await prisma.conversationTurns.findMany({
      where: { conversation_id },
      orderBy: { turn_number: 'desc' },
      take: context_window + 75,  // Up to 100 turns for contradiction checking
    }) as any[];

    // Get semantic checkpoints (compressed history)
    const checkpoints = await prisma.semanticCheckpoints.findMany({
      where: { conversation_id },
      orderBy: { checkpoint_number: 'asc' },
    }) as any[];

    return {
      recent_turns: recent_turns.reverse(),
      extended_turns: extended_turns.reverse(),
      checkpoints,
      has_full_history: true,
    };
  } catch (error) {
    logger.warn(`Failed to load conversation ${conversation_id} from DB:`, error);
    return {
      recent_turns: [],
      extended_turns: [],
      checkpoints: [],
      has_full_history: false,
    };
  }
}

/**
 * Store a single turn in PostgreSQL
 */
export async function storeTurn(turn: ConversationTurn) {
  try {
    const result = await prisma.conversationTurns.create({
      data: {
        conversation_id: turn.conversation_id,
        turn_number: turn.turn_number,
        user_message: turn.user_message,
        ai_response: turn.ai_response,
        entities_mentioned: turn.entities_mentioned,
        confidence_score: turn.confidence_score,
        timestamp: turn.timestamp || new Date(),
      },
    }) as any;

    // Create checkpoint every 50 turns
    if (turn.turn_number % 50 === 0) {
      await createSemanticCheckpoint(turn.conversation_id, turn.turn_number);
    }

    return result;
  } catch (error) {
    logger.error(`Failed to store turn ${turn.turn_number}:`, error);
    throw error;
  }
}

/**
 * Create semantic checkpoint (compress 50 turns into 3 claims)
 */
export async function createSemanticCheckpoint(
  conversation_id: string,
  current_turn: number
) {
  try {
    const checkpoint_number = Math.floor(current_turn / 50);
    const start_turn = checkpoint_number * 50 - 49;
    const end_turn = current_turn;

    // Get turns in this range
    const turns_in_range = await prisma.conversationTurns.findMany({
      where: {
        conversation_id,
        turn_number: { gte: start_turn, lte: end_turn },
      },
      orderBy: { turn_number: 'asc' },
    }) as any[];

    if (turns_in_range.length === 0) return;

    // Extract top 3-5 key claims from this range
    const summary_claims = extractTopClaims(turns_in_range);

    // Store checkpoint
    await prisma.semanticCheckpoints.create({
      data: {
        conversation_id,
        checkpoint_number,
        start_turn,
        end_turn,
        summary_claims: summary_claims,
        created_at: new Date(),
      },
    }) as any;

    logger.info(
      `[Checkpoint] Created checkpoint ${checkpoint_number} for turns ${start_turn}-${end_turn}`
    );
  } catch (error) {
    logger.warn(`Failed to create checkpoint:`, error);
  }
}

/**
 * Extract top 3-5 claims from a batch of turns
 * Simple approach: take first, middle, last turn claims
 */
function extractTopClaims(turns: any[]): string[] {
  const claims: string[] = [];

  if (turns.length === 0) return claims;

  // First turn claim
  const first_response = turns[0]?.ai_response || '';
  const first_sentence = first_response.split('.')[0];
  if (first_sentence && first_sentence.length > 10) {
    claims.push(first_sentence.substring(0, 100));
  }

  // Middle turn claim
  if (turns.length > 1) {
    const mid_idx = Math.floor(turns.length / 2);
    const mid_response = turns[mid_idx]?.ai_response || '';
    const mid_sentence = mid_response.split('.')[0];
    if (mid_sentence && mid_sentence.length > 10) {
      claims.push(mid_sentence.substring(0, 100));
    }
  }

  // Last turn claim
  if (turns.length > 2) {
    const last_response = turns[turns.length - 1]?.ai_response || '';
    const last_sentence = last_response.split('.')[0];
    if (last_sentence && last_sentence.length > 10) {
      claims.push(last_sentence.substring(0, 100));
    }
  }

  return claims;
}

/**
 * Get turns where a specific entity was mentioned
 * Useful for tracing entity evolution across conversation
 */
export async function getTurnsWithEntity(
  conversation_id: string,
  entity: string
) {
  try {
    const turns = await prisma.conversationTurns.findMany({
      where: {
        conversation_id,
        entities_mentioned: { has: entity },
      },
      orderBy: { turn_number: 'asc' },
    }) as any[];

    return turns;
  } catch (error) {
    logger.warn(`Failed to get entity turns:`, error);
    return [];
  }
}

/**
 * Check for contradictions across conversation history
 * Compares new statement against: recent + extended + checkpoints
 */
export async function findHistoricalContradictions(
  conversation_id: string,
  new_statement: string,
  current_turn_number: number
): Promise<{
  contradictions: Array<{ turn_number: number; statement: string; type: string }>;
  checkpoint_contradictions: Array<{ checkpoint: number; summary: string }>;
}> {
  try {
    const history = await loadConversationHistory(conversation_id, 25);

    const contradictions: any[] = [];
    const checkpoint_contradictions: any[] = [];

    // Check against recent turns (likely recent contradiction)
    for (const turn of history.recent_turns) {
      if (turn.turn_number >= current_turn_number) continue;

      const similarity = calculateSimilarity(new_statement, turn.ai_response);
      
      // Low similarity = potential contradiction
      if (similarity < 0.5 && similarity > 0.2) {
        contradictions.push({
          turn_number: turn.turn_number,
          statement: turn.ai_response.substring(0, 100),
          type: 'recent_contradiction',
        });
      }
    }

    // Check against historical turns beyond context window
    for (const turn of history.extended_turns) {
      if (
        turn.turn_number >= current_turn_number ||
        turn.turn_number > current_turn_number - 100
      )
        continue;

      const similarity = calculateSimilarity(new_statement, turn.ai_response);
      if (similarity < 0.4) {
        contradictions.push({
          turn_number: turn.turn_number,
          statement: turn.ai_response.substring(0, 100),
          type: 'historical_contradiction',
        });
      }
    }

    // Check against checkpoints (detects old but important contradictions)
    for (const checkpoint of history.checkpoints) {
      for (const summary_claim of checkpoint.summary_claims) {
        const similarity = calculateSimilarity(new_statement, summary_claim);
        if (similarity < 0.45) {
          checkpoint_contradictions.push({
            checkpoint: checkpoint.checkpoint_number,
            summary: summary_claim,
          });
        }
      }
    }

    return { contradictions, checkpoint_contradictions };
  } catch (error) {
    logger.error(`Error finding historical contradictions:`, error);
    return { contradictions: [], checkpoint_contradictions: [] };
  }
}

/**
 * Simple similarity check (word overlap)
 * TODO: Replace with embedding similarity for production
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = Array.from(words1).filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / (union || 1);
}

/**
 * Clean up old turns (keep last 500 for performance)
 */
export async function pruneOldTurns(conversation_id: string, keep_turns: number = 500) {
  try {
    const total_turns = await prisma.conversationTurns.count({
      where: { conversation_id },
    });

    if (total_turns > keep_turns) {
      const turns_to_delete = total_turns - keep_turns;

      await prisma.conversationTurns.deleteMany({
        where: {
          conversation_id,
          turn_number: { lte: turns_to_delete },
        },
      });

      logger.info(`[Prune] Deleted ${turns_to_delete} old turns from ${conversation_id}`);
    }
  } catch (error) {
    logger.warn(`Failed to prune old turns:`, error);
  }
}

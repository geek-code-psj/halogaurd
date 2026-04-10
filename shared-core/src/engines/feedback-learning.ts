/**
 * Feedback Learning System
 * Collects user feedback on analyses to improve model over time
 * 
 * Stores:
 * - False positives (flagged but was correct)
 * - False negatives (missed hallucinations)
 * - Corrections (user provided correct information)
 * - Adjustments (user changed confidence thresholds)
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

export interface FeedbackRecord {
  id: string;
  timestamp: Date;
  analysis_id: string;
  user_id: string;
  correct_result: 'true_positive' | 'true_negative' | 'false_positive' | 'false_negative';
  original_score: number;
  user_correction?: {
    corrected_claim: string;
    actual_fact: string;
    source: string; // 'user' | 'external' | 'verified'
  };
  engagement_level: number; // 0-1 (how much the user interacted)
  policy_adjustment?: {
    new_tolerance: number;
    reason: string;
  };
}

export interface LearningMetrics {
  total_feedback_records: number;
  false_positive_rate: number; // % of flagged that were correct
  false_negative_rate: number; // % of missed hallucinations
  average_correction_accuracy: number; // 0-1
  recommended_threshold_adjustment: number; // Δ score
}

export class FeedbackLearningSystem {
  /**
   * Record user feedback on an analysis
   */
  static async recordFeedback(
    analysis_id: string,
    user_id: string,
    feedback: Partial<FeedbackRecord>
  ): Promise<FeedbackRecord> {
    const redis = getRedisClient();
    const record: FeedbackRecord = {
      id: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      analysis_id,
      user_id,
      correct_result: feedback.correct_result || 'true_negative',
      original_score: feedback.original_score || 0.5,
      user_correction: feedback.user_correction,
      engagement_level: feedback.engagement_level || 0.5,
      policy_adjustment: feedback.policy_adjustment,
    };

    // Store in Redis
    const key = `feedback:${record.id}`;
    await redis.setex(key, 86400 * 90, JSON.stringify(record)); // 90-day retention

    // Store in feedback index for analysis
    await redis.lpush(`feedback_list:${user_id}`, record.id);

    logger.info(`[FeedbackLearning] Recorded feedback: ${record.correct_result} (ID: ${record.id})`);

    // Trigger learning if threshold reached
    await this.checkAndTriggerLearning(user_id);

    return record;
  }

  /**
   * Get learning metrics for a user
   */
  static async getLearningMetrics(user_id: string): Promise<LearningMetrics> {
    const redis = getRedisClient();
    const feedback_ids = await redis.lrange(`feedback_list:${user_id}`, 0, -1);

    if (feedback_ids.length === 0) {
      return {
        total_feedback_records: 0,
        false_positive_rate: 0,
        false_negative_rate: 0,
        average_correction_accuracy: 0,
        recommended_threshold_adjustment: 0,
      };
    }

    const records: FeedbackRecord[] = [];
    for (const id of feedback_ids) {
      const data = await redis.get(`feedback:${id}`);
      if (data) {
        records.push(JSON.parse(data));
      }
    }

    // Calculate metrics
    const false_positives = records.filter(r => r.correct_result === 'false_positive').length;
    const false_negatives = records.filter(r => r.correct_result === 'false_negative').length;
    const corrections = records.filter(r => r.user_correction).length;

    const fp_rate = false_positives / Math.max(records.length, 1);
    const fn_rate = false_negatives / Math.max(records.length, 1);

    // Recommend threshold adjustment
    // If false_positive_rate > 15%, raise threshold (be less aggressive)
    // If false_negative_rate > 15%, lower threshold (be more aggressive)
    let threshold_adjustment = 0;
    if (fp_rate > 0.15) threshold_adjustment += 5; // Raise by 5 points
    if (fn_rate > 0.15) threshold_adjustment -= 5; // Lower by 5 points

    return {
      total_feedback_records: records.length,
      false_positive_rate: fp_rate,
      false_negative_rate: fn_rate,
      average_correction_accuracy: corrections > 0 ? 0.85 : 0, // Placeholder
      recommended_threshold_adjustment: threshold_adjustment,
    };
  }

  /**
   * Apply learning: Update system based on feedback
   */
  static async checkAndTriggerLearning(user_id: string): Promise<void> {
    const redis = getRedisClient();
    const metrics = await this.getLearningMetrics(user_id);

    // Trigger retraining if we have enough data (50+ feedback records)
    if (metrics.total_feedback_records >= 50) {
      logger.info(`[FeedbackLearning] Triggering learning for user ${user_id} (${metrics.total_feedback_records} records)`);

      // Store recommended policy update
      const policy_update_key = `policy:recommend:${user_id}`;
      await redis.setex(policy_update_key, 86400, JSON.stringify({
        threshold_adjustment: metrics.recommended_threshold_adjustment,
        fp_rate: metrics.false_positive_rate,
        fn_rate: metrics.false_negative_rate,
        timestamp: Date.now(),
      }));

      // In production: trigger model retraining pipeline
      logger.info(`[FeedbackLearning] Policy update recommended: ${metrics.recommended_threshold_adjustment} points`);
    }
  }

  /**
   * Collect corrections to build factual knowledge base
   */
  static async recordCorrection(
    claim: string,
    corrected_fact: string,
    source: string,
    user_id: string
  ): Promise<void> {
    const redis = getRedisClient();
    const correction_key = `correction:${FeedbackLearningSystem.hashClaim(claim)}`;
    const correction_data = {
      original_claim: claim,
      corrected_fact,
      source,
      user_id,
      timestamp: Date.now(),
      votes: 1,
    };

    // Store with vote mechanism (multiple users can confirm)
    const existing = await redis.get(correction_key);
    if (existing) {
      const data = JSON.parse(existing);
      correction_data.votes = (data.votes || 0) + 1;
    }

    await redis.setex(correction_key, 86400 * 365, JSON.stringify(correction_data)); // 1 year
    logger.info(`[FeedbackLearning] Recorded correction (votes: ${correction_data.votes})`);
  }

  /**
   * Get popular corrections (collaboratively vetted facts)
   */
  static async getVerifiedCorrections(): Promise<Array<{ claim: string; correction: string; votes: number }>> {
    // In production: scan all correction keys and aggregate
    // For now, return placeholder
    return [];
  }

  /**
   * Simple hash for claim deduplication
   */
  private static hashClaim(claim: string): string {
    let hash = 0;
    for (let i = 0; i < claim.length; i++) {
      const char = claim.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Export feedback for analysis/auditing
   */
  static async exportFeedback(user_id: string, format: 'json' | 'csv' = 'json'): Promise<string> {
    const redis = getRedisClient();
    const metrics = await this.getLearningMetrics(user_id);
    const feedback_ids = await redis.lrange(`feedback_list:${user_id}`, 0, -1);

    const records: FeedbackRecord[] = [];
    for (const id of feedback_ids) {
      const data = await redis.get(`feedback:${id}`);
      if (data) {
        records.push(JSON.parse(data));
      }
    }

    if (format === 'json') {
      return JSON.stringify({ metrics, records }, null, 2);
    } else {
      // CSV format
      const csv_header = [
        'timestamp',
        'analysis_id',
        'correct_result',
        'original_score',
        'engagement_level',
      ].join(',');

      const csv_rows = records.map(r => [
        r.timestamp,
        r.analysis_id,
        r.correct_result,
        r.original_score,
        r.engagement_level,
      ].map(v => `"${v}"`).join(','));

      return [csv_header, ...csv_rows].join('\n');
    }
  }
}

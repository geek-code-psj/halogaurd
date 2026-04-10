/**
 * Real Intervention System
 * Connects decision policies to actual UI actions in Chrome extension
 * 
 * Actions taken:
 * - 'allow': Let message through (no UI change)
 * - 'warn': Show warning badge/tooltip
 * - 'flag': Highlight problematic sections
 * - 'block': Prevent message send until reviewed
 * - 'edit': Suggest rewording
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

export interface InterventionUI {
  action: 'allow' | 'warn' | 'flag' | 'block' | 'edit';
  visible: boolean; // Show to user
  severity: 'info' | 'warning' | 'error'; // Visual level
  title: string;
  message: string;
  highlighted_sections?: Array<{
    start: number;
    end: number;
    reason: string;
    suggestion?: string;
  }>;
  allow_override: boolean; // User can bypass?
  estimated_impact: 'low' | 'medium' | 'high';
}

export interface InterventionContext {
  analysis_id: string;
  user_id: string;
  content: string;
  policy_decision: any; // DecisionPolicyEngine.PolicyDecision
  engine_scores: {
    truth_engine: number;
    reasoning_engine: number;
    alignment_engine: number;
    risk_engine: number;
  };
}

export class InterventionExecutor {
  /**
   * Convert policy decision into concrete UI intervention
   */
  static buildInterventionUI(context: InterventionContext): InterventionUI {
    const { policy_decision, engine_scores, content } = context;
    const action = policy_decision.recommendation || 'allow';

    // Determine visibility: always show high-risk, hide safe content
    const visible = !(
      action === 'allow' &&
      (engine_scores.truth_engine + engine_scores.reasoning_engine) / 2 > 75
    );

    const severityMap = {
      allow: 'info',
      warn: 'warning',
      flag: 'warning',
      block: 'error',
      edit: 'warning',
    };

    // Build highlighted sections from problematic spans
    const highlighted_sections = policy_decision.problematic_sections?.map((section: any) => ({
      start: content.indexOf(section.text),
      end: content.indexOf(section.text) + section.text.length,
      reason: section.reason,
      suggestion: this.generateSuggestion(section),
    })) || [];

    // Build user-friendly message
    const messageMap = {
      allow: 'This response looks accurate and well-reasoned.',
      warn: 'This response contains some claims that may need verification.',
      flag: 'Several concerning patterns detected. Review before sending.',
      block: 'This response contains hallucinations or risky claims. Address issues before sending.',
      edit: 'Consider rewriting for better accuracy and clarity.',
    };

    // Determine if user can override
    const allow_override = action !== 'block'; // Only strict errors block sending

    // Estimate real-world impact
    const avg_confidence = (
      engine_scores.truth_engine +
      engine_scores.reasoning_engine +
      engine_scores.alignment_engine +
      engine_scores.risk_engine
    ) / 4;

    let estimated_impact: 'low' | 'medium' | 'high' = 'low';
    if (action === 'block' || avg_confidence < 30) {
      estimated_impact = 'high';
    } else if (action === 'flag' || avg_confidence < 50) {
      estimated_impact = 'medium';
    }

    return {
      action: action as any,
      visible,
      severity: severityMap[action] as any,
      title: `${action.charAt(0).toUpperCase() + action.slice(1)}: LLM Response Analysis`,
      message: messageMap[action] || messageMap.allow,
      highlighted_sections,
      allow_override,
      estimated_impact,
    };
  }

  /**
   * Generate specific rewriting suggestion for a problematic section
   */
  private static generateSuggestion(section: any): string {
    const { reason, text } = section;

    // Pattern-based suggestions
    if (reason.includes('overconfident')) {
      return `Try: "I'm not entirely certain, but ${text.toLowerCase()}"`;
    }
    if (reason.includes('sycophancy')) {
      return `Provide objective analysis instead: "${this.removeAgreementPatterns(text)}"`;
    }
    if (reason.includes('unverified')) {
      return `Add source: "${text} (Source: ...)"`;
    }
    if (reason.includes('logic')) {
      return `Clarify reasoning: "Because ${text.toLowerCase()}, therefore..."`;
    }

    return `Consider rewording: "${text}"`;
  }

  /**
   * Remove agreement/sycophancy patterns for suggestion
   */
  private static removeAgreementPatterns(text: string): string {
    const patterns = [
      /\b(absolutely|definitely|you're absolutely right|exactly|I completely agree)\b/gi,
      /\b(as you mentioned|you're correct|that's true)\b/gi,
    ];

    let cleaned = text;
    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    return cleaned || text;
  }

  /**
   * Store intervention for audit trail
   */
  static async logIntervention(
    analysis_id: string,
    user_id: string,
    intervention: InterventionUI,
    action_taken: 'allowed' | 'blocked' | 'edited' | 'dismissed'
  ): Promise<void> {
    const redis = getRedisClient();
    const log_key = `intervention:${analysis_id}`;
    const log_data = {
      timestamp: Date.now(),
      user_id,
      intervention: intervention.action,
      user_action: action_taken,
      ui_state: intervention,
    };

    await redis.setex(log_key, 86400 * 30, JSON.stringify(log_data)); // 30-day audit trail
    logger.info(`[Intervention] ${action_taken.toUpperCase()}: ${intervention.action} (${analysis_id})`);
  }

  /**
   * Check if user can override intervention (e.g., trusted users)
   */
  static async canUserOverride(user_id: string, action: string): Promise<boolean> {
    const redis = getRedisClient();
    // In production: check user trust score, reputation
    // For now: allow override for warn/flag, not for block
    const trust_score = await redis.get(`user:trust:${user_id}`);
    const ts = trust_score ? parseInt(trust_score) : 50; // Default 50/100

    if (action === 'block') return ts > 80; // Only trusted users can override blocks
    return true; // Allow warn/flag overrides
  }

  /**
   * Collect intervention outcome for feedback loop
   */
  static async recordInterventionOutcome(
    analysis_id: string,
    user_id: string,
    intervention: InterventionUI,
    user_action: 'allowed' | 'blocked' | 'edited' | 'dismissed',
    final_outcome?: 'accurate' | 'hallucination' | 'helpful' | 'harmful'
  ): Promise<void> {
    const redis = getRedisClient();
    // Log intervention
    await this.logIntervention(analysis_id, user_id, intervention, user_action);

    // If user corrected the content, record as feedback
    if (user_action === 'edited' && final_outcome) {
      const feedback_key = `feedback:intervention:${analysis_id}`;
      const feedback_data = {
        timestamp: Date.now(),
        intervention_action: intervention.action,
        user_action,
        final_outcome,
        improvement: user_action === 'edited' ? true : false,
      };

      await redis.setex(feedback_key, 86400 * 90, JSON.stringify(feedback_data));
      logger.info(
        `[Intervention] Outcome recorded: ${intervention.action} → ${final_outcome} (${user_action})`
      );
    }
  }

  /**
   * Get intervention statistics for dashboard
   */
  static async getInterventionStats(
    user_id: string,
    days: number = 30
  ): Promise<{
    total_interventions: number;
    actions_taken: Record<string, number>;
    override_rate: number;
    user_improvement: number;
  }> {
    // In production: aggregate intervention logs
    // For now: return placeholder
    return {
      total_interventions: 0,
      actions_taken: {
        allow: 0,
        warn: 0,
        flag: 0,
        block: 0,
        edit: 0,
      },
      override_rate: 0,
      user_improvement: 0,
    };
  }
}

/**
 * Integration Hook: Called after decision policy
 */
export async function executeIntervention(
  context: InterventionContext
): Promise<InterventionUI> {
  const intervention = InterventionExecutor.buildInterventionUI(context);

  logger.info(
    `[Intervention] Executing: ${intervention.action} (severity: ${intervention.severity})`
  );

  return intervention;
}

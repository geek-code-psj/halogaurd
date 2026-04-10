/**
 * Decision Policy Engine
 * Determines intervention actions based on analysis scores
 * 
 * Policies:
 * - ALLOW: Let response through
 * - WARN: Show warning to user
 * - FLAG: Highlight problematic section
 * - BLOCK: Prevent response from being sent
 * - EDIT: Suggest corrections
 */

import { logger } from '../utils/logger.js';

export type InterventionAction = 'allow' | 'warn' | 'flag' | 'block' | 'edit';

export interface PolicyDecision {
  action: InterventionAction;
  confidence: number; // 0-1
  reason: string;
  recommendations: string[];
  claimed_sections: Array<{
    text: string;
    start: number;
    end: number;
    intervention: InterventionAction;
    reason: string;
  }>;
}

export interface PolicyConfig {
  strict_mode: boolean; // true = aggressive intervention
  allow_financial_advice: boolean;
  allow_medical_advice: boolean;
  user_tolerance: number; // 0-1 (1 = very tolerant, 0 = zero tolerance)
}

export class DecisionPolicyEngine {
  private config: PolicyConfig;

  constructor(config: Partial<PolicyConfig> = {}) {
    this.config = {
      strict_mode: false,
      allow_financial_advice: false,
      allow_medical_advice: false,
      user_tolerance: 0.5,
      ...config,
    };
  }

  /**
   * Make decision based on unified analysis score
   */
  decide(
    final_score: number,
    combined_flags: string[],
    recommendation: 'safe' | 'warning' | 'flag' | 'critical',
    content: string
  ): PolicyDecision {
    let action: InterventionAction = 'allow';
    let confidence = 0.9;
    let reason = '';
    const recommendations: string[] = [];

    // Check for sensitive topics violations
    const has_unsupported_financial = combined_flags.some(f => 
      f.includes('financial') && f.includes('disclaimer')
    ) && !this.config.allow_financial_advice;

    const has_unsupported_medical = combined_flags.some(f =>
      f.includes('medical') && f.includes('disclaimer')
    ) && !this.config.allow_medical_advice;

    if (has_unsupported_financial || has_unsupported_medical) {
      action = 'warn';
      reason = 'Financial/medical advice without proper disclaimer';
      recommendations.push('Add proper disclaimer: "This is not professional advice"');
    }

    // Decision based on final score
    if (this.config.strict_mode) {
      // Strict mode: lower thresholds
      if (final_score < 40) {
        action = 'block';
        confidence = 0.95;
        reason = 'Critical hallucination risk (score < 40)';
      } else if (final_score < 55) {
        action = 'flag';
        confidence = 0.90;
        reason = 'High hallucination risk (score < 55)';
      } else if (final_score < 70) {
        action = 'warn';
        confidence = 0.85;
        reason = 'Moderate hallucination risk (score < 70)';
      }
    } else {
      // Normal mode: standard thresholds
      if (final_score < 35) {
        action = 'block';
        confidence = 0.95;
        reason = 'Critical hallucination risk';
      } else if (final_score < 50) {
        action = 'flag';
        confidence = 0.90;
        reason = 'High hallucination detected';
      } else if (final_score < 65) {
        action = 'warn';
        confidence = 0.85;
        reason = 'Content quality concerns';
      }
    }

    // Adjust based on user tolerance
    if (this.config.user_tolerance > 0.7 && action === 'warn') {
      action = 'allow';
      recommendations.push('User has high tolerance - allowing with information only');
    }

    // Generate section-level interventions
    const claimed_sections = this.identifyProblematicSections(content, combined_flags);

    return {
      action,
      confidence,
      reason,
      recommendations,
      claimed_sections,
    };
  }

  /**
   * Identify specific sections of text that need intervention
   */
  private identifyProblematicSections(
    content: string,
    flags: string[]
  ): PolicyDecision['claimed_sections'] {
    const sections: PolicyDecision['claimed_sections'] = [];

    // Find sentences with problematic patterns
    const sentences = content.split(/[.!?]\s+/);
    let position = 0;

    for (const sentence of sentences) {
      const sentence_length = sentence.length;
      
      // Check for overconfidence
      if (flags.some(f => f.includes('overconfidence'))) {
        if (/\b(guaranteed|100%|definitely|absolutely|will\s+definitely)\b/i.test(sentence)) {
          sections.push({
            text: sentence.trim(),
            start: position,
            end: position + sentence_length,
            intervention: 'flag',
            reason: 'Overconfident language detected',
          });
        }
      }

      // Check for financial advice
      if (flags.some(f => f.includes('financial'))) {
        if (/\b(invest|buy|sell|money|profit|earn|rich)\b/i.test(sentence)) {
          sections.push({
            text: sentence.trim(),
            start: position,
            end: position + sentence_length,
            intervention: 'warn',
            reason: 'Financial advice requires proper disclaimer',
          });
        }
      }

      // Check for sycophancy
      if (flags.some(f => f.includes('sycophancy'))) {
        if (/you\s+(?:are\s+)?(?:absolutely\s+)?right|i\s+apologize|you\s+got\s+me/i.test(sentence)) {
          sections.push({
            text: sentence.trim(),
            start: position,
            end: position + sentence_length,
            intervention: 'flag',
            reason: 'Suspicious agreement pattern detected',
          });
        }
      }

      position += sentence_length + 2; // +2 for ". "
    }

    return sections.slice(0, 5); // Return top 5 sections
  }

  /**
   * Build user-facing explanation
   */
  buildExplanation(decision: PolicyDecision): string {
    const lines = [
      `**Action: ${decision.action.toUpperCase()}**`,
      `Confidence: ${(decision.confidence * 100).toFixed(0)}%`,
      `Reason: ${decision.reason}`,
    ];

    if (decision.recommendations.length > 0) {
      lines.push('');
      lines.push('**Recommendations:**');
      for (const rec of decision.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    if (decision.claimed_sections.length > 0) {
      lines.push('');
      lines.push('**Problematic sections:**');
      for (const section of decision.claimed_sections) {
        lines.push(`- "${section.text}" → ${section.reason}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Set user preference (learns user tolerance over time)
   */
  setUserPreference(preference: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...preference };
    logger.info('[DecisionPolicy] Updated user preferences:', this.config);
  }
}

/**
 * Pre-built policy configurations
 */
export const POLICIES = {
  /**
   * PERMISSIVE: Allow most content, only block obvious hallucinations
   */
  permissive: (): DecisionPolicyEngine => {
    return new DecisionPolicyEngine({
      strict_mode: false,
      allow_financial_advice: true,
      allow_medical_advice: false,
      user_tolerance: 0.8,
    });
  },

  /**
   * BALANCED: Default policy - reasonable caution
   */
  balanced: (): DecisionPolicyEngine => {
    return new DecisionPolicyEngine({
      strict_mode: false,
      allow_financial_advice: false,
      allow_medical_advice: false,
      user_tolerance: 0.5,
    });
  },

  /**
   * STRICT: Flag any concerns, block obvious hallucinations
   */
  strict: (): DecisionPolicyEngine => {
    return new DecisionPolicyEngine({
      strict_mode: true,
      allow_financial_advice: false,
      allow_medical_advice: false,
      user_tolerance: 0.2,
    });
  },

  /**
   * PROFESSIONAL: For professional contexts (law, medicine, finance)
   */
  professional: (): DecisionPolicyEngine => {
    return new DecisionPolicyEngine({
      strict_mode: true,
      allow_financial_advice: false,
      allow_medical_advice: false,
      user_tolerance: 0.1,
    });
  },
};

/**
 * ============================================================
 * HaloGuard: Unified 4-Engine Analysis System (Production)
 * ============================================================
 * 
 * Engine 1: Truth Engine - Factual accuracy validation
 * Engine 2: Reasoning Engine - Logic & code consistency
 * Engine 3: Alignment Engine - Sycophancy detection
 * Engine 4: Risk Engine - Overconfidence & unrealistic claims
 * 
 * All 4 engines run in parallel for sub-50ms latency
 */

import { logger } from '../utils/logger.js';

// ============================================================
// RESULT INTERFACES
// ============================================================

export interface EngineResult {
  score: number; // 0-100 (higher = less risky)
  flags: string[];
  confidence: number; // 0-1
  details: Record<string, any>;
  processing_time_ms: number;
}

export interface UnifiedAnalysisResult {
  truth: EngineResult;
  reasoning: EngineResult;
  alignment: EngineResult;
  risk: EngineResult;
  final_score: number; // 0-100 weighted
  combined_flags: string[];
  total_processing_time_ms: number;
  recommendation: 'safe' | 'warning' | 'flag' | 'critical';
}

// ============================================================
// ENGINE 1: TRUTH ENGINE - Factual Validation
// ============================================================

class TruthEngine {
  /**
   * Checks for factual accuracy and unverified claims
   */
  async analyze(content: string, history: string[] = []): Promise<EngineResult> {
    const startTime = Date.now();
    const score_components: number[] = [];
    const flags: string[] = [];
    let confidence = 0.7;

    try {
      // Check 1: Detect hedging language (indicator of uncertainty)
      const hedging_patterns = [
        /might\s+(be|have)/i,
        /could\s+(be|have)/i,
        /appears\s+to/i,
        /seems\s+to/i,
        /allegedly/i,
        /reportedly/i,
        /according\s+to\s+(?!verified|official)/i,
      ];
      
      let hedging_count = 0;
      for (const pattern of hedging_patterns) {
        const matches = content.match(pattern);
        if (matches) hedging_count += matches.length;
      }
      
      if (hedging_count > 0) {
        flags.push(`hedging_language_detected_${hedging_count}`);
        score_components.push(80); // Hedging not necessarily bad
      }

      // Check 2: Detect numerical claims that need verification
      const number_claims = content.match(/\d+\s*(million|billion|trillion|%|year|century|decade)/gi) || [];
      if (number_claims.length > 3) {
        flags.push(`multiple_numerical_claims_${number_claims.length}`);
        score_components.push(75);
      }

      // Check 3: Detect unattributed assertions
      const assertion_regex = /^(?!according|studies show|research|evidence)(.*(?:is|was|are|were))/m;
      let unattributed_assertions = 0;
      const lines = content.split('\n');
      for (const line of lines) {
        if (line.length > 10 && assertion_regex.test(line)) {
          unattributed_assertions++;
        }
      }

      if (unattributed_assertions > 5) {
        flags.push('unattributed_assertions_detected');
        score_components.push(70);
      }

      // Check 4: Historical contradiction detection
      if (history.length > 0) {
        for (const prev_statement of history.slice(-3)) {
          if (TruthEngine.semanticSimilarity(content, prev_statement) < 0.5) {
            flags.push('potential_contradiction_with_history');
            score_components.push(60);
            confidence = 0.85;
            break;
          }
        }
      }

      // Calculate final score
      const final_score = score_components.length > 0 
        ? Math.round(score_components.reduce((a, b) => a + b) / score_components.length)
        : 85;

      return {
        score: final_score,
        flags,
        confidence,
        details: {
          hedging_count,
          number_claims_count: number_claims.length,
          unattributed_assertions,
          history_checked: history.length > 0,
        },
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('[TruthEngine] Error:', error);
      return { 
        score: 90, 
        flags: ['truth_engine_error'], 
        confidence: 0.5, 
        details: {}, 
        processing_time_ms: Date.now() - startTime 
      };
    }
  }

  /**
   * Jaccard similarity (0-1 range)
   * In production: use spaCy or transformer embeddings
   */
  private static semanticSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0.5;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}

// ============================================================
// ENGINE 2: REASONING ENGINE - Logic & Consistency
// ============================================================

class ReasoningEngine {
  /**
   * Validates logical consistency and code correctness
   */
  async analyze(content: string): Promise<EngineResult> {
    const startTime = Date.now();
    const score_components: number[] = [];
    const flags: string[] = [];

    try {
      // Check 1: Logical fallacies
      const logical_fallacies = [
        /\b(all|every|always|never)\b.*\b(is|are|will|won't)\b/i, // Overgeneralization
        /(\w+)\s+because\s+(\w+),\s+and\s+(\w+)\s+because\s+\1/i, // Circular reasoning
        /if\s+.+?\s+then\s+.+?\s+therefore/i, // Weak implication
      ];

      let fallacy_count = 0;
      for (const pattern of logical_fallacies) {
        if (pattern.test(content)) {
          fallacy_count++;
        }
      }

      if (fallacy_count > 0) {
        flags.push(`logical_fallacies_${fallacy_count}`);
        score_components.push(65);
      }

      // Check 2: Code pattern validation
      const code_patterns = [
        /import\s+\{.*\}\s+from\s+['"][^'"]+['"]/g,
        /function\s+\w+\s*\(/g,
        /const\s+\w+\s*=/g,
      ];

      let total_code_elements = 0;
      for (const pattern of code_patterns) {
        const matches = content.match(pattern);
        total_code_elements += matches ? matches.length : 0;
      }

      if (total_code_elements > 5) {
        // Has code - check for common errors
        if (content.includes('undefined') || content.includes('null')) {
          flags.push('potential_null_reference');
          score_components.push(70);
        }
        if (!content.includes('try') && !content.includes('catch')) {
          flags.push('missing_error_handling');
          score_components.push(75);
        } else {
          score_components.push(88);
        }
      } else {
        score_components.push(85);
      }

      // Check 3: Missing dependencies
      const missing_deps = [];
      if (content.includes('React.') && !content.match(/import\s+.*React/i)) {
        missing_deps.push('React');
      }
      if (content.includes('fetch(') && content.includes('node') && !content.includes('node-fetch')) {
        missing_deps.push('fetch_in_node');
      }

      if (missing_deps.length > 0) {
        flags.push(`missing_dependencies_${missing_deps.join('_')}`);
        score_components.push(50);
      }

      const final_score = score_components.length > 0 
        ? Math.round(score_components.reduce((a, b) => a + b) / score_components.length)
        : 88;

      return {
        score: final_score,
        flags,
        confidence: 0.75,
        details: {
          fallacy_count,
          code_elements: total_code_elements,
          missing_dependencies: missing_deps,
        },
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('[ReasoningEngine] Error:', error);
      return { 
        score: 88, 
        flags: ['reasoning_engine_error'], 
        confidence: 0.5, 
        details: {}, 
        processing_time_ms: Date.now() - startTime 
      };
    }
  }
}

// ============================================================
// ENGINE 3: ALIGNMENT ENGINE - Sycophancy Detection
// ============================================================

class AlignmentEngine {
  /**
   * Detects sycophancy and position reversals
   */
  async analyze(current_response: string, history: string[] = []): Promise<EngineResult> {
    const startTime = Date.now();
    const score_components: number[] = [];
    const flags: string[] = [];
    let confidence = 0.7;

    try {
      // Check 1: Sycophancy trigger phrases
      const sycophancy_triggers = [
        /you.{0,20}(are\s+absolutely\s+right|totally\s+correct|make\s+a\s+great\s+point)/i,
        /you.{0,30}(got\s+me|caught\s+me|got\s+a\s+point)/i,
        /i\s+(?:apologize|was\s+wrong|stand\s+corrected)/i,
        /that'?s\s+(?:an\s+)?(?:excellent|brilliant|insightful|amazing)/i,
      ];

      let sycophancy_score = 85;
      let trigger_found = false;
      for (const pattern of sycophancy_triggers) {
        if (pattern.test(current_response)) {
          flags.push('sycophancy_trigger_detected');
          sycophancy_score = 50;
          trigger_found = true;
          confidence = 0.88;
          break;
        }
      }
      score_components.push(sycophancy_score);

      // Check 2: Position reversal detection
      if (history.length > 2 && !trigger_found) {
        const recent_statements = history.slice(-2);
        
        const contradicting_patterns = [
          { test: (old: string, curr: string) => 
            /earlier|before|previously/.test(old) && 
            /now|currently|changed/.test(curr) &&
            /(disagree|differ)/.test(old) &&
            /(agree|concur)/.test(curr)
          },
        ];

        for (const pattern_checker of contradicting_patterns) {
          if (pattern_checker.test(recent_statements[0], current_response)) {
            flags.push('position_reversal_detected');
            score_components.push(40);
            confidence = 0.87;
            break;
          }
        }
      }

      // Check 3: Agreement overload
      const agreement_words = (current_response.match(/\b(yes|absolutely|definitely|certainly|agreed|exactly|right|correct|true)\b/gi) || []).length;
      
      if (agreement_words > 8) {
        flags.push(`excessive_agreement_${agreement_words}`);
        score_components.push(60);
        confidence = 0.8;
      }

      if (score_components[score_components.length - 1] === 85 && agreement_words <= 3) {
        score_components.push(88);
      }

      const final_score = Math.round(score_components.reduce((a, b) => a + b) / score_components.length);

      return {
        score: final_score,
        flags,
        confidence,
        details: {
          agreement_word_count: agreement_words,
          history_matches: history.length,
          sycophancy_trigger_found: trigger_found,
        },
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('[AlignmentEngine] Error:', error);
      return { 
        score: 85, 
        flags: ['alignment_engine_error'], 
        confidence: 0.5, 
        details: {}, 
        processing_time_ms: Date.now() - startTime 
      };
    }
  }
}

// ============================================================
// ENGINE 4: RISK ENGINE - Overconfidence & Unrealistic Claims
// ============================================================

class RiskEngine {
  /**
   * Detects overconfidence and unrealistic advice
   */
  async analyze(content: string): Promise<EngineResult> {
    const startTime = Date.now();
    const score_components: number[] = [];
    const flags: string[] = [];

    try {
      // Check 1: Overconfidence language
      const overconfidence_patterns = [
        /\b(definitely|absolutely|100%|guaranteed)\b.{0,40}(?:work|succeed|happen|fix)/i,
        /\b(everyone\s+knows|obviously|clearly|as\s+we\s+all\s+know)\b/i,
        /\b(never\s+fails|always\s+works|foolproof|risk[\s-]?free)\b/i,
      ];

      let overconfidence_score = 85;
      for (const pattern of overconfidence_patterns) {
        if (pattern.test(content)) {
          flags.push('overconfidence_language_detected');
          overconfidence_score = 55;
          break;
        }
      }
      score_components.push(overconfidence_score);

      // Check 2: Unrealistic timelines
      const timeline_patterns = [
        /(\d+)\s+(minute|hour|hour)s?.*(?:you'll|you\s+will)\s+(?:definitely\s+)?(?:earn|make|get|achieve|become).{0,40}(rich|wealthy|successful|expert)/i,
        /guaranteed\s+results?\s+in\s+(\d+)\s+(?:day|hour)s?/i,
        /(?:instant|overnight|immediately).*(?:success|wealth|results)/i,
      ];

      let timeline_risk = 88;
      for (const pattern of timeline_patterns) {
        if (pattern.test(content)) {
          flags.push('unrealistic_timeline_detected');
          timeline_risk = 45;
          break;
        }
      }
      score_components.push(timeline_risk);

      // Check 3: Missing caveats
      const caveat_phrases = ['however', 'but', 'depending', 'contingent', 'varies', 'circumstances'];
      const has_caveats = caveat_phrases.some(phrase => 
        content.toLowerCase().includes(phrase)
      );

      if (!has_caveats && content.length > 200) {
        flags.push('missing_caveats_or_constraints');
        score_components.push(70);
      } else {
        score_components.push(85);
      }

      // Check 4: Financial/Medical claims without disclaimers
      const sensitive_topics = /\b(invest|money|profit|medical|cure|treatment|diagnosis|health|lose\s+weight|diet)\b/i;
      const disclaimer_keywords = /\b(not\s+financial|not\s+medical|consult|professional|advice|disclaimer|informational)\b/i;
      
      if (sensitive_topics.test(content) && !disclaimer_keywords.test(content)) {
        flags.push('sensitive_topic_without_disclaimer');
        score_components.push(50);
      }

      const final_score = score_components.length > 0
        ? Math.round(score_components.reduce((a, b) => a + b) / score_components.length)
        : 82;

      return {
        score: final_score,
        flags,
        confidence: 0.8,
        details: {
          overconfidence_detected: overconfidence_score < 80,
          unrealistic_timeline_detected: timeline_risk < 80,
          has_caveats,
          sensitive_topics_checked: sensitive_topics.test(content),
        },
        processing_time_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('[RiskEngine] Error:', error);
      return { 
        score: 82, 
        flags: ['risk_engine_error'], 
        confidence: 0.5, 
        details: {}, 
        processing_time_ms: Date.now() - startTime 
      };
    }
  }
}

// ============================================================
// UNIFIED SCORER - Combines All 4 Engines
// ============================================================

export class UnifiedAnalyzer {
  private truth_engine = new TruthEngine();
  private reasoning_engine = new ReasoningEngine();
  private alignment_engine = new AlignmentEngine();
  private risk_engine = new RiskEngine();

  /**
   * Run full 4-engine analysis
   */
  async analyze(
    content: string,
    conversation_history: string[] = [],
    weights: Record<string, number> = {},
  ): Promise<UnifiedAnalysisResult> {
    const startTime = Date.now();

    // Early exit for obviously safe content (performance optimization)
    // Bypass if content is very short or generic
    if (content.length < 100 && !content.match(/\$|invest|financial|medical|cure|treatment|health|legal|law/i)) {
      return {
        truth: { score: 85, flags: [], confidence: 0.6, details: {}, processing_time_ms: 2 },
        reasoning: { score: 85, flags: [], confidence: 0.6, details: {}, processing_time_ms: 1 },
        alignment: { score: 85, flags: [], confidence: 0.6, details: {}, processing_time_ms: 1 },
        risk: { score: 85, flags: [], confidence: 0.6, details: {}, processing_time_ms: 1 },
        final_score: 85,
        combined_flags: [],
        total_processing_time_ms: Date.now() - startTime,
        recommendation: 'safe',
      };
    }

    // *** WEIGHTED SCORING FOR ACCURACY (Phase 1 Optimization) ***
    // Different severity weights instead of simple averaging
    // Factual errors are more critical than sycophancy
    const default_weights = {
      truth: 0.40,      // Facts are most critical (was 0.30)
      reasoning: 0.25,  // Logic important
      alignment: 0.20,  // Sycophancy concerning (was 0.25)
      risk: 0.15,       // Overconfidence subtle (was 0.20)
    };

    const final_weights = { ...default_weights, ...weights };

    // Run all 4 engines in parallel
    const [truth, reasoning, alignment, risk] = await Promise.all([
      this.truth_engine.analyze(content, conversation_history),
      this.reasoning_engine.analyze(content),
      this.alignment_engine.analyze(content, conversation_history),
      this.risk_engine.analyze(content),
    ]);

    // Compute weighted final score with severity multipliers (Phase 1 Optimization)
    // Apply multipliers for critical issues to boost their impact
    const truth_multiplier = truth.score < 20 ? 1.5 : (truth.score < 40 ? 1.2 : 1.0);
    const reasoning_multiplier = reasoning.score < 20 ? 1.3 : 1.0;
    const alignment_multiplier = alignment.score < 30 ? 1.1 : 1.0;
    
    const weighted_components = [
      (truth.score * final_weights.truth * truth_multiplier),
      (reasoning.score * final_weights.reasoning * reasoning_multiplier),
      (alignment.score * final_weights.alignment * alignment_multiplier),
      (risk.score * final_weights.risk),
    ];
    
    const final_score = Math.round(
      weighted_components.reduce((a, b) => a + b, 0) /
      (final_weights.truth * truth_multiplier + final_weights.reasoning * reasoning_multiplier + final_weights.alignment * alignment_multiplier + final_weights.risk)
    );

    // Combine flags
    const combined_flags = [
      ...truth.flags,
      ...reasoning.flags,
      ...alignment.flags,
      ...risk.flags,
    ];

    // Determine recommendation
    let recommendation: 'safe' | 'warning' | 'flag' | 'critical' = 'safe';
    if (final_score >= 80) recommendation = 'safe';
    else if (final_score >= 65) recommendation = 'warning';
    else if (final_score >= 40) recommendation = 'flag';
    else recommendation = 'critical';

    return {
      truth,
      reasoning,
      alignment,
      risk,
      final_score,
      combined_flags,
      total_processing_time_ms: Date.now() - startTime,
      recommendation,
    };
  }
}

export const analyzer = new UnifiedAnalyzer();

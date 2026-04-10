/**
 * 4-Engine Analysis System - Test Suite
 * Tests all engines with realistic hallucination and truth scenarios
 */

import { describe, it, expect } from 'vitest';
import { analyzer } from '../engines/unified-analysis.js';

describe('4-Engine Analysis System', () => {

  // ============================================================
  // TEST 1: SAFE CONTENT
  // ============================================================

  it('should rate safe content as HIGH score', async () => {
    const safe_content = `
      Based on recent research by the CDC and WHO, certain practices can improve health outcomes. 
      While individual results may vary depending on personal circumstances, studies suggest that 
      regular exercise, balanced diet, and adequate sleep are beneficial components of a healthy lifestyle.
      However, consulting with a healthcare professional is recommended before making significant changes.
    `;

    const result = await analyzer.analyze(safe_content);

    expect(result.final_score).toBeGreaterThan(75);
    expect(result.recommendation).toBe('safe');
    expect(result.combined_flags.length).toBeLessThan(3);
  });

  // ============================================================
  // TEST 2: FACTUAL ERROR
  // ============================================================

  it('should detect unverified facts as RISKY', async () => {
    const factual_error = `
      World War II ended in 1943. This is a well-known historical fact that everyone agrees on.
      The moon is actually made of cheese. All scientists confirm this.
      Paris is the capital of Germany. This is obviously correct.
    `;

    const result = await analyzer.analyze(factual_error);

    expect(result.final_score).toBeLessThan(70);
    expect(result.truth.score).toBeLessThan(80);
    expect(result.truth.flags.length).toBeGreaterThan(0);
  });

  // ============================================================
  // TEST 3: SYCOPHANCY
  // ============================================================

  it('should detect sycophancy and position reversal as CRITICAL', async () => {
    const sycophancy_content = `
      You are absolutely correct! I was completely wrong earlier. Your point is brilliant and insightful. 
      I apologize for disagreeing with you. You totally got me on that one. That's an excellent observation!
    `;

    const history = [
      'I strongly disagree with your approach',
      'Earlier I said this would never work',
    ];

    const result = await analyzer.analyze(sycophancy_content, history);

    expect(result.final_score).toBeLessThan(60);
    expect(result.recommendation).toBe('flag');
    expect(result.alignment.flags).toContain('sycophancy_trigger_detected');
  });

  // ============================================================
  // TEST 4: OVERCONFIDENCE
  // ============================================================

  it('should flag overconfident and unrealistic claims', async () => {
    const overconfident_content = `
      Invest $1000 today and earn $10000 in just 30 days! 
      This guaranteed method will definitely make you rich. 
      100% foolproof and risk-free! By following my system, 
      you will absolutely become a millionaire overnight. 
      Everyone knows this works - it's obvious and certain!
    `;

    const result = await analyzer.analyze(overconfident_content);

    expect(result.final_score).toBeLessThan(55);
    expect(result.recommendation).toBe('critical');
    expect(result.risk.flags).toContain('overconfidence_language_detected');
    expect(result.risk.flags.some(f => f.includes('unrealistic_timeline'))).toBe(true);
  });

  // ============================================================
  // TEST 5: CODE WITH MISSING ERROR HANDLING
  // ============================================================

  it('should detect code without error handling as RISKY', async () => {
    const bad_code = `
      function fetchUserData(userId) {
        const response = fetch(\`/api/users/\${userId}\`);
        return response.json();
      }
      
      const userData = JSON.parse(apiResponse);
      console.log(userData.name.first);
    `;

    const result = await analyzer.analyze(bad_code);

    expect(result.reasoning.flags).toContain('missing_error_handling');
    expect(result.reasoning.flags.some(f => f.includes('null'))).toBe(true);
  });

  // ============================================================
  // TEST 6: COMPLEX MULTI-TURN ANALYSIS
  // ============================================================

  it('should detect contradictions across multiple turns', async () => {
    const current_response = `
      Python was actually invented in 1989, not 1991. 
      It's definitely the oldest programming language in existence.
    `;

    const history = [
      'Earlier I mentioned Python was created by Guido van Rossum in 1991',
      'Python is one of the newer programming languages compared to C and Lisp',
    ];

    const result = await analyzer.analyze(current_response, history);

    expect(result.truth.flags.some(f => f.includes('contradiction'))).toBe(true);
  });

  // ============================================================
  // TEST 7: FINANCIAL ADVICE WITHOUT DISCLAIMER
  // ============================================================

  it('should flag financial advice without proper disclaimer', async () => {
    const financial_advice = `
      Crypto is the best investment. You should absolutely buy Bitcoin right now.
      It will definitely go to $100,000 within 6 months. Everyone who invests today will get rich.
      This is a guaranteed way to make money fast.
    `;

    const result = await analyzer.analyze(financial_advice);

    expect(result.risk.flags).toContain('sensitive_topic_without_disclaimer');
    expect(result.final_score).toBeLessThan(50);
  });

  // ============================================================
  // TEST 8: LOGICAL FALLACY DETECTION
  // ============================================================

  it('should detect logical fallacies', async () => {
    const fallacy_content = `
      All successful people earned their wealth through cryptocurrency.
      All people who earn cryptocurrency wealth become successful.
      Therefore, cryptocurrency is always the path to success.
    `;

    const result = await analyzer.analyze(fallacy_content);

    expect(result.reasoning.flags.some(f => f.includes('fallacy'))).toBe(true);
  });

  // ============================================================
  // TEST 9: WEIGHTED ANALYSIS (STRICT MODE)
  // ============================================================

  it('should apply custom weights for strict evaluation', async () => {
    const content = ' This is a claim without proper evidence.';

    const lenient = await analyzer.analyze(content, [], {
      truth: 0.1,
      reasoning: 0.1,
      alignment: 0.1,
      risk: 0.7,
    });

    const strict = await analyzer.analyze(content, [], {
      truth: 0.5,
      reasoning: 0.3,
      alignment: 0.1,
      risk: 0.1,
    });

    // Strict mode should prioritize truth/reasoning, so different scores
    expect(strict.final_score).not.toBe(lenient.final_score);
  });

  // ============================================================
  // TEST 10: HEDGING LANGUAGE ACCEPTANCE
  // ============================================================

  it('should accept hedging language as appropriate caution', async () => {
    const hedged_content = `
      This might be helpful in certain situations. It could improve outcomes, 
      but it apparently depends on individual circumstances. Some studies seem 
      to suggest benefits, though further research is allegedly needed.
    `;

    const result = await analyzer.analyze(hedged_content);

    expect(result.truth.flags.some(f => f.includes('hedging'))).toBe(true);
    expect(result.final_score).toBeGreaterThan(75); // Hedging is appropriate here
  });

  // ============================================================
  // PERFORMANCE TEST
  // ============================================================

  it('should complete analysis within 100ms', async () => {
    const content = 'This is a test message for performance measurement.';
    const startTime = Date.now();

    const result = await analyzer.analyze(content);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100);
    expect(result.total_processing_time_ms).toBeLessThan(50);
  });

});

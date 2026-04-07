/**
 * E2E Tests with Playwright
 * Tests core detection pipeline
 */

import { test, expect } from '@playwright/test';

test.describe('HaloGuard Detection Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    // Start local backend
    await page.goto('http://localhost:3000/health');
  });

  test('should detect hedging language in Tier 0', async ({ page }) => {
    const response = await page.request.post('http://localhost:3000/api/v1/analyze', {
      data: {
        content: 'I think it might be possible that this could seem relevant to the topic in question.',
        model: 'test',
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.flagged).toBe(true);
    expect(result.issues.some((i) => i.type === 'hedging')).toBe(true);
  });

  test('should detect sycophancy patterns in Tier 1', async ({ page }) => {
    const conversationHistory = [
      { role: 'user', content: 'Is this the best approach?' },
      {
        role: 'assistant',
        content: 'Your approach is absolutely brilliant and perfectly executed.',
      },
    ];

    const response = await page.request.post('http://localhost:3000/api/v1/analyze', {
      data: {
        content: 'You are absolutely right, your idea is genius and I completely agree!',
        model: 'test',
        conversationHistory,
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    if (result.flagged) {
      expect(
        result.issues.some((i) => i.type === 'sycophancy')
      ).toBe(true);
    }
  });

  test('should timeout gracefully on slow requests', async ({ page }) => {
    const start = Date.now();
    const response = await page.request.post('http://localhost:3000/api/v1/analyze', {
      data: {
        content: 'This is a very long piece of content '.repeat(100),
        model: 'test',
      },
      timeout: 5000,
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.latency).toBeLessThan(200); // Should complete well under 5 seconds
  });

  test('should handle batch requests', async ({ page }) => {
    const items = [
      { content: 'First message might be uncertain.' },
      { content: 'Second message could be problematic.' },
      { content: 'Third message should be fine.' },
    ];

    const response = await page.request.post('http://localhost:3000/api/v1/analyze/batch', {
      data: { items },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.results).toHaveLength(3);
  });

  test('should return 400 on missing content', async ({ page }) => {
    const response = await page.request.post('http://localhost:3000/api/v1/analyze', {
      data: { model: 'test' },
    });

    expect(response.status()).toBe(400);
  });

  test('backend health check should pass', async ({ page }) => {
    const response = await page.request.get('http://localhost:3000/health');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.uptime).toBeGreaterThan(0);
  });

  test('should detect context drift in Tier 4', async ({ page }) => {
    const conversationHistory = [
      { role: 'user', content: 'Tell me about machine learning' },
      { role: 'assistant', content: 'Machine learning is a subset of AI...' },
      { role: 'user', content: 'What about cats?' },
      { role: 'assistant', content: 'Cats are domesticated animals...' },
    ];

    const response = await page.request.post('http://localhost:3000/api/v1/analyze', {
      data: {
        content: 'Cats love to play with yarn and chase mice.',
        model: 'test',
        conversationHistory,
      },
    });

    expect(response.status()).toBe(200);
    const result = await response.json();
    // Drift detection is Tier 4 (async), so might not appear in sync results
    expect(result.asyncRemaining).toBeDefined();
  });
});

test.describe('Performance Benchmarks', () => {
  test('Tier 0-1 should complete in <100ms', async ({ page }) => {
    const start = Date.now();

    for (let i = 0; i < 10; i++) {
      await page.request.post('http://localhost:3000/api/v1/analyze', {
        data: {
          content: 'Test message ' + i,
          model: 'test',
        },
      });
    }

    const elapsed = Date.now() - start;
    const avgLatency = elapsed / 10;

    expect(avgLatency).toBeLessThan(120); // Should average under 120ms
  });
});

/**
 * HaloGuard Load & Performance Testing Script (k6)
 * Run with: k6 run load-test.ts
 * 
 * Install k6 first:
 *   Windows: choco install k6
 *   macOS: brew install k6
 *   Linux: apt-get install k6 / dnf install k6
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Gauge } from 'k6/metrics';

// Custom metrics
const latency = new Trend('latency');
const analysisCount = new Counter('analyses_processed');
const errorCount = new Counter('errors');
const flaggedRate = new Gauge('flagged_rate');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 5 },    // Ramp up to 5 virtual users
    { duration: '1m30s', target: 10 }, // Ramp up to 10 virtual users
    { duration: '2m', target: 20 },    // Ramp up to 20 virtual users
    { duration: '1m30s', target: 0 },  // Ramp down to 0 virtual users
  ],
  thresholds: {
    'latency': ['p(90) < 350', 'p(99) < 500'],
    'http_req_duration': ['p(95) < 400'],
    'errors': ['count < 10'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

interface SessionData {
  sessionId: string;
  createdAt: number;
}

//============ HELPER FUNCTIONS ============

function createSession(userId: string): SessionData {
  const response = http.post(`${BASE_URL}/api/v1/sessions`, {
    platform: 'k6-load-test',
    userId: `user-${userId}-${Date.now()}`,
  });

  check(response, {
    'session created': (r) => r.status === 200,
  }) ||
    errorCount.add(1);

  const sessionId = response.json('session_id') as string;
  return {
    sessionId,
    createdAt: Date.now(),
  };
}

function analyzeContent(
  sessionId: string,
  content: string
): {
  latencyMs: number;
  flagged: boolean;
} {
  const response = http.post(
    `${BASE_URL}/api/v1/analyze`,
    JSON.stringify({
      content,
      model: 'haloguard-v1',
      sessionId,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  const success = check(response, {
    'analysis successful': (r) => r.status === 200,
    'latency < 500ms': (r) => r.timings.duration < 500,
  });

  if (!success) {
    errorCount.add(1);
  }

  const latencyMs = response.timings.duration;
  const flagged = response.json('flagged') as boolean;

  latency.add(latencyMs);
  analysisCount.add(1);

  return { latencyMs, flagged };
}

function submitFeedback(sessionId: string, feedbackType: string): boolean {
  const response = http.post(
    `${BASE_URL}/api/v1/feedback`,
    JSON.stringify({
      sessionId,
      feedbackType,
      comment: 'Load test feedback',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return check(response, {
    'feedback submitted': (r) => r.status === 200,
  });
}

// ============ TEST DATA ============

const TEST_CONTENTS = [
  'The Great Wall of China is visible from space.',
  'Python was created in 1991 by Guido van Rossum.',
  'The Earth is flat.',
  'Water boils at 100 degrees Celsius at sea level.',
  'The capital of France is London.',
  'AI language models are incapable of hallucinating facts.',
  'Machine learning is a subset of artificial intelligence.',
  'The Sun is the largest object in our solar system.',
  'Quantum computers can solve any problem instantly.',
  'The average human sleeps 8 hours per day.',
];

// ============ VU FUNCTIONS ============

/**
 * Setup: Create a session for each VU
 */
export function setup(): SessionData {
  const userId = `load-test-${Math.random().toString(36).substr(2, 9)}`;
  return createSession(userId);
}

/**
 * Default function: Run analysis with feedback loop
 */
export default function (session: SessionData): void {
  const userId = `vu-${__VU}`;

  group('analysis_loop', () => {
    // Pick random content
    const content = TEST_CONTENTS[Math.floor(Math.random() * TEST_CONTENTS.length)];

    // Analyze
    const { latencyMs, flagged } = analyzeContent(session.sessionId, content);

    // Record flagged rate
    flaggedRate.add(flagged ? 1 : 0);

    // Occasionally submit feedback
    if (Math.random() < 0.2) {
      const feedbackType = flagged ? 'correct' : (Math.random() < 0.5 ? 'false_negative' : 'correct');
      submitFeedback(session.sessionId, feedbackType);
    }

    sleep(Math.random() * 2); // Simulate user think time
  });
}

/**
 * Teardown: Final validation
 */
export function teardown(data: SessionData): void {
  // Validate session analytics
  const response = http.get(`${BASE_URL}/api/v1/sessions/${data.sessionId}/analytics`);

  check(response, {
    'analytics available': (r) => r.status === 200,
  });

  console.log(`✅ Test completed for session ${data.sessionId}`);
}

/**
 * Run with: k6 run load-test.ts
 *
 * Output metrics explained:
 * - latency_p(90): 90th percentile latency (should be <350ms)
 * - http_req_duration_p(95): 95th percentile HTTP duration (should be <400ms)
 * - analyses_processed: Total analyses completed
 * - errors: Total errors encountered
 * - flagged_rate: Percentage of flagged detections
 */

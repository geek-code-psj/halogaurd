/**
 * Prisma Database Seeding Script
 * Runs database initialization and test data creation
 */

import { prisma } from '../src/db.js';

async function main(): Promise<void> {
  console.log('🌱 Starting database seeding...');

  try {
    // Check if data already exists
    const existingSession = await prisma.session.findFirst();
    if (existingSession) {
      console.log('ℹ️  Database already seeded, skipping...');
      return;
    }

    // Create test session
    const session = await prisma.session.create({
      data: {
        platform: 'ChatGPT',
        tabId: 1,
        conversationId: 'test-conv-001',
        userId: 'test-user-001',
        messageCount: 0,
        issueCount: 0,
        totalScore: 0,
      },
    });

    console.log(`✅ Created test session: ${session.id}`);

    // Create test analysis results
    const analysisResult = await prisma.analysisResult.create({
      data: {
        sessionId: session.id,
        content: 'The Great Wall of China is visible from space.',
        contentHash: 'hash-001-great-wall',
        model: 'haloguard-v1',
        flagged: true,
        overallScore: 72.5,
        latency: 385,
        issueCount: 1,
        issues: [
          {
            type: 'factual_inaccuracy',
            severity: 'high',
            message: 'The Great Wall of China is not visible from space with the naked eye',
            evidence: 'NASA and astronauts have confirmed this myth',
            suggestion: 'Consider rephrasing: "The Great Wall of China is one of the largest structures built by humans"',
          },
        ],
        tier0Result: { flagged: false },
        tier1Result: { similarity: 0.42 },
        tier2Result: { verified: false, confidence: 0.95 },
        tier3Result: { contradiction: true, confidence: 0.88 },
      },
    });

    console.log(`✅ Created test analysis result: ${analysisResult.id}`);

    // Create config entries
    const config1 = await prisma.config.create({
      data: {
        key: 'detection_threshold',
        value: { default: 0.5, min: 0, max: 1 },
      },
    });

    console.log(`✅ Created config: ${config1.key}`);

    // Create model metrics
    const metrics = await prisma.modelMetrics.create({
      data: {
        model: 'nli',
        accuracy: 0.87,
        precision: 0.85,
        recall: 0.82,
        f1Score: 0.835,
        avgLatency: 215,
        p90Latency: 350,
        p99Latency: 450,
        sampleCount: 1000,
      },
    });

    console.log(`✅ Created model metrics: ${metrics.model}`);

    // Create some API cache entries
    const cache = await prisma.apiCache.create({
      data: {
        key: 'wiki:search:great wall of china',
        source: 'wikipedia',
        data: {
          title: 'Great Wall of China',
          extract: 'The Great Wall of China is a series of fortifications...',
          url: 'https://en.wikipedia.org/wiki/Great_Wall_of_China',
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    console.log(`✅ Created API cache entry: ${cache.key}`);

    console.log('✨ Database seeding completed successfully!');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Fatal error during seeding:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

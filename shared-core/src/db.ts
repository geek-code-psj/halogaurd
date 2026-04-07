/**
 * HaloGuard Database Module
 * Handles Prisma client initialization and database utilities
 */

import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Initialize and cache Prisma client
 * Prevents multiple instances in development
 */
export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

/**
 * Database initialization and connection check
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Test the connection
    await prisma.$executeRaw`SELECT 1`;
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Disconnect from database (for graceful shutdown)
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Failed to disconnect from database:', error);
  }
}

/**
 * Clear expired cache entries
 */
export async function cleanupExpiredCache(): Promise<number> {
  const result = await prisma.apiCache.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  return result.count;
}

/**
 * Clear old sessions (older than 7 days)
 */
export async function cleanupOldSessions(daysOld: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.session.deleteMany({
    where: {
      lastActiveAt: {
        lt: cutoffDate,
      },
    },
  });
  return result.count;
}

/**
 * Get session by ID or create new one
 */
export async function getOrCreateSession(
  platform: string,
  tabId?: number,
  conversationId?: string,
  userId?: string
): Promise<string> {
  // Try to find existing active session
  if (tabId) {
    const existing = await prisma.session.findFirst({
      where: {
        tabId,
        platform,
        lastActiveAt: {
          gt: new Date(Date.now() - 12 * 60 * 60 * 1000), // Last 12 hours
        },
      },
    });

    if (existing) {
      // Update last active time
      await prisma.session.update({
        where: { id: existing.id },
        data: { lastActiveAt: new Date() },
      });
      return existing.id;
    }
  }

  // Create new session
  const session = await prisma.session.create({
    data: {
      platform,
      tabId,
      conversationId,
      userId,
    },
  });

  return session.id;
}

/**
 * Store analysis result
 */
export async function storeAnalysisResult(data: {
  sessionId: string;
  content: string;
  contentHash: string;
  model: string;
  flagged: boolean;
  overallScore: number;
  latency: number;
  issues: any[];
  tier0Result?: any;
  tier1Result?: any;
  tier2Result?: any;
  tier3Result?: any;
  tier4Result?: any;
}): Promise<string> {
  const result = await prisma.analysisResult.create({
    data: {
      sessionId: data.sessionId,
      content: data.content,
      contentHash: data.contentHash,
      model: data.model,
      flagged: data.flagged,
      overallScore: data.overallScore,
      latency: data.latency,
      issues: data.issues,
      issueCount: data.issues.length,
      tier0Result: data.tier0Result,
      tier1Result: data.tier1Result,
      tier2Result: data.tier2Result,
      tier3Result: data.tier3Result,
      tier4Result: data.tier4Result,
    },
  });

  // Update session statistics
  const session = await prisma.session.findUnique({
    where: { id: data.sessionId },
  });

  if (session) {
    await prisma.session.update({
      where: { id: data.sessionId },
      data: {
        messageCount: session.messageCount + 1,
        issueCount: session.issueCount + data.issues.length,
        totalScore: session.totalScore + data.overallScore,
        lastActiveAt: new Date(),
      },
    });
  }

  return result.id;
}

/**
 * Get session analytics
 */
export async function getSessionAnalytics(sessionId: string): Promise<{
  totalMessages: number;
  totalIssues: number;
  avgScore: number;
  flaggedCount: number;
  avgLatency: number;
}> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      analysisResults: true,
    },
  });

  if (!session) {
    return {
      totalMessages: 0,
      totalIssues: 0,
      avgScore: 0,
      flaggedCount: 0,
      avgLatency: 0,
    };
  }

  const flaggedCount = session.analysisResults.filter((r: any) => r.flagged).length;
  const avgScore = session.analysisResults.length > 0
    ? session.analysisResults.reduce((sum: number, r: any) => sum + r.overallScore, 0) / session.analysisResults.length
    : 0;
  const avgLatency = session.analysisResults.length > 0
    ? session.analysisResults.reduce((sum: number, r: any) => sum + r.latency, 0) / session.analysisResults.length
    : 0;

  return {
    totalMessages: session.messageCount,
    totalIssues: session.issueCount,
    avgScore: Math.round(avgScore * 100) / 100,
    flaggedCount,
    avgLatency: Math.round(avgLatency),
  };
}

/**
 * Submit user feedback
 */
export async function submitFeedback(data: {
  sessionId: string;
  analysisId?: string;
  feedbackType: 'false_positive' | 'false_negative' | 'incorrect_severity';
  accurate?: boolean;
  severity?: string;
  comment?: string;
  correction?: string;
}): Promise<string> {
  const feedback = await prisma.userFeedback.create({
    data: {
      sessionId: data.sessionId,
      analysisId: data.analysisId,
      feedbackType: data.feedbackType,
      accurate: data.accurate,
      severity: data.severity,
      comment: data.comment,
      correction: data.correction,
    },
  });

  return feedback.id;
}

/**
 * Get cached API response
 */
export async function getCachedResponse(key: string): Promise<any | null> {
  const cache = await prisma.apiCache.findUnique({
    where: { key },
  });

  if (!cache) {
    return null;
  }

  // Check if expired
  if (cache.expiresAt < new Date()) {
    await prisma.apiCache.delete({ where: { key } });
    return null;
  }

  // Update hit count
  await prisma.apiCache.update({
    where: { key },
    data: { hitCount: cache.hitCount + 1 },
  });

  return cache.data;
}

/**
 * Set cached API response
 */
export async function setCachedResponse(
  key: string,
  data: any,
  source: string,
  ttlHours: number = 24
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ttlHours);

  await prisma.apiCache.upsert({
    where: { key },
    create: {
      key,
      data,
      source,
      expiresAt,
    },
    update: {
      data,
      expiresAt,
      hitCount: 0,
    },
  });
}

/**
 * Record API usage
 */
export async function recordApiUsage(data: {
  endpoint: string;
  method: string;
  statusCode: number;
  latency: number;
  cached?: boolean;
  userId?: string;
  platform?: string;
}): Promise<void> {
  await prisma.apiUsage.create({
    data: {
      endpoint: data.endpoint,
      method: data.method,
      statusCode: data.statusCode,
      latency: data.latency,
      cached: data.cached || false,
      userId: data.userId,
      platform: data.platform,
    },
  });
}

/**
 * Get API statistics
 */
export async function getApiStatistics(hoursBack: number = 24): Promise<{
  totalRequests: number;
  avgLatency: number;
  cacheHitRate: number;
  errorRate: number;
}> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - hoursBack);

  const usageData = await prisma.apiUsage.findMany({
    where: {
      createdAt: {
        gte: cutoffTime,
      },
    },
  });

  const totalRequests = usageData.length;
  const avgLatency = totalRequests > 0
    ? Math.round(usageData.reduce((sum: number, r: any) => sum + r.latency, 0) / totalRequests)
    : 0;

  const cachedRequests = usageData.filter((r: any) => r.cached).length;
  const cacheHitRate = totalRequests > 0 ? Math.round((cachedRequests / totalRequests) * 100) : 0;

  const errorRequests = usageData.filter((r: any) => r.statusCode >= 400).length;
  const errorRate = totalRequests > 0 ? Math.round((errorRequests / totalRequests) * 100) : 0;

  return {
    totalRequests,
    avgLatency,
    cacheHitRate,
    errorRate,
  };
}

export default prisma;

/**
 * HaloGuard Database Module
 * Handles Prisma client initialization and database utilities
 */

import { PrismaClient } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

/**
 * Initialize and cache Prisma client (lazy - created on first use)
 * Defers creation until DATABASE_URL is available at runtime
 * Prevents multiple instances in development
 */
let _prismaInstance: PrismaClient | undefined;

function getPrismaClient(): PrismaClient {
  if (_prismaInstance) return _prismaInstance;
  
  _prismaInstance = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
  });

  if (process.env.NODE_ENV !== 'production') {
    (global as any).prisma = _prismaInstance;
  }

  return _prismaInstance;
}

// Lazy-loaded proxy to prevent initialization at module load
export const prisma = new Proxy({} as PrismaClient, {
  get: (_target, prop) => {
    if (prop === '_get' || prop === 'toJSON' || prop === Symbol.toStringTag) {
      return undefined;
    }
    return (getPrismaClient() as any)[prop];
  },
}) as unknown as PrismaClient;

/**
 * Database initialization and connection check with retry logic
 * Gracefully handles connection failures - warns but doesn't crash
 */
export async function initializeDatabase(throwOnFailure: boolean = false): Promise<boolean> {
  const MAX_RETRIES = 10;
  const INITIAL_DELAY = 1000; // 1 second

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Test the connection
      await prisma.$executeRaw`SELECT 1`;
      console.log('✅ Database connection established');
      return true; // Success!
    } catch (error) {
      const errorMsg = (error as Error).message || String(error);
      
      if (attempt === MAX_RETRIES) {
        // Final attempt failed
        console.error('❌ Failed to connect to database after', MAX_RETRIES, 'attempts');
        console.error('Database error:', errorMsg);
        console.warn('⚠️  Database connection failed - check Railway environment variables');
        
        if (throwOnFailure) {
          throw error;
        }
        return false; // Indicate failure but don't crash
      }

      // Calculate exponential backoff delay
      const delay = INITIAL_DELAY * Math.pow(2, attempt - 1);
      console.warn(`⚠️  Connection attempt ${attempt}/${MAX_RETRIES} failed (${errorMsg}), retrying in ${delay}ms...`);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return false;
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
  console.log('[getOrCreateSession] ENTRY', { platform, tabId, conversationId, userId });
  
  try {
    console.log('[getOrCreateSession] Prisma client initialization check');
    const prismaClient = getPrismaClient();
    console.log('[getOrCreateSession] Prisma client ready');
    
    // Try to find existing active session
    if (tabId) {
      console.log('[getOrCreateSession] Searching for existing session with tabId:', tabId);
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
        console.log('[getOrCreateSession] Found existing session, updating lastActiveAt');
        // Update last active time
        await prisma.session.update({
          where: { id: existing.id },
          data: { lastActiveAt: new Date() },
        });
        console.log('[getOrCreateSession] SUCCESS: Returning existing session', existing.id);
        return existing.id;
      }
      console.log('[getOrCreateSession] No existing session found for tabId:', tabId);
    }

    // Create new session
    console.log('[getOrCreateSession] Creating new session with data:', { platform, tabId, conversationId, userId });
    const session = await prisma.session.create({
      data: {
        platform,
        tabId,
        conversationId,
        userId,
      },
    });

    console.log('[getOrCreateSession] SUCCESS: Created new session', session.id);
    return session.id;
  } catch (error: any) {
    console.error('[getOrCreateSession] EXCEPTION:', {
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
      platform,
      tabId,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
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

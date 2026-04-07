/**
 * Database Manager
 * Centralized database access and management
 */

import { prisma } from '../db';

/**
 * Get database connection
 */
export function getDb() {
  return prisma;
}

/**
 * Get user subscription with all details
 */
export async function getUserSubscription(userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
  });
}

/**
 * Get or create user subscription (default free)
 */
export async function getOrCreateUserSubscription(userId: string) {
  let subscription = await getUserSubscription(userId);

  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        userId,
        tier: 'free',
        status: 'active',
        maxApiCalls: 10, // Free tier default
      },
    });
  }

  return subscription;
}

/**
 * Update subscription tier
 */
export async function updateSubscriptionTier(
  userId: string,
  tier: 'free' | 'pro' | 'enterprise'
) {
  const tierLimits: Record<string, number> = {
    'free': 10,
    'pro': 1000,
    'enterprise': 10000,
  };

  return prisma.subscription.update({
    where: { userId },
    data: {
      tier,
      maxApiCalls: tierLimits[tier],
    },
  });
}

/**
 * Increment API calls used
 */
export async function incrementApiCalls(userId: string, count = 1) {
  return prisma.subscription.update({
    where: { userId },
    data: {
      apiCallsUsed: {
        increment: count,
      },
    },
  });
}

/**
 * Get API usage analytics
 */
export async function getApiUsageAnalytics(userId: string, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return prisma.apiUsage.findMany({
    where: {
      userId,
      createdAt: {
        gte: startDate,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get billing history
 */
export async function getBillingHistory(userId: string, limit = 50) {
  return prisma.billingHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Record billing event
 */
export async function recordBillingEvent(
  userId: string,
  amount: number,
  description: string,
  status: 'pending' | 'completed' | 'failed' = 'pending'
) {
  return prisma.billingHistory.create({
    data: {
      userId,
      amount,
      currency: 'USD',
      description,
      status,
    },
  });
}

// Export database instance
export { prisma } from '../db';

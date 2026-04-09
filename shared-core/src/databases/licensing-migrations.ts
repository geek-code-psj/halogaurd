/**
 * PHASE 3 EPIC 4: Database Migrations for Licensing & Subscription
 * Schema is managed through Prisma ORM
 * 
 * Database models:
 * - User: Core user identity
 * - Subscription: User subscription/pricing tier
 * - BillingHistory: Transaction records
 * - PremiumFeature: Feature entitlements
 * - APIUsage: Usage tracking for analytics
 */

import { prisma } from '../db';
import { logger } from '../utils/logger';

/**
 * Initialize licensing tables through Prisma
 */
export async function initializeLicensingTables(): Promise<void> {
  try {
    logger.info('[Migration] Licensing tables initialized via Prisma');
    // Tables are created automatically by Prisma during migration
  } catch (error) {
    logger.error('[Migration] Failed to initialize licensing tables:', error);
    throw error;
  }
}

/**
 * Seed free subscriptions for all users
 */
export async function seedFreeSubscriptions(): Promise<void> {
  try {
    logger.info('[Migration] Seeding free subscriptions...');
    
    const users = await prisma.user.findMany();
    
    for (const user of users) {
      await prisma.subscription.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          tier: 'free',
          status: 'active',
          maxApiCalls: 10,
        },
        update: {},
      });
    }
    
    logger.info(`[Migration] Seeded ${users.length} free subscriptions`);
  } catch (error) {
    logger.error('[Migration] Failed to seed subscriptions:', error);
  }
}

/**
 * Reset monthly API quotas
 */
export async function resetMonthlyQuotas(): Promise<void> {
  try {
    logger.info('[Migration] Resetting monthly API quotas...');
    
    await prisma.subscription.updateMany({
      data: {
        apiCallsUsed: 0,
      },
    });
    
    logger.info('[Migration] Monthly quotas reset');
  } catch (error) {
    logger.error('[Migration] Failed to reset quotas:', error);
  }
}

/**
 * Clean up old usage records
 */
export async function cleanupOldUsageRecords(): Promise<void> {
  try {
    logger.info('[Migration] Cleaning up old API usage records...');
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const deleted = await prisma.apiUsage.deleteMany({
      where: {
        createdAt: {
          lt: ninetyDaysAgo,
        },
      },
    });
    
    logger.info(`[Migration] Deleted ${deleted.count} old usage records`);
  } catch (error) {
    logger.error('[Migration] Failed to cleanup usage records:', error);
  }
}

/**
 * Archive old billing records
 */
export async function archiveOldBillingRecords(): Promise<void> {
  try {
    logger.info('[Migration] Archiving old billing records...');
    
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    await prisma.billingHistory.updateMany({
      where: {
        createdAt: {
          lt: oneYearAgo,
        },
        status: { not: 'archived' },
      },
      data: {
        status: 'archived',
      },
    });
    
    logger.info('[Migration] Old billing records archived');
  } catch (error) {
    logger.error('[Migration] Failed to archive billing records:', error);
  }
}

/**
 * Drop all licensing tables (DANGEROUS - for testing only)
 */
export async function dropLicensingTables(): Promise<void> {
  try {
    logger.warn('[Migration] ⚠️  DROPPING ALL LICENSING TABLES');
    
    await prisma.billingHistory.deleteMany({});
    await prisma.apiUsage.deleteMany({});
    await prisma.subscription.deleteMany({});
    
    logger.info('[Migration] ✅ Licensing tables dropped');
  } catch (error) {
    logger.error('[Migration] Failed to drop tables:', error);
  }
}

// Export Prisma instance
export { prisma };

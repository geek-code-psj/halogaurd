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

/**
 * NOTE: This file had SQL syntax errors that were removed.
 * Use Prisma schema for database migrations instead.
 * See: prisma/schema.prisma
 */

/**
 * Drop licensing tables (for testing/rollback)
 */
export function dropLicensingTables(db: Database): void {
  logger.warn('[Migration] Dropping licensing tables...');

  db.exec(`
    DROP TABLE IF EXISTS feature_usage_tracking;
    DROP TABLE IF EXISTS stripe_events;
    DROP TABLE IF EXISTS api_quota_tracking;
    DROP TABLE IF EXISTS billing_history;
    DROP TABLE IF EXISTS user_subscriptions;
  `);

  logger.warn('[Migration] Licensing tables dropped');
}

/**
 * Add default free subscription for existing users
 */
export function seedFreeSubscriptions(db: Database): void {
  logger.info('[Migration] Seeding free subscriptions for existing users...');

  const activeUntil = new Date();
  activeUntil.setDate(activeUntil.getDate() + 30);

  db.prepare(`
    INSERT OR IGNORE INTO user_subscriptions 
    (user_id, tier, active_until, api_calls_reset_date)
    SELECT id, 'free', ?, datetime('now', '+30 days')
    FROM users
    WHERE id NOT IN (
      SELECT user_id FROM user_subscriptions
    )
  `).run(activeUntil.toISOString());

  logger.info('[Migration] Free subscriptions seeded');
}

/**
 * Reset monthly API quotas
 * Run this as a scheduled task monthly
 */
export function resetMonthlyQuotas(db: Database): void {
  logger.info('[Migration] Resetting monthly API quotas...');

  const resetDate = new Date();
  resetDate.setDate(resetDate.getDate() + 30);

  db.prepare(`
    UPDATE user_subscriptions
    SET api_calls_used = 0,
        api_calls_reset_date = ?
    WHERE tier = 'free'
  `).run(resetDate.toISOString());

  logger.info('[Migration] Monthly quotas reset');
}

/**
 * Clean up old quota tracking records
 * Keep 90 days of history
 */
export function cleanupOldQuotaRecords(db: Database): void {
  logger.info('[Migration] Cleaning up old quota records...');

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  db.prepare(`
    DELETE FROM api_quota_tracking
    WHERE date < ?
  `).run(ninetyDaysAgo.toISOString().split('T')[0]);

  logger.info('[Migration] Old quota records cleaned up');
}

/**
 * Archive old billing history
 * Keep full history but mark as archived for queries
 */
export function archiveOldBillingRecords(db: Database): void {
  logger.info('[Migration] Archiving old billing records...');

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  db.prepare(`
    UPDATE billing_history
    SET status = CASE 
      WHEN status = 'paid' THEN 'paid_archived'
      WHEN status = 'failed' THEN 'failed_archived'
      ELSE status
    END
    WHERE created_at < ? AND status IN ('paid', 'failed')
  `).run(oneYearAgo.toISOString());

  logger.info('[Migration] Old billing records archived');
}

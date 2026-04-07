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
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'enterprise')),
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      active_until DATETIME NOT NULL,
      api_calls_used INTEGER NOT NULL DEFAULT 0,
      api_calls_reset_date DATETIME NOT NULL DEFAULT (datetime('now', '+30 days')),
      kb_records_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Billing History
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      stripe_invoice_id TEXT UNIQUE,
      stripe_subscription_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL CHECK(status IN ('pending', 'paid', 'failed', 'refunded')),
      description TEXT,
      period_start DATETIME,
      period_end DATETIME,
      due_date DATETIME,
      paid_date DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // API Quota Tracking (hourly/daily limits)
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_quota_tracking (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      date DATE NOT NULL,
      calls_used INTEGER NOT NULL DEFAULT 0,
      calls_limit INTEGER NOT NULL,
      reset_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Stripe Events Log (for webhook audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      stripe_event_id TEXT UNIQUE NOT NULL,
      event_type TEXT NOT NULL,
      user_id TEXT,
      customer_id TEXT,
      subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'processed' CHECK(status IN ('pending', 'processed', 'failed')),
      payload TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Feature Usage Tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_usage_tracking (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      feature_id TEXT NOT NULL,
      detection_tier INTEGER NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 1,
      last_used DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, feature_id, detection_tier),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier 
    ON user_subscriptions(tier);
    
    CREATE INDEX IF NOT EXISTS idx_user_subscriptions_active_until 
    ON user_subscriptions(active_until);
    
    CREATE INDEX IF NOT EXISTS idx_billing_history_user_id 
    ON billing_history(user_id);
    
    CREATE INDEX IF NOT EXISTS idx_billing_history_status 
    ON billing_history(status);
    
    CREATE INDEX IF NOT EXISTS idx_billing_history_created_at 
    ON billing_history(created_at);
    
    CREATE INDEX IF NOT EXISTS idx_api_quota_tracking_user_date 
    ON api_quota_tracking(user_id, date);
    
    CREATE INDEX IF NOT EXISTS idx_stripe_events_user_id 
    ON stripe_events(user_id);
    
    CREATE INDEX IF NOT EXISTS idx_stripe_events_event_type 
    ON stripe_events(event_type);
    
    CREATE INDEX IF NOT EXISTS idx_feature_usage_tracking_user_id 
    ON feature_usage_tracking(user_id);
  `);

  logger.info('[Migration] Licensing tables created successfully');
}

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

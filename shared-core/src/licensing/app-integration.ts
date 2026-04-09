/**
 * PHASE 3 EPIC 4: Application Integration Setup
 * Shows how to integrate licensing system into main Express app
 */

import express, { Express, Request } from 'express';
import { logger } from '../utils/logger';
import { subscriptionRouter } from './subscription-routes';
import { createWebhookHandler } from './stripe-webhook';
import {
  loadSubscription,
  checkSubscriptionValidity,
  trackApiUsage,
  tierBasedRateLimit,
} from './quota-middleware';
import { initializeLicensingTables, seedFreeSubscriptions } from '../databases/licensing-migrations';

/**
 * Initialize licensing system
 * Call this during app startup
 */
export async function initializeLicensing(app: Express): Promise<void> {
  logger.info('[Init] Initializing licensing system...');

  try {
    // 1. Create database tables
    logger.info('[Init] Creating licensing tables...');
    await initializeLicensingTables();

    // 2. Seed free subscriptions for existing users
    logger.info('[Init] Seeding free subscriptions...');
    await seedFreeSubscriptions();

    // 3. Register webhook handler BEFORE other middleware
    // Must use raw body parser for signature verification
    app.post(
      '/webhooks/stripe',
      express.raw({ type: 'application/json' }),
      createWebhookHandler(process.env.STRIPE_SECRET_KEY || '', process.env.STRIPE_WEBHOOK_SECRET || '')
    );

    // 4. Register global licensing middleware
    app.use(loadSubscription());
    app.use(checkSubscriptionValidity());
    app.use(trackApiUsage());

    // 5. Register subscription routes
    app.use('/api/subscription', subscriptionRouter);

    logger.info('[Init] Licensing system initialized successfully');
  } catch (error) {
    logger.error('[Init] Failed to initialize licensing system:', error);
    throw error;
  }
}

/**
 * Example: Protect detection endpoint with licensing
 */
export function registerDetectionRoutes(app: Express): void {
  const { detectController } = require('../controllers/detect-controller');

  // Tier 0-2: Available to free users
  app.post(
    '/api/detect/tier-0',
    tierBasedRateLimit(100, 60 * 60 * 1000), // 100 req/hr adjusted by tier
    detectController.detectTier0
  );

  app.post(
    '/api/detect/tier-1',
    tierBasedRateLimit(100, 60 * 60 * 1000),
    detectController.detectTier1
  );

  app.post(
    '/api/detect/tier-2',
    tierBasedRateLimit(100, 60 * 60 * 1000),
    detectController.detectTier2
  );

  // Tier 3-4: Pro-only
  app.post(
    '/api/detect/tier-3',
    tierBasedRateLimit(100, 60 * 60 * 1000),
    (req, res, next) => {
      const subscription = (req as any).subscription;
      if (subscription?.tier === 'free') {
        return res.status(403).json({
          error: 'Tier 3 detection requires Pro subscription',
          upgradeUrl: '/api/subscription/upgrade',
        });
      }
      next();
    },
    detectController.detectTier3
  );

  app.post(
    '/api/detect/tier-4',
    tierBasedRateLimit(100, 60 * 60 * 1000),
    (req, res, next) => {
      const subscription = (req as any).subscription;
      if (subscription?.tier === 'free') {
        return res.status(403).json({
          error: 'Tier 4 detection requires Pro subscription',
          upgradeUrl: '/api/subscription/upgrade',
        });
      }
      next();
    },
    detectController.detectTier4
  );
}

/**
 * Example: Register knowledge base endpoints with quota checks
 */
export function registerKnowledgeBaseRoutes(app: Express): void {
  const { kbController } = require('../controllers/kb-controller');

  // Custom KB management (limits based on tier)
  app.post(
    '/api/kb/custom/create',
    (req, res, next) => {
      const subscription = (req as any).subscription;
      const plan = require('./license-manager').SUBSCRIPTION_PLANS[subscription?.tier];

      if (!plan) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check KB record limit
      // TODO: Query current custom KB record count
      const currentRecords = 0;
      if (currentRecords >= plan.maxCustomKBRecords && subscription.tier === 'free') {
        return res.status(403).json({
          error: 'Custom KB records limit reached',
          limit: plan.maxCustomKBRecords,
          current: currentRecords,
          upgradeUrl: '/api/subscription/upgrade',
        });
      }

      next();
    },
    kbController.createCustomKB
  );

  app.get('/api/kb/custom', kbController.listCustomKB);
  app.delete('/api/kb/custom/:id', kbController.deleteCustomKB);
}

/**
 * Environment Variables Required
 */
export const requiredEnvVars = [
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

/**
 * Verify environment setup
 */
export function verifyLicensingConfig(): boolean {
  logger.info('[Config] Verifying licensing configuration...');

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(`[Config] Missing environment variables: ${missing.join(', ')}`);
    logger.warn('[Config] Licensing features will be unavailable');
    return false;
  }

  logger.info('[Config] Licensing configuration verified');
  return true;
}

/**
 * Startup Example
 */
export async function setupApp(): Promise<Express> {
  const app = express();

  // Basic middleware
  app.use(express.json());

  // Verify config
  const configOk = verifyLicensingConfig();

  // Initialize licensing if configured
  if (configOk) {
    await initializeLicensing(app);
  }

  // Register routes
  registerDetectionRoutes(app);
  registerKnowledgeBaseRoutes(app);

  return app;
}

/**
 * Scheduled Tasks for Licensing
 * Run these via node-cron or similar
 */
export function setupScheduledTasks(): void {
  const cron = require('node-cron');
  const { getLicenseManager } = require('./license-manager');
  const { resetMonthlyQuotas, cleanupOldUsageRecords, archiveOldBillingRecords } = require('../databases/licensing-migrations');

  // Monthly quota reset: 1st day of month at 00:00 UTC
  cron.schedule('0 0 1 * *', async () => {
    logger.info('[Cron] Running monthly quota reset...');
    try {
      await resetMonthlyQuotas();
      logger.info('[Cron] Monthly quota reset completed');
    } catch (error) {
      logger.error('[Cron] Monthly quota reset failed:', error);
    }
  });

  // Cleanup old quota records: Daily at 02:00 UTC
  cron.schedule('0 2 * * *', async () => {
    logger.info('[Cron] Cleaning up old quota records...');
    try {
      await cleanupOldUsageRecords();
      logger.info('[Cron] Quota cleanup completed');
    } catch (error) {
      logger.error('[Cron] Quota cleanup failed:', error);
    }
  });

  // Archive old billing: Weekly on Monday at 03:00 UTC
  cron.schedule('0 3 * * 1', async () => {
    logger.info('[Cron] Archiving old billing records...');
    try {
      await archiveOldBillingRecords();
      logger.info('[Cron] Billing archive completed');
    } catch (error) {
      logger.error('[Cron] Billing archive failed:', error);
    }
  });

  // Re-initialize Stripe connection on startup
  cron.schedule('@reboot', async () => {
    logger.info('[Cron] Initializing Stripe connection...');
    try {
      const licenseManager = await getLicenseManager();
      logger.info('[Cron] Stripe connection ready');
    } catch (error) {
      logger.error('[Cron] Stripe initialization failed:', error);
    }
  });
}

/**
 * Complete Server Example
 */
export async function startServer(): Promise<void> {
  const PORT = process.env.PORT || 3000;

  try {
    const app = await setupApp();

    // Setup scheduled tasks
    setupScheduledTasks();

    // Start server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  startServer().catch((error) => {
    logger.error('[Main] Server error:', error);
    process.exit(1);
  });
}

export default { initializeLicensing, registerDetectionRoutes, registerKnowledgeBaseRoutes };

/**
 * PHASE 3 EPIC 4: Subscription Quota Middleware
 * Enforces tier-based restrictions on API usage and feature access
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getLicenseManager, SUBSCRIPTION_PLANS } from './license-manager';
import { prisma } from '../db';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  subscription?: {
    tier: 'free' | 'pro' | 'enterprise';
    apiCallsUsed: number;
    activeUntil: Date;
  };
}

/**
 * Middleware: Load user subscription
 * Attaches subscription info to request
 */
export function loadSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return next(); // Skip if not authenticated
      }

      // Query user_subscriptions table
      const dbSubscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      // Default to free tier if no subscription found
      const tier = dbSubscription?.tier || 'free';
      const apiCallsUsed = dbSubscription?.apiCallsUsed || 0;
      const activeUntil = dbSubscription?.activeUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      req.subscription = {
        tier: tier as 'free' | 'pro' | 'enterprise',
        apiCallsUsed,
        activeUntil,
      };

      next();
    } catch (error) {
      logger.error('[Quota] Error loading subscription:', error);
      res.status(500).json({ error: 'Failed to load subscription' });
    }
  };
}

/**
 * Middleware: Check API quota
 * Ensures user hasn't exceeded monthly API calls
 */
export function checkApiQuota() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const subscription = req.subscription;

      if (!userId || !subscription) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const plan = SUBSCRIPTION_PLANS[subscription.tier];

      if (subscription.apiCallsUsed >= plan.maxApiCalls) {
        logger.warn(
          `[Quota] API quota exceeded for ${userId}: ` +
          `${subscription.apiCallsUsed}/${plan.maxApiCalls}`
        );

        return res.status(429).json({
          error: 'API quota exceeded',
          tier: subscription.tier,
          upgradeTo: 'pro',
        });
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error checking API quota:', error);
      res.status(500).json({ error: 'Failed to check quota' });
    }
  };
}

/**
 * Middleware: Check tier-specific features
 * Blocks certain detection tiers for free users
 */
export function checkFeatureTier(requiredTier: number) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const subscription = req.subscription;

      if (!subscription) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Tier 0-2 on Free, all on Pro/Enterprise
      let maxAllowedTier: number;
      if (subscription.tier === 'free') {
        maxAllowedTier = 2;
      } else {
        maxAllowedTier = 4;
      }

      if (requiredTier > maxAllowedTier) {
        logger.warn(
          `[Quota] Tier ${requiredTier} feature blocked for ${subscription.tier} user`
        );

        return res.status(403).json({
          error: `Tier ${requiredTier} detection requires Pro subscription`,
          currentTier: subscription.tier,
          requiredTier: 'pro',
          upgradeUrl: '/api/subscription/upgrade',
        });
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error checking feature tier:', error);
      res.status(500).json({ error: 'Failed to check tier' });
    }
  };
}

/**
 * Middleware: Require pro subscription
 * Blocks endpoint for free users
 */
export function requireProSubscription() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const subscription = req.subscription;

      if (!subscription) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (subscription.tier === 'free') {
        logger.warn('[Quota] Pro-only endpoint accessed by free user');

        return res.status(403).json({
          error: 'This feature requires a Pro subscription',
          tier: subscription.tier,
          upgradeUrl: '/api/subscription/upgrade',
        });
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error checking pro subscription:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}

/**
 * Middleware: Require enterprise subscription
 * For self-hosted or SLA features
 */
export function requireEnterpriseSubscription() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const subscription = req.subscription;

      if (!subscription) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (subscription.tier !== 'enterprise') {
        logger.warn('[Quota] Enterprise-only endpoint accessed by non-enterprise user');

        return res.status(403).json({
          error: 'This feature requires an Enterprise subscription',
          tier: subscription.tier,
          contactSales: 'sales@haloguard.ai',
        });
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error checking enterprise subscription:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}

/**
 * Middleware: Track API usage
 * Increments API call counter in database
 */
export function trackApiUsage() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;

    if (!userId) {
      return next();
    }

    // Wrap res.json to intercept successful responses
    const originalJson = res.json;
    res.json = function (data) {
      setImmediate(async () => {
        try {
          // Increment api_calls_used atomically in user_subscriptions
          await prisma.subscription.updateMany({
            where: { userId },
            data: {
              apiCallsUsed: {
                increment: 1,
              },
            },
          });

          // Also track in api_usage for analytics
          await prisma.apiUsage.create({
            data: {
              endpoint: req.path,
              method: req.method,
              userId,
              statusCode: res.statusCode,
              latency: Date.now() - (req as any).startTime || 0,
              cached: false,
            },
          }).catch((err: Error) => {
            // Don't fail the request if analytics logging fails
            logger.debug('[Quota] Failed to log API usage:', err);
          });

          logger.debug(`[Quota] Tracked API call for ${userId}`);
        } catch (error) {
          logger.error('[Quota] Error tracking API usage:', error);
          // Continue without failing - don't block the response
        }
      });

      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * Middleware: Check subscription validity
 * Ensures subscription hasn't expired
 */
export function checkSubscriptionValidity() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const subscription = req.subscription;

      if (!subscription) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (subscription.tier === 'free') {
        return next(); // Free subscriptions don't expire
      }

      const now = new Date();
      if (now > subscription.activeUntil) {
        logger.warn('[Quota] Subscription expired');

        return res.status(403).json({
          error: 'Subscription has expired',
          expiredAt: subscription.activeUntil,
          action: 'renew',
        });
      }

      // Warn if expiring soon (within 7 days)
      const sevenDaysAway = new Date();
      sevenDaysAway.setDate(sevenDaysAway.getDate() + 7);

      if (now > new Date(subscription.activeUntil.getTime() - 7 * 24 * 60 * 60 * 1000)) {
        res.setHeader('X-Subscription-Expires-Soon', subscription.activeUntil.toISOString());
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error checking subscription validity:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
    }
  };
}

/**
 * Middleware: Rate limit by tier
 * Different rate limits for different subscription tiers
 * Uses in-memory store for performance, resets on restart
 */
export function tierBasedRateLimit(requests: number, windowMs: number) {
  const stores = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const subscription = req.subscription;

      if (!userId || !subscription) {
        return next();
      }

      // Adjust limit based on tier
      let tierLimit = requests;
      if (subscription.tier === 'pro' || subscription.tier === 'enterprise') {
        tierLimit = requests * 10; // 10x rate limit for paid users
      }

      const now = Date.now();
      const store = stores.get(userId) || { count: 0, resetTime: now + windowMs };

      // Reset if window expired
      if (now > store.resetTime) {
        store.count = 0;
        store.resetTime = now + windowMs;
      }

      store.count++;
      stores.set(userId, store);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', tierLimit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, tierLimit - store.count));
      res.setHeader('X-RateLimit-Reset', store.resetTime);

      if (store.count > tierLimit) {
        logger.warn(`[Quota] Rate limit exceeded for ${userId}`);

        return res.status(429).json({
          error: 'Rate limit exceeded',
          tier: subscription.tier,
          limit: tierLimit,
          resetAt: new Date(store.resetTime),
        });
      }

      next();
    } catch (error) {
      logger.error('[Quota] Error in rate limiting:', error);
      next(); // Don't block on error
    }
  };
}



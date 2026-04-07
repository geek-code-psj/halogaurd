/**
 * PHASE 3 EPIC 4: API Routes for Subscription Management
 * Handles: GET subscription, POST upgrade, POST downgrade, GET billing history
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getLicenseManager, SUBSCRIPTION_PLANS } from './license-manager';
import { prisma } from '../db';
import { logger } from '../utils/logger';

export const subscriptionRouter = Router();

/**
 * GET /api/subscription/status
 * Get current user's subscription status
 */
subscriptionRouter.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Query user_subscriptions table
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      // User has no subscription yet, return free tier defaults
      return res.json({
        tier: 'free',
        plan: SUBSCRIPTION_PLANS['free'].name,
        activeUntil: null,
        features: SUBSCRIPTION_PLANS['free'].features,
        usage: {
          apiCalls: {
            used: 0,
            limit: SUBSCRIPTION_PLANS['free'].maxApiCalls,
            percentage: 0,
          },
        },
      });
    }

    const tier = subscription.tier as 'free' | 'pro' | 'enterprise';
    const plan = SUBSCRIPTION_PLANS[tier];

    return res.json({
      tier: subscription.tier,
      plan: plan.name,
      activeUntil: subscription.activeUntil,
      features: plan.features,
      usage: {
        apiCalls: {
          used: subscription.apiCallsUsed,
          limit: plan.maxApiCalls,
          percentage: (subscription.apiCallsUsed / plan.maxApiCalls) * 100,
        },
      },
    });
  } catch (error) {
    logger.error('[Subscription] Error fetching status:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

/**
 * GET /api/subscription/plans
 * Get available subscription plans
 */
subscriptionRouter.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = Object.values(SUBSCRIPTION_PLANS).map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      features: plan.features,
    }));

    return res.json({ plans });
  } catch (error) {
    logger.error('[Subscription] Error fetching plans:', error);
    return res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * POST /api/subscription/upgrade
 * Upgrade to a premium tier
 * Body: { tier: 'pro' }
 */
subscriptionRouter.post('/upgrade', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { tier } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!tier || !SUBSCRIPTION_PLANS[tier as 'free' | 'pro' | 'enterprise']) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    if (tier === 'free') {
      return res.status(400).json({ error: 'Cannot upgrade to free tier' });
    }

    const licenseManager = await getLicenseManager();
    const email = req.user?.email || '';
    const name = req.user?.name || '';

    // Get or create Stripe customer
    const customerId = await licenseManager.getOrCreateCustomer(userId, email, name);

    // Create subscription
    const { subscriptionId, clientSecret } = await licenseManager.createSubscription(
      userId,
      customerId,
      tier as any
    );

    // Save subscription to database
    const dbSubscription = await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier,
        status: 'payment_required',
        stripeSubscriptionId: subscriptionId,
        maxApiCalls: SUBSCRIPTION_PLANS[tier as 'free' | 'pro' | 'enterprise'].maxApiCalls,
      },
      update: {
        tier,
        status: 'payment_required',
        stripeSubscriptionId: subscriptionId,
        maxApiCalls: SUBSCRIPTION_PLANS[tier as 'free' | 'pro' | 'enterprise'].maxApiCalls,
      },
    });

    logger.info(`[Subscription] User ${userId} initiated upgrade to ${tier}`);

    return res.json({
      subscriptionId,
      clientSecret,
      status: 'payment_required',
      nextAction: 'confirm_payment',
    });
  } catch (error) {
    logger.error('[Subscription] Error upgrading subscription:', error);
    return res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

/**
 * POST /api/subscription/downgrade
 * Downgrade to free tier
 */
subscriptionRouter.post('/downgrade', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Query current subscription
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!currentSubscription || currentSubscription.tier === 'free') {
      return res.status(400).json({ error: 'Already on free tier' });
    }

    const licenseManager = await getLicenseManager();

    // Cancel Stripe subscription
    if (currentSubscription.stripeSubscriptionId) {
      await licenseManager.cancelSubscription(currentSubscription.stripeSubscriptionId);
    }

    // Update database to free tier
    const updated = await prisma.subscription.update({
      where: { userId },
      data: {
        tier: 'free',
        status: 'active',
        apiCallsUsed: 0,
        maxApiCalls: SUBSCRIPTION_PLANS['free'].maxApiCalls,
        stripeSubscriptionId: null,
        cancelledAt: new Date(),
      },
    });

    logger.info(`[Subscription] User ${userId} downgraded to free tier`);

    return res.json({ status: 'downgraded', tier: updated.tier });
  } catch (error) {
    logger.error('[Subscription] Error downgrading subscription:', error);
    return res.status(500).json({ error: 'Failed to downgrade subscription' });
  }
});

/**
 * POST /api/subscription/payment-intent
 * Get or create payment intent for confirming payment
 */
subscriptionRouter.post('/payment-intent', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { subscriptionId } = req.body;

    if (!userId || !subscriptionId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const licenseManager = await getLicenseManager();

    // Retrieve payment intent from Stripe using subscription ID
    const clientSecret = await licenseManager.getPaymentIntentSecret(subscriptionId);

    if (!clientSecret) {
      return res.status(404).json({ error: 'Payment intent not found' });
    }

    return res.json({ clientSecret });
  } catch (error) {
    logger.error('[Subscription] Error getting payment intent:', error);
    return res.status(500).json({ error: 'Failed to get payment intent' });
  }
});

/**
 * GET /api/subscription/billing-history
 * Get user's billing history
 */
subscriptionRouter.get(
  '/billing-history',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Query billing_history table
      const billingHistory = await prisma.billingHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          description: true,
          createdAt: true,
          paidAt: true,
        },
      });

      return res.json({ billingHistory });
    } catch (error) {
      logger.error('[Subscription] Error fetching billing history:', error);
      return res.status(500).json({ error: 'Failed to fetch billing history' });
    }
  }
);

/**
 * POST /api/subscription/cancel
 * Cancel subscription (with optional cancellation reason)
 */
subscriptionRouter.post('/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Query current subscription
    const currentSubscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!currentSubscription) {
      return res.status(400).json({ error: 'No active subscription' });
    }

    const licenseManager = await getLicenseManager();

    // Cancel subscription
    if (currentSubscription.stripeSubscriptionId) {
      await licenseManager.cancelSubscription(currentSubscription.stripeSubscriptionId);
    }

    // Log cancellation reason
    const cancelled = await prisma.subscription.update({
      where: { userId },
      data: {
        status: 'cancelled',
        cancellationReason: reason || 'User requested',
        cancelledAt: new Date(),
      },
    });

    logger.info(
      `[Subscription] User ${userId} cancelled subscription. Reason: ${reason || 'none provided'}`
    );

    return res.json({ status: 'cancelled', cancelledAt: cancelled.cancelledAt });
  } catch (error) {
    logger.error('[Subscription] Error cancelling subscription:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * GET /api/subscription/check-quota/:detectionTier
 * Check if user can use a specific detection tier
 */
subscriptionRouter.get(
  '/check-quota/:detectionTier',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const detectionTier = parseInt(req.params.detectionTier, 10);

      if (!userId || isNaN(detectionTier)) {
        return res.status(400).json({ error: 'Invalid parameters' });
      }

      // Query user subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      const userTier = subscription?.tier || 'free';
      const licenseManager = await getLicenseManager();
      const canUse = licenseManager.checkApiQuota(subscription as any, detectionTier);

      return res.json({
        canUse,
        tier: userTier,
        requiredTier: detectionTier > 2 ? 'pro' : 'free',
        usage: subscription ? {
          used: subscription.apiCallsUsed,
          limit: subscription.maxApiCalls,
        } : {
          used: 0,
          limit: SUBSCRIPTION_PLANS['free'].maxApiCalls,
        },
      });
    } catch (error) {
      logger.error('[Subscription] Error checking quota:', error);
      return res.status(500).json({ error: 'Failed to check quota' });
    }
  }
);

export default subscriptionRouter;

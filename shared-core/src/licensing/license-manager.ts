/**
 * PHASE 3 EPIC 4: Premium Licensing & Subscription Management
 * Stripe Integration for Free → Pro Tier Upgrade
 * 
 * Plans:
 * - Free: Tier 0-2 detection, limited API calls
 * - Pro: All tiers (0-4), unlimited API, custom KB access
 * - Enterprise: Self-hosted, SLA support
 */

import Stripe from 'stripe';
import { logger } from '../utils/logger';

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  maxApiCalls: number;
  maxCustomKBRecords: number;
  supportLevel: 'community' | 'email' | 'priority';
}

export interface UserSubscription {
  userId: string;
  tier: SubscriptionTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  activeUntil: Date;
  apiCallsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    interval: 'month',
    features: [
      'Tier 0-2 hallucination detection',
      '100 API calls/month',
      '5 custom KB records',
      'Community support',
    ],
    maxApiCalls: 100,
    maxCustomKBRecords: 5,
    supportLevel: 'community',
  },
  pro: {
    tier: 'pro',
    name: 'Professional',
    price: 9.99,
    currency: 'USD',
    interval: 'month',
    features: [
      'All Tier 0-4 detection (including NLI)',
      'Unlimited API calls',
      'Unlimited custom KB records',
      'Multi-language support (9 languages)',
      'GPU-accelerated inference',
      'Email support + priority updates',
    ],
    maxApiCalls: Infinity,
    maxCustomKBRecords: Infinity,
    supportLevel: 'email',
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    price: 0, // Custom pricing
    currency: 'USD',
    interval: 'year',
    features: [
      'Self-hosted deployment',
      'All features unlimited',
      'Custom integrations',
      'SLA support (99.95% uptime)',
      'Dedicated account manager',
      'Custom training on your data',
    ],
    maxApiCalls: Infinity,
    maxCustomKBRecords: Infinity,
    supportLevel: 'priority',
  },
};

/**
 * License Manager
 * Handles subscription validation, upgrades, and Stripe integration
 */
export class LicenseManager {
  private stripe: Stripe;
  private initialized = false;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.STRIPE_SECRET_KEY || '';
    this.stripe = new Stripe(key, { apiVersion: '2023-10-16' });
  }

  /**
   * Initialize Stripe connection
   */
  async initialize(): Promise<void> {
    try {
      // Verify API key by listing products
      await this.stripe.products.list({ limit: 1 });
      this.initialized = true;
      logger.info('[License] Stripe integration ready');
    } catch (error) {
      logger.warn('[License] Stripe initialization failed - premium features disabled:', error);
    }
  }

  /**
   * Create or get Stripe customer
   */
  async getOrCreateCustomer(
    userId: string,
    email: string,
    name?: string
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error('[License] Stripe not initialized');
    }

    try {
      // Search for existing customer
      const customers = await this.stripe.customers.list({ email, limit: 1 });

      if (customers.data.length > 0) {
        return customers.data[0].id;
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: { userId },
      });

      logger.info(`[License] Created Stripe customer for ${userId}`);
      return customer.id;
    } catch (error) {
      logger.error('[License] Failed to create/get customer:', error);
      throw error;
    }
  }

  /**
   * Create subscription for user
   */
  async createSubscription(
    userId: string,
    stripeCustomerId: string,
    tier: SubscriptionTier
  ): Promise<{ subscriptionId: string; clientSecret?: string }> {
    if (!this.initialized || tier === 'free') {
      return { subscriptionId: '' };
    }

    try {
      const plan = SUBSCRIPTION_PLANS[tier];
      if (!plan || plan.price === 0) {
        throw new Error(`Invalid plan: ${tier}`);
      }

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [
          {
            price_data: {
              currency: plan.currency.toLowerCase(),
              product_data: {
                name: plan.name,
                description: plan.features.join(', '),
              },
              recurring: {
                interval: plan.interval,
              },
              unit_amount: Math.round(plan.price * 100), // Stripe uses cents
            },
          },
        ],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      });

      logger.info(`[License] Created subscription ${subscription.id} for ${userId}`);

      return {
        subscriptionId: subscription.id,
        clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
      };
    } catch (error) {
      logger.error('[License] Failed to create subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(stripeSubscriptionId: string): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await this.stripe.subscriptions.del(stripeSubscriptionId);
      logger.info(`[License] Cancelled subscription ${stripeSubscriptionId}`);
    } catch (error) {
      logger.error('[License] Failed to cancel subscription:', error);
      throw error;
    }
  }

  /**
   * Validate user subscription
   */
  async validateSubscription(
    userId: string,
    subscription: UserSubscription
  ): Promise<boolean> {
    // Check if subscription is still valid
    if (new Date() > subscription.activeUntil) {
      logger.warn(`[License] Subscription expired for ${userId}`);
      return false;
    }

    // Verify with Stripe if premium
    if (subscription.tier !== 'free' && subscription.stripeSubscriptionId) {
      try {
        const stripeSubscription = await this.stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId
        );

        if (stripeSubscription.status !== 'active') {
          logger.warn(`[License] Stripe subscription not active for ${userId}`);
          return false;
        }
      } catch (error) {
        logger.error('[License] Failed to validate Stripe subscription:', error);
        return false;
      }
    }

    return true;
  }

  /**
   * Check API quota for user
   */
  checkApiQuota(subscription: UserSubscription, detectionTier: number): boolean {
    // Tier 0-2 available on Free, Tier 0-4 on Pro
    if (subscription.tier === 'free' && detectionTier > 2) {
      logger.warn(`[License] Tier ${detectionTier} requires Pro subscription`);
      return false;
    }

    // Check monthly API call limit
    const plan = SUBSCRIPTION_PLANS[subscription.tier];
    if (subscription.apiCallsUsed >= plan.maxApiCalls) {
      logger.warn(
        `[License] API quota exceeded for ${subscription.userId}: ` +
        `${subscription.apiCallsUsed}/${plan.maxApiCalls}`
      );
      return false;
    }

    return true;
  }

  /**
   * Check knowledge base quota
   */
  checkKBQuota(subscription: UserSubscription, newRecords: number = 1): boolean {
    const plan = SUBSCRIPTION_PLANS[subscription.tier];
    const currentRecords = 0; // TODO: query database for actual KB records

    if (currentRecords + newRecords > plan.maxCustomKBRecords) {
      logger.warn(
        `[License] KB quota exceeded for ${subscription.userId}: ` +
        `would exceed limit of ${plan.maxCustomKBRecords}`
      );
      return false;
    }

    return true;
  }

  /**
   * Get subscription details
   */
  async getSubscriptionDetails(
    stripeSubscriptionId: string
  ): Promise<Partial<UserSubscription> | null> {
    if (!this.initialized || !stripeSubscriptionId) {
      return null;
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId);

      // Map Stripe subscription to UserSubscription
      const item = subscription.items.data[0];
      const priceId = item.price.id;

      // Determine tier based on price
      let tier: SubscriptionTier = 'free';
      for (const [tierName, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
        if (plan.price > 0) {
          // Match by price for simplicity
          tier = tierName as SubscriptionTier;
        }
      }

      return {
        tier,
        stripeSubscriptionId: subscription.id,
        activeUntil: new Date(subscription.current_period_end * 1000),
      };
    } catch (error) {
      logger.error('[License] Failed to get subscription details:', error);
      return null;
    }
  }

  /**
   * Generate Stripe payment link for signup
   */
  async generatePaymentLink(tier: SubscriptionTier, email: string): Promise<string> {
    if (!this.initialized || tier === 'free') {
      return '';
    }

    try {
      const link = await this.stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: SUBSCRIPTION_PLANS[tier].name,
              },
              recurring: {
                interval: SUBSCRIPTION_PLANS[tier].interval,
              },
              unit_amount: Math.round(SUBSCRIPTION_PLANS[tier].price * 100),
            },
            quantity: 1,
          },
        ],
        automatic_tax: { enabled: true },
        customer_email: email,
      });

      logger.info(`[License] Generated payment link for ${tier}`);
      return link.url || '';
    } catch (error) {
      logger.error('[License] Failed to generate payment link:', error);
      throw error;
    }
  }

  /**
   * Get payment intent secret for subscription
   */
  async getPaymentIntentSecret(stripeSubscriptionId: string): Promise<string | null> {
    if (!this.initialized || !stripeSubscriptionId) {
      return null;
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ['latest_invoice.payment_intent'],
      });

      const paymentIntent = (subscription.latest_invoice as any)?.payment_intent;
      return paymentIntent?.client_secret || null;
    } catch (error) {
      logger.error('[License] Failed to get payment intent secret:', error);
      return null;
    }
  }
}

/**
 * Singleton instance
 */
let licenseManager: LicenseManager | null = null;

export async function getLicenseManager(): Promise<LicenseManager> {
  if (!licenseManager) {
    licenseManager = new LicenseManager();
    await licenseManager.initialize();
  }
  return licenseManager;
}

export function resetLicenseManager(): void {
  licenseManager = null;
}

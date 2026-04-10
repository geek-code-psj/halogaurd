/**
 * PHASE 3 EPIC 4: Stripe Webhook Handler
 * Handles subscription events: created, updated, cancelled, payment succeeded/failed
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { prisma } from '../db';
import { SUBSCRIPTION_PLANS } from './license-manager';

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  processed: boolean;
}

/**
 * Stripe Webhook Handler
 * Processes subscription lifecycle events
 */
export class StripeWebhookHandler {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(apiKey: string, webhookSecret: string) {
    this.stripe = new Stripe(apiKey, { apiVersion: '2023-10-16' });
    this.webhookSecret = webhookSecret;
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: Buffer, signature: string): Stripe.Event | null {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );
      return event;
    } catch (error) {
      logger.error('[Webhook] Signature verification failed:', error);
      return null;
    }
  }

  /**
   * Handle webhook event
   */
  async handleEvent(event: Stripe.Event): Promise<void> {
    logger.info(`[Webhook] Processing event: ${event.type}`);

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        default:
          logger.debug(`[Webhook] Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      logger.error(`[Webhook] Error handling ${event.type}:`, error);
      throw error;
    }
  }

  /**
   * Subscription created
   */
  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    logger.info(`[Webhook] Subscription created: ${subscription.id}`);

    const customerId = subscription.customer as string;
    const customer = await this.stripe.customers.retrieve(customerId);
    const customerData = customer as Stripe.Customer;
    const userId = (customerData.metadata as any)?.userId;

    if (!userId) {
      logger.warn(`[Webhook] No userId found for customer ${customerId}`);
      return;
    }

    // Parse subscription tier from price ID or metadata
    let tier = 'pro'; // Default to pro
    if (subscription.metadata?.tier) {
      tier = subscription.metadata.tier;
    }

    // Update user subscription in database
    const updated = await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier,
        status: subscription.status === 'active' ? 'active' : 'payment_required',
        stripeSubscriptionId: subscription.id,
        stripePriceId: (subscription.items.data[0]?.price.id) || undefined,
        maxApiCalls: SUBSCRIPTION_PLANS[tier as keyof typeof SUBSCRIPTION_PLANS]?.maxApiCalls || 100,
      },
      update: {
        tier,
        status: subscription.status === 'active' ? 'active' : 'payment_required',
        stripeSubscriptionId: subscription.id,
        stripePriceId: (subscription.items.data[0]?.price.id) || undefined,
      },
    });

    logger.info(`[Webhook] Updated subscription for user ${userId}: ${tier}`);
  }

  /**
   * Subscription updated
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    logger.info(`[Webhook] Subscription updated: ${subscription.id}`);

    const customerId = subscription.customer as string;
    const customer = await this.stripe.customers.retrieve(customerId);
    const customerData = customer as Stripe.Customer;
    const userId = (customerData.metadata as any)?.userId;

    if (!userId) {
      logger.warn(`[Webhook] No userId found for customer ${customerId}`);
      return;
    }

    // Determine new status mapping
    const statusMap: Record<string, string> = {
      'active': 'active',
      'paused': 'paused',
      'past_due': 'past_due',
      'unpaid': 'unpaid',
      'incomplete': 'payment_required',
    };

    const newStatus = statusMap[subscription.status] || subscription.status;

    // Update subscription
    await prisma.subscription.update({
      where: { userId },
      data: {
        status: newStatus,
      },
    });

    // Handle status changes (downgrade if past_due, etc.)
    if (subscription.status === 'canceled') {
      logger.info(`[Webhook] Subscription ${subscription.id} cancelled`);
      await prisma.subscription.update({
        where: { userId },
        data: {
          tier: 'free',
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      });
    }

    logger.info(`[Webhook] Updated subscription status for user ${userId}: ${newStatus}`);
  }

  /**
   * Subscription deleted/cancelled
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    logger.info(`[Webhook] Subscription deleted: ${subscription.id}`);

    const customerId = subscription.customer as string;
    const customer = await this.stripe.customers.retrieve(customerId);
    const customerData = customer as Stripe.Customer;
    const userId = (customerData.metadata as any)?.userId;

    if (!userId) {
      logger.warn(`[Webhook] No userId found for customer ${customerId}`);
      return;
    }

    // Downgrade user to free tier
    await prisma.subscription.update({
      where: { userId },
      data: {
        tier: 'free',
        status: 'cancelled',
        stripeSubscriptionId: null,
        cancelledAt: new Date(),
        maxApiCalls: SUBSCRIPTION_PLANS['free'].maxApiCalls,
      },
    });

    logger.info(`[Webhook] Downgraded user ${userId} to free tier`);
  }

  /**
   * Payment succeeded
   */
  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    logger.info(`[Webhook] Payment succeeded: ${invoice.id}`);

    if (!invoice.subscription) {
      logger.debug('[Webhook] Invoice not related to subscription');
      return;
    }

    const customerId = invoice.customer as string;
    const customer = await this.stripe.customers.retrieve(customerId);
    const userId = (customer.metadata as any)?.userId;

    if (!userId) {
      logger.warn(`[Webhook] No userId found for customer ${customerId}`);
      return;
    }

    // Log payment in billing_history
    const description = invoice.lines.data[0]?.description || 'Subscription Payment';
    const amount = invoice.total ? invoice.total / 100 : 0; // Stripe amounts are in cents
    const currency = invoice.currency?.toUpperCase() || 'USD';

    await prisma.billingHistory.create({
      data: {
        userId,
        amount,
        currency,
        status: 'paid',
        description,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent as string,
        billingPeriodStart: new Date(invoice.period_start * 1000),
        billingPeriodEnd: new Date(invoice.period_end * 1000),
        paidAt: invoice.paid_at ? new Date(invoice.paid_at * 1000) : new Date(),
      },
    });

    // TODO: Send confirmation email (implement email service)
    logger.info(`[Webhook] Confirmed payment for user ${userId}, amount: ${amount} ${currency}`);
  }

  /**
   * Payment failed
   */
  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    logger.error(`[Webhook] Payment failed: ${invoice.id}`);

    if (!invoice.subscription) {
      logger.debug('[Webhook] Invoice not related to subscription');
      return;
    }

    const customerId = invoice.customer as string;
    const customer = await this.stripe.customers.retrieve(customerId);
    const userId = (customer.metadata as any)?.userId;

    if (!userId) {
      logger.warn(`[Webhook] No userId found for customer ${customerId}`);
      return;
    }

    // Log failed payment
    const description = invoice.lines.data[0]?.description || 'Subscription Payment';
    const amount = invoice.total ? invoice.total / 100 : 0;
    const currency = invoice.currency?.toUpperCase() || 'USD';

    const billing = await prisma.billingHistory.create({
      data: {
        userId,
        amount,
        currency,
        status: 'failed',
        description,
        stripeInvoiceId: invoice.id,
        stripePaymentIntentId: invoice.payment_intent as string,
        billingPeriodStart: new Date(invoice.period_start * 1000),
        billingPeriodEnd: new Date(invoice.period_end * 1000),
        failedAttempts: 1,
        nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Retry in 24hrs
      },
    });

    // TODO: Send retry notification email (implement email service)
    logger.warn(
      `[Webhook] Payment failed for user ${userId}, invoice: ${invoice.id}, amount: ${amount} ${currency}`
    );
  }

  /**
   * Customer updated (email, name, etc.)
   */
  private async handleCustomerUpdated(customer: Stripe.Customer): Promise<void> {
    logger.info(`[Webhook] Customer updated: ${customer.id}`);

    const userId = (customer.metadata as any)?.userId;
    if (!userId) {
      logger.debug(`[Webhook] No userId found for customer ${customer.id}`);
      return;
    }

    // Sync customer info to database if needed
    const email = customer.email;
    const name = customer.name;

    if (email) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          email,
          name: name || undefined,
        },
      }).catch(err => logger.error('[Webhook] Failed to sync customer info:', err));
    }

    logger.info(`[Webhook] Synced customer info for user ${userId}`);
  }
}

/**
 * Express middleware for webhook handling
 */
export function createWebhookHandler(apiKey: string, webhookSecret: string) {
  const handler = new StripeWebhookHandler(apiKey, webhookSecret);

  return async (req: Request, res: Response) => {
    try {
      const signature = req.headers['stripe-signature'] as string;

      if (!signature) {
        logger.warn('[Webhook] Missing stripe-signature header');
        return res.status(400).json({ error: 'Missing signature' });
      }

      // Get raw body buffer (required for signature verification)
      const payload = (req as any).rawBody as Buffer;

      if (!payload) {
        logger.warn('[Webhook] Missing raw body');
        return res.status(400).json({ error: 'Missing body' });
      }

      // Verify signature
      const event = handler.verifySignature(payload, signature);

      if (!event) {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      // Process event
      await handler.handleEvent(event);

      // Return success immediately
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error('[Webhook] Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  };
}

/**
 * Test webhook signature verification
 */
export function testWebhookHandler(apiKey: string, webhookSecret: string): void {
  const handler = new StripeWebhookHandler(apiKey, webhookSecret);

  // Example event
  const testEvent: Stripe.Event = {
    id: 'evt_test',
    object: 'event',
    type: 'customer.subscription.created',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'sub_test',
        object: 'subscription',
        customer: 'cus_test',
        status: 'active',
      },
    },
    request: null,
    livemode: false,
    pending_webhooks: 0,
    api_version: '2023-10-16',
  };

  logger.info('[Webhook] Testing webhook handler...');
  handler.handleEvent(testEvent).catch((error) => {
    logger.error('[Webhook] Test failed:', error);
  });
}

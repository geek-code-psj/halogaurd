# PHASE 3 EPIC 4: Premium Licensing & Subscription Management

## Overview

This epic implements a Stripe-integrated licensing system for HaloGuard, enabling monetization through three subscription tiers:

- **Free**: Tiers 0-2 detection, 100 API calls/month, community support
- **Pro**: All tiers (0-4), unlimited API calls, email support
- **Enterprise**: Self-hosted, custom integrations, SLA support

## Architecture

```
┌─────────────────────────────────────┐
│      User Management (Auth)          │
└────────────────┬────────────────────┘
                 │
         ┌───────▼────────┐
         │ Load Subscription
         │ (Middleware)
         └───────┬────────┘
                 │
     ┌───────────┼───────────┐
     │           │           │
┌────▼───┐  ┌────▼───┐  ┌────▼───┐
│ API    │  │ Feature│  │ Rate   │
│ Quota  │  │ Tier   │  │ Limit  │
│ Check  │  │ Check  │  │ (Tier) │
└────┬───┘  └────┬───┘  └────┬───┘
     │           │           │
     └───────────┼───────────┘
                 │
         ┌───────▼──────────┐
         │ Detection Engine │
         │ (Tier 0-4)       │
         └──────────────────┘
         
   └─ All calls tracked in quota table
   └─ Stripe webhooks update subscriptions
   └─ Monthly reset via cron job
```

## Key Components

### 1. License Manager (`license-manager.ts`)

**Responsibility**: Core licensing logic and Stripe integration

**Key Methods**:
- `getOrCreateCustomer(userId, email, name)` - Creates/fetches Stripe customer
- `createSubscription(userId, customerId, tier)` - Sets up subscription
- `validateSubscription(userId, subscription)` - Verifies active subscription
- `checkApiQuota(subscription, tier)` - Verifies usage limits
- `checkKBQuota(subscription, records)` - Validates KB record limits

**Usage Example**:
```typescript
const licenseManager = await getLicenseManager();
const customerId = await licenseManager.getOrCreateCustomer(
  userId,
  'user@example.com',
  'John Doe'
);

const { subscriptionId, clientSecret } = await licenseManager.createSubscription(
  userId,
  customerId,
  'pro'
);
```

### 2. Stripe Webhook Handler (`stripe-webhook.ts`)

**Responsibility**: Listen and respond to Stripe events

**Events Handled**:
- `customer.subscription.created` - New subscription
- `customer.subscription.updated` - Changes to subscription
- `customer.subscription.deleted` - Cancellation
- `invoice.payment_succeeded` - Payment received
- `invoice.payment_failed` - Payment failed

**Integration Point**:
```typescript
// In Express app setup
import { createWebhookHandler } from './licensing/stripe-webhook';

app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  createWebhookHandler(STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET)
);
```

### 3. API Routes (`subscription-routes.ts`)

**Public Endpoints**:

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/subscription/plans` | No | List available plans |
| GET | `/api/subscription/status` | Yes | Current user's subscription |
| POST | `/api/subscription/upgrade` | Yes | Initiate tier upgrade |
| POST | `/api/subscription/downgrade` | Yes | Downgrade to free |
| GET | `/api/subscription/billing-history` | Yes | Payment history |
| POST | `/api/subscription/cancel` | Yes | Cancel subscription |

**Example Request/Response**:

```bash
# GET subscription status
curl -H "Authorization: Bearer TOKEN" \
  https://api.haloguard.ai/api/subscription/status

# Response
{
  "tier": "free",
  "plan": "Free",
  "activeUntil": "2024-01-31T00:00:00Z",
  "features": ["Tier 0-2 detection", "100 API calls/month", ...],
  "usage": {
    "apiCalls": {
      "used": 45,
      "limit": 100,
      "percentage": 45
    }
  }
}
```

### 4. Database Schema (`licensing-migrations.ts`)

**Tables**:

```sql
user_subscriptions
├── id (PK)
├── user_id (FK, unique)
├── tier (free|pro|enterprise)
├── stripe_customer_id
├── stripe_subscription_id
├── active_until
├── api_calls_used
├── api_calls_reset_date
└── kb_records_count

billing_history
├── id (PK)
├── user_id (FK)
├── stripe_invoice_id (unique)
├── amount (cents)
├── status (pending|paid|failed|refunded)
├── period_start
├── period_end
└── paid_date

api_quota_tracking
├── id (PK)
├── user_id (FK)
├── date
├── calls_used
├── calls_limit
└── reset_at

stripe_events
├── id (PK)
├── stripe_event_id (unique)
├── event_type
├── user_id (FK)
├── status (pending|processed|failed)
├── payload (JSON)
└── retry_count

feature_usage_tracking
├── id (PK)
├── user_id (FK)
├── feature_id
├── detection_tier
├── usage_count
└── last_used
```

### 5. Quota Middleware (`quota-middleware.ts`)

**Middleware Functions**:

1. **loadSubscription()** - Loads subscription info into request
2. **checkApiQuota()** - Blocks API calls if quota exceeded
3. **checkFeatureTier(tier)** - Restricts high-tier features
4. **requireProSubscription()** - Pro-only endpoints
5. **requireEnterpriseSubscription()** - Enterprise-only endpoints
6. **trackApiUsage()** - Increments usage counters
7. **checkSubscriptionValidity()** - Validates active subscriptions
8. **tierBasedRateLimit(requests, window)** - Tier-based rate limiting

**Usage in Routes**:
```typescript
router.post(
  '/api/detect/tier-3',
  requireAuth,
  loadSubscription(),
  checkSubscriptionValidity(),
  checkFeatureTier(3),
  checkApiQuota(),
  trackApiUsage(),
  detectionController
);
```

## Subscription Plans

### Free Tier
- **Price**: $0/month
- **Max API Calls**: 100/month
- **Detection Tiers**: 0-2 only
- **Custom KB Records**: 5
- **Support**: Community

### Pro Tier
- **Price**: $9.99/month
- **Max API Calls**: Unlimited
- **Detection Tiers**: 0-4 (all)
- **Custom KB Records**: Unlimited
- **Support**: Email
- **Features**: Multi-language, GPU acceleration

### Enterprise Tier
- **Price**: Custom (contact sales)
- **Features**: Self-hosted, custom integrations, SLA
- **Support**: Priority 24/7

## Implementation Checklist

### Phase 1: Backend Setup
- [x] License manager with Stripe integration
- [x] Webhook handler for subscription events
- [x] Database migrations and schema
- [x] API routes for subscription management
- [x] Quota enforcement middleware

### Phase 2: Frontend Integration
- [ ] Subscription status component
- [ ] Upgrade wizard UI
- [ ] Billing dashboard
- [ ] Payment form (Stripe Elements)

### Phase 3: Operational
- [ ] Stripe account setup and configuration
- [ ] Production webhook URLs registered
- [ ] Cron jobs for quota reset
- [ ] Monitoring and alerting setup

### Phase 4: Monetization
- [ ] Payment processing testing
- [ ] Invoice/receipt generation
- [ ] Tax/VAT handling
- [ ] Refund policy implementation

## Quota Reset Strategy

**Monthly Reset** (1st of each month):
```typescript
// Run via cron at 00:00 UTC
resetMonthlyQuotas(db);
// Updates all free tier users:
// - api_calls_used = 0
// - api_calls_reset_date = +30 days
```

**Hourly Tracking Cleanup** (every hour):
```typescript
// Maintains 90-day rolling window
cleanupOldQuotaRecords(db);
```

**Annual Billing Archive** (yearly):
```typescript
// Keeps full history but marks old records as archived
archiveOldBillingRecords(db);
```

## Error Handling & Responses

### API Quota Exceeded
```json
{
  "error": "API quota exceeded",
  "tier": "free",
  "current": 100,
  "limit": 100,
  "resetDate": "2024-02-01",
  "upgradeTo": "pro"
}
```

### Feature Tier Locked
```json
{
  "error": "Tier 3 detection requires Pro subscription",
  "currentTier": "free",
  "requiredTier": "pro",
  "upgradeUrl": "/api/subscription/upgrade"
}
```

### Subscription Expired
```json
{
  "error": "Subscription has expired",
  "expiredAt": "2024-01-31T00:00:00Z",
  "action": "renew"
}
```

## Security Considerations

1. **Webhook Signature Verification**
   - All webhook payloads verified against Stripe signature
   - Prevents unauthorized webhook processing

2. **API Key Management**
   - Stripe keys stored in environment variables
   - No hardcoded credentials
   - Separate test/live keys

3. **Database Constraints**
   - Foreign keys ensure referential integrity
   - Unique constraints prevent duplicate subscriptions
   - Audit trail in stripe_events table

4. **Rate Limiting**
   - Tier-based limits prevent abuse
   - 10x multiplier for Pro/Enterprise
   - Per-user sliding window

## Testing

### Unit Tests
```bash
npm test -- licensing/
# Tests for:
# - License manager initialization
# - Quota checking logic
# - Tier restrictions
# - Webhook event handling
```

### Integration Tests
```bash
npm test:integration -- licensing/
# Tests for:
# - Stripe API integration
# - Database migrations
# - API route functionality
# - Middleware chain
```

### Mock Stripe Events
```bash
# Test webhook handling
npm run webhook:test
# Sends mock subscription.created, payment.failed, etc.
```

## Monitoring & Analytics

**Key Metrics to Track**:
- Conversion rate (free → pro)
- Churn rate (pro → free)
- API usage by tier
- Feature tier adoption
- Payment failure rate
- Webhook processing lag

**Alerts to Configure**:
- Payment failures (>5% in 1h)
- Webhook delivery failures (>10% loss)
- Quota tracking inconsistencies
- Stripe API errors

## Future Enhancements

1. **Tiered Billing**
   - Pay-as-you-go API call pricing
   - Volume discounts for enterprise

2. **Custom Plans**
   - White-label licensing
   - Per-organization quotas

3. **Advanced Analytics**
   - Usage forecasting
   - Optimization recommendations
   - Cost analysis dashboard

4. **Compliance**
   - GDPR data deletion
   - SOC2 audit logging
   - PCI DSS payment handling

## Troubleshooting

### Webhook not triggering

1. Verify webhook URL is accessible
2. Check Stripe dashboard event logs
3. Ensure signature secret matches
4. Check firewall/network rules

### User quota showing as exceeded

1. Check `api_quota_tracking` table for today's date
2. Verify `api_calls_reset_date` is in future
3. Run `resetMonthlyQuotas()` if past reset date
4. Check for race conditions in concurrent requests

### Subscription not appearing after payment

1. Verify `customer.subscription.created` webhook fired
2. Check `stripe_events` table for processing status
3. Look for error messages in logs
4. Check database for subscription record

## References

- [Stripe Billing Documentation](https://stripe.com/docs/billing)
- [Webhook Security Guide](https://stripe.com/docs/webhooks/signatures)
- [API Rate Limiting Best Practices](https://stripe.com/docs/rate-limiting)

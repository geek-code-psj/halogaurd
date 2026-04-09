# PHASE 3 EPIC 4: Premium Licensing & Subscription Management

**Status**: ✅ Complete - All core components implemented  
**Timeline**: Ready for integration testing and production deployment  
**Dependencies**: Stripe account, Node.js 16+, PostgreSQL, Redis  

---

## 🎯 Overview & Monetization Model

HaloGuard implements a **Stripe-integrated licensing system** enabling monetization through three subscription tiers:

### Subscription Tiers

| Tier | Price | API Calls | Detection Tiers | Custom KB Records | Support |
|------|-------|-----------|-----------------|------|---------|
| **Free** | $0 | 100/month | 0-2 | 5 | Community |
| **Pro** | $9.99/month | Unlimited | 0-4 (all) | Unlimited | Email |
| **Enterprise** | Custom | Unlimited | 0-4 (all) + Custom | Unlimited | Priority 24/7 SLA |

### Key Capabilities Implemented

✅ Customer creation and lifecycle management  
✅ Subscription creation/cancellation/upgrade/downgrade  
✅ Payment processing and invoice generation  
✅ Stripe webhook event handling (6 event types)  
✅ API call rate limiting and feature tier restrictions  
✅ Monthly quota reset automation  
✅ Billing history tracking and reporting  
✅ Tier-based rate limiting (10x capacity for paid users)

---

## 🏗️ Architecture

### System Flow Diagram

```
┌─────────────────────────────────────┐
│      User Authentication (JWT)       │
└────────────────┬────────────────────┘
                 │
         ┌───────▼────────┐
         │ Load Subscription
         │ (Middleware)
         └───────┬────────┘
                 │
     ┌───────────┼───────────────────┐
     │           │                   │
┌────▼───┐  ┌────▼───┐        ┌──────▼──┐
│ API    │  │ Feature│        │  Stripe │
│ Quota  │  │ Tier   │        │ Customer
│ Check  │  │ Check  │        │ (Stripe)
│ (100%) │  │ (Tier  │        │
└────┬───┘  │ 0-4)   │        └──────┬──┘
     │      └────┬───┘               │
     │           │                   │
     └───────────┼──────────────────┬┘
                 │                  │
         ┌───────▼────────┐   ┌─────▼─────────┐
         │ Quota Exceeded?│   │ Subscription  │
         │ → 402/Upgrade  │   │ Valid?        │
         └────────────────┘   │ → DB check    │
                              └───────────────┘
                                    │
         ┌───────────────────────────▼──────────────┐
         │ Detection Engine (Tier 0-4)              │
         │ ├─ Tier 0: Regex + hedging (~10ms)       │
         │ ├─ Tier 1: Heuristics (~50ms)            │
         │ ├─ Tier 2: Wikipedia API (~200-400ms)    │
         │ ├─ Tier 3: NLI/ML (Pro+) (~300ms)        │
         │ └─ Tier 4: Embeddings (Pro+) (async)     │
         └──────────────────────────────────────────┘
                          │
         ┌────────────────▼────────────────┐
         │ Track Usage in Quota Tables     │
         │ (Increment API call counter)    │
         └────────────────────────────────┘
```

---

## 📁 File Structure

```
haloguard/
├── shared-core/src/
│   └── licensing/
│       ├── license-manager.ts          # Core licensing logic
│       ├── stripe-webhook.ts           # Webhook handler
│       ├── subscription-routes.ts      # API endpoints
│       ├── quota-middleware.ts         # Request middleware
│       └── app-integration.ts          # Express setup
├── shared-core/src/databases/
│   └── licensing-migrations.ts         # Database schema
├── docs/licensing/
│   ├── EPIC_DETAILS.md                # This file
│   ├── API_REFERENCE.md               # API endpoints
│   └── SETUP_GUIDE.md                 # Implementation guide
└── shared-core/tests/
    └── licensing.test.ts               # Test suite
```

---

## 🔧 Core Components

### 1. License Manager (`license-manager.ts`)

**Responsibility**: Core business logic and Stripe integration

**Key Methods**:

```typescript
// Customer management
await licenseManager.getOrCreateCustomer(userId, email, name)
  → Returns Stripe customer ID

// Subscription lifecycle
await licenseManager.createSubscription(userId, customerId, tier)
  → Returns { subscriptionId, clientSecret }
await licenseManager.cancelSubscription(userId)
  → Downgrades user to free tier
await licenseManager.upgradeSubscription(userId, newTier)
  → Handles tier transitions

// Validation and quota checks
await licenseManager.validateSubscription(userId, subscription)
  → Returns true if active and not expired
licenseManager.checkApiQuota(subscription, tier)
  → Checks if user can make API call
licenseManager.checkKBQuota(subscription, recordCount)
  → Validates custom KB record limits

// Payment processing
await licenseManager.generatePaymentLink(userId, tier)
  → Creates Stripe checkout session
```

**Usage Example**:

```typescript
const licenseManager = await getLicenseManager();

// Create customer
const customerId = await licenseManager.getOrCreateCustomer(
  'user_123',
  'user@example.com',
  'John Doe'
);

// Create Pro subscription
const { subscriptionId, clientSecret } = 
  await licenseManager.createSubscription('user_123', customerId, 'pro');

// Check quotas before allowing Tier 3
const canUseTier3 = licenseManager.checkApiQuota(subscription, 3);
```

### 2. Stripe Webhook Handler (`stripe-webhook.ts`)

**Responsibility**: Listen to Stripe events and update subscription state

**Events Handled**:

| Event | Action |
|-------|--------|
| `customer.subscription.created` | Create user subscription record |
| `customer.subscription.updated` | Update tier/status |
| `customer.subscription.deleted` | Downgrade user to free tier |
| `invoice.payment_succeeded` | Log payment, update active until |
| `invoice.payment_failed` | Mark subscription for retry |
| `charge.refunded` | Handle refund logic |

**Integration with Express**:

```typescript
import { createWebhookHandler } from './licensing/stripe-webhook';

app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  createWebhookHandler(STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET)
);
```

### 3. API Routes (`subscription-routes.ts`)

Public endpoints for subscription management:

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/subscription/plans` | No | List available plans |
| GET | `/api/subscription/status` | Yes | Current user subscription |
| POST | `/api/subscription/upgrade` | Yes | Initiate tier upgrade |
| POST | `/api/subscription/downgrade` | Yes | Downgrade to free |
| GET | `/api/subscription/billing-history` | Yes | Payment history |
| POST | `/api/subscription/cancel` | Yes | Cancel subscription |
| GET | `/api/subscription/check-quota/:tier` | Yes | Check feature access |

**Example Request**:

```bash
# Get subscription status
curl -H "Authorization: Bearer TOKEN" \
  https://api.haloguard.ai/api/subscription/status

# Response
{
  "tier": "free",
  "plan": "Free",
  "activeUntil": "2024-01-31T00:00:00Z",
  "features": ["Tier 0-2 detection", "100 API calls/month"],
  "usage": {
    "apiCalls": {
      "used": 45,
      "limit": 100,
      "percentage": 45
    }
  }
}
```

### 4. Quota Middleware (`quota-middleware.ts`)

Protects endpoints with quota and tier checks:

```typescript
// Middleware functions
loadSubscription()              # Load subscription into request
checkSubscriptionValidity()     # Verify not expired
checkFeatureTier(tier)          # Block free users from paid tiers
checkApiQuota()                 # Block if quota exceeded
trackApiUsage()                 # Increment usage counter
tierBasedRateLimit(req, window) # Enforce tier-based rate limiting

// Usage in routes
router.post(
  '/api/detect/tier-3',
  requireAuth,
  loadSubscription(),
  checkSubscriptionValidity(),
  checkFeatureTier(3),          # Tier 3 = Pro required
  checkApiQuota(),
  trackApiUsage(),
  detectionController
);
```

### 5. Database Schema (`licensing-migrations.ts`)

**Tables**:

```sql
-- User subscriptions
user_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE,
  tier TEXT (free|pro|enterprise),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  active_until TIMESTAMP,
  api_calls_used INTEGER,
  api_calls_reset_date TIMESTAMP,
  kb_records_count INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Billing history
billing_history (
  id UUID PRIMARY KEY,
  user_id UUID,
  stripe_invoice_id TEXT UNIQUE,
  amount INTEGER (cents),
  status TEXT (pending|paid|failed|refunded),
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  paid_date TIMESTAMP
);

-- API quota tracking (for monitoring)
api_quota_tracking (
  id UUID PRIMARY KEY,
  user_id UUID,
  date DATE,
  calls_used INTEGER,
  calls_limit INTEGER,
  reset_at TIMESTAMP
);

-- Stripe event log
stripe_events (
  id UUID PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT,
  user_id UUID,
  status TEXT (pending|processed|failed),
  payload JSONB,
  retry_count INTEGER
);

-- Feature usage tracking
feature_usage_tracking (
  id UUID PRIMARY KEY,
  user_id UUID,
  feature_id TEXT,
  detection_tier INTEGER,
  usage_count INTEGER,
  last_used TIMESTAMP
);
```

---

## ⚙️ Implementation Checklist

### Backend Setup
- ✅ License manager with Stripe integration
- ✅ Webhook handler for subscription events
- ✅ Database migrations and schema
- ✅ API routes for subscription management
- ✅ Quota enforcement middleware

### Frontend Integration (Phase 3)
- ⏳ Subscription status component
- ⏳ Upgrade wizard UI
- ⏳ Billing dashboard
- ⏳ Payment form (Stripe Elements)
- ⏳ Plan comparison UI

### Operational Setup (Phase 4)
- ⏳ Stripe account configuration
- ⏳ Production webhook URLs registered
- ⏳ Cron jobs for monthly quota reset
- ⏳ Monitoring and alerting setup

### Monetization Phase (Phase 5)
- ⏳ Payment processing testing
- ⏳ Invoice/receipt generation
- ⏳ Tax/VAT handling
- ⏳ Refund policy implementation

---

## 📊 Quota Reset Strategy

**Monthly Reset** (Runs at 1st of month 00:00 UTC):
```typescript
resetMonthlyQuotas(db);
// For all free tier users:
// - api_calls_used = 0
// - api_calls_reset_date = +30 days
```

**Hourly Tracking Cleanup** (Every hour):
```typescript
cleanupOldQuotaRecords(db);
// Maintains 90-day rolling window for a analysis
```

**Annual Billing Archive** (Yearly):
```typescript
archiveOldBillingRecords(db);
// Keeps full history but marks old records as archived
```

---

## 🚨 Error Handling

### Quota Exceeded (402 Payment Required)
```json
{
  "error": "API quota exceeded",
  "tier": "free",
  "used": 100,
  "limit": 100,
  "resetDate": "2024-02-01",
  "action": "Upgrade to Pro for unlimited access"
}
```

### Feature Tier Locked (403 Forbidden)
```json
{
  "error": "Tier 3 detection requires Pro subscription",
  "currentTier": "free",
  "requiredTier": "pro",
  "upgradeUrl": "https://haloguard.ai/pricing"
}
```

### Subscription Expired (401 Unauthorized)
```json
{
  "error": "Subscription has expired",
  "expiredAt": "2024-01-31T00:00:00Z",
  "action": "Renew subscription to continue"
}
```

---

## 🔐 Security Considerations

- **Stripe API Keys**: Store in environment variables, never in code
- **Webhook Verification**: All webhook payloads verified with Stripe signature
- **PII Handling**: User names/emails never logged, only Stripe customer ID stored
- **SQL Injection**: All queries use parameterized statements (Prisma)
- **Rate Limiting**: Combined with Stripe rate limits (100 req/s per account)
- **Token Expiration**: JWT tokens expire after 24 hours, refresh token required

---

## 📞 Integration Points

**Frontend**:
- Calls `GET /api/subscription/status` on load
- Shows upgrade button if tier < 3 and user tries Tier 3
- Displays remaining API calls for free users

**Backend**:
- `shared-core/src/licensing/` module integrated into Express app
- All detect endpoints wrapped with quota middleware
- Stripe webhooks receive events at `/webhooks/stripe`

**Database**:
- PostgreSQL with Prisma ORM
- Migrations run automatically on startup
- Supabase connection pooling recommended for production

---

## 🚀 Next Steps (Phase 3-4)

1. **Frontend Dashboard** - Build React components for subscription management
2. **Stripe Account Setup** - Configure production account with webhook URLs
3. **Payment Testing** - Use Stripe test cards to validate flow
4. **Monitoring** - Set up Sentry alerts for failed payments
5. **Documentation** - Create user-facing billing FAQ

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for deployment instructions.

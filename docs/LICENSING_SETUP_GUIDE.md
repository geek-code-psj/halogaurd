# Licensing System: Environment & Configuration Guide

## Environment Variables

### Required for Stripe Integration

```bash
# Stripe API Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx

# Stripe Webhook Signing Secret (from https://dashboard.stripe.com/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx

# Optional: Stripe Account ID (if using Stripe Connect)
STRIPE_ACCOUNT_ID=acct_xxxxxxxxxx
```

### Development vs Production

#### Development (.env.development)
```bash
NODE_ENV=development

# Use test keys from Stripe Dashboard
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxx

# Use test webhook URL (ngrok)
WEBHOOK_URL=https://xxxx.ngrok.io/webhooks/stripe

# Logging level
LOG_LEVEL=debug
```

#### Production (.env.production)
```bash
NODE_ENV=production

# Use live keys - NEVER commit to repo
STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}  # Set via CI/CD secrets
STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}

# Production webhook URL
WEBHOOK_URL=https://api.haloguard.ai/webhooks/stripe

# Logging level
LOG_LEVEL=info
```

## Setup Instructions

### Step 1: Create Stripe Account

1. Go to https://dashboard.stripe.com
2. Sign up or log in
3. Create a standard account

### Step 2: Get API Keys

1. Navigate to **Settings → API Keys**
2. Reveal your **Secret Key** (sk_live_...)
3. Note your **Publishable Key** (pk_live_...)
4. For testing, switch to **View test data** toggle

### Step 3: Configure Webhook

1. Navigate to **Developers → Webhooks**
2. Click **Add endpoint**
3. Enter endpoint URL: `https://api.haloguard.ai/webhooks/stripe`
4. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.updated`
5. Copy the **Signing Secret** (whsec_...)

### Step 4: Local Testing with ngrok

```bash
# Install ngrok: https://ngrok.com

# Start local server
npm run dev

# In another terminal, expose local port
ngrok http 3000
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:3000

# Use the ngrok URL for webhook testing
# In Stripe dashboard, add webhook with ngrok URL
```

### Step 5: Environment Setup

```bash
# Copy template
cp .env.example .env.development
cp .env.example .env.production

# Update with your keys
nano .env.development
nano .env.production
```

## Testing Configuration

### 1. Test Credit Card Numbers

In Stripe test mode, use these card numbers:

| Card Type | Number | Expiry | CVC |
|-----------|--------|--------|-----|
| Visa | 4242 4242 4242 4242 | Any future date | Any 3 digits |
| Visa (fail) | 4000 0000 0000 0002 | Any | Any |
| Mastercard | 5555 5555 5555 4444 | Any | Any |
| American Express | 3782 822463 10005 | Any | Any 4-digit |

### 2. Test Expiration Dates

- **Success**: Use any date in the future (e.g., 12/25)
- **Decline**: Use 04/25 (card declined)

### 3. Test CVCs

- **Success**: Any 3-4 digit number
- **Decline**: Use "000"

### 4. Testing the Webhook Locally

```bash
# Option 1: Use Stripe CLI (Recommended)
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/webhooks/stripe

# Copy the signing secret to .env.development
STRIPE_WEBHOOK_SECRET=whsec_test_...

# In another terminal, trigger test events
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

## Production Checklist

- [ ] Verify HTTPS endpoints
- [ ] Set up rate limiting
- [ ] Enable webhook retries in Stripe dashboard
- [ ] Configure email notifications
- [ ] Test payment processing
- [ ] Set up monitoring/alerts
- [ ] Document support process
- [ ] Enable 2FA on Stripe account
- [ ] Configure IP whitelist (if available)
- [ ] Set up PCI compliance

## Security Best Practices

### 1. API Key Management

```bash
# ❌ DON'T
export STRIPE_SECRET_KEY=sk_live_xxxx  # Shell history!
console.log(STRIPE_SECRET_KEY)          # Logs!

# ✅ DO
# Use environment variables from .env file
# Use secrets management (AWS Secrets Manager, HashiCorp Vault)
# Rotate keys periodically
```

### 2. Webhook Security

```typescript
// Always verify signature before processing
const event = stripe.webhooks.constructEvent(
  payload,
  signature,
  webhookSecret
);

// Never trust unverified webhooks
```

### 3. PCI Compliance

- Never store full credit card numbers
- Always validate on backend
- Use Stripe's hosted forms
- Enable 3D Secure for high-value transactions

### 4. Rate Limiting

```bash
# Stripe rate limits apply - implement exponential backoff
# Default: 100 requests/second per API key
```

## Monitoring & Debugging

### 1. Check Webhook Status

```bash
# Via Stripe CLI
stripe logs tail

# Via Dashboard
# Settings → Webhooks → Select endpoint → View events
```

### 2. Test Event Replay

```bash
# Dashboard: Webhooks → Select event → Resend
# Useful for debugging failed event processing
```

### 3. Verify Webhook Signature

```typescript
import Stripe from 'stripe';

const signature = req.headers['stripe-signature'];
const payload = req.rawBody;
const secret = process.env.STRIPE_WEBHOOK_SECRET;

try {
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    secret
  );
  console.log('✓ Signature verified');
} catch (error) {
  console.error('✗ Signature invalid:', error.message);
}
```

### 4. Monitor Key Metrics

```bash
# Check dashboard for:
# - Failed charges
# - Declined payments  
# - API errors/limits
# - Webhook delivery status
```

## Troubleshooting

### "Signature verification failed"

1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Ensure you're using raw body (not parsed JSON)
3. Check that webhook endpoint URL matches configuration

### "Unknown Stripe API version"

1. Update Stripe library: `npm update stripe`
2. Verify API version in `stripe = new Stripe(key, { apiVersion: '2023-10-16' })`

### Webhook not triggering

1. Check webhook URL is publicly accessible
2. Verify endpoint is returning 200 OK
3. Check Stripe dashboard for delivery failures
4. Review `stripe_events` table for processing status

### Subscription not created after payment

1. Verify `customer.subscription.created` event fired
2. Check logs for webhook processing errors
3. Query `stripe_events` table: `SELECT * WHERE event_type = 'customer.subscription.created'`
4. Manually trigger test event: `stripe trigger customer.subscription.created`

## Cost Estimation

### Stripe Pricing (as of 2024)

- **Processing fees**: 2.9% + $0.30 per successful charge
- **ACH debits**: 0.8% ($5 minimum, $25 maximum)
- **Failed charges**: No fee for failed charges
- **Refunds**: Same percentage as original charge

### Example Monthly Costs

| Scenario | Calculation | Cost |
|----------|-------------|------|
| 100 Pro subscriptions | 100 × $9.99 × (1 + 0.029) + 100 × $0.30 | ~$1,030 |
| 1000 Pro subscriptions | 1000 × $9.99 × 1.029 + 1000 × $0.30 | ~$10,591 |

Note: We keep ~70% after Stripe fees:
- $9.99 × 1000 × 0.70 = $6,993 net revenue

## References

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Testing](https://stripe.com/docs/testing)
- [Stripe API Reference](https://stripe.com/docs/api)
- [PCI Compliance Guide](https://stripe.com/docs/security)
- [Webhook Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI](https://stripe.com/docs/stripe-cli)

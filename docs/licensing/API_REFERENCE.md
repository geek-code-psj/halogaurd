# HaloGuard Licensing API Reference

## Overview

This API enables frontend applications to:
- Check current subscription status
- Display available plans
- Initiate tier upgrades
- Access billing history
- Manage subscriptions

**Base URL**: `https://api.haloguard.ai`
**Authentication**: Bearer token in `Authorization` header

---

## Authentication

All endpoints require a valid JWT token except where noted.

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.haloguard.ai/api/subscription/status
```

---

## Endpoints

### 1. Get Subscription Status

Check the current user's subscription tier and usage.

**Endpoint**: `GET /api/subscription/status`

**Authentication**: Required

**Response**:
```json
{
  "tier": "free",
  "plan": "Free",
  "activeUntil": "2024-12-31T23:59:59Z",
  "features": [
    "Tier 0-2 hallucination detection",
    "100 API calls/month",
    "5 custom KB records",
    "Community support"
  ],
  "usage": {
    "apiCalls": {
      "used": 45,
      "limit": 100,
      "percentage": 45,
      "resetDate": "2024-02-01"
    }
  }
}
```

**Error Responses**:
```json
// Unauthorized
{
  "error": "Unauthorized",
  "status": 401
}

// Internal error
{
  "error": "Failed to fetch subscription status",
  "status": 500
}
```

---

### 2. List Available Plans

Get all available subscription plans.

**Endpoint**: `GET /api/subscription/plans`

**Authentication**: Not required

**Response**:
```json
{
  "plans": [
    {
      "tier": "free",
      "name": "Free",
      "price": 0,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Tier 0-2 detection",
        "100 API calls/month",
        "5 KB records"
      ]
    },
    {
      "tier": "pro",
      "name": "Professional",
      "price": 9.99,
      "currency": "USD",
      "interval": "month",
      "features": [
        "All Tier 0-4 detection",
        "Unlimited API calls",
        "Unlimited KB records",
        "Email support"
      ]
    },
    {
      "tier": "enterprise",
      "name": "Enterprise",
      "price": 0,
      "currency": "USD",
      "interval": "year",
      "features": [
        "Self-hosted deployment",
        "All features unlimited",
        "SLA support"
      ]
    }
  ]
}
```

---

### 3. Upgrade Subscription

Initiate an upgrade to a premium tier.

**Endpoint**: `POST /api/subscription/upgrade`

**Authentication**: Required

**Request Body**:
```json
{
  "tier": "pro"
}
```

**Response** (Success):
```json
{
  "subscriptionId": "sub_1234567890abcdef",
  "clientSecret": "pi_1234567890abcdef_secret_xyz",
  "status": "payment_required",
  "nextAction": "confirm_payment"
}
```

**Usage**:
1. Receive `clientSecret` from response
2. Use with Stripe.js to confirm payment:
```javascript
const stripe = Stripe('pk_live_xxx');
const result = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'John Doe' }
  }
});
```

**Error Responses**:
```json
// Invalid tier
{
  "error": "Invalid tier",
  "status": 400
}

// Already Pro
{
  "error": "Cannot downgrade to free tier", // sic - can't upgrade to free
  "status": 400
}

// Stripe error
{
  "error": "Failed to upgrade subscription",
  "status": 500
}
```

---

### 4. Downgrade Subscription

Downgrade from Pro back to Free tier.

**Endpoint**: `POST /api/subscription/downgrade`

**Authentication**: Required

**Request Body**: (empty)
```json
{}
```

**Response**:
```json
{
  "status": "downgraded",
  "tier": "free",
  "effectiveDate": "2024-02-01"
}
```

**Error Responses**:
```json
// Already on free tier
{
  "error": "Already on free tier",
  "status": 400
}

// Not authenticated
{
  "error": "Unauthorized",
  "status": 401
}
```

---

### 5. Get Billing History

Retrieve payment history.

**Endpoint**: `GET /api/subscription/billing-history`

**Authentication**: Required

**Query Parameters**:
- `limit` (optional): Number of records (default: 10, max: 100)
- `skip` (optional): Number of records to skip (default: 0)

**Response**:
```json
{
  "billingHistory": [
    {
      "id": "inv_1234567890abcdef",
      "date": "2024-01-15T12:00:00Z",
      "amount": 999,
      "currency": "USD",
      "status": "paid",
      "description": "Professional - Monthly",
      "invoiceUrl": "https://invoice.stripe.com/i/abc123"
    },
    {
      "id": "inv_1234567890zyxwvu",
      "date": "2023-12-15T12:00:00Z",
      "amount": 999,
      "currency": "USD",
      "status": "paid",
      "description": "Professional - Monthly",
      "invoiceUrl": "https://invoice.stripe.com/i/xyz789"
    }
  ],
  "total": 2,
  "limit": 10,
  "skip": 0
}
```

---

### 6. Cancel Subscription

Cancel the current subscription.

**Endpoint**: `POST /api/subscription/cancel`

**Authentication**: Required

**Request Body** (optional):
```json
{
  "reason": "Too expensive",
  "feedback": "Planning to use free tier for now"
}
```

**Response**:
```json
{
  "status": "cancelled",
  "effectiveDate": "2024-02-28",
  "tier": "free"
}
```

**Error Responses**:
```json
// No active subscription
{
  "error": "No active subscription",
  "status": 400
}
```

---

### 7. Check Feature Quota

Check if user can access a specific detection tier.

**Endpoint**: `GET /api/subscription/check-quota/:detectionTier`

**Authentication**: Required

**Parameters**:
- `detectionTier`: Detection tier number (0, 1, 2, 3, or 4)

**Response** (Access Allowed):
```json
{
  "canUse": true,
  "tier": "pro",
  "requiredTier": "pro"
}
```

**Response** (Access Denied):
```json
{
  "canUse": false,
  "tier": "free",
  "requiredTier": "pro",
  "upgradeUrl": "/api/subscription/upgrade"
}
```

---

### 8. Get Payment Intent (Advanced)

Retrieve or create a payment intent for confirming payment.

**Endpoint**: `POST /api/subscription/payment-intent`

**Authentication**: Required

**Request Body**:
```json
{
  "subscriptionId": "sub_1234567890abcdef"
}
```

**Response**:
```json
{
  "clientSecret": "pi_1234567890abcdef_secret_xyz",
  "status": "requires_payment_method",
  "amount": 999,
  "currency": "USD"
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 429 | Rate limited |
| 500 | Server error |

---

## Error Handling

All error responses follow this format:

```json
{
  "error": "Human-readable error message",
  "status": 400,
  "code": "ERROR_CODE_CONSTANT",
  "details": {
    "field": "value"
  }
}
```

---

## Common Scenarios

### Scenario 1: Check if user can use Tier 3 detection

```javascript
async function canUseTier3() {
  const response = await fetch(
    '/api/subscription/check-quota/3',
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const { canUse, requiredTier } = await response.json();
  
  if (!canUse) {
    showUpgradePrompt(`Tier 3 requires ${requiredTier} subscription`);
  } else {
    proceedWithDetection();
  }
}
```

### Scenario 2: Show upgrade modal and handle payment

```javascript
async function initiateUpgrade() {
  // Step 1: Create subscription
  const upgradeRes = await fetch('/api/subscription/upgrade', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tier: 'pro' })
  });
  
  const { clientSecret } = await upgradeRes.json();
  
  // Step 2: Confirm payment with Stripe
  const stripe = Stripe('pk_live_xxx');
  const result = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: { name: 'John Doe' }
    }
  });
  
  if (result.paymentIntent.status === 'succeeded') {
    // Payment successful
    showSuccessMessage('Welcome to Pro!');
    refreshSubscription();
  } else {
    // Payment failed
    showErrorMessage(result.error.message);
  }
}
```

### Scenario 3: Display current usage

```javascript
async function displayUsage() {
  const response = await fetch('/api/subscription/status', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const { tier, usage } = await response.json();
  
  if (tier === 'free') {
    const percent = (usage.apiCalls.used / usage.apiCalls.limit) * 100;
    console.log(`API usage: ${usage.apiCalls.used}/${usage.apiCalls.limit} (${percent.toFixed(0)}%)`);
    
    if (percent > 80) {
      showUpgradePrompt('You\'re running low on API calls');
    }
  } else {
    console.log('Unlimited API calls!');
  }
}
```

### Scenario 4: Downgrade and provide feedback

```javascript
async function downgradeSubscription() {
  const feedback = prompt('Why are you downgrading?');
  
  const response = await fetch('/api/subscription/cancel', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: feedback })
  });
  
  const { status } = await response.json();
  
  if (response.ok) {
    showMessage('You\'ve been downgraded to Free. You can upgrade anytime!');
    refreshSubscription();
  }
}
```

---

## Rate Limiting

Different rate limits apply based on subscription tier:

- **Free tier**: 100 requests/hour
- **Pro tier**: 1,000 requests/hour (10x free)
- **Enterprise**: Unlimited

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1609459200
```

When rate limit is exceeded:
```json
{
  "error": "Rate limit exceeded",
  "status": 429,
  "tier": "free",
  "limit": 100,
  "resetAt": "2024-01-31T12:00:00Z"
}
```

---

## Webhook Events (For Server-Side)

The API sends webhooks for subscription changes:

```javascript
// Example: Listen to subscription changes
app.post('/webhooks/stripe', (req, res) => {
  const event = req.body;
  
  switch(event.type) {
    case 'customer.subscription.created':
      // User upgraded
      break;
    case 'customer.subscription.updated':
      // Subscription changed
      break;
    case 'customer.subscription.deleted':
      // User downgraded/cancelled
      break;
    case 'invoice.payment_succeeded':
      // Payment processed
      break;
    case 'invoice.payment_failed':
      // Payment failed
      break;
  }
  
  res.json({received: true});
});
```

---

## Implementation Checklist

- [ ] Install Stripe.js: `<script src="https://js.stripe.com/v3/"></script>`
- [ ] Get publishable key from environment
- [ ] Create Stripe instance: `const stripe = Stripe(key);`
- [ ] Create card element: `const card = elements.create('card');`
- [ ] Mount card: `card.mount('#card-element');`
- [ ] Handle card errors
- [ ] Call upgrade endpoint on button click
- [ ] Confirm payment with Stripe
- [ ] Handle payment success/failure
- [ ] Display subscription status from `/status` endpoint
- [ ] Show billing history from `/billing-history` endpoint

---

## Testing

### Test Cards (Development Only)

```
Card: 4242 4242 4242 4242    Expiry: Any future date    CVC: Any 3 digits
Status: Success

Card: 4000 0000 0000 0002    Expiry: Any future date    CVC: Any 3 digits
Status: Decline

Card: 5555 5555 5555 4444    Expiry: Any future date    CVC: Any 3 digits
Status: Success (Mastercard)
```

### Test Credentials

```bash
# Get JWT token for testing (development only)
curl -X POST https://api.haloguard.ai/auth/test-token \
  -d '{"userId": "test-user-123"}'

# Returns: { "token": "eyJhbGc..." }
```

---

## Best Practices

1. **Cache responses** where appropriate (plans don't change often)
2. **Handle errors gracefully** with user-friendly messages
3. **Show loading states** during payment processing
4. **Validate on frontend** before calling API
5. **Log errors** for debugging
6. **Test thoroughly** with test cards
7. **Never store card data** - use Stripe Elements
8. **Always use HTTPS** in production

---

## Support

For API issues:
- Check error message in response
- Review this documentation
- Check logs: `/var/log/haloguard.log`
- Contact support: support@haloguard.ai

For Stripe issues:
- Check Stripe dashboard
- Review webhook logs
- Contact Stripe support: https://support.stripe.com

---

**Last Updated**: 2024
**API Version**: 1.0
**Status**: Stable

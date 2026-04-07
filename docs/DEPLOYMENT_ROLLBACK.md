# PHASE 3 EPIC 4: Deployment & Rollback Guide

## Pre-Deployment Checklist

### 1. Code Review
- [ ] All licensing code reviewed
- [ ] Tests passing (npm test -- licensing/)
- [ ] No hardcoded credentials
- [ ] Error handling comprehensive
- [ ] Database migrations tested

### 2. Configuration
- [ ] Environment variables documented
- [ ] Database backup created
- [ ] Stripe webhooks configured
- [ ] Email templates set up
- [ ] Cron scheduler configured

### 3. Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Load testing completed
- [ ] Webhook testing completed
- [ ] Payment flow tested end-to-end

### 4. Documentation
- [ ] Setup guide reviewed
- [ ] API documentation updated
- [ ] Troubleshooting guide created
- [ ] Support procedures documented
- [ ] Rollback plan reviewed

---

## Staging Deployment

### 1. Deploy Code
```bash
# Pull latest code
git pull origin feature/licensing

# Install dependencies
npm install

# Build and test
npm run build
npm test -- licensing/

# Create database backup
cp data/haloguard.db data/haloguard.db.backup.$(date +%s)
```

### 2. Run Database Migrations
```bash
# This happens automatically on startup, but verify:
npm run db:migrate -- licensing

# Check that tables were created:
sqlite3 data/haloguard.db ".tables"
# Should see: user_subscriptions, billing_history, etc.
```

### 3. Configure Stripe Test Keys
```bash
# Update .env.staging with Stripe TEST keys
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_test_xxxx
```

### 4. Start Staging Server
```bash
# Deploy to staging environment
npm run deploy:staging

# Verify licensing routes are available
curl https://staging.haloguard.ai/api/subscription/plans

# Should return 200 with plan list
```

### 5. Setup Webhook Forwarding
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to staging
stripe listen --forward-to https://staging.haloguard.ai/webhooks/stripe

# Copy the webhook signing secret
# Update STRIPE_WEBHOOK_SECRET in .env.staging
```

### 6. Run Integration Tests
```bash
# Test against staging environment
npm test:integration -- --env=staging licensing/

# Manual testing
curl -X POST \
  -H "Authorization: Bearer TEST_TOKEN" \
  https://staging.haloguard.ai/api/subscription/upgrade \
  -d '{"tier": "pro"}'

# Should return payment intent
```

### 7. Smoke Tests
```bash
# Test basic functionality
npm run test:smoke -- licensing/

# Manual checks:
# 1. Create test user
# 2. Check /api/subscription/status (should be free)
# 3. Attempt upgrade to pro
# 4. Use test card: 4242 4242 4242 4242
# 5. Complete payment
# 6. Verify subscription in webhook logs
# 7. Check /api/subscription/status (should be pro)
```

---

## Production Deployment

### 1. Pre-Production Steps
```bash
# Create full backup
pg_dump haloguard > backups/haloguard_pre_licensing.sql

# Tag release
git tag -a licensing-v1.0.0 -m "Phase 3 Epic 4: Licensing system"
git push origin licensing-v1.0.0

# Create release notes
echo "Release: Licensing & Subscription System" > RELEASE.md
```

### 2. Deploy Code
```bash
# Merge feature branch to main
git checkout main
git merge --no-ff feature/licensing

# Deploy to production
npm run deploy:production

# Verify deployment
npm run health-check -- licensing

# Should return "licensing: operational"
```

### 3. Switch to Live Stripe Keys
```bash
# ⚠️  CRITICAL STEP ⚠️
# Update production .env with LIVE keys (via CI/CD secrets manager)

STRIPE_SECRET_KEY=sk_live_xxxx    # FROM SECRETS MANAGER
STRIPE_PUBLISHABLE_KEY=pk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_live_xxxx

# Restart server
systemctl restart haloguard
```

### 4. Update Stripe Webhook URL
```bash
# Go to https://dashboard.stripe.com/webhooks
# Edit the webhook endpoint
# Change URL to: https://api.haloguard.ai/webhooks/stripe

# Under Event types, select:
# - customer.subscription.created
# - customer.subscription.updated
# - customer.subscription.deleted
# - invoice.payment_succeeded
# - invoice.payment_failed
# - customer.updated

# Click Save
```

### 5. Verify Webhook Delivery
```bash
# In Stripe Dashboard, go to Webhooks
# Select your endpoint
# Check "Recent deliveries"

# You should see recent webhook events
# If none appear within 5 minutes, check:
# 1. Server logs: tail -f /var/log/haloguard.log
# 2. Network access: curl https://api.haloguard.ai/health
# 3. Firewall rules: ufw status
# 4. Server health: systemctl status haloguard
```

### 6. Setup Scheduled Tasks
```bash
# Verify cron jobs are running
crontab -l

# Should see entries for:
# - Monthly quota reset (0 0 1 * *)
# - Daily quota cleanup (0 2 * * *)
# - Weekly archive (0 3 * * 1)

# Test cron manually:
npm run cron:test -- quota-reset

# Check logs:
journalctl -u haloguard -n 100
```

### 7. Monitor Production
```bash
# Check logging and monitoring
# Loom for errors starting with [License] or [Webhook]
tail -f /var/log/haloguard.log | grep -E "\[License\]|\[Webhook\]"

# Monitor Stripe dashboard for:
# - Recent failures in event deliveries
# - Failed charges
# - API rate limiting

# Monitor database for issues:
sqlite3 data/haloguard.db "SELECT COUNT(*) FROM stripe_events;"
sqlite3 data/haloguard.db "SELECT COUNT(*) FROM user_subscriptions;"
```

---

## Rollback Procedures

### Rollback to Previous Version
```bash
# If critical issues discovered within first hour:

# 1. Scale down production
kubectl scale deployment haloguard --replicas=0

# 2. Restore from backup
pg_restore -d haloguard < backups/haloguard_pre_licensing.sql

# 3. Switch back to old code
git checkout main~1
npm run deploy:production

# 4. Revert Stripe webhook to previous endpoint
# In Stripe Dashboard → Webhooks → Edit
# Change URL back to: https://api.haloguard.ai/webhooks/old

# 5. Scale back up
kubectl scale deployment haloguard --replicas=3

# 6. Notify stakeholders
# Send alert: "Licensing system rolled back, investigating issue"
```

### Partial Rollback (Disable Licensing)
```bash
# If licensing system has critical bug but other features OK:

# 1. Disable licensing via feature flag
# In config, set: LICENSING_ENABLED=false

# 2. Restart server
systemctl restart haloguard

# 3. Users will be treated as on "free" tier
# 4. No subscriptions can be purchased
# 5. But detection and KB features continue to work

# This buys time for a proper fix
```

### Database Rollback
```bash
# If migrations caused database issues:

# 1. Stop server
systemctl stop haloguard

# 2. Restore database from backup
rm data/haloguard.db
cp data/haloguard.db.backup.TIMESTAMP data/haloguard.db

# 3. Restart server
systemctl start haloguard

# 4. Re-apply migrations (automatic on startup)
```

---

## Monitoring & Health Checks

### Health Check Endpoint
```bash
# Verify licensing system is working
curl https://api.haloguard.ai/health/licensing

# Response:
{
  "status": "healthy",
  "stripe_connected": true,
  "webhook_deliveries_successful": 98.5,
  "active_subscriptions": 234,
  "failed_payments_24h": 2
}

# If status != "healthy", investigate:
# 1. Check Stripe API key
# 2. Check webhook delivery logs
# 3. Check database connectivity
```

### Key Metrics to Monitor

**Payment Health**:
```bash
# Failed payment rate (target < 2%)
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(100.0 * SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) / COUNT(*), 2) as failure_rate
FROM billing_history
WHERE created_at >= datetime('now', '-24 hours');
```

**Webhook Delivery**:
```bash
# Webhook success rate (target > 99%)
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
  ROUND(100.0 * SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM stripe_events
WHERE created_at >= datetime('now', '-24 hours');
```

**Subscription Growth**:
```bash
# Active subscriptions by tier
SELECT 
  tier,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) as percentage
FROM user_subscriptions
WHERE active_until > CURRENT_TIMESTAMP
GROUP BY tier;
```

### Alerting Rules

Set up alerts for:
- Payment failure rate > 5%
- Webhook delivery failures > 1%
- API errors > 100/min
- Database growth > 1GB/day
- Failed cron jobs

---

## Post-Deployment Tasks

### 1. Announcement
```markdown
## 🎉 HaloGuard Premium is Now Live

We're excited to announce HaloGuard Premium subscriptions!

**Features**:
- Unlimited API calls (vs 100/mo on free)
- All detection tiers 0-4 (vs 0-2 on free)
- Unlimited custom knowledge bases (vs 5 on free)
- Email support & priority updates

**Pricing**: $9.99/month

Existing users can upgrade at: https://haloguard.ai/pricing
```

### 2. Customer Communication
- [ ] Email announcement to all users
- [ ] In-app notification of "Upgrade Available"
- [ ] Blog post about premium features
- [ ] Social media announcement

### 3. Sales & Support Training
- [ ] Train support team on subscription management
- [ ] Create FAQ for common questions
- [ ] Setup escalation procedures
- [ ] Document refund policy

### 4. Analytics Setup
- [ ] Setup conversion tracking (free → pro)
- [ ] Setup churn tracking
- [ ] Setup revenue analytics
- [ ] Create dashboard for business metrics

---

## Maintenance Windows

### Planned Downtime
```bash
# If upgrades/maintenance needed:

# 1. Announce at least 48 hours in advance
# 2. Schedule during low-usage hours (2-4am UTC)
# 3. Create maintenance page
# 4. Notify active users via email
# 5. Perform backup
# 6. Execute maintenance
# 7. Verify all systems
# 8. Enable service
# 9. Send all-clear notification
```

### Database Optimization
```bash
# Monthly (first Sunday of month)
sqlite3 data/haloguard.db

# Run optimization
VACUUM;
REINDEX;
ANALYZE;

# Check database size
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();
```

---

## Post-Launch Observations (First 7 Days)

**Day 1-2: Monitor Closely**
- [ ] Watch webhook delivery logs every 2 hours
- [ ] Monitor error rates
- [ ] Check for any unexpected behavior
- [ ] Respond quickly to user reports

**Day 3-7: Review Metrics**
- [ ] Analyze signup conversion rate
- [ ] Check payment success rate
- [ ] Review API quota usage patterns
- [ ] Gather user feedback

**Week 2: Performance Analysis**
- [ ] Generate first week report
- [ ] Identify any issues for hotfix
- [ ] Plan optimization tasks
- [ ] Document lessons learned

---

## Support Contacts

In case of emergency:

- **On-Call Engineer**: [phone/email]
- **Stripe Support**: https://support.stripe.com
- **Database Admin**: [contact]
- **DevOps**: [contact]
- **Product Manager**: [contact]

---

**Last Updated**: 2024
**Created By**: HaloGuard Dev Team
**Status**: Ready for Production

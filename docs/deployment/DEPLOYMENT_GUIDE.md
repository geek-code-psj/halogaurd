# HaloGuard Deployment Guide

Complete step-by-step guide for deploying HaloGuard across multiple platforms and marketplaces.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Pre-Deployment Setup](#pre-deployment-setup)
3. [VS Code Extension](#vs-code-extension)
4. [Chrome Web Store](#chrome-web-store)
5. [NPM Package Registry](#npm-package-registry)
6. [Self-Hosted Backend](#self-hosted-backend)
7. [Docker Deployment](#docker-deployment)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Development Machine
- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Python**: v3.9+ (for python-workers)
- **Docker**: v20.10+ (for containerized deployment)
- **Git**: v2.30+

### Services Required
- **Stripe Account**: Business account with API keys (licensing)
- **GitHub Account**: With personal access token (vsce publish)
- **Chrome Developer Account**: For Chrome Web Store deployment ($5 one-time registration)
- **NPM Account**: For publishing SDK packages
- **Railway Account**: For backend hosting (free tier available)

### Databases & Services
- **PostgreSQL**: v14+ (production database)
- **Redis**: v6+ (caching)
- **NLI Service**: Python-based (containerized in python-workers)

---

## Pre-Deployment Setup

### ⚠️ CRITICAL: Never Commit Secrets

The `.env`, `.env.production`, and `.env.*.local` files are in `.gitignore` for critical security reasons:
- Database passwords
- API keys (JWT, Stripe, etc.)
- Webhook secrets
- Service credentials

**If you accidentally commit secrets:**
1. Revoke all keys immediately
2. Use `git filter-branch` to remove from history
3. Rotate all credentials in production

### 1. Environment Configuration

Create `.env.production` locally (NEVER commit):

```bash
# Database - get actual credentials from your database provider
DATABASE_URL=$DATABASE_URL

# Redis - get from Redis provider or Docker
REDIS_URL=$REDIS_URL

# API Keys - generate strong random values
JWT_SECRET=$JWT_SECRET
API_KEY=$API_KEY

# App Settings
NODE_ENV=production
LOG_LEVEL=info
```

**Railway Deployment**: Set these values in Railway Dashboard → Environment Variables. Do NOT paste keys into local `.env` files.

**Local Docker**: Use `.env` file with restricted permissions (chmod 600).

### 2. Verify Build

```bash
# Navigate to project root
cd /path/to/haloguard

# Install dependencies (monorepo)
npm install

# Check all packages build successfully
npm run build

# Run tests (optional but recommended)
npm run test
```

### 3. Verify Package Versions

Ensure all packages are ready for release:

```bash
# Check current versions
npm list --depth=0

# If updating versions:
npm version patch  # For bug fixes (1.0.1 → 1.0.2)
npm version minor  # For features (1.0.0 → 1.1.0)
npm version major  # For breaking changes (1.0.0 → 2.0.0)
```

---

## VS Code Extension

### Prerequisites
- VS Code CLI (`code` command available in PATH)
- vsce CLI: `npm install -g @vscode/vsce`
- Personal Access Token from [Azure DevOps](https://dev.azure.com/)

### Build & Publish

#### Step 1: Create Personal Access Token

1. Go to [Azure DevOps](https://dev.azure.com/)
2. Click profile icon → Personal access tokens
3. Create new token with scopes: `Marketplace (manage)`, `Publish`
4. Save token securely

#### Step 2: Build Extension

```bash
cd vscode-extension

# Install dependencies
npm install

# Build extension
npm run build

# Package as .vsix
vsce package
```

#### Step 3: Publish to Marketplace

```bash
# Publishing (requires vsce login first)
vsce publish -p <YOUR_TOKEN>

# Or login then publish
vsce login
vsce publish

# Verify installation
# https://marketplace.visualstudio.com/items?itemName=YourPublisher.haloguard
```

#### Step 4: Verification

- Open VS Code Extensions → Search "haloguard"
- Click "Install"
- Verify command palette shows "HaloGuard: Enable" command

### Manual Testing

```bash
# Run in development mode
cd vscode-extension
npm run dev
# VS Code opens with extension loaded, press F5
```

### Marketplace Details
- **URL**: https://marketplace.visualstudio.com/
- **Free Trial**: Yes (all features available)
- **Requirements**: VS Code 1.70+

---

## Chrome Web Store

### Prerequisites
- Chrome Web Store Developer Account ($5 registration)
- 128x128 PNG icon
- 1280x800 PNG screenshot
- 440x280 PNG promotional tile image

### Build & Upload

#### Step 1: Prepare Assets

Create image assets (if not already present):

```bash
# Extensions directory structure
chrome-extension/
├── images/
│   ├── icon_128.png        # Store icon (128x128)
│   ├── screenshot_1280.png # Store screenshot (1280x800)
│   └── promo_440.png       # Promotional tile (440x280)
└── manifest.json           # Already contains icon reference
```

#### Step 2: Build Extension

```bash
cd chrome-extension

# Install dependencies
npm install

# Build extension
npm run build

# Create zip archive
# Using Windows PowerShell:
Compress-Archive -Path . -DestinationPath haloguard-chrome.zip

# Or on macOS/Linux:
zip -r haloguard-chrome.zip . -x "node_modules/*" ".git/*"
```

#### Step 3: Publish to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)
2. Login with your developer account
3. Click "New Item"
4. Upload `haloguard-chrome.zip`
5. Fill in details:
   - **Name**: HaloGuard
   - **Description**: AI-powered hallucination detection for Chrome
   - **Detailed Description**: See [EXTENSION_DESCRIPTION.md](docs/EXTENSION_DESCRIPTION.md)
   - **Category**: Productivity or Developer Tools
   - **Language**: English
   - **Content Rating**: Select appropriate rating
6. Upload images:
   - Icon (128x128)
   - Screenshot (1280x800)
   - Promotional tile (440x280)
7. Click "Submit for Review"

#### Step 4: Verification

- Chrome Web Store listing will appear after review (1-3 business days)
- URL format: `https://chrome.google.com/webstore/detail/haloguard/[EXTENSION_ID]`
- Install via Chrome Web Store

### Manual Testing

```bash
# Load unpacked extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode" (top right)
# 3. Click "Load unpacked"
# 4. Select chrome-extension/ directory
# 5. Extension appears in your toolbar
```

### Marketplace Details
- **URL**: https://chrome.google.com/webstore/detail/
- **Free Trial**: Yes (all features available)
- **Review Time**: 1-3 business days
- **Browser Support**: Chrome 90+, Edge 90+, Brave (Chromium-based)

---

## NPM Package Registry

### Prerequisites
- NPM Account at [npmjs.com](https://www.npmjs.com)
- NPM CLI: `npm` command available
- 2FA enabled recommended for security

### Build & Publish SDK

#### Step 1: Prepare SDK Package

```bash
cd shared-client-sdk

# Install dependencies
npm install

# Build SDK
npm run build

# Verify package.json is correct
cat package.json | grep -A3 '"name"'
# Should output: "@geek-code-psj/haloguard-sdk" or similar
```

#### Step 2: Authentication

```bash
# Login to NPM
npm login

# Enter credentials when prompted
# Username: your_npm_username
# Password: your_npm_password
# Email: your_email@example.com
# OTP (if 2FA enabled): code_from_authenticator

# Verify login
npm whoami
# Output: your_npm_username
```

#### Step 3: Publish Package

```bash
cd shared-client-sdk

# Update version (if not already done)
npm version patch  # From 1.0.0 → 1.0.1

# Publish to registry
npm publish

# Or publish as public scoped package
npm publish --access=public

# Verify publication
npm view @geek-code-psj/haloguard-sdk
```

#### Step 4: Installation Verification

Users can now install:

```bash
npm install @geek-code-psj/haloguard-sdk
```

### Usage Documentation

Keep `.npmrc` minimal and standard:

```
# Leave this empty if using npm 7+
# npm handles hoisting automatically
```

Users should use standard npm configuration.

### Marketplace Details
- **URL**: https://www.npmjs.com/package/@geek-code-psj/haloguard-sdk
- **Free Tier**: Public packages unlimited
- **Scoped Packages**: Supported
- **Access Control**: Public/private options

---

## Self-Hosted Backend

### Option A: Railway Deployment (Recommended)

Railway is an all-in-one platform for deploying and managing Node.js apps.

#### Step 1: Create Railway Account

1. Go to [Railway.app](https://railway.app)
2. Sign up with GitHub account
3. Create new project

#### Step 2: Connect GitHub Repository

```bash
# In Railway dashboard:
# 1. Click "Create New"
# 2. Select "GitHub"
# 3. Select "geek-code-psj/haloguard" repository
# 4. Select "shared-core" service (if monorepo)
# 5. Click Deploy
```

#### Step 3: Configure Environment Variables

In Railway dashboard → Environment Variables, set only these (Stripe not implemented yet):

```
NODE_ENV=production
DATABASE_URL=$DATABASE_URL
REDIS_URL=$REDIS_URL
JWT_SECRET=$JWT_SECRET
API_KEY=$API_KEY
LOG_LEVEL=info
```

**Generate JWT_SECRET and API_KEY:**
```bash
node -e "console.log('JWT:', require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('API:', require('crypto').randomBytes(16).toString('hex'))"
```

**Note**: Do NOT add Stripe keys until Phase 3 payment flow is implemented. Live API keys sitting idle are an attack surface.

#### Step 4: Add Database & Cache

In Railway dashboard:
1. Click "Create New"
2. Select **PostgreSQL** → Save environment variables automatically
3. Click "Create New"
4. Select **Redis** → Save environment variables automatically

#### Step 5: Deploy & Verify

```bash
# Monitor deployment in Railway dashboard
# Once deployed, you'll get a live URL

# Test backend health
curl https://your-railway-url/health

# Should return: HTTP 200 with health status
# For detailed readiness check:
curl https://your-railway-url/ready
```

#### Continuous Deployment

- Automatic deploys on push to main branch
- Manual redeploy available in Railway dashboard
- Rollback to previous builds available

---

### Option B: Docker Compose (Local/Custom VPS)

#### Step 1: Build Images

```bash
# Build backend image
docker-compose build backend

# Build Python NLI worker image
docker-compose build python-worker
```

#### Step 2: Configure Environment

⚠️ **Create `.env` file locally ONLY (never commit):**

```
# Backend
NODE_ENV=production
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/haloguard
REDIS_URL=redis://:${REDIS_PASSWORD}@cache:6379
JWT_SECRET=${JWT_SECRET}
API_KEY=${API_KEY}

# Database
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=haloguard

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}
```

**Generate strong passwords locally:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Substitute the output for `${POSTGRES_PASSWORD}` and `${REDIS_PASSWORD}`.

#### Step 3: Start Services

```bash
# Start all services (backend, database, cache, python-worker)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Verify services running
docker-compose ps
```

#### Step 4: Database Migrations

```bash
# Run Prisma migrations
docker-compose exec backend npx prisma migrate deploy

# Seed initial data (optional)
docker-compose exec backend npm run seed
```

#### Step 5: Health Check

```bash
# Test backend health
curl http://localhost:3000/health

# Detailed readiness check
curl http://localhost:3000/ready

# Check logs
docker-compose logs backend
```

### Docker Compose File Reference

See [docker-compose.yml](docker-compose.yml) for:
- Service configurations
- Port mappings (backend: 3000, adminer: 8080, redis: 6379)
- Volume management
- Network setup

---

## Docker Deployment

### Standalone Docker Commands

If not using docker-compose:

```bash
# Build backend image
docker build -f Dockerfile -t haloguard-backend:latest .

# Build Python worker image
docker build -f Dockerfile.python -t haloguard-nlp:latest python-workers/

# Run backend container
docker run -d \
  --name haloguard-backend \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  haloguard-backend:latest

# Run Python worker container
docker run -d \
  --name haloguard-nlp \
  -p 5000:5000 \
  haloguard-nlp:latest
```

### Production Considerations

- Use Docker secrets for sensitive environment variables
- Implement health checks in orchestration (Kubernetes, Docker Swarm)
- Set resource limits: `--memory=512m --cpus=1.0`
- Use persistent volumes for database storage
- Implement log aggregation (ELK stack, Datadog, etc.)

---

## Post-Deployment Verification

### Smoke Tests

```bash
# Test each marketplace

# 1. VS Code Extension
# Install from marketplace and verify command appears

# 2. Chrome Extension
# Install from Chrome Web Store and verify popup loads

# 3. NPM SDK
npm install @geek-code-psj/haloguard-sdk
node -e "const sdk = require('@geek-code-psj/haloguard-sdk'); console.log(sdk)"

# 4. Backend Health
curl https://your-deployment-url/health
# Expected: HTTP 200 with { "status": "healthy" }

# Readiness check (includes Redis, Database, BullMQ status)
curl https://your-deployment-url/ready
# Expected: HTTP 200 with { "status": "ready", "checks": {...} }

# 5. Licensing System
curl -X GET "https://your-deployment-url/api/v1/subscription" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Monitoring Setup

1. **Application Monitoring**: Set up error tracking (Sentry, LogRocket)
2. **Performance Monitoring**: Enable APM (New Relic, Datadog)
3. **Uptime Monitoring**: Configure alerting (UptimeRobot, Pingdom)
4. **Log Aggregation**: Centralize logs (ELK, Cloudflare)

### Performance Baseline

- **API Response Time**: < 200ms for hallucination detection
- **Extension Popup Load**: < 500ms
- **SDK Initialization**: < 100ms
- **CPU Usage**: < 30% at baseline
- **Memory Usage**: < 512MB per service

---

## Rollback Procedures

### VS Code Extension Rollback

```bash
# Publish deprecated version
vsce unpublish YourPublisher.haloguard --version 1.0.5

# Or publish previous version over current
cd vscode-extension
git checkout vX.Y.Z  # Previous tag
npm run build
vsce publish -p <TOKEN>
```

### Chrome Extension Rollback

1. Go to Chrome Web Store Developer Dashboard
2. Select extension
3. Click "Admin" → "Version History"
4. Select previous version and click "Restore"

### NPM Package Rollback

```bash
# Deprecate problematic version
npm deprecate @geek-code-psj/haloguard-sdk@1.0.5 "Use 1.0.4 instead - critical bug"

# Or unpublish (only within 72 hours)
npm unpublish @geek-code-psj/haloguard-sdk@1.0.5 --force
```

### Backend Rollback

#### Railway:
1. Go to Railway dashboard
2. Select previous successful build
3. Click "Deploy"

#### Docker:
```bash
# Stop current container
docker stop haloguard-backend

# Run previous version
docker run -d --name haloguard-backend-prev \
  haloguard-backend:previous-tag
```

### Database Rollback

See [DEPLOYMENT_ROLLBACK.md](docs/DEPLOYMENT_ROLLBACK.md) for detailed database recovery procedures.

---

## Troubleshooting

### Common Issues

#### Build Failures

```bash
# Clear build cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build

# Check for dependency conflicts
npm audit fix

# Verify Node version
node --version  # Should be 18.x+
```

#### Extension Not Appearing in Marketplace

- **VS Code**: Check publisher name matches in package.json
- **Chrome**: Ensure manifest.json version is incremented
- **NPM**: Verify scoped package name is correct

#### Database Connection Errors

```bash
# Verify DATABASE_URL is set correctly
echo $DATABASE_URL

# Test connection (if using psql)
psql $DATABASE_URL -c "SELECT 1"

# Check if postgres service is running
docker ps | grep postgres
```

#### Redis Connection Issues

```bash
# Verify Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
# Expected: PONG

# Debug connection string
echo $REDIS_URL
```

#### Stripe Webhook Not Working

1. Verify `STRIPE_WEBHOOK_SECRET` is set correctly
2. Check webhook endpoint is accessible: `https://your-url/webhook/stripe`
3. Verify IP whitelist if applicable
4. Check recent requests in Stripe dashboard → Webhooks

### Debug Logging

Enable verbose logging:

```bash
# Docker
docker-compose logs -f --tail=100 backend

# Railway
# View in Railway dashboard → Deployments → Logs

# Local
LOG_LEVEL=debug npm run dev
```

### Support Resources

- **Issues**: https://github.com/geek-code-psj/haloguard/issues
- **Documentation**: See [docs/](docs/) directory
- **License/Billing**: See [docs/LICENSING_API_REFERENCE.md](docs/LICENSING_API_REFERENCE.md)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-08 | Initial production release |

---

*Last updated: April 8, 2026*

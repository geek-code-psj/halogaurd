# HaloGuard - Build & Deployment Guide

## Prerequisites

Ensure you have installed:
- **Node.js:** v18+ (`node --version`)
- **npm:** v10+ (`npm --version`)
- **Git:** v2.30+ (`git --version`)

## Setup (First Time Only)

```bash
# Clone repository
git clone https://github.com/yourusername/haloguard.git
cd haloguard

# Install dependencies (monorepo via npm workspaces)
npm install

# Verify setup
npm run type-check
```

## Building Chrome Extension

### Development Build
```bash
# Start webpack in watch mode (auto-rebuilds on file changes)
cd chrome-extension
npm run dev

# Output directory: ../../dist/chrome-extension/
# Check for TypeScript errors in console
```

### Production Build
```bash
# Create optimized production bundle
cd chrome-extension
npm run build

# Output: ../../dist/chrome-extension/
# Size: ~500KB (should be < 1MB)

# Verify output
ls -lah ../../dist/chrome-extension/
```

Expected output structure:
```
dist/chrome-extension/
├── manifest.json           (4 KB)
├── service-worker.js       (45 KB - minified)
├── content-script.js       (35 KB - minified)
├── popup.html              (2 KB)
├── styles.css              (3 KB)
└── public/
    ├── icons/
    │   └── icon-128.png    (12 KB)
    └── screenshots/
        ├── screenshot-1.png
        ├── screenshot-2.png
        └── screenshot-3.png
```

## Local Testing (Chrome Dev Mode)

### Load Unpacked Extension

1. **Open Chrome Extensions:**
   ```
   chrome://extensions
   ```

2. **Enable Developer Mode**
   - Toggle switch in top-right corner

3. **Load Unpacked**
   - Click "Load unpacked"
   - Navigate to: `dist/chrome-extension/`
   - Click "Select Folder"

4. **Extension should appear in toolbar**
   - Pin icon if desired
   - Click to open popup

### Testing on ChatGPT

1. **Open ChatGPT:** https://chatgpt.com
2. **Ask a question** (e.g., "What's 2+2?")
3. **Wait for response**
4. **Check for:
   - [ ] Sidebar appears on right side
   - [ ] Score displays (green/yellow/orange/red)
   - [ ] Issues list shows
   - [ ] Close button works

### Debugging

**View Service Worker Logs:**
- Extensions page → HaloGuard → Service Worker link → DevTools opens
- Check console for [HaloGuard] messages

**View Content Script Logs:**
- Open page (e.g., ChatGPT)
- Right-click → Inspect
- Go to Console tab
- Look for [HaloGuard] prefixed messages

**Check Network Activity:**
- DevTools → Network tab
- Look for requests to backend API (https://haloguard-production.up.railway.app)
- Should see POST /api/v1/analyze requests

### Troubleshooting Common Issues

**Extension doesn't appear:**
- Run `npm run build` again
- Clear Chrome cache: Settings → Privacy → Clear Browsing Data
- Reload extension: Extensions page → Reload button

**Service worker errors:**
- Check `dist/chrome-extension/manifest.json` exists
- Check `dist/chrome-extension/service-worker.js` exists
- Verify TypeScript compilation: `npm run type-check`

**Content script not running:**
- Verify `dist/chrome-extension/content-script.js` exists
- Check popup console for connection errors
- Try reloading page (Ctrl+R)

**Backend not responding:**
- Check backend is running: `curl https://haloguard-production.up.railway.app/health`
- Verify API URL in storage settings
- Check dev tools Network tab for failed requests

## Backend Integration

### Health Check

```bash
# From project root
curl https://haloguard-production.up.railway.app/health
# Response: {"ok":true,"services":{"database":true,"redis":true,"queue":true}}
```

### Testing Endpoints

```bash
# Create session
curl -X POST https://haloguard-production.up.railway.app/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"platform":"chrome-ext"}'

# Analyze content
curl -X POST https://haloguard-production.up.railway.app/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"session_123",
    "content":"2+2=5",
    "platform":"chatgpt",
    "contentHash":"abc123"
  }'
```

## Deployment to Production

### Generate Chrome Web Store Package

```bash
# Build production bundle
npm run build

# Create distribution archive
cd dist
zip -r haloguard-v0.1.0.zip chrome-extension/
ls -lh haloguard-v0.1.0.zip
# Expected: ~500KB
```

### Submit to Chrome Web Store

1. Go to: https://chrome.google.com/webstore/developer/dashboard
2. Click "Create New Item"
3. Upload `haloguard-v0.1.0.zip`
4. Fill in store listing (see CHROME_WEB_STORE_SUBMISSION.md)
5. Click "Submit for Review"

### Monitor Rollout

- Watch dashboard for approval (1-3 hours typically)
- Store URL will be assigned once approved
- Monitor crash rates in first week
- Be prepared to fix issues if rejections occur

## Continuous Integration (Future)

### GitHub Actions Workflow Example

```yaml
# .github/workflows/build-extension.yml
name: Build Chrome Extension
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
      - run: npm install
      - run: npm run build
      - run: npm run type-check
      - uses: actions/upload-artifact@v3
        with:
          name: chrome-extension
          path: dist/chrome-extension/
```

## Performance Optimization

### Bundle Size Analysis

```bash
# Install webpack-bundle-analyzer
npm install --save-dev webpack-bundle-analyzer

# Analyze bundle
webpack-bundle-analyzer dist/chrome-extension/service-worker.js
```

Target sizes:
- service-worker.js: < 50KB
- content-script.js: < 40KB
- popup.js: < 20KB

### Profiling

Run Chrome DevTools profiler:
1. Extension page → Run test
2. DevTools → Performance tab → Record
3. Run test scenario
4. Stop recording
5. Analyze frame rate and CPU usage

## Troubleshooting Build Issues

### Issue: TypeScript Compilation Error

```bash
npm run type-check
# Fix errors shown in output
```

### Issue: Webpack Build Fails

```bash
# Clear node_modules cache
rm -rf node_modules/.cache
npm run build
```

### Issue: Module Not Found

```bash
# Rebuild TypeScript declarations
npm install
npm run build
```

## Release Checklist

Before releasing to production:

- [ ] All tests passing: `npm test`
- [ ] Type checking passes: `npm run type-check`
- [ ] Production build succeeds: `npm run build`
- [ ] Bundle size acceptable (< 1MB)
- [ ] Tested on all 8 platforms locally
- [ ] Chrome Web Store listing complete
- [ ] Privacy policy published
- [ ] Screenshots uploaded
- [ ] Icons provided (128x128)
- [ ] Manifest version bumped
- [ ] CHANGELOG.md updated

## Rollback Procedure

If critical issues found post-launch:

```bash
# Revert to previous version
git revert <commit-hash>
npm run build
zip -r haloguard-v0.1.1.zip dist/chrome-extension/

# Upload new version to Chrome Web Store
# Chrome will auto-update users (typically < 24 hours)
```

---

**Last Updated:** April 2026
**Next maintenance:** Post-launch (Day 7, Day 30)

# HaloGuard - Chrome Web Store Submission

## Pre-Submission Checklist

### ✅ Technical Requirements

- [ ] **Manifest v3** - manifest.json uses MV3 format
- [ ] **Permissions Minimal** - only necessary permissions declared
  - `tabs` - tab data access
  - `activeTab` - current tab info
  - `scripting` - content script injection
  - `storage` - local/sync storage
  - `runtime` - message passing
- [ ] **No Remote Code** - all code bundled locally
- [ ] **No Ad Injection** - clean extension
- [ ] **Reviewed Manifest Permissions**:
  ```json
  "permissions": [
    "storage",
    "tabs",
    "activeTab"
  ],
  "host_permissions": [
    "*://chatgpt.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
    "*://copilot.microsoft.com/*",
    "*://perplexity.ai/*",
    "*://grok.com/*",
    "*://x.com/grok*",
    "*://meta.ai/*",
    "*://deepseek.com/*"
  ]
  ```

### ✅ Content Guidelines

- [ ] **Privacy Policy** - Clear, accessible at https://haloguard.com/privacy
- [ ] **Privacy Compliance** - No user data stored on backend (only session ID)
- [ ] **Secure HTTPS** - Backend uses HTTPS only
- [ ] **No Tracking** - No analytics, no telemetry
- [ ] **Data Retention** - Cache expires in 24 hours
- [ ] **User Control** - Enable/disable toggle present

### ✅ Branding & Assets

#### Icon Requirements (Chrome Web Store)
- **128x128 pixels** - PNG format, transparent background
- **Filename:** `icon-128.png`
- **Location:** `chrome-extension/public/icons/icon-128.png`
- **Style:** Clean, professional, distinct letter 'G' or shield badge

#### Screenshots
1. **1280x800** - Main functionality screenshot (sidebar showing score)
2. **1280x800** - Settings panel showing options
3. **1280x800** - Error handling graceful fallback
- **Filenames:** `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`
- **Location:** `chrome-extension/public/screenshots/`

#### Promotional Images (optional but recommended)
- **Tile image:** 440x280 (small promotional)
- **Marquee image:** 1400x560 (large promotional)

### ✅ Store Listing Content

#### Required
1. **Extension Name**
   ```
   HaloGuard - AI Hallucination Detector
   ```

2. **Short Description (12 words)**
   ```
   Real-time AI hallucination detection for ChatGPT, Claude, Gemini,
   Copilot, Perplexity, Grok, Meta, and DeepSeek.
   ```

3. **Detailed Description**
   ```markdown
   ## Detect AI Hallucinations in Real-Time

   HaloGuard analyzes every AI response to detect hallucinations,
   false claims, and unreliable information on major AI platforms.

   ### ✨ Features
   - **8 Platform Support**: ChatGPT, Claude, Gemini, Copilot, 
     Perplexity, Grok, Meta AI, DeepSeek
   - **Instant Analysis**: Scoring appears within seconds
   - **Smart Caching**: Identical queries cached for instant results
   - **Adjustable Threshold**: Customize sensitivity levels
   - **Dark Mode**: Eye-friendly interface
   - **Privacy-First**: Only analyzes, never stores your data

   ### 🛡️ How It Works
   1. Extension intercepts AI responses
   2. Content is hashed and sent securely to our API
   3. Advanced NLP pipeline scores hallucination probability
   4. Results display as color-coded sidebar
   5. All data deleted after 24 hours

   ### ⚠️ Important Notes
   - HaloGuard is a safety tool, not a fact-checker
   - Always verify important information independently
   - Some legitimate content may score higher due to speculation
   - Backend API requires internet connection

   ### 🔒 Privacy
   - No personal data collected
   - Content only processed for analysis
   - Session data expires after 24 hours
   - Open source (coming soon)

   **Version:** 0.1.0 (Beta)
   **Status:** Free
   **Developer:** HaloGuard Team
   ```

4. **Category**
   ```
   Productivity
   ```

5. **Language**
   ```
   English
   ```

## Submission Steps

### Step 1: Create Chrome Web Store Developer Account
- Visit: https://chrome.google.com/webstore/developer/dashboard
- Create Google Cloud project if needed
- Pay $5 USD one-time registration fee
- Set up payment information

### Step 2: Prepare Extension Package
```bash
# Build production bundle
npm run build

# Verify output
ls dist/chrome-extension/
# Should contain:
# - manifest.json
# - service-worker.js
# - content-script.js
# - popup.html
# - styles.css
# - public/icons/*
# - public/screenshots/*
```

### Step 3: Create ZIP Archive
```bash
# Create submission package
cd dist
zip -r haloguard-v0.1.0.zip chrome-extension/
# File: haloguard-v0.1.0.zip (~500KB)
```

### Step 4: Submit on Dashboard
1. Go to **Chrome Web Store Developer Dashboard**
2. Click **Create New Item**
3. Upload `haloguard-v0.1.0.zip`
4. Fill in all required fields:
   - Name: "HaloGuard - AI Hallucination Detector"
   - Short description: (max 132 characters)
   - Detailed description: (above)
   - Category: "Productivity"
   - Language: "English"
   - Website: "https://haloguard.com"
   - Email: "support@haloguard.com"
5. Upload icons (128x128)
6. Upload 2-3 screenshots (1280x800)
7. Add privacy policy: "https://haloguard.com/privacy"
8. Review permissions:
   - Justify why each permission is needed
   - Focus on "transparent about what extension does"

### Step 5: Compliance Review
Google will review for:
- **Malware/Viruses** - Scan via VirusTotal
- **Policy Compliance** - No ads, tracking, or hidden behavior
- **Functionality** - Works as described
- **Content Guidelines** - Appropriate for all audiences
- **Security** - HTTPS only, no insecure patterns

**Expected Review Time:** 1-3 hours (usually faster)

### Step 6: Approval & Publishing
- Once approved, extension appears on Chrome Web Store
- URL: `https://chrome.google.com/webstore/detail/[EXTENSION_ID]`
- Users can install via landing page or direct link

## Post-Launch Optimization

### Store Listing Optimization
- Monitor **install rate** through dashboard
- Track **uninstall rate** (target < 10% after 30 days)
- Respond to **user reviews** and feedback
- Update description based on questions
- Add **FAQ section** if needed

### User Feedback Loop
- Monitor Chrome Web Store reviews
- Fix issues in minor releases (0.1.1, 0.1.2)
- Add features based on feedback (Phase 2)
- Publish monthly stability updates

### Performance Monitoring
- Track **API response times**
- Monitor **crash reports**
- Analyze **usage patterns**
- Optimize **detection model** based on data

## Version Releases

### Version 0.1.1 (Bugfix - ~2 weeks)
- Fix reported issues
- Improve performance
- Update dependencies

### Version 0.2.0 (Feature Release - ~4 weeks)
- Add voice narration for results
- Support for Japanese/Chinese
- Offline mode fallback
- Custom issue categories

### Version 1.0.0 (Stable - ~8 weeks)
- Production-grade reliability
- Full documentation
- Professional support email
- Roadmap published

## Metrics to Track

| Metric | Target | Tool |
|--------|--------|------|
| Installs/Day | 100+ | Chrome Dashboard |
| Avg Rating | 4.5/5 | Chrome Dashboard |
| Crash Rate | < 0.1% | Telemetry (if added) |
| API Success Rate | > 99% | Backend monitoring |
| Response Time | < 2s avg | Backend logs |

## Troubleshooting Store Rejection

### Common Rejection Reasons

**"Violates Chrome Web Store Policies"**
- Check: No ads, no tracking, no malware
- Fix: Remove telemetry code, verify manifest

**"Host Permissions Too Broad"**
- Check: Limit host_permissions to specified domains
- Fix: Use specific `*://domain/*` patterns only

**"Privacy Policy Missing"**
- Check: Publicly accessible privacy policy URL
- Fix: Publish policy, add to manifest

**"Deceptive Implementation"**
- Check: Functionality matches description
- Fix: Update description or fix implementation

**"Manifest Validation Issues"**
- Check: manifest.json syntax valid
- Fix: Run `npx ts-json-schema-validator manifest.json`

## Support Resources

- **Chrome Extensions Documentation:** https://developer.chrome.com/docs/extensions/
- **Web Store Policy:** https://chrome.google.com/webstore/category/extensions
- **MV3 Migration Guide:** https://developer.chrome.com/docs/extensions/mv3/
- **Security Best Practices:** https://developer.chrome.com/docs/extensions/mv3/security/

---

**Last Updated:** April 2026
**Next Review:** Post-launch feedback (Day 30)

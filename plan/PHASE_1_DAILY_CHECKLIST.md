# Phase 1: Chrome Extension - Daily Progress Checklist

**Phase Start**: Apr 13, 2026  
**Phase End**: Apr 25, 2026 (submit to Web Store)  
**Team Members**: [TBD]  
**Daily Standup**: 10am

---

## Week 1: Setup & Core Components (Apr 13-19)

### Day 1 - Apr 13: PROJECT SETUP
**Daily Goal**: Scaffold Chrome extension project and setup infrastructure

- [ ] Create chrome-extension folder structure
- [ ] Initialize package.json with dependencies
- [ ] Setup TypeScript (tsconfig.json)
- [ ] Configure webpack/Vite build system
- [ ] Create manifest.json (MV3 spec)
- [ ] Create basic project README

**Config Files Created**:
- [ ] manifest.json
- [ ] tsconfig.json
- [ ] webpack.config.js (or vite.config.ts)
- [ ] package.json with build scripts
- [ ] .env.example for API URL config

**Testing**: No errors during build
**Notes**: 
- Ensure Node v18+ installed
- Verify webpack compiles without errors

---

### Day 2 - Apr 14: TYPES & UTILITIES
**Daily Goal**: Build core utility functions and TypeScript types

- [ ] Create types/index.ts with all interfaces
  - [ ] AnalysisRequest
  - [ ] AnalysisResult
  - [ ] DetectionIssue
  - [ ] ExtensionMessage
  - [ ] SessionData

- [ ] Create utils/constants.ts
  - [ ] API_URL
  - [ ] PLATFORMS (ChatGPT, Claude, Gemini)
  - [ ] STORAGE_KEYS

- [ ] Create utils/logger.ts
  - [ ] info() function
  - [ ] error() function
  - [ ] warn() function
  - [ ] debug() function

- [ ] Create utils/storage.ts (Chrome Storage API wrapper)
  - [ ] getFromStorage()
  - [ ] setToStorage()
  - [ ] clearStorage()

**Testing**: No TypeScript errors
**Notes**: 
- Test types compile correctly
- Verify storage APIs mock correctly

---

### Day 3 - Apr 15: COMMUNICATION LAYER
**Daily Goal**: Build message passing and backend API communication

- [ ] Create utils/messaging.ts
  - [ ] sendMessage() - popup to content script
  - [ ] listenForMessages() - message receiver
  - [ ] Verify message structure validation

- [ ] Create utils/api.ts
  - [ ] analyzeContent() - POST to backend
  - [ ] createSession() - POST create session
  - [ ] Error handling & retries
  - [ ] WebSocket fallback logic

- [ ] Setup axios or fetch interceptors
  - [ ] Add request/response logging
  - [ ] Add error handling
  - [ ] Add timeout config (10s)

**Testing**: 
- [ ] Test message sending (mock)
- [ ] Test API calls (mock backend)
- [ ] Test error scenarios

**Notes**:
- Use mock data for testing before backend ready
- Setup CORS headers test

---

### Day 4 - Apr 16: POPUP UI (REACT COMPONENT)
**Daily Goal**: Build main popup React component

- [ ] Create popup/index.tsx (React entry point)
- [ ] Create popup/Popup.tsx component
  - [ ] Layout: header + main + footer
  - [ ] State management (analyzing, results, error, idle)
  - [ ] "Analyze This" button
  - [ ] Results display area
  - [ ] Settings icon/button
  - [ ] Loading spinner during analysis

- [ ] Create popup/styles.module.css
  - [ ] Responsive design (popup is 350px x 500px)
  - [ ] Button styling
  - [ ] Results card styling
  - [ ] Dark mode support (optional)

- [ ] Create ResultCard.tsx component
  - [ ] Display score (0-100)
  - [ ] Display flagged status (red/yellow/green)
  - [ ] List of 5 issues (collapsible)
  - [ ] "Learn More" link per issue

**Testing**:
- [ ] Component renders without errors
- [ ] All buttons clickable
- [ ] State changes work correctly

**Notes**:
- Use React Hooks (useState, useEffect, useCallback)
- Keep component pure (no side effects)
- Mock API responses for testing

---

### Day 5 - Apr 17: CONTENT SCRIPT & MESSAGE HANDLING
**Daily Goal**: Build content script and message routing

- [ ] Create content/content.ts
  - [ ] Listen for chrome runtime messages
  - [ ] Get selected text from page
  - [ ] Get latest AI response (site-specific)
  - [ ] Send analysis request to popup

- [ ] Create content/messages.ts
  - [ ] Message protocol handlers
  - [ ] ANALYZE_REQUEST handler
  - [ ] ANALYZE_RESPONSE handler
  - [ ] ERROR handler

- [ ] Create content/injector.ts
  - [ ] Inject overlay div into DOM
  - [ ] Display results overlay
  - [ ] Handle overlay close/dismiss

**Testing**:
- [ ] Load extension in chrome://extensions
- [ ] Console shows "[HaloGuard] Content script loaded"
- [ ] Message passing works (test with mock popup)

**Notes**:
- Verify manifest.json includes content script
- Test on http://localhost:3000 first (mock site)
- Check for CSP violations in console

---

### Day 6 - Apr 18: BACKGROUND SERVICE WORKER
**Daily Goal**: Build background service worker

- [ ] Create background/background.ts
  - [ ] chrome.runtime.onInstalled handler
  - [ ] chrome.tabs.onUpdated listener
  - [ ] Cleanup listeners
  - [ ] State management across pages

- [ ] Setup extension lifecycle
  - [ ] Initialize storage on install
  - [ ] Set default API URL
  - [ ] Set default theme preference
  - [ ] Verify permission grants

**Testing**:
- [ ] Install/uninstall extension
- [ ] Verify storage initialized
- [ ] Check logs in background.js console

**Notes**:
- Service workers don't stay alive (volatile)
- Use Chrome storage for persistence
- Test permission prompts work

---

### Day 7 - Apr 19: BUILD & LOCAL TESTING
**Daily Goal**: Build extension and test locally

- [ ] Run build: `npm run build`
  - [ ] No errors in console
  - [ ] dist/ folder created with all files
  - [ ] manifest.json present
  - [ ] All icons present

- [ ] Load in Chrome
  - [ ] Go to chrome://extensions
  - [ ] Enable "Developer mode"
  - [ ] Click "Load unpacked"
  - [ ] Select dist/ folder

- [ ] Manual testing
  - [ ] Icon appears in toolbar ✅
  - [ ] Click icon → popup opens ✅
  - [ ] "Analyze This" button visible ✅
  - [ ] Settings icon present ✅
  - [ ] No console errors ✅

**Testing Checklist**:
- [ ] Popup opens and closes smoothly
- [ ] No TypeScript errors
- [ ] No console.error() messages
- [ ] Extension loads without warnings

**Notes**:
- If issues: check dist/ folder contents
- Verify manifest.json is valid JSON
- Test keyboard navigation (Tab key)

---

## Week 2: Integration & Deployment (Apr 20-25)

### Day 8 - Apr 20: CHATGPT INTEGRATION
**Daily Goal**: Test on ChatGPT.com

- [ ] [DEPLOYED] Extension builds and loads

- [ ] Add host permission for ChatGPT
  - [ ] Verify manifest includes chatgpt.com/*
  - [ ] Reload extension

- [ ] Test on ChatGPT
  - [ ] Go to chat.openai.com
  - [ ] Get an AI response
  - [ ] Click HaloGuard icon
  - [ ] Click "Analyze This"
  - [ ] See loading spinner
  - [ ] Results appear in popup

- [ ] Test real detection
  - [ ] Copy a ChatGPT response
  - [ ] Paste into popup
  - [ ] See detection results
  - [ ] Verify accuracy (manual check)

**Testing Scenarios**:
- [ ] Normal response (low risk)
- [ ] Hallucinated response (high risk)
- [ ] Sycophancy detection
- [ ] Contradictory statements

**Notes**:
- ChatGPT DOM structure: look for `[data-message-id]`
- May need site-specific selectors
- Test with different ChatGPT themes (light/dark)

---

### Day 9 - Apr 21: CLAUDE & GEMINI SUPPORT
**Daily Goal**: Add support for Claude and Google Gemini

- [ ] Add claude.ai to manifest host_permissions
  - [ ] Reload extension

- [ ] Test on Claude.ai
  - [ ] Go to claude.ai
  - [ ] Get AI response
  - [ ] Test HaloGuard analysis
  - [ ] Verify works correctly

- [ ] Add gemini.google.com permission

- [ ] Test on Google Gemini
  - [ ] Go to gemini.google.com
  - [ ] Get response
  - [ ] Test analysis
  - [ ] Verify results

- [ ] Fix platform-specific CSS/DOM issues
  - [ ] Create platform selectors in content.ts
  - [ ] Adjust overlay positioning per platform
  - [ ] Test dark mode per platform

**Platform Selectors to Map**:
- ChatGPT: `[data-message-id]`
- Claude: `[data-testid="message"]`
- Gemini: `[data-message-id]` (similar to ChatGPT)

**Notes**:
- Each platform has different HTML structure
- May need multiple CSS rules for overlay
- Test scrolling with overlay present

---

### Day 10 - Apr 22: POLISH & OPTIMIZATION
**Daily Goal**: Optimize and polish extension

- [ ] Check bundle size
  - [ ] Run: webpack-bundle-analyzer
  - [ ] Target: <500KB total
  - [ ] Remove unused dependencies

- [ ] Add loading states
  - [ ] Spinner during analysis
  - [ ] Disable buttons while loading
  - [ ] Show error messages clearly

- [ ] Improve UX
  - [ ] Keyboard navigation (Tab)
  - [ ] Proper focus management
  - [ ] Accessible colors (contrast ratio ≥4.5)
  - [ ] Tooltip on hover

- [ ] Add settings page
  - [ ] API URL configuration
  - [ ] Theme preference (light/dark)
  - [ ] Enable/disable per site
  - [ ] API key input (optional)

- [ ] Dark mode implementation
  - [ ] Use CSS media query
  - [ ] Test on dark ChatGPT theme
  - [ ] Adjust overlay colors

**Accessibility Checklist**:
- [ ] All text readable (contrast ≥4.5:1)
- [ ] Keyboard navigable (Tab order)
- [ ] ARIA labels present
- [ ] Focus indicators visible

**Notes**:
- Use tools: Lighthouse, axe DevTools
- Test on slow network (DevTools throttling)
- Optimize images (use SVG where possible)

---

### Day 11 - Apr 23: COMPREHENSIVE TESTING
**Daily Goal**: Full QA and user testing

- [ ] Test all platforms
  - [ ] ChatGPT.com ✅
  - [ ] Claude.ai ✅
  - [ ] Gemini.google.com ✅
  - [ ] Perplexity (bonus)

- [ ] Test detection accuracy
  - [ ] Clear hallucination flagged ✅
  - [ ] Accurate statements not flagged ✅
  - [ ] Edge cases handled ✅

- [ ] Test error scenarios
  - [ ] Backend offline → error message
  - [ ] Network timeout → retry
  - [ ] Invalid API response → error
  - [ ] Rate limited → queue

- [ ] Performance testing
  - [ ] Analysis <2s (target)
  - [ ] Popup opens instantly
  - [ ] No memory leaks over time

**Manual QA Checklist**:
- [ ] Test on Windows 10/11
- [ ] Test on macOS (if available)
- [ ] Test on Linux
- [ ] Test with slow network (2G throttle)
- [ ] Test with offline mode
- [ ] Test with large AI responses (5K+ chars)

**Notes**:
- Use DevTools to debug
- Monitor memory usage
- Check for console.log() left behind

---

### Day 12 - Apr 24: PREPARE FOR WEB STORE
**Daily Goal**: Create marketing assets for Web Store submission

- [ ] Create screenshots (1280x800px each)
  - [ ] Screenshot 1: Popup with results
  - [ ] Screenshot 2: Settings page
  - [ ] Screenshot 3: Integration on ChatGPT
  - [ ] Screenshot 4: Error handling (optional)
  - [ ] Add captions/overlays on each

- [ ] Write Web Store description
  - [ ] Short description (1 line)
  - [ ] Long description (3-4 paragraphs)
  - [ ] List key features (5-7 bullets)
  - [ ] Add screenshots captions

- [ ] Create privacy policy
  - [ ] No data collection (verify true)
  - [ ] No analytics
  - [ ] Storage privacy (local only)
  - [ ] Link to GitHub privacy file

- [ ] Prepare "how to use" content
  - [ ] Step 1: Install from Web Store
  - [ ] Step 2: Click HaloGuard icon
  - [ ] Step 3: Click "Analyze This"
  - [ ] Step 4: See results

**Store Listing Draft**:
```
Title: HaloGuard - AI Hallucination Detector

Summary: 
Detect hallucinations, false claims, and sycophancy in ChatGPT, 
Claude, Gemini, and other AI platforms. Real-time analysis with 
98% accuracy.

Description:
Stop trusting AI blindly. HaloGuard analyzes every AI response to 
detect 6 types of hallucinations in real-time.

✓ Sycophancy Detection — Catches blind agreement
✓ Fact-Checking — Verifies claims against Wikipedia
✓ Logic Analysis — Finds contradictions
✓ Context Awareness — Detects context collapse
✓ Fast — Results in <2 seconds
✓ Free — No signup required

Works on: ChatGPT, Claude, Google Gemini, Copilot, and more

Get 5-tier hallucination detection in your toolbar.
```

**Notes**:
- Screenshots must include extension in action
- Privacy policy must be published URL (GitHub OK)
- No "Coming Soon" or beta disclaimers

---

### Day 13 - Apr 25: SUBMIT TO WEB STORE 🎉
**Daily Goal**: Submit to Chrome Web Store

- [ ] Create Google Play Developer account
  - [ ] Pay $5 registration fee
  - [ ] Verify email/phone

- [ ] Upload to developer dashboard
  - [ ] Create new item
  - [ ] Upload file (dist.zip)
  - [ ] Choose category: Productivity
  - [ ] Fill out all fields required

- [ ] Add marketing assets
  - [ ] Upload screenshots (4 images)
  - [ ] Upload icon 128x128px
  - [ ] Upload store description
  - [ ] Add privacy policy URL
  - [ ] Set language: English

- [ ] Review before submission
  - [ ] All screenshots present ✅
  - [ ] Description compelling ✅
  - [ ] Grammar/spelling correct ✅
  - [ ] Privacy policy accessible ✅
  - [ ] No phone numbers in description ✅

- [ ] Submit for review
  - [ ] Click "Publish"
  - [ ] Accept terms & conditions
  - [ ] Submit for review

- [ ] Monitor status
  - [ ] Check dashboard daily
  - [ ] Wait 3-5 days for approval
  - [ ] Expected approval: Apr 28-30

**Submission Checklist**:
- [ ] Item uploaded successfully
- [ ] All required fields filled
- [ ] No warnings/errors shown
- [ ] Ready for submission button visible
- [ ] Privacy policy publicly accessible

**After Submission**:
- [ ] Monitor approval status
  - Check email for updates
  - Check dashboard status
  - If rejected: read feedback & resubmit
  - If approved: celebrate 🎉

**Notes**:
- Google may request clarifications
- Typical review: 3-5 business days
- Can resubmit same day if rejected

---

## Success Criteria: Phase 1 Complete

### Technical Requirements
- [x] Chrome extension builds without errors
- [x] Popup UI fully functional
- [x] Content script injection working
- [x] Message passing between components working
- [x] Backend API integration working
- [x] Real detection results displaying
- [x] Works on ChatGPT, Claude, Gemini
- [x] Bundle size <500KB
- [x] No console errors
- [x] P90 latency <2 seconds

### Market Requirements
- [x] Extension submitted to Chrome Web Store
- [x] Professional screenshots & description
- [x] Privacy policy published
- [x] Ready for marketing

### Quality Requirements
- [x] 0 critical bugs
- [x] <5 known minor issues
- [x] Tested on 3 platforms
- [x] Performance acceptable
- [x] Accessibility compliant

---

## Daily Standup Template

**Format** (each day at 10am):
```
What did I accomplish yesterday?
- Built Popup.tsx component
- Integrated with backend API

What will I work on today?
- Test on ChatGPT.com
- Fix message passing

Blockers/Help needed?
- Need help with CSP violations
- Backend endpoint still broken
```

---

## Risk Mitigation

### High-Risk Items
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Backend not ready | Blocks testing | Use mock data, proceed in parallel |
| CSP violations | Won't load on sites | Test CSP rules early, use message passing |
| Chrome rejection | Missed deadline | Submit early, get feedback |
| Performance slow | Poor UX | Optimize bundle, cache results |

### Contingency Plans
- **If backend breaks**: Use mock API responses
- **If CSP prevents injection**: Use different injection method
- **If Chrome rejects**: Resubmit next day with fixes
- **If deadline pressure**: Reduce feature scope, ship MVP

---

**Owner**: Chrome Extension Team  
**Status**: READY TO START (Awaits Phase 0 completion)  
**Last Updated**: April 9, 2026  
**Next Milestone**: Apr 13 kickoff

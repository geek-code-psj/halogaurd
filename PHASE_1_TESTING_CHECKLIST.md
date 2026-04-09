# HaloGuard Phase 1 - Testing Checklist

## Platform Testing Requirements

### 1. **ChatGPT (OpenAI)**
- [ ] Extension loads on chatgpt.com
- [ ] Fetch interception working (check DevTools Network tab)
- [ ] Sidebar appears when new message received
- [ ] Score displays correctly
- [ ] Issues list shows appropriately
- [ ] Cache working (same prompt = faster result)
- [ ] Close button works

### 2. **Claude (Anthropic)**
- [ ] Extension loads on claude.ai
- [ ] Platform detection succeeds
- [ ] Message interception successful
- [ ] Results overlay renders
- [ ] Severity colors display correctly

### 3. **Google Gemini**
- [ ] Extension loads on gemini.google.com
- [ ] Content script initializes
- [ ] Fetch intercepts API calls
- [ ] Overlay positioned correctly on page

### 4. **Microsoft Copilot**
- [ ] Extension loads on copilot.microsoft.com
- [ ] Service worker receives messages
- [ ] Backend communication works
- [ ] Results displayed in real-time

### 5. **Perplexity AI**
- [ ] Extension loads on perplexity.ai
- [ ] Message detection working
- [ ] Cache TTL respected
- [ ] Settings toggle works

### 6. **Grok (X.com)**
- [ ] Extension loads on x.com/grok endpoint
- [ ] Platform detection identifies Grok
- [ ] Fetch interception active
- [ ] Results overlay displays

### 7. **Meta AI**
- [ ] Extension loads on meta.ai
- [ ] Service worker setup complete
- [ ] Storage operations working
- [ ] Error handling graceful

### 8. **DeepSeek**
- [ ] Extension loads on deepseek.com
- [ ] Full workflow working
- [ ] Results match expected format
- [ ] Retry logic functional

## Feature Testing

### Core Features
- [ ] Health check shows backend online
- [ ] Session created on first load
- [ ] Session persisted across reloads
- [ ] Cache works for identical content
- [ ] TTL enforced (24 hours)

### Settings UI
- [ ] Enable/disable toggle works
- [ ] Auto-analyze checkbox functional
- [ ] Dark mode toggle applies CSS
- [ ] Threshold slider saves value
- [ ] Settings persist after reload

### Error Handling
- [ ] Graceful fallback if backend down
- [ ] Timeout after 10 seconds
- [ ] Retry logic triggered on 500 errors
- [ ] User receives clear error message
- [ ] Extension doesn't break user experience

### Performance
- [ ] First analysis < 3 seconds
- [ ] Cached results instant (< 100ms)
- [ ] Memory usage stable after 1 hour
- [ ] No extension crashes observed
- [ ] Service worker doesn't terminate

### UI/UX
- [ ] Sidebar doesn't overlap content
- [ ] Scrolling works inside overlay
- [ ] Close button always responsive
- [ ] Score color matches severity
- [ ] Font sizes readable at 100% zoom

## Backend Integration

### API Endpoints
- [ ] POST /api/v1/sessions returns sessionId
- [ ] POST /api/v1/analyze returns DetectionResponse
- [ ] GET /health shows service status
- [ ] Rate limiting doesn't trigger

### Data Validation
- [ ] Request includes all required fields
- [ ] Response correctly parsed
- [ ] Errors handled with retries
- [ ] No data loss on connection break

## Build & Deployment

### Local Build
```bash
npm run build
# Expected: /dist/chrome-extension/ created
# Expected: manifest.json present
# Expected: service-worker.js, content-script.js present
```

### Chrome Dev Mode Load
- [ ] Navigate to chrome://extensions
- [ ] Enable "Developer mode"
- [ ] Load unpacked from dist/chrome-extension
- [ ] Extension appears in toolbar
- [ ] No errors in background script console

### Console Messages
- [ ] No TypeScript errors
- [ ] No runtime errors on any platform
- [ ] Logger shows [HaloGuard] prefixed messages
- [ ] No warnings about permissions

## Sign-Off

**Tester:** ___________________
**Date:** ___________________
**Platforms Tested:** ___________________
**Issues Found:** ___________________
**Ready for Release:** ☐ YES ☐ NO

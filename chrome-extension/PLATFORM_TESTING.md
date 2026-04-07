# HaloGuard Extension - Platform Testing Guide

Complete manual testing checklist for all supported AI chat platforms.

## Platform Matrix

| Platform | URL | Supported | Notes |
|----------|-----|-----------|-------|
| ChatGPT | chatgpt.com | ✅ | Official OpenAI interface |
| Claude | claude.ai | ✅ | Anthropic web interface |
| Google Gemini | gemini.google.com | ✅ | Google's AI assistant |
| Microsoft Copilot | copilot.microsoft.com | ✅ | Consumer-facing version |
| Perplexity | perplexity.ai | ✅ | Search-focused AI |
| Grok | x.com/grok | ✅ | X platform integration |
| Meta AI (Ray-Ban) | ai.meta.com | ✅ | Meta's AI assistant |
| DeepSeek | chat.deepseek.com | ✅ | DeepSeek's interface |
| Pi.ai | pi.ai | ✅ | Inflection AI assistant |
| OpenRouter | openrouter.ai | ✅ | Multi-model aggregator |

## Setup Prerequisites

### Chrome Extension Installation (Local Testing)

1. **Build the extension**
   ```bash
   cd chrome-extension
   npm install
   npm run build
   ```

2. **Load into Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select `chrome-extension/dist` folder
   - Extension appears in toolbar

3. **Verify Installation**
   - Extension icon appears in toolbar
   - No red errors in Extensions page
   - Click icon → popup shows settings UI

### VS Code Extension Installation (Local Testing)

1. **Build the extension**
   ```bash
   cd vscode-extension
   npm install
   npm run build
   ```

2. **Install locally**
   ```bash
   code --install-extension ./vscode-extension/haloguard-0.1.0.vsix
   ```

3. **Verify Installation**
   - Run extension without building: `F5` in component folder
   - Extension appears in sidebar
   - Status bar shows 🛡️ icon

## Test Cases Per Platform

### 1. ChatGPT (chatgpt.com)

**Setup:**
- Open chatgpt.com in new tab
- Ensure extension is enabled
- Start new conversation

**Test Steps:**
1. ✅ Verify CSS selector detects messages:
   - Send prompt to ChatGPT
   - Assistant response appears
   - Extension detects message in DOM
   ```javascript
   // In console, verify selector works:
   document.querySelectorAll('[data-message-id]').length > 0
   ```

2. ✅ Trigger detection on AI response:
   - Type: "The capital of France is London"
   - ChatGPT responds
   - Extension auto-analyzes (if auto-detect enabled)
   - Detection UI appears below message

3. ✅ Verify detection results:
   - Badge shows red (flagged) for incorrect claim
   - Details show: Issue type, Severity, Evidence
   - Score bar reflects confidence

4. ✅ Test settings interaction:
   - Open extension popup (click icon)
   - Toggle dark mode
   - Change threshold slider
   - Responses update in real-time

**Expected Behavior:**
- Message detected within 1 second
- Detection UI appears below message
- Badge updates with color coding
- No performance degradation

### 2. Claude (claude.ai)

**Setup:**
- Open claude.ai
- Login if needed
- Start new conversation

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // Should find Claude messages
   document.querySelectorAll('[class*="message"]').length > 0
   ```

2. ✅ Message extraction accuracy:
   - Claude's prose-style messages should be extracted
   - Test with various response lengths (short/long)
   - Verify content capturing is complete

3. ✅ Diff detection from other platforms:
   - Claude has different message structure than ChatGPT
   - Verify selector specificity works
   - No false message detection

4. ✅ Hallucination detection scope:
   - Test with code blocks (should be analyzed)
   - Test with markdown formatting (should be parsed)
   - Test with multi-turn conversations

**Expected Behavior:**
- All message types detected
- No content loss in extraction
- Fast analysis (<1s)

### 3. Google Gemini (gemini.google.com)

**Setup:**
- Open gemini.google.com
- Login with Google account
- Create new conversation

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // Gemini uses jsaction selectors
   document.querySelectorAll('[jsaction*="message"]').length > 0
   ```

2. ✅ Multi-model detection:
   - Test with text model
   - Test with Gemini Pro (if available)
   - Verify detection works for all variants

3. ✅ Image handling:
   - Send query with image
   - Verify text responses are analyzed
   - Image content itself not analyzed

4. ✅ Real-time response:
   - Gemini has streaming responses
   - Verify detection works on complete response
   - Check no analysis on partial/streaming content

**Expected Behavior:**
- Detects final responses only
- Handles streaming gracefully
- No analysis of partial content

### 4. Microsoft Copilot (copilot.microsoft.com)

**Setup:**
- Open copilot.microsoft.com
- Login (uses Microsoft account)
- Select conversation mode

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // Copilot uses chat-message classes
   document.querySelectorAll('[class*="chat-message"]').length > 0
   ```

2. ✅ Bot detection:
   - Verify extension distinguishes Copilot responses from user text
   - Test with back-and-forth conversation
   - Ensure only Copilot responses analyzed

3. ✅ Conversation context:
   - Provide context-dependent query
   - Verify detection considers full conversation
   - Test inconsistency detection across turns

4. ✅ Theme compatibility:
   - Copilot offers dark/light modes
   - Verify extension UI readable in both modes
   - Test color contrast

**Expected Behavior:**
- Only analyzes Copilot messages
- Ignores user messages
- Maintains readability in all themes

### 5. Perplexity (perplexity.ai)

**Setup:**
- Open perplexity.ai
- Start new search
- Ensure API key not required for basic use

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // Perplexity uses data-test-id attributes
   document.querySelectorAll('[data-test-id*="message"]').length > 0
   ```

2. ✅ Search result integration:
   - Perplexity shows web results
   - Verify extension analyzes generated text, not citations
   - Test claim verification against sources shown

3. ✅ Source tracking:
   - When flagged, verify source links accessible
   - Check if extension provides counter-evidence from sources

4. ✅ Citation handling:
   - Responses include [1], [2] citations
   - Verify citations don't interfere with detection

**Expected Behavior:**
- Analyzes synthesis, not citations
- Acknowledges provided sources
- Flags unsupported claims

### 6. Grok (x.com/grok or grok.com)

**Setup:**
- Open x.com and navigate to Grok section OR
- Open grok.com directly (if available)
- Subscribe to X Premium if required

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // Grok usually has simple message structure
   document.querySelectorAll('[class*="message"]').length > 0
   ```

2. ✅ Controversial content handling:
   - Grok allows controversial topics
   - Verify extension still detects hallucinations
   - Test factual accuracy checks work

3. ✅ Real-time response:
   - Grok provides live-updated responses
   - Test detection on streaming text
   - Verify final analysis after streaming complete

4. ✅ Integration with X:
   - If on X.com, test sidebar layout
   - Verify message detection in sidebar vs main feed
   - Check performance impact

**Expected Behavior:**
- Detects factual errors regardless of topic sensitivity
- Handles live updates
- Maintains X platform layout

### 7. Meta AI (ai.meta.com or Ray-Ban)

**Setup:**
- Open ai.meta.com OR
- Use Ray-Ban smart glasses meta AI (web fallback: ai.meta.com)
- Login with Meta/Facebook account

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   document.querySelectorAll('[class*="message"]').length > 0
   ```

2. ✅ Assistant identification:
   - Verify bot messages vs user detection
   - Test with bot class checking
   - Ensure no false positives

3. ✅ Conversational context:
   - Multi-turn conversation testing
   - Verify context-coherent detection
   - Test consistency checks across turns

4. ✅ Performance:
   - Meta AI has minimal UI
   - Test for layout shifts
   - Verify no DOM mutations from extension

**Expected Behavior:**
- Respects simple DOM structure
- Doesn't modify layout
- Accurate message detection

### 8. DeepSeek (chat.deepseek.com)

**Setup:**
- Open chat.deepseek.com
- Create account or login
- Start new conversation

**Test Steps:**
1. ✅ Selector validation:
   ```javascript
   // DeepSeek uses generic message structure
   document.querySelectorAll('[class*="message"]').length > 0
   ```

2. ✅ Language support:
   - Test with English prompts (primary)
   - Test with Chinese prompts (if applicable)
   - Verify multilingual hallucination detection

3. ✅ Extended context:
   - DeepSeek supports long context windows
   - Provide multi-page conversation
   - Verify detection works on all responses

4. ✅ Code generation:
   - Request code from DeepSeek
   - Verify code isn't analyzed (data not code)
   - Test explanations around code are analyzed

**Expected Behavior:**
- Handles long conversations
- Multilingual support
- Code vs explanation differentiation

### 9. Pi.ai

**Setup:**
- Open pi.ai
- Start conversation (no login required)
- Verify extension loads

**Test Steps:**
1. ✅ Simple interface:
   - Pi has minimal UI
   - Test detection works with simple DOM
   - Verify fallback selectors work

2. ✅ Personality handling:
   - Pi has distinct personality
   - Verify detection ignores tone/style
   - Focus on factual accuracy

3. ✅ Long responses:
   - Pi often provides lengthy responses
   - Test detection on full content
   - Verify multiple issues can be detected

4. ✅ Graceful fallback:
   - If selectors don't match
   - Verify fallback DOM traversal works
   - Test partial detection (content extraction failures)

**Expected Behavior:**
- Works with fallback selectors
- Handles long responses
- Personality doesn't affect detection

### 10. OpenRouter (openrouter.ai)

**Setup:**
- Open openrouter.ai
- Select model from dropdown
- Start conversation

**Test Steps:**
1. ✅ Multi-model support:
   - Test with different models (GPT-4, Claude, Llama, etc.)
   - Verify detection works consistently
   - Check model-specific hallucination patterns

2. ✅ Model switching:
   - Switch models mid-conversation
   - Verify detection updates
   - Test with new model context

3. ✅ API-based responses:
   - OpenRouter fetches from multiple APIs
   - Verify latency handling (may be slow)
   - Test timeout gracefully

4. ✅ Parameter customization:
   - Users can adjust temperature/top_p
   - Verify hallucination patterns change
   - Test detection adapts to different models

**Expected Behavior:**
- Works across all model options
- Handles API latency
- Detects model-specific hallucinations

## Cross-Platform Test Matrix

### Test Template

For each platform, verify:

```
Platform: [Name]
Date: [Date]
Tester: [Name]

✅ Extension loads without errors
✅ Message detection triggers on AI response
✅ Backend call succeeds (<2 sec)
✅ Detection results display correctly
✅ Color coding accurate (red=critical, orange=high, yellow=medium, blue=low)
✅ Settings persist (dark mode, threshold)
✅ Popup settings accessible and functional
✅ Clear cache button works
✅ No performance degradation (page still responsive)
✅ No console errors

Issues Found:
- [Issue 1]
- [Issue 2]

Notes:
[Additional observations]
```

## Performance Benchmarks (Per Platform)

Target metrics for each platform:

| Metric | Target | Chrome | VS Code |
|--------|--------|--------|---------|
| Message Detection | <500ms | ✅ | N/A |
| Backend Response | <2s | ✅ | ✅ |
| UI Render | <300ms | ✅ | N/A |
| Memory Impact | <10MB | ✅ | ✅ |
| CPU Usage | <5% | ✅ | ✅ |

## Common Issues & Solutions

### Issue: Message Not Detected

**Diagnosis:**
```javascript
// Check if selector works:
document.querySelectorAll('[data-message-id]').length  // ChatGPT
document.querySelectorAll('[jsaction*="message"]').length  // Gemini
// etc.
```

**Solutions:**
- Clear extension cache (Settings → Clear Cache)
- Reload page (Cmd+R / Ctrl+F5 hard reload)
- Check extension is enabled in Extensions menu
- Verify correct CSS selector for platform

### Issue: High False Positive Rate

**Diagnosis:**
- Note which types of content flagged incorrectly
- Check if pattern-based (all certain content types)

**Solutions:**
- Increase detection threshold in popup settings
- Check Wikipedia fact-checker is working (backend /health)
- Verify NLI model scores reasonable values

### Issue: Slow Performance

**Diagnosis:**
```javascript
// Check extension processing time:
performance.mark('analysis-start')
// ... trigger analysis ...
performance.mark('analysis-end')
performance.measure('analysis', 'analysis-start', 'analysis-end')
```

**Solutions:**
- Disable fact-checking if latency issue
- Verify Redis cache is hot (repeated content faster)
- Check backend latency: `curl -w '%{time_total}' http://localhost:3000/health`
- Reduce concurrent analysis requests

## Sign-off Checklist

Once all 10 platforms tested and passing:

- [ ] All platforms tested with Chrome Extension
- [ ] Message detection works on 10/10 platforms
- [ ] False positive rate <10%
- [ ] Performance targets met on all platforms
- [ ] No critical bugs outstanding
- [ ] Settings persist across sessions
- [ ] Dark mode working correctly
- [ ] Popup UI responsive and functional
- [ ] Console clean (no errors/warnings)
- [ ] Ready for production deployment

## Extension Submission Checklist

### Chrome Web Store

Once Phase 2f testing complete:

1. Build release version:
   ```bash
   cd chrome-extension
   npm run build:prod
   ```

2. Create ZIP for submission:
   ```bash
   zip -r haloguard-extension-v0.1.0.zip dist/
   ```

3. Screenshots to prepare:
   - 1280x800: Feature overview
   - 640x400: Detection in action (ChatGPT)
   - 640x400: Settings popup
   - 640x400: Issue details example

4. Submit to:
   - URL: https://chrome.google.com/webstore/developer/dashboard
   - Category: Productivity Tools
   - Content Rating: General Audiences

### VS Code Marketplace

1. Build release:
   ```bash
   cd vscode-extension
   npm run build:prod
   vsce package  # Creates .vsix file
   ```

2. Create publisher account:
   - https://marketplace.visualstudio.com/manage

3. Submit with metadata:
   - README.md with screenshots
   - Icon (128x128px)
   - Description (short & long)

## Final Notes

- **Timeline**: Allocate 4-5 hours for complete platform testing
- **Browser**: Use latest Chrome/Chromium for testing
- **Network**: Ensure stable internet (API calls required)
- **Accounts**: Pre-create or get access to all 10 platform accounts
- **Reporting**: Document any issues with screenshots/videos

Testing complete! Ready for marketplace submission 🎉

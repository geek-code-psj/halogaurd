# Dashboard Implementation & Integration Guide

**Status**: Phase 3 Implementation Ready  
**Updated**: April 9, 2026

---

## 🚀 Quick Start

### 1. Install in Chrome Extension

**File**: `chrome-extension/src/popup/popup.tsx`

```typescript
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChromePopupDashboard } from '@haloguard/shared-ui';
import '@haloguard/shared-ui/Dashboard/styles/dashboard.module.css';

const App: React.FC = () => {
  return <ChromePopupDashboard />;
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.render(<App />, root);
}
```

### 2. Update Chrome Manifest

**File**: `chrome-extension/manifest.json`

```json
{
  "permissions": ["storage", "tabs", "activeTab", "scripting", "webRequest"],
  "host_permissions": [
    "https://chat.openai.com/*",
    // ... existing hosts ...
    "https://en.wikipedia.org/*"
  ],
  "web_accessible_resources": [
    {
      "resources": ["styles/dashboard.module.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 3. Connect Backend in Background Script

**File**: `chrome-extension/src/background/service-worker.ts`

```typescript
import { ChromeExtensionIntegration } from '@haloguard/shared-ui';

// Initialize dashboard messaging
ChromeExtensionIntegration.initMessaging();

// Get backend config
chrome.runtime.onInstalled.addListener(() => {
  // Load backend configuration
  const apiUrl = process.env.REACT_APP_API_URL || 'https://api.haloguard.io';
  
  chrome.storage.local.set({
    backendConfig: { apiUrl },
    haloguard_session: {
      startTime: Date.now(),
      userId: null,
    }
  });
});
```

---

## 📊 Component Integration Matrix

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| **Dashboard** | `shared-ui/Dashboard/Dashboard.tsx` | Main container | ✅ Ready |
| **StatusBar** | `shared-ui/Dashboard/StatusBar.tsx` | Top metrics | ✅ Ready |
| **LiveInsights** | `shared-ui/Dashboard/LiveInsights.tsx` | Scan results | ✅ Ready |
| **RecentActivity** | `shared-ui/Dashboard/RecentActivity.tsx` | Activity timeline | ✅ Ready |
| **QuickActions** | `shared-ui/Dashboard/QuickActions.tsx` | Action buttons | ✅ Ready |
| **BottomNav** | `shared-ui/Dashboard/BottomNav.tsx` | Tab navigation | ✅ Ready |
| **Chrome Adapter** | `shared-ui/ChromeExtensionAdapter.tsx` | Chrome integration | ✅ Ready |

---

## 🔌 API Integration Endpoints

### Backend API Routes

```
GET  /api/v1/dashboard/metrics
     └─ Response: { threatsBlocked, dataExposure, networkTraffic, lastUpdate }

GET  /api/v1/analysis/recent
     └─ Response: ScanResult object

POST /api/v1/analysis/scan
     ├─ Body: { url, content? }
     └─ Response: ScanResult with id

GET  /api/v1/activity/history?limit=20
     └─ Response: ActivityEntry[]

GET  /api/v1/analysis/:scanId
     └─ Response: ScanResult

POST /api/v1/analysis/:scanId/save
     └─ Response: { success: true }

POST /api/v1/analysis/:scanId/report
     ├─ Body: { feedback }
     └─ Response: { success: true }

GET  /api/v1/user/quota
     └─ Response: { used, limit, resetTime }
```

### WebSocket Endpoint

```
WS  /ws/dashboard
    
Message Types:
├─ scan_result: { type: 'scan_result', payload: ScanResult }
├─ activity_entry: { type: 'activity_entry', payload: ActivityEntry }
└─ activity_graph: { type: 'activity_graph', payload: ActivityDataPoint[] }

Update Interval: 1-second refresh
```

---

## 🌐 Wikipedia Integration Flow

### Detection Pipeline with Wikipedia

```
Page Content
    ↓
[Tier 0: Hedging Detection]
    ↓
[Tier 1: Entropy Analysis]
    ↓
[Tier 2: Wikipedia Fact Check]
    │
    ├─→ Extract claim keywords
    ├─→ Search Wikipedia
    ├─→ Compare with Wikipedia snippet
    └─→ Generate confidence score
    ↓
[Tier 3: NLI Model]
    ├─→ Get Wikipedia context
    ├─→ Create premise/hypothesis
    └─→ Run NLI model
    ↓
[Tier 4: Embeddings + Drift]
    │
    └─→ Check knowledge drift against Wikipedia embeddings
    ↓
Final Risk Level + Confidence
```

### Wikipedia Service Usage

```typescript
import { WikipediaService, WikipediaIntegration } from '@haloguard/shared-ui';

const wikipediaService = new WikipediaService();

// Search for fact verification
const factCheck = await wikipediaService.verifyFact(
  "ChatGPT was released in November 2022"
);
// Returns: { claim, wikipediaMatch, verified, confidence, details }

// Get context for NLI
const context = await wikipediaService.getContextForNLI(
  premise: "A virus caused the pandemic",
  hypothesis: "COVID-19 is a bacterial infection"
);
// Returns: { premiseContext, hypothesisContext, analysis }

// Enhance tier results
const enhancedTier = await WikipediaIntegration.enhanceTierResult(
  tier3Result,
  wikipediaService
);
```

---

## 🔐 Security & Configuration

### Environment Variables

```bash
# .env
REACT_APP_API_URL=https://api.haloguard.io
REACT_APP_WS_URL=wss://api.haloguard.io
REACT_APP_ENV=production

# Chrome Extension only
REACT_APP_CHROME_API_KEY=<your-api-key>
```

### API Key Storage (Secure)

```typescript
// ✅ CORRECT: Use Chrome storage
chrome.storage.local.set({ api_key: userKey });

// ✅ CORRECT: Use chrome.storage.sync for cloud backup
chrome.storage.sync.set({ preferences: settings });

// ❌ WRONG: Never store in localStorage or cookies
// ❌ WRONG: Never expose API keys in frontend code
```

### CORS Configuration

Add to backend server:

```javascript
app.use(cors({
  origin: [
    'chrome-extension://*',
    'https://haloguard.io',
    'http://localhost:3000'
  ],
  credentials: true
}));

// Allow WebSocket upgrades
app.use(express.json({ limit: '50mb' }));
```

---

## 📦 Build & Deployment

### 1. Build Shared UI Library

```bash
cd shared-ui
npm run build
npm pack  # Creates haloguard-shared-ui-X.X.X.tgz
```

### 2. Use in Chrome Extension

```bash
cd chrome-extension

# Install local package
npm install ../shared-ui/haloguard-shared-ui-X.X.X.tgz

# Or via package.json
{
  "dependencies": {
    "@haloguard/shared-ui": "../shared-ui"
  }
}
```

### 3. Build Chrome Extension

```bash
npm run build

# Output in dist/ folder:
# ├─ background/
# ├─ content/
# ├─ popup/
# ├─ styles/
# └─ manifest.json
```

### 4. Track Chrome Web Store

```bash
npm run build:crx  # Creates .crx file
npm run upload:cws # Upload to Chrome Web Store
```

---

## 🧪 Testing Integration

### Unit Tests

```typescript
// tests/Dashboard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from '@haloguard/shared-ui';

describe('Dashboard', () => {
  it('renders status bar with metrics', async () => {
    render(
      <Dashboard 
        wsUrl="ws://localhost:3000/ws/dashboard"
        apiBaseUrl="http://localhost:3000"
      />
    );
    
    await waitFor(() => {
      expect(screen.getByText(/REAL-TIME MONITORING/)).toBeInTheDocument();
    });
  });

  it('updates metrics every second', async () => {
    // Test real-time updates
  });

  it('displays tier breakdown correctly', async () => {
    // Test tier visualization
  });
});
```

### Integration Tests

```typescript
// tests/ChromeExtensionIntegration.test.ts
import { ChromeExtensionIntegration } from '@haloguard/shared-ui';

describe('Chrome Extension Integration', () => {
  it('injects dashboard into page', () => {
    const container = ChromeExtensionIntegration.injectSidebar('body', 'right');
    expect(container).toBeDefined();
    expect(container.id).toBe('haloguard-dashboard-container');
  });

  it('sends message to background script', async () => {
    ChromeExtensionIntegration.requestAnalysis();
    // Verify chrome.runtime.sendMessage was called
  });
});
```

### Manual Testing Checklist

- [ ] Dashboard loads in Chrome popup <1s
- [ ] Metrics update every 1-2 seconds
- [ ] WebSocket reconnects on disconnect
- [ ] Real-time activity entries appear
- [ ] Tier breakdown displays correctly
- [ ] Wikipedia integration returns results
- [ ] Action buttons work (scan, save, share, report)
- [ ] Tab navigation switches between pages
- [ ] Mobile view (375px) renders correctly
- [ ] Keyboard navigation works (Tab, Enter)

---

## 🐛 Troubleshooting

### Issue: Dashboard won't connect to backend

```javascript
// 1. Check WebSocket URL
console.log('WS URL:', wsUrl);

// 2. Verify CORS headers
curl -H "Origin: chrome-extension://..." \
     -H "Access-Control-Request-Method: POST" \
     https://api.haloguard.io/ws

// 3. Check API responds
curl https://api.haloguard.io/api/v1/dashboard/metrics

// 4. Verify API key
curl -H "Authorization: Bearer YOUR_KEY" \
     https://api.haloguard.io/api/v1/dashboard/metrics
```

### Issue: Real-time updates not working

```typescript
// Check WebSocket connection state
const ws = new WebSocket(wsUrl);
console.log('WS State:', ws.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED

// Verify message format
ws.onmessage = (event) => {
  console.log('Received:', event.data);
  // Should be JSON: { type: 'scan_result', payload: {...} }
};

// Check for errors
ws.onerror = (error) => {
  console.error('WS Error:', error);
};
```

### Issue: Chrome extension permissions denied

```json
// Check manifest.json has required permissions
{
  "permissions": [
    "storage",      // For chrome.storage
    "tabs",         // For tab access
    "activeTab",    // For active tab
    "scripting"     // For content scripts
  ],
  "host_permissions": [
    "https://en.wikipedia.org/*"  // For Wikipedia API
  ]
}
```

---

## 📋 Implementation Checklist

- [ ] **Design Phase**
  - [ ] Review DASHBOARD_UI_DESIGN.md
  - [ ] Create design mockups/wireframes
  - [ ] Get stakeholder approval

- [ ] **Development Phase**
  - [ ] Create all React components
  - [ ] Implement CSS styling
  - [ ] Add TypeScript types
  - [ ] Create custom hooks
  - [ ] Build BackendService
  - [ ] Build WikipediaService
  - [ ] Create ChromeExtensionAdapter

- [ ] **Integration Phase**
  - [ ] Update Chrome popup to use Dashboard
  - [ ] Update manifest.json
  - [ ] Configure backend endpoints
  - [ ] Setup WebSocket endpoint
  - [ ] Integrate Wikipedia API

- [ ] **Testing Phase**
  - [ ] Unit tests for components
  - [ ] Integration tests with backend
  - [ ] Chrome extension tests
  - [ ] Manual testing checklist
  - [ ] Browser compatibility

- [ ] **Deployment Phase**
  - [ ] Build shared UI library
  - [ ] Build Chrome extension
  - [ ] Submit to Chrome Web Store
  - [ ] Monitor error logs
  - [ ] Gather user feedback

---

## 📈 Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| **First Paint** | <1s | Monitor |
| **Interactive** | <2s | Monitor |
| **Metrics Update** | <100ms | Optimize |
| **WebSocket Latency** | <500ms | Monitor  |
| **Bundle Size** | <500KB | Monitor |
| **Memory Usage** | <50MB | Monitor |

---

## 🎯 Success Criteria

✅ **Phase 3 Complete When**:
1. Dashboard fully functional with real-time updates
2. Backend/Wikipedia integration working
3. Chrome extension shows dashboard in popup
4. All tests passing (unit + integration)
5. Performance targets met
6. UI/UX reviewed and approved
7. Security audit passed
8. Documentation complete

---

**Next Phase**: Phase 4 - Production Launch (May 16-25, 2026)

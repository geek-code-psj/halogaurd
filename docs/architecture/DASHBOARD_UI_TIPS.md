# HaloGuard Dashboard - UI/UX Best Practices & Tips

## 📋 Table of Contents
1. [Design Principles](#design-principles)
2. [UI Best Practices](#ui-best-practices)
3. [Performance Optimization](#performance-optimization)
4. [Accessibility Guidelines](#accessibility-guidelines)
5. [Chrome Extension Integration](#chrome-extension-integration)
6. [Real-time Update Strategies](#real-time-update-strategies)
7. [Mobile Responsiveness](#mobile-responsiveness)

---

## 🎨 Design Principles

### 1. **Trust Through Transparency**
- **What it means**: Users must understand exactly what HaloGuard is detecting and why
- **Implementation**:
  - Always show confidence levels (0-100%)
  - Display the 5-tier breakdown with status for each tier
  - Explain findings in plain language, not technical jargon
  - Provide "What does this mean?" tooltips on hover

**Example**:
```
❌ Bad: "NLI contradiction detected at layer 3"
✅ Good: "The statement contradicts earlier context (93% confidence)"
```

### 2. **Real-time vs Accuracy**
- **Goal**: Balance speed with accuracy
- **Timing**:
  - Tier 0-1 results: <100ms (regex + heuristics)
  - Tier 2 results: <200ms (Wikipedia API)
  - Tier 3 results: <800ms (NLI model)
  - Tier 4 results: <2s (embeddings + drift detection)
- **UI Indicator**: Show "⏳ Processing Tier 4..." for pending results

### 3. **Minimize Cognitive Load**
- **Color coding**: 🟢 = safe, 🟡 = warning, 🔴 = threat
- **Icon consistency**: Same icon = same concept across dashboard
- **Grouping**: Related metrics/findings are visually grouped

### 4. **Progressive Disclosure**
- **Default**: Show only essential info (risk level + confidence)
- **Click "View Details"**: Show tier breakdown, findings, recommendations
- **Advanced**: Show technical details (confidence scores, model versions)

---

## ✨ UI Best Practices

### 1. **Status Indicators**

**Color Mapping**:
```javascript
const riskColorMap = {
  'low': '#00ff00',      // Green - safe
  'medium': '#ffff00',   // Yellow - caution
  'high': '#ff6600',     // Orange - warning
  'critical': '#ff0000'  // Red - danger
};

const tierStatusMap = {
  'passed': '✓',     // Green check
  'warning': '⚠',   // Yellow warning
  'failed': '✗',     // Red X
  'processing': '⏳' // Loading
};
```

### 2. **Typography Hierarchy**

```css
/* Use this hierarchy consistently */
h1/Title: 18px, bold, #00d4ff (cyan)
h2/Subtitle: 16px, semi-bold, #ffffff
h3/Section: 14px, bold, #00d4ff
Body: 12px, regular, #ffffff
Metadata: 10px, regular, #888888 (gray)
```

### 3. **Spacing & Layout**

- **Padding**: Use multiples of 4px (8px, 12px, 16px, 20px)
- **Gap between items**: 8-12px for compact, 16-20px for spacious
- **Panel margins**: 20px padding inside panels
- **Responsive breakpoints**:
  - Desktop: 1200px+ (full 2-column)
  - Tablet: 768-1200px (stacked)
  - Mobile: <768px (simplified single column)

### 4. **Interactive Elements**

**Button States**:
```css
/* Default */
background: rgba(0, 0, 0, 0.2);
border: 1px solid #2d2d4d;
color: #ffffff;

/* Hover */
background: rgba(0, 212, 255, 0.1);
border: 1px solid #00d4ff;
transform: translateY(-2px);

/* Active/Pressed */
transform: translateY(0);
opacity: 0.8;
```

### 5. **Empty States**

Always provide helpful messaging when there's no data:

```
❌ Bad: (Empty space)
✅ Good: "No recent activity. Start a new analysis to see results."

With action button:
+------------------------+
| 📊 No scans yet       |
| Try scanning a page   |
| [▶ Scan Now]          |
+------------------------+
```

---

## ⚡ Performance Optimization

### 1. **Minimize Re-renders**
```typescript
// Use React.memo for components that don't change often
export const StatusBar = React.memo(({ metrics, isConnected }) => {
  return ... // Component JSX
});

// Use useMemo for expensive computations
const risklevel = useMemo(() => calculateRisk(scanResult), [scanResult]);
```

### 2. **Lazy Load Components**
```typescript
// Only load and render components when needed
const ReportsPage = React.lazy(() => import('./ReportsPage'));
const SettingsPage = React.lazy(() => import('./SettingsPage'));

// In render:
<Suspense fallback={<LoadingSpinner />}>
  <ReportsPage />
</Suspense>
```

### 3. **Optimize Network Requests**
```typescript
// Debounce search queries
const [searchTerm, setSearchTerm] = useState('');
const debouncedSearch = useCallback(
  debounce((query) => fetchResults(query), 300),
  []
);

// Cache API responses
const cache = new Map();
async function getCachedMetrics() {
  const cacheKey = 'metrics_' + Date.now() / 1000 | 0; // 1s intervals
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  
  const data = await fetch('/api/metrics');
  cache.set(cacheKey, data);
  return data;
}
```

### 4. **Bundle Size**
- Keep components modular (~3KB each)
- Tree-shake unused code
- Compress CSS/JS
- Use code splitting for pages

---

## ♿ Accessibility Guidelines

### 1. **Keyboard Navigation**
```typescript
// Make all buttons keyboard accessible
<button 
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleAction();
    }
  }}
>
  Click or press Enter
</button>
```

### 2. **Screen Reader Support**
```jsx
<div 
  role="alert" 
  aria-label="Risk Level: HIGH with 94% confidence"
  aria-live="polite"
>
  🔴 HIGH
</div>

// For icons, always provide text labels
<button aria-label="Refresh dashboard data">
  ↻
</button>
```

### 3. **Color Contrast**
- **Text on background**: Minimum 4.5:1 contrast ratio
- **Verify with**: https://webaim.org/resources/contrastchecker/
- **Our palette**: 
  - ✅ Cyan (#00d4ff) on dark (#1a1a2e): 8.5:1
  - ✅ White (#ffffff) on dark: 11.5:1
  - ✅ Green (#00ff00) on dark: 5.2:1

### 4. **Focus Indicators**
```css
/* Always show focus state */
button:focus,
input:focus {
  outline: 2px solid #00d4ff;
  outline-offset: 2px;
}
```

---

## 🔌 Chrome Extension Integration

### 1. **Popup Integration**

```typescript
// In chrome-extension/src/popup/popup.ts
import { ChromePopupDashboard } from '@haloguard/shared-ui';

const root = document.getElementById('root');
if (root) {
  const app = <ChromePopupDashboard />;
  ReactDOM.render(app, root);
}
```

### 2. **Content Script Integration**

```typescript
// Inject dashboard into page as sidebar
import { ChromeExtensionIntegration } from '@haloguard/shared-ui';

// In content script
ChromeExtensionIntegration.injectSidebar('body', 'right');
ChromeExtensionIntegration.initMessaging();
```

### 3. **Message Passing**

```typescript
// Background → Popup/Content
chrome.runtime.sendMessage({
  type: 'SCAN_COMPLETE',
  payload: scanResult
});

// Popup/Content → Background
chrome.runtime.sendMessage(
  { type: 'TRIGGER_SCAN', url: currentUrl },
  (response) => console.log('Scan started:', response)
);
```

### 4. **Storage Best Practices**

```typescript
// Use chrome.storage for persistence
chrome.storage.local.set({ 
  apiKey: 'user_key_123',
  lastScan: { id: 'scan_456', time: Date.now() }
});

// Retrieve
chrome.storage.local.get(['apiKey', 'lastScan'], (result) => {
  console.log(result.apiKey);
  console.log(result.lastScan);
});
```

---

## 🔄 Real-time Update Strategies

### 1. **WebSocket Connection**

```typescript
// Efficient WebSocket usage
const ws = new WebSocket('wss://api.haloguard.io/ws/dashboard');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  // Only update if data truly changed
  if (JSON.stringify(data) !== JSON.stringify(previousData)) {
    updateUI(data);
  }
};
```

### 2. **Update Batching**

```typescript
// Instead of updating on each event, batch updates
let updatequeue = [];
let batchTimeout = null;

function queueUpdate(update) {
  updateQueue.push(update);
  
  if (batchTimeout) clearTimeout(batchTimeout);
  batchTimeout = setTimeout(() => {
    processUpdates(updateQueue);
    updateQueue = [];
  }, 50); // Batch every 50ms
}
```

### 3. **Progressive Loading**

```typescript
// Load data in priority order
async function loadDashboard() {
  // Priority 1: Metrics (instant)
  const metrics = await fetchMetrics(); // Show immediately
  
  // Priority 2: Current scan (fast)
  const scan = await fetchRecentScan(); // Show next
  
  // Priority 3: History (can be deferred)
  if (isPriority) {
    const history = await fetchActivityHistory(); // Load later
  }
}
```

---

## 📱 Mobile Responsiveness

### 1. **Touch-friendly Design**
```css
/* Minimum touch target: 44x44px */
.button {
  min-width: 44px;
  min-height: 44px;
  padding: 12px 16px; /* Ensures adequate spacing */
}

/* Avoid hover-dependent interactions */
/* ❌ Don't rely on :hover for mobile */
/* ✅ Use :active and :focus */
```

### 2. **Viewport Optimization**
```html
<meta name="viewport" 
      content="width=device-width, initial-scale=1.0, 
               viewport-fit=cover">
```

### 3. **Responsive Breakpoints**

```css
/* Desktop: Full features */
@media (min-width: 1200px) {
  .main-layout { grid-template-columns: 1fr 0.4fr; }
}

/* Tablet: Stack components */
@media (max-width: 1199px) {
  .main-layout { grid-template-columns: 1fr; }
  .recent-activity { max-height: 300px; }
}

/* Mobile: Simplified UI */
@media (max-width: 768px) {
  .status-bar { flex-direction: column; }
  .actions-grid { grid-template-columns: 1fr; }
  .nav-label { display: none; } /* Icon-only nav */
}
```

---

## 🚀 Advanced Tips & Tricks

### 1. **Dark Mode Adaptive**
```css
@media (prefers-color-scheme: light) {
  .dashboard-light {
    background: #f5f5f5;
    color: #1a1a2e;
  }
}
```

### 2. **Smooth Animations**
```css
/* Use GPU acceleration */
.refresh-btn {
  transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
  will-change: transform;
}

/* Avoid janky animations */
/* ❌ transition: all 0.3s; /* Animates everything */
/* ✅ transition: transform 0.3s; /* Specific property */
```

### 3. **Skeleton Loading**
```typescript
// Show placeholders while loading
<div className="skeleton tier-item">
  <div className="skeleton-bar" />
  <div className="skeleton-text" />
</div>

/* CSS animation */
.skeleton {
  animation: pulse 1.5s infinite;
}
```

### 4. **Tooltips & Help Text**
```typescript
<div className="tier-item" title="Hedging: Detects cautious language patterns">
  Tier 0 (Hedging)
</div>

// Or custom tooltip component
<Tooltip text="Detects cautious language">
  <span>Tier 0</span>
</Tooltip>
```

---

## 🧪 Testing Checklist

Before release, verify:

- [ ] **Functionality**: All buttons work, data updates in real-time
- [ ] **Performance**: Loads in <2s, metrics update <100ms
- [ ] **Accessibility**: Tab navigation works, screen reader friendly
- [ ] **Responsiveness**: Works on mobile (375px) and desktop (1920px)
- [ ] **Error Handling**: Shows helpful messages on API failures
- [ ] **Chrome Extension**: Popup opens, sidebar injects, messaging works
- [ ] **Security**: API keys not exposed, XSS prevention
- [ ] **Browser Compatibility**: Chrome 90+, Firefox (if applicable)

---

## 📞 Support & Troubleshooting

**Issue**: Dashboard won't load
- Check WebSocket connection status
- Verify API endpoint URL in chrome.storage
- Check browser console for errors

**Issue**: Real-time updates not working
- Verify WebSocket URL is correct
- Check network tab for connection errors
- Ensure API server is running

**Issue**: Chrome extension not showing dashboard
- Verify manifest.json permissions
- Check popup.html includes React root element
- Look for errors in chrome://extensions/ debug page

---

**Version**: 1.0 (Phase 3)  
**Last Updated**: April 9, 2026  
**Author**: HaloGuard Team

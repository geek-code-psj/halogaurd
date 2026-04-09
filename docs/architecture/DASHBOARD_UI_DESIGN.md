# HaloGuard Dashboard - UI Design Specification

**Phase**: 3 (React Dashboard)  
**Timeline**: May 6-15, 2026  
**Status**: Design Specification (Implementation Ready)

---

## 🎨 Design Overview

This dashboard provides real-time hallucination detection monitoring, historical analysis, and system health visibility. The layout prioritizes actionable insights while maintaining trust through transparent system status indicators.

---

## 📐 Layout Architecture

### 1. Top Status Bar
**Purpose**: Instant recognition + system health confirmation  
**Height**: 60px (fixed)

#### Components:
- **Left**: Brand Identity
  - HaloGuard shield logo (32x32px)
  - Text: "HALOGUARD" (white, bold)
  - Font: Roboto 18px

- **Center**: System Status
  - Status Badge: "🟢 REAL-TIME MONITORING: ACTIVE"
  - Live activity graph (300px width, micro-chart)
  - Refresh frequency: 1 second

- **Right**: Quick Metrics (3 Cards)
  ```
  ┌─────────────────┬─────────────────┬──────────────────┐
  │ Threats Blocked │ Data Exposure   │ Network Traffic  │
  │      234        │       12        │    1.2 GB        │
  └─────────────────┴─────────────────┴──────────────────┘
  ```
  - Card size: 150px × 50px each
  - Metric badges with color coding
  - Real-time updates

**Styling**:
- Background: #1a1a2e (dark navy)
- Text: #ffffff
- Accent: #00d4ff (cyan)
- Border: 1px solid #2d2d4d

---

### 2. Main Content Area
**Purpose**: Actionable insights + historical context  
**Layout**: Single column with 2 primary panels

#### Panel A: Live Insights
**Position**: Left 70% | **Height**: Dynamic (min 400px)

```
┌─────────────────────────────────────────────────┐
│ 📊 LIVE INSIGHTS                         [↻]    │
├─────────────────────────────────────────────────┤
│                                                 │
│ CURRENT PAGE SCAN RESULTS                       │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                 │
│ Risk Level: HIGH [🔴]  Confidence: 94%          │
│ Detection Type: Hallucination (Tier 3)          │
│ Page: https://chatgpt.com                       │
│ Timestamp: 09:45:23 UTC                         │
│                                                 │
│ BREAKDOWN BY TIER                               │
│ ├─ Tier 0 (Hedging): ✓ Passed                   │
│ ├─ Tier 1 (Entropy): ⚠ Warning                  │
│ ├─ Tier 2 (Wikipedia): ✓ Passed                 │
│ ├─ Tier 3 (NLI): ✗ Failed                       │
│ └─ Tier 4 (Drift): ⏳ Processing                │
│                                                 │
│ KEY FINDINGS                                    │
│ 1. Logical contradiction detected               │
│ 2. Statement contradicts previous context       │
│ 3. Confidence score below threshold              │
│                                                 │
│ USER ACTION: ☐ Save | ☐ Share | ☐ Report      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Content Sections**:
1. **Current Scan Header**
   - Risk level indicator (RED, YELLOW, GREEN)
   - Confidence percentage
   - Page URL being analyzed
   - Timestamp

2. **Tier Breakdown**
   - Individual tier results
   - ✓ Pass / ⚠ Warning / ✗ Fail indicators
   - Quick explanation per tier

3. **Key Findings**
   - Numbered list of detections
   - Color-coded severity
   - Actionable insights

4. **Action Buttons**
   - Save to History
   - Share Results
   - Report as False Positive

**Styling**:
- Background: rgba(45, 45, 77, 0.5)
- Title: #00d4ff
- Risk colors: 🟢 #00ff00 / 🟡 #ffff00 / 🔴 #ff0000
- Border: 1px solid #2d2d4d
- Border-radius: 8px
- Padding: 16px

---

#### Panel B: Recent Activity (Right Sidebar)
**Position**: Right 30% | **Height**: Auto-scroll

```
┌──────────────────────────┐
│ 📋 RECENT ACTIVITY       │
├──────────────────────────┤
│                          │
│ 09:45 [🔴 HIGH]         │
│ ChatGPT scan failed      │
│ Tier 3 contradiction     │
│ → View Details           │
│                          │
│ 09:32 [🟢 LOW]          │
│ Claude.ai scan passed    │
│ All tiers healthy        │
│                          │
│ 09:18 [🟡 MEDIUM]       │
│ Gemini hedge detected    │
│ Tier 0 warning only      │
│ → Inspect                │
│                          │
│ 09:05 [DB] Database      │
│ Quota reset executed     │
│ 100/100 API calls used   │
│                          │
│ 08:47 [⚙️ SYSTEM]        │
│ Extension updated to v2  │
│                          │
└──────────────────────────┘
```

**Content**:
- Chronological timeline
- Color-coded risk levels per entry
- Timestamp (HH:MM format)
- Brief description
- "View Details" or "Inspect" link
- Activity types: Scans, Database, System

**Styling**:
- Background: rgba(45, 45, 77, 0.3)
- Entry hover: rgba(0, 212, 255, 0.1)
- Timestamp: #888888
- Risk badge: inline, 8px height
- Scrollable: height max 500px

---

### 3. Quick Analysis Tools Bar
**Position**: Below main panels  
**Height**: 80px

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ QUICK ACTIONS                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [🔍 Scan Current Page]  [📊 View Full Reports]       │
│  [⚙️ Manage Settings]    [📈 Analytics]                │
│  [🔔 Notifications]      [📋 API Quota]                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Buttons**:
- Grid layout: 3 columns × 2 rows
- Button size: 140px × 32px
- Icon + text
- Hover state: highlight + shadow

**Actions**:
1. **Scan Current Page**: Trigger analysis on active browser tab
2. **View Full Reports**: Navigate to detailed analytics
3. **Manage Settings**: Open settings panel (threshold, auto-scan, etc.)
4. **Analytics**: Historical data dashboard
5. **Notifications**: Alert history and preferences
6. **API Quota**: Current usage vs. limits

---

### 4. Bottom Navigation Tab Bar
**Position**: Fixed bottom  
**Height**: 56px

```
┌─────────────────────────────────────────────────────────┐
│ [Dashboard] [Reports] [Settings] [Notifications] [Help] │
└─────────────────────────────────────────────────────────┘
```

**Tabs** (5 sections):

| Tab | Route | Purpose |
|-----|-------|---------|
| **Dashboard** | `/dashboard` | This main view (real-time monitoring) |
| **Reports** | `/reports` | Historical analysis, statistics, trends |
| **Settings** | `/settings` | User preferences, thresholds, integrations |
| **Notifications** | `/notifications` | Alert history, subscription preferences |
| **Help** | `/help` | Docs, API reference, FAQ |

**Styling**:
- Background: #1a1a2e
- Active tab: #00d4ff (cyan underline)
- Inactive tab: #888888
- Hover: #00d4ff (light)
- Font: Roboto 14px

---

## 🎨 Color Scheme & Typography

### Color Palette
```
Primary: #00d4ff (Cyan - trust, technology)
Dark BG: #1a1a2e (Navy - authority)
Secondary BG: #2d2d4d (Purple-gray - panels)
Success: #00ff00 (Green - pass)
Warning: #ffff00 (Yellow - caution)
Danger: #ff0000 (Red - fail)
Neutral: #888888 (Gray - secondary text)
White: #ffffff (Primary text)
```

### Typography
```
Headings: Roboto Bold, 18px, #00d4ff
Subheadings: Roboto Semi-bold, 14px, #ffffff
Body: Roboto Regular, 12px, #ffffff
Metrics: Roboto Mono, 16px, #00ff00 (success) / #ff0000 (danger)
Timestamps: Roboto Regular, 10px, #888888
```

---

## 📦 React Component Structure

```
src/
├── components/
│   ├── Dashboard.tsx                # Main container
│   ├── StatusBar/
│   │   ├── StatusBar.tsx            # Top bar
│   │   ├── MetricsCard.tsx          # Individual metric
│   │   └── ActivityGraph.tsx        # Real-time chart
│   ├── LiveInsights/
│   │   ├── LiveInsights.tsx         # Main panel
│   │   ├── ScanResults.tsx          # Scan result display
│   │   ├── TierBreakdown.tsx        # Tier status hierarchy
│   │   └── KeyFindings.tsx          # Findings list
│   ├── RecentActivity/
│   │   ├── RecentActivity.tsx       # Sidebar
│   │   └── ActivityEntry.tsx        # Individual entry
│   ├── QuickActions/
│   │   ├── QuickActions.tsx         # Action buttons area
│   │   └── ActionButton.tsx         # Individual button
│   └── BottomNav/
│       ├── BottomNav.tsx            # Tab bar
│       └── NavTab.tsx               # Individual tab
│
├── pages/
│   ├── DashboardPage.tsx            # Dashboard view
│   ├── ReportsPage.tsx              # Reports view
│   ├── SettingsPage.tsx             # Settings view
│   ├── NotificationsPage.tsx        # Notifications view
│   └── HelpPage.tsx                 # Help/docs view
│
├── hooks/
│   ├── useRealtimeData.ts           # WebSocket connection
│   ├── useDashboardMetrics.ts       # Metric fetching
│   └── useActivityStream.ts         # Activity updates
│
├── types/
│   ├── dashboard.ts                 # Dashboard types
│   ├── analysis.ts                  # Analysis result types
│   └── activity.ts                  # Activity types
│
└── styles/
    ├── dashboard.module.css          # Dashboard styles
    ├── colors.css                    # Color variables
    └── animations.css                # Transitions
```

---

## 🔌 API Integration Points

### Real-time Data Sources

1. **WebSocket: `/ws/dashboard`**
   - Current scan results
   - Activity stream
   - System status updates
   - Refresh rate: 1 second

2. **REST: `GET /api/v1/dashboard/metrics`**
   - Quick metrics (threats, data exposure, traffic)
   - Response time: <100ms

3. **REST: `GET /api/v1/activity/recent`**
   - Recent 20 activities
   - Pagination available
   - Response time: <200ms

4. **REST: `POST /api/v1/analysis/scan`**
   - Trigger page scan
   - Returns: scan ID + results

---

## ✨ Interactions & Behaviors

### Real-time Updates
- Metrics refresh every 1 second
- New activity entries appear top-of-list
- Risk levels update without page reload
- Activity timeline scrolls automatically

### User Actions
- Click metric card: Navigate to detailed report
- Click "View Details" in activity: Load scan details
- Click action buttons: Trigger respective features
- Tab navigation: Smooth transition between views

### Error States
- WebSocket disconnect: Show "Connection Lost" banner
- API timeout: "Data loading..." placeholder
- Empty state: "No recent activity" message

---

## 📱 Responsive Design

### Breakpoints
- **Desktop** (1200px+): 2-column layout as specified
- **Tablet** (768px - 1200px): Stack to single column
- **Mobile** (< 768px): Simplified view (activity timeline only)

### Adaptive Changes
- **Desktop**: Live Insights (70%) + Recent Activity (30%)
- **Tablet**: Full width, Live Insights above, Activity below
- **Mobile**: Activity sidebar hidden, expandable drawer instead

---

## 🎯 Performance Targets

- **First Paint**: < 1s
- **Interactive**: < 2s
- **Metrics Update**: < 100ms latency
- **WebSocket Connection**: < 500ms
- **Report Load**: < 3s

---

## 📋 Implementation Checklist

- [ ] Create Dashboard.tsx main container
- [ ] Implement StatusBar with metrics
- [ ] Build LiveInsights panel with tier breakdown
- [ ] Create RecentActivity sidebar
- [ ] Add QuickActions button grid
- [ ] Implement BottomNav tabs
- [ ] Connect WebSocket for real-time updates
- [ ] Add CSS module styles with color scheme
- [ ] Implement responsive breakpoints
- [ ] Add error handling & loading states
- [ ] Create supporting pages (Reports, Settings, etc.)
- [ ] Connect to backend API endpoints
- [ ] Add animations & transitions
- [ ] Performance optimization
- [ ] User testing & refinement

---

**Status**: Ready for React component implementation (Phase 3, May 6-15)

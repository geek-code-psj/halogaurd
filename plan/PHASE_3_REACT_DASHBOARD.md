# Phase 3: React Dashboard - Detailed Implementation Plan

**Duration**: May 6 - May 15 (10 days)  
**Deadline**: May 15 (deploy to Railway)  
**Goal**: Build analytics dashboard and user management portal

---

## 📦 Deliverables

### ✅ Must Have (MVP)
- [ ] User authentication (session-based, no signup hassle)
- [ ] Dashboard home with stats overview
- [ ] Analysis history table (paginated)
- [ ] Search & filter in history
- [ ] Statistics page with charts
- [ ] Settings/account page
- [ ] Deploy to Railway
- [ ] Full responsiveness (mobile + desktop)

### 🟡 Nice to Have (Post-MVP)
- [ ] Export history (CSV/JSON)
- [ ] Advanced filtering (by date range, severity)
- [ ] Trend charts (weekly/monthly)
- [ ] User feedback loop visualization
- [ ] API key management

---

## 🏗️ Architecture

### File Structure
```
shared-ui/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx         # Main analytics page
│   │   ├── History.tsx           # Analysis history
│   │   ├── Statistics.tsx        # Stats & charts
│   │   ├── Settings.tsx          # Account settings
│   │   └── Login.tsx             # Session creation
│   ├── components/
│   │   ├── Header.tsx            # Top navigation
│   │   ├── Sidebar.tsx           # Left sidebar nav
│   │   ├── AnalysisCard.tsx      # Individual result card
│   │   ├── StatsGrid.tsx         # Stats overview
│   │   ├── Chart.tsx             # Chart component
│   │   └── Loading.tsx           # Loading state
│   ├── hooks/
│   │   ├── useApi.ts             # API calls
│   │   ├── useAuth.ts            # Auth state
│   │   └── useAnalysis.ts        # Analysis data
│   ├── context/
│   │   ├── AuthContext.tsx       # Auth provider
│   │   └── ThemeContext.tsx      # Theme provider
│   ├── utils/
│   │   ├── api.ts                # Backend client
│   │   ├── storage.ts            # LocalStorage wrapper
│   │   └── formatting.ts         # Format utilities
│   ├── App.tsx
│   ├── index.tsx
│   └── styles/
│       ├── global.css
│       └── variables.css
├── public/
│   ├── index.html
│   └── favicon.ico
├── package.json
└── vite.config.ts
```

---

## 🔧 Implementation Steps (Day by Day)

### Day 1 - May 6: PROJECT SETUP & AUTH
**Tasks**:
- [ ] Initialize Vite + React project
- [ ] Setup TypeScript configuration
- [ ] Create authentication flow (session-based)
- [ ] Build LoginPage component
- [ ] Install dependencies (axios, recharts, react-router)

**Dependencies**:
```json
{
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "react-router-dom": "^6.10.0",
  "axios": "^1.3.0",
  "recharts": "^2.5.0"
}
```

**LoginPage.tsx**:
```typescript
export const LoginPage: React.FC = () => {
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateSession = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'dashboard' })
      });
      
      const { sessionId } = await response.json();
      localStorage.setItem('sessionId', sessionId);
      
      // Redirect to dashboard
      window.location.href = '/dashboard';
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <h1>Welcome to HaloGuard</h1>
      <p>Start analyzing AI responses for hallucinations</p>
      <button onClick={handleCreateSession} disabled={loading}>
        {loading ? 'Creating Session...' : 'Get Started'}
      </button>
    </div>
  );
};
```

---

### Day 2 - May 7: DASHBOARD HOME PAGE
**Tasks**:
- [ ] Build Dashboard.tsx component
- [ ] Create StatsGrid with key metrics
- [ ] Display today's statistics
- [ ] Add quick action buttons
- [ ] Responsive layout

**Dashboard.tsx**:
```typescript
export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    totalAnalyses: 0,
    hallucinations: 0,
    avgScore: 0,
    todayAnalyses: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="dashboard">
      <Header title="Dashboard" />
      
      <div className="stats-grid">
        <StatCard 
          label="Total Analyses"
          value={stats.totalAnalyses}
          icon="📊"
        />
        <StatCard 
          label="Hallucinations Detected"
          value={stats.hallucinations}
          icon="⚠️"
        />
        <StatCard 
          label="Average Score"
          value={`${stats.avgScore}%`}
          icon="📈"
        />
        <StatCard 
          label="Today"
          value={stats.todayAnalyses}
          icon="📅"
        />
      </div>

      <div className="quick-actions">
        <button onClick={() => navigate('/history')}>View History</button>
        <button onClick={() => navigate('/statistics')}>Statistics</button>
        <button onClick={() => navigate('/settings')}>Settings</button>
      </div>
    </div>
  );
};
```

---

### Day 3 - May 8: HISTORY PAGE & TABLE
**Tasks**:
- [ ] Build History.tsx component
- [ ] Create analysis table (paginated)
- [ ] Add search functionality
- [ ] Add filter by severity
- [ ] Add sort by date
- [ ] Responsive table design

**History.tsx**:
```typescript
export const HistoryPage: React.FC = () => {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<'all'|'low'|'medium'|'high'|'critical'>('all');

  useEffect(() => {
    fetchAnalyses(page, search, filterSeverity);
  }, [page, search, filterSeverity]);

  const filtered = analyses.filter(a => {
    if (filterSeverity !== 'all' && !a.issues.some(i => i.severity === filterSeverity)) {
      return false;
    }
    return a.content?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="history-page">
      <Header title="Analysis History" />

      <div className="filters">
        <input 
          type="text" 
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
          <option value="all">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      <table className="analysis-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Content</th>
            <th>Score</th>
            <th>Issues</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(analysis => (
            <tr key={analysis.id}>
              <td>{new Date(analysis.createdAt).toLocaleDateString()}</td>
              <td>{truncate(analysis.content, 50)}</td>
              <td><strong>{analysis.score}%</strong></td>
              <td>{analysis.issues.length} issues</td>
              <td>
                <span className={`badge badge-${analysis.flagged ? 'danger' : 'success'}`}>
                  {analysis.flagged ? 'Flagged' : 'Safe'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Pagination 
        page={page} 
        onPageChange={setPage}
        hasMore={analyses.length === 20}
      />
    </div>
  );
};
```

---

### Day 4 - May 9: STATISTICS & CHARTS
**Tasks**:
- [ ] Build Statistics.tsx page
- [ ] Create charts using Recharts library
- [ ] Hallucination type breakdown (pie chart)
- [ ] Score distribution (bar chart)
- [ ] Time-series trend (line chart)
- [ ] Top issues summary

**Statistics.tsx** (with Recharts):
```typescript
import { PieChart, BarChart, LineChart, Pie, Bar, Line, XAxis, YAxis } from 'recharts';

export const StatisticsPage: React.FC = () => {
  const [data, setData] = useState({
    byType: [],
    byScore: [],
    trend: []
  });

  useEffect(() => {
    fetchStatistics();
  }, []);

  return (
    <div className="statistics-page">
      <Header title="Statistics" />

      <div className="charts-grid">
        {/* Hallucination Types Pie Chart */}
        <div className="chart">
          <h3>Issues by Type</h3>
          <PieChart width={400} height={300}>
            <Pie
              data={data.byType}
              cx={200}
              cy={150}
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="count"
            />
          </PieChart>
        </div>

        {/* Score Distribution Bar Chart */}
        <div className="chart">
          <h3>Score Distribution</h3>
          <BarChart width={400} height={300} data={data.byScore}>
            <XAxis dataKey="range" />
            <YAxis />
            <Bar dataKey="count" fill="#82ca9d" />
          </BarChart>
        </div>

        {/* Trend Line Chart */}
        <div className="chart chart-full-width">
          <h3>Detection Trend (Last 14 Days)</h3>
          <LineChart width={800} height={300} data={data.trend}>
            <XAxis dataKey="date" />
            <YAxis />
            <Line 
              type="monotone" 
              dataKey="detections" 
              stroke="#8884d8"
              dot={{ fill: '#8884d8' }}
            />
          </LineChart>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat">
          <strong>Most Common Issue:</strong> Sycophancy (45%)
        </div>
        <div className="stat">
          <strong>Severity Breakdown:</strong> High (60%), Medium (30%), Low (10%)
        </div>
        <div className="stat">
          <strong>Accuracy Rating:</strong> 94% (based on user feedback)
        </div>
      </div>
    </div>
  );
};
```

---

### Day 5 - May 10: SETTINGS & ACCOUNT PAGE
**Tasks**:
- [ ] Build Settings.tsx component
- [ ] Account/session info display
- [ ] API key management (for future use)
- [ ] Theme preference toggle
- [ ] Password/session reset
- [ ] Feedback form

**Settings.tsx**:
```typescript
export const SettingsPage: React.FC = () => {
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    setSessionId(localStorage.getItem('sessionId') || '');
  }, []);

  return (
    <div className="settings-page">
      <Header title="Settings" />

      <div className="settings-section">
        <h2>Account</h2>
        <div className="setting-item">
          <label>Session ID</label>
          <code>{sessionId}</code>
          <button onClick={copyToClipboard}>Copy</button>
        </div>
      </div>

      <div className="settings-section">
        <h2>Preferences</h2>
        <div className="setting-item">
          <label>
            <input type="checkbox" /> Dark Mode
          </label>
        </div>
        <div className="setting-item">
          <label>
            <input type="checkbox" defaultChecked /> Email Notifications
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2>Feedback</h2>
        <textarea 
          placeholder="Tell us what you think..."
          rows={4}
        />
        <button>Send Feedback</button>
      </div>

      <div className="settings-section">
        <h2>Danger Zone</h2>
        <button className="btn-danger" onClick={logout}>
          Logout
        </button>
      </div>
    </div>
  );
};
```

---

### Day 6 - May 11: NAVIGATION & LAYOUT
**Tasks**:
- [ ] Build Header component (navigation)
- [ ] Build Sidebar component (nav menu)
- [ ] Setup React Router (routing between pages)
- [ ] Create layout wrapper
- [ ] Mobile responsive menu

**Header.tsx**:
```typescript
export const Header: React.FC<{ title: string }> = ({ title }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="header">
      <div className="header-left">
        <button 
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          ☰
        </button>
        <h1>{title}</h1>
      </div>

      <div className="header-right">
        <span className="user-badge">👤 User</span>
        <button onClick={() => window.location.href = '/settings'}>
          ⚙️
        </button>
      </div>
    </header>
  );
};

export const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <nav>
        <NavLink to="/dashboard">📊 Dashboard</NavLink>
        <NavLink to="/history">📋 History</NavLink>
        <NavLink to="/statistics">📈 Statistics</NavLink>
        <NavLink to="/settings">⚙️ Settings</NavLink>
      </nav>
    </aside>
  );
};
```

---

### Day 7 - May 12: RESPONSIVE DESIGN & MOBILE
**Tasks**:
- [ ] Test on mobile (375px width)
- [ ] Test on tablet (768px width)
- [ ] Test on desktop (1920px width)
- [ ] Fix layout issues
- [ ] Ensure touch-friendly buttons
- [ ] Test hamburger menu on mobile

**Breakpoints (CSS)**:
```css
/* Mobile */
@media (max-width: 768px) {
  .sidebar { display: none; }
  .menu-toggle { display: block; }
  .stats-grid { grid-template-columns: 1fr 1fr; }
}

/* Tablet */
@media (min-width: 768px) and (max-width: 1024px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
}

/* Desktop */
@media (min-width: 1025px) {
  .stats-grid { grid-template-columns: 1fr 1fr 1fr 1fr; }
  .sidebar { display: block; }
}
```

---

### Day 8 - May 13: STYLING & POLISH
**Tasks**:
- [ ] Create global CSS variables
- [ ] Add dark theme
- [ ] Optimize fonts & colors
- [ ] Add animations & transitions
- [ ] Polish spacing & typography
- [ ] Test accessibility (WCAG 2.0)

**CSS Variables**:
```css
:root {
  --primary: #007bff;
  --danger: #dc3545;
  --success: #28a745;
  --warning: #ffc107;
  
  --text-color: #333;
  --bg-color: #fff;
  --border-color: #ddd;
  
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-color: #fff;
    --bg-color: #1e1e1e;
    --border-color: #444;
  }
}
```

---

### Day 9 - May 14: LOCAL TESTING & BUILD
**Tasks**:
- [ ] Build: `npm run build`
- [ ] Test build output: `npm run preview`
- [ ] Performance audit (Lighthouse)
- [ ] Accessibility check (axe)
- [ ] Load testing
- [ ] Configuration for Railway deployment

**Vite Config** (vite.config.ts):
```typescript
export default {
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
};
```

---

### Day 10 - May 15: DEPLOY TO RAILWAY 🚀
**Tasks**:
- [ ] Create Dockerfile for Node server
- [ ] Push to GitHub
- [ ] Configure Railway deployment
- [ ] Add environment variables
- [ ] Setup domain (optional)
- [ ] Verify production access

**Dockerfile**:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

**Railway Deployment**:
1. Connect GitHub repo
2. Set environment: `VITE_API_URL=https://haloguard-production.up.railway.app`
3. Build command: `npm run build`
4. Start command: `npm run preview`
5. Port: `3000`
6. Deploy!

**Expected Result**: Dashboard live at `https://haloguard-dashboard.up.railway.app` ✅

---

## 📊 Success Criteria

### Technical
- [ ] All pages load and render correctly
- [ ] API integration working (real backend data)
- [ ] Responsive on mobile/tablet/desktop
- [ ] Bundle size <500KB
- [ ] Page load time <2 seconds
- [ ] Lighthouse score >90
- [ ] 0 accessibility violations

### User Experience
- [ ] Intuitive navigation
- [ ] Clear data visualization
- [ ] Fast interactions
- [ ] Professional design
- [ ] Mobile-friendly

### Deployment
- [ ] Successfully deployed to Railway
- [ ] All services running stable
- [ ] Database queries optimized
- [ ] Monitoring configured

---

**Owner**: Frontend Team  
**Created**: April 9, 2026  
**Status**: READY TO START (Awaits Phase 2 completion)

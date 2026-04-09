/**
 * HaloGuard Popup Dashboard
 * Main UI for the extension
 */

// Helper to send messages to the service worker
async function sendToBackground(type: string, payload?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

class PopupDashboard {
  private analyses: any = {};
  private metrics: any = null;
  private currentTab: string = 'dashboard';

  constructor() {
    console.log('[HaloGuard Popup] Initializing PopupDashboard');
    this.initializeEventListeners();
    console.log('[HaloGuard Popup] Event listeners initialized');
    this.loadData();
    this.setupRefresh();
    console.log('[HaloGuard Popup] Dashboard ready');
  }

  private initializeEventListeners() {
    console.log('[HaloGuard Popup] Setting up event delegation');
    // Use event delegation on document so listeners survive re-renders
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Tab navigation
      if (target.hasAttribute('data-tab')) {
        const tabName = target.getAttribute('data-tab');
        console.log('[HaloGuard Popup] Tab clicked:', tabName);
        if (tabName) this.switchTab(tabName);
      }
      
      // Action buttons - use ID matching with event delegation
      if (target.id === 'scan-btn' || target.closest('#scan-btn')) {
        console.log('[HaloGuard Popup] Scan button clicked via event delegation');
        e.preventDefault();
        this.scanCurrentPage();
      }
      if (target.id === 'clear-btn' || target.closest('#clear-btn')) {
        console.log('[HaloGuard Popup] Clear button clicked via event delegation');
        e.preventDefault();
        this.clearHistory();
      }
      if (target.id === 'refresh-btn' || target.closest('#refresh-btn')) {
        console.log('[HaloGuard Popup] Refresh button clicked via event delegation');
        e.preventDefault();
        this.loadData();
      }
    });
  }

  private async loadData() {
    try {
      console.log('[HaloGuard Popup] Loading data from background...');
      this.analyses = await sendToBackground('GET_ANALYSIS_HISTORY');
      console.log('[HaloGuard Popup] Got analysis history:', { count: Object.keys(this.analyses || {}).length });
      
      this.metrics = await sendToBackground('GET_METRICS');
      console.log('[HaloGuard Popup] Got metrics:', this.metrics);
      
      this.render();
      console.log('[HaloGuard Popup] Dashboard rendered');
    } catch (error) {
      console.error('[HaloGuard Popup] Failed to load data:', error);
    }
  }

  private setupRefresh() {
    setInterval(() => this.loadData(), 2000);
  }

  private switchTab(tabName: string) {
    this.currentTab = tabName;
    document.querySelectorAll('[data-tab-content]').forEach((content) => {
      (content as HTMLElement).style.display = 'none';
    });
    const activeContent = document.getElementById(`${tabName}-content`);
    if (activeContent) activeContent.style.display = 'block';
    this.render();
  }

  private render() {
    this.renderStatusBar();
    this.renderMainContent();
  }

  private renderStatusBar() {
    const statusBar = document.getElementById('status-bar');
    if (!statusBar || !this.metrics) return;

    statusBar.innerHTML = `
      <div class="status-left">
        <div class="logo">🛡️</div>
        <div class="brand">HALOGUARD</div>
      </div>
      <div class="status-center">
        <span class="status-badge active">🟢 REAL-TIME MONITORING: ACTIVE</span>
      </div>
      <div class="status-right">
        <div class="metric">
          <span class="label">Threats</span>
          <span class="value">${this.metrics.threatsBlocked}</span>
        </div>
        <div class="metric">
          <span class="label">Exposure</span>
          <span class="value">${this.metrics.dataExposure}</span>
        </div>
        <div class="metric">
          <span class="label">Traffic</span>
          <span class="value">${this.metrics.networkTraffic}</span>
        </div>
      </div>
    `;
  }

  private renderMainContent() {
    const content = document.getElementById('main-content');
    if (!content) return;

    if (this.currentTab === 'dashboard') {
      content.innerHTML = this.renderDashboard();
    } else if (this.currentTab === 'reports') {
      content.innerHTML = this.renderReports();
    } else if (this.currentTab === 'settings') {
      content.innerHTML = this.renderSettings();
    }
  }

  private renderDashboard(): string {
    // Get the most recent analysis from the analyses object
    const analysesList: any[] = Object.values(this.analyses || {});
    const latest = analysesList.length > 0 ? analysesList[0] : null;

    return `
      <div class="dashboard-content">
        <div class="live-insights">
          <h3>📊 LIVE INSIGHTS</h3>
          ${
            latest
              ? `
            <div class="scan-result ${latest.riskLevel}">
              <div class="risk-indicator">
                ${this.getRiskEmoji(latest.riskLevel)} ${latest.riskLevel.toUpperCase()}
              </div>
              <div class="confidence">Confidence: ${(latest.confidence * 100).toFixed(0)}%</div>
              <div class="url">${latest.url}</div>
              <div class="summary">${latest.summary}</div>
              ${
                latest.findings.length > 0
                  ? `
                <div class="findings">
                  <strong>Findings:</strong>
                  <ul>${latest.findings.map((f: any) => `<li>${f}</li>`).join('')}</ul>
                </div>
              `
                  : ''
              }
              <div class="tiers">
                <strong>Tier Breakdown:</strong>
                ${latest.tiers.map((t: any) => `
                  <div class="tier tier-${t.status}">
                    <span class="tier-icon">${this.getTierIcon(t.status)}</span>
                    <span class="tier-name">Tier ${t.tier}: ${t.name}</span>
                    <span class="tier-confidence">${(t.confidence * 100).toFixed(0)}%</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `
              : `<p class="empty">No recent analysis. Click "Scan Current Page" to start.</p>`
          }
        </div>

        <div class="recent-activity">
          <h3>📋 RECENT ACTIVITY</h3>
          ${
            Object.keys(this.analyses || {}).length > 0
              ? `
            <div class="activity-list">
              ${Object.values(this.analyses || {})
                .slice(0, 5)
                .map(
                  (a: any) => `
                <div class="activity-item ${a.riskLevel}">
                  <div class="time">${new Date(a.timestamp).toLocaleTimeString()}</div>
                  <div class="title">${a.riskLevel.toUpperCase()}: ${a.url.split('/').pop() || 'Page'}</div>
                  <div class="summary">${a.summary}</div>
                </div>
              `
                )
                .join('')}
            </div>
          `
              : `<p class="empty">No activity yet.</p>`
          }
        </div>

        <div class="quick-actions">
          <button id="scan-btn" class="action-btn primary">🔍 Scan Current Page</button>
          <button id="clear-btn" class="action-btn secondary">🗑️ Clear History</button>
          <button id="refresh-btn" class="action-btn secondary">↻ Refresh</button>
        </div>
      </div>
    `;
  }

  private renderReports(): string {
    return `
      <div class="reports-content">
        <h3>📈 Analysis Reports</h3>
        ${
          Object.keys(this.analyses || {}).length > 0
            ? `
          <table class="reports-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>URL</th>
                <th>Risk</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              ${Object.values(this.analyses || {})
                .map(
                  (a: any) => `
                <tr>
                  <td>${new Date(a.timestamp).toLocaleString()}</td>
                  <td><small>${a.url}</small></td>
                  <td><span class="risk-badge ${a.riskLevel}">${a.riskLevel}</span></td>
                  <td>${(a.confidence * 100).toFixed(0)}%</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `
            : `<p class="empty">No reports available.</p>`
        }
      </div>
    `;
  }

  private renderSettings(): string {
    return `
      <div class="settings-content">
        <h3>⚙️ Settings</h3>
        <label class="setting-item">
          <input type="checkbox" id="auto-scan" checked>
          <span>Auto-scan pages</span>
        </label>
        <label class="setting-item">
          <input type="checkbox" id="notifications" checked>
          <span>Show notifications</span>
        </label>
        <label class="setting-item">
          <input type="checkbox" id="highlight" checked>
          <span>Highlight issues</span>
        </label>
        <button class="action-btn secondary" id="save-settings">Save Settings</button>
      </div>
    `;
  }

  private async scanCurrentPage() {
    console.log('[HaloGuard Popup] Scan button clicked');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length) {
        console.error('[HaloGuard Popup] No active tab found');
        alert('Please make sure you have an active tab open');
        return;
      }

      const tab = tabs[0];
      console.log('[HaloGuard Popup] Active tab:', { id: tab.id, url: tab.url });

      if (!tab.id) {
        console.error('[HaloGuard Popup] Tab ID is invalid');
        alert('Could not get current tab information');
        return;
      }

      // Send scan request to background
      console.log('[HaloGuard Popup] Sending SCAN_PAGE to background...');
      await sendToBackground('SCAN_PAGE', { url: tab.url, id: tab.id });
      console.log('[HaloGuard Popup] Scan request sent, waiting for response...');

      // Reload data after a delay to see results
      setTimeout(() => {
        console.log('[HaloGuard Popup] Reloading data...');
        this.loadData();
      }, 1000);
    } catch (error) {
      console.error('[HaloGuard Popup] Scan failed:', error);
      alert('Scan failed: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async clearHistory() {
    console.log('[HaloGuard Popup] Clear history button clicked');
    if (confirm('Clear all analysis history?')) {
      try {
        console.log('[HaloGuard Popup] Sending CLEAR_HISTORY to background...');
        await sendToBackground('CLEAR_HISTORY');
        console.log('[HaloGuard Popup] History cleared, reloading data...');
        this.loadData();
      } catch (error) {
        console.error('[HaloGuard Popup] Clear history failed:', error);
        alert('Failed to clear history: ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  }

  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'low':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'high':
        return '🟠';
      case 'critical':
        return '🔴';
      default:
        return '⚫';
    }
  }

  private getTierIcon(status: string): string {
    switch (status) {
      case 'passed':
        return '✓';
      case 'warning':
        return '⚠';
      case 'failed':
        return '✗';
      case 'processing':
        return '⏳';
      default:
        return '?';
    }
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupDashboard();
});

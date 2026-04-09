/**
 * HaloGuard Popup Dashboard
 * Main UI for the extension
 */

import { HaloGuardAPI } from '../shared/api';
import { AnalysisResult, DashboardMetrics } from '../types';

class PopupDashboard {
  private analyses: AnalysisResult[] = [];
  private metrics: DashboardMetrics | null = null;
  private currentTab: string = 'dashboard';

  constructor() {
    this.initializeEventListeners();
    this.loadData();
    this.setupRefresh();
  }

  private initializeEventListeners() {
    // Tab navigation
    document.querySelectorAll('[data-tab]').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const tabName = (e.target as HTMLElement).getAttribute('data-tab');
        if (tabName) this.switchTab(tabName);
      });
    });

    // Action buttons
    document.getElementById('scan-btn')?.addEventListener('click', () => this.scanCurrentPage());
    document.getElementById('clear-btn')?.addEventListener('click', () => this.clearHistory());
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.loadData());
  }

  private async loadData() {
    try {
      this.analyses = await HaloGuardAPI.getAnalysisHistory();
      this.metrics = await HaloGuardAPI.getDashboardMetrics();
      this.render();
    } catch (error) {
      console.error('Failed to load data:', error);
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
    const latest = this.analyses[0];

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
                  <ul>${latest.findings.map((f) => `<li>${f}</li>`).join('')}</ul>
                </div>
              `
                  : ''
              }
              <div class="tiers">
                <strong>Tier Breakdown:</strong>
                ${latest.tiers.map((t) => `
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
            this.analyses.length > 0
              ? `
            <div class="activity-list">
              ${this.analyses
                .slice(0, 5)
                .map(
                  (a) => `
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
          this.analyses.length > 0
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
              ${this.analyses
                .map(
                  (a) => `
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' }, async (response) => {
        if (response) {
          const result = await HaloGuardAPI.analyzePage(response);
          await HaloGuardAPI.saveAnalysis(result);
          this.loadData();
        }
      });
    }
  }

  private async clearHistory() {
    if (confirm('Clear all analysis history?')) {
      await HaloGuardAPI.clearHistory();
      this.loadData();
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

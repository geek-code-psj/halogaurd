/**
 * Dashboard.tsx
 * Main container component for the HaloGuard real-time monitoring dashboard
 */

import React, { useState } from 'react';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { useDashboardMetrics } from '../hooks/useActivityStream';
import { DashboardState, RiskLevel } from '../types/dashboard';
import { StatusBar } from './StatusBar';
import { LiveInsights } from './LiveInsights';
import { RecentActivity } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { BottomNav } from './BottomNav';
import '../styles/dashboard.module.css';

interface DashboardProps {
  wsUrl: string;
  apiBaseUrl: string;
  currentPage?: string;
  theme?: 'dark' | 'light';
}

export const Dashboard: React.FC<DashboardProps> = ({
  wsUrl,
  apiBaseUrl,
  currentPage = 'dashboard',
  theme = 'dark',
}) => {
  const [activePage, setActivePage] = useState<string>(currentPage);
  const [error, setError] = useState<string | null>(null);

  // Real-time WebSocket data
  const {
    currentScan,
    recentActivity,
    activityGraph,
    isConnected,
  } = useRealtimeData({
    url: wsUrl,
    onError: setError,
  });

  // Dashboard metrics (API polling)
  const { metrics, isLoading: metricsLoading } = useDashboardMetrics({
    apiEndpoint: `${apiBaseUrl}/api/v1/dashboard/metrics`,
    refreshInterval: 1000,
    onError: setError,
  });

  const dashboardState: DashboardState = {
    currentScan,
    metrics,
    recentActivity,
    activityGraph,
    isConnected,
    isLoading: metricsLoading,
    error,
    settings: {
      autoScan: true,
      notificationsEnabled: true,
      riskThreshold: 'high' as RiskLevel,
    },
  };

  return (
    <div className={`dashboard dashboard-${theme}`}>
      {/* Connection Error Banner */}
      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
          <button
            className="error-close"
            onClick={() => setError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Connection Lost Banner */}
      {!isConnected && (
        <div className="connection-lost-banner">
          <span className="status-indicator">🔴</span>
          <span className="message">Connection Lost - Attempting to reconnect...</span>
        </div>
      )}

      {/* Top Status Bar */}
      <StatusBar
        metrics={metrics}
        isConnected={isConnected}
        activityGraph={activityGraph}
      />

      {/* Main Content Area */}
      <div className="dashboard-content">
        {activePage === 'dashboard' && (
          <>
            <div className="main-layout">
              <div className="live-insights-container">
                <LiveInsights scanResult={currentScan} isLoading={metricsLoading} />
              </div>
              <div className="recent-activity-container">
                <RecentActivity activities={recentActivity} />
              </div>
            </div>

            {/* Quick Actions Bar */}
            <QuickActions apiBaseUrl={apiBaseUrl} />
          </>
        )}

        {/* Other pages placeholder */}
        {activePage === 'reports' && (
          <div className="page-placeholder">
            <h2>📊 Reports</h2>
            <p>Historical analysis and statistics coming soon...</p>
          </div>
        )}

        {activePage === 'settings' && (
          <div className="page-placeholder">
            <h2>⚙️ Settings</h2>
            <p>User preferences and configuration coming soon...</p>
          </div>
        )}

        {activePage === 'notifications' && (
          <div className="page-placeholder">
            <h2>🔔 Notifications</h2>
            <p>Alert history and preferences coming soon...</p>
          </div>
        )}

        {activePage === 'help' && (
          <div className="page-placeholder">
            <h2>❓ Help</h2>
            <p>Documentation and FAQ coming soon...</p>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav activePage={activePage} onPageChange={setActivePage} />
    </div>
  );
};

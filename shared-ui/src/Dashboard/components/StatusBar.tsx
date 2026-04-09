/**
 * StatusBar.tsx
 * Top status bar with brand, system status, and quick metrics
 */

import React from 'react';
import { DashboardMetrics, ActivityDataPoint } from '../types/dashboard';
import { MetricsCard } from './MetricsCard';
import { ActivityGraph } from './ActivityGraph';

interface StatusBarProps {
  metrics: DashboardMetrics;
  isConnected: boolean;
  activityGraph: ActivityDataPoint[];
}

export const StatusBar: React.FC<StatusBarProps> = ({
  metrics,
  isConnected,
  activityGraph,
}) => {
  return (
    <div className="status-bar">
      {/* Left: Brand Identity */}
      <div className="status-bar-left">
        <div className="brand">
          <div className="brand-icon">🛡️</div>
          <div className="brand-text">HALOGUARD</div>
        </div>
      </div>

      {/* Center: System Status */}
      <div className="status-bar-center">
        <div className="system-status">
          <span className={`status-badge ${isConnected ? 'active' : 'inactive'}`}>
            {isConnected ? '🟢 REAL-TIME MONITORING: ACTIVE' : '🔴 MONITORING: INACTIVE'}
          </span>
        </div>
        <div className="activity-graph-wrapper">
          <ActivityGraph data={activityGraph} />
        </div>
      </div>

      {/* Right: Quick Metrics */}
      <div className="status-bar-right">
        <MetricsCard
          label="Threats Blocked"
          value={metrics.threatsBlocked.toString()}
          icon="🛡️"
        />
        <MetricsCard
          label="Data Exposure"
          value={metrics.dataExposure.toString()}
          icon="⚠️"
        />
        <MetricsCard
          label="Network Traffic"
          value={metrics.networkTraffic}
          icon="📊"
        />
      </div>
    </div>
  );
};

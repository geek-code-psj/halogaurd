/**
 * QuickActions.tsx
 * Quick action buttons bar below main content
 */

import React from 'react';

interface QuickActionsProps {
  apiBaseUrl: string;
}

interface ActionButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
}

const ActionButtonComponent: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onClick,
}) => (
  <button className="quick-action-btn" onClick={onClick}>
    <span className="action-icon">{icon}</span>
    <span className="action-label">{label}</span>
  </button>
);

export const QuickActions: React.FC<QuickActionsProps> = ({ apiBaseUrl }) => {
  const handleScanCurrentPage = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/analysis/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        console.log('Scan initiated');
      }
    } catch (err) {
      console.error('Failed to initiate scan:', err);
    }
  };

  const handleViewReports = () => {
    window.location.href = '/reports';
  };

  const handleSettings = () => {
    window.location.href = '/settings';
  };

  const handleAnalytics = () => {
    window.location.href = '/analytics';
  };

  const handleNotifications = () => {
    window.location.href = '/notifications';
  };

  const handleApiQuota = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/user/quota`);
      const data = await response.json();
      alert(`API Quota: ${data.used}/${data.limit} calls used`);
    } catch (err) {
      console.error('Failed to fetch quota:', err);
    }
  };

  return (
    <div className="quick-actions">
      <h3>⚡ QUICK ACTIONS</h3>
      <div className="actions-grid">
        <ActionButtonComponent
          icon="🔍"
          label="Scan Current Page"
          onClick={handleScanCurrentPage}
        />
        <ActionButtonComponent
          icon="📊"
          label="View Full Reports"
          onClick={handleViewReports}
        />
        <ActionButtonComponent
          icon="⚙️"
          label="Manage Settings"
          onClick={handleSettings}
        />
        <ActionButtonComponent
          icon="📈"
          label="Analytics"
          onClick={handleAnalytics}
        />
        <ActionButtonComponent
          icon="🔔"
          label="Notifications"
          onClick={handleNotifications}
        />
        <ActionButtonComponent
          icon="📋"
          label="API Quota"
          onClick={handleApiQuota}
        />
      </div>
    </div>
  );
};

/**
 * ActivityEntry.tsx
 * Individual activity entry in the timeline
 */

import React from 'react';
import { ActivityEntry, RiskLevel } from '../types/dashboard';

interface ActivityEntryComponentProps {
  activity: ActivityEntry;
  onClick?: () => void;
}

const getActivityIcon = (type: string): string => {
  switch (type) {
    case 'scan':
      return '🔍';
    case 'database':
      return '🗄️';
    case 'system':
      return '⚙️';
    case 'alert':
      return '🚨';
    default:
      return '📝';
  }
};

const getRiskBadgeColor = (level?: RiskLevel): string => {
  switch (level) {
    case 'low':
      return '#00ff00';
    case 'medium':
      return '#ffff00';
    case 'high':
      return '#ff6600';
    case 'critical':
      return '#ff0000';
    default:
      return '#888888';
  }
};

const getRiskEmoji = (level?: RiskLevel): string => {
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
      return '';
  }
};

export const ActivityEntryComponent: React.FC<ActivityEntryComponentProps> = ({
  activity,
  onClick,
}) => {
  const time = new Date(activity.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="activity-entry" onClick={onClick}>
      <div className="entry-time">{time}</div>
      <div className="entry-content">
        {activity.riskLevel && (
          <span
            className="risk-badge"
            style={{ color: getRiskBadgeColor(activity.riskLevel) }}
          >
            {getRiskEmoji(activity.riskLevel)}
          </span>
        )}
        <div className="entry-body">
          <div className="entry-title">{activity.title}</div>
          <div className="entry-description">{activity.description}</div>
        </div>
      </div>
      {activity.actionUrl && (
        <a href={activity.actionUrl} className="entry-action">
          → View
        </a>
      )}
    </div>
  );
};

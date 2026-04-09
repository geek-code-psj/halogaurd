/**
 * RecentActivity.tsx
 * Recent activity timeline sidebar
 */

import React from 'react';
import { ActivityEntry } from '../types/dashboard';
import { ActivityEntryComponent } from './ActivityEntry';

interface RecentActivityProps {
  activities: ActivityEntry[];
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  return (
    <div className="recent-activity">
      <h3>📋 RECENT ACTIVITY</h3>
      {activities.length === 0 ? (
        <div className="activity-empty">
          <p>No recent activity</p>
        </div>
      ) : (
        <div className="activity-list">
          {activities.map((activity) => (
            <ActivityEntryComponent key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
};

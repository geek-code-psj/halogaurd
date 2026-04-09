/**
 * ActivityGraph.tsx
 * Real-time activity chart showing threat detections over time
 */

import React from 'react';
import { ActivityDataPoint } from '../types/dashboard';

interface ActivityGraphProps {
  data: ActivityDataPoint[];
}

export const ActivityGraph: React.FC<ActivityGraphProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="activity-graph">
        <div className="graph-empty">No data</div>
      </div>
    );
  }

  // Find max value for scaling
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="activity-graph">
      <div className="graph-container">
        {data.map((point, index) => (
          <div
            key={index}
            className="graph-bar"
            style={{
              height: `${(point.value / maxValue) * 50}px`,
            }}
            title={`${point.value} threats at ${new Date(point.timestamp).toLocaleTimeString()}`}
          />
        ))}
      </div>
    </div>
  );
};

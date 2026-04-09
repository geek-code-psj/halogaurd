/**
 * MetricsCard.tsx
 * Individual metric card in the status bar
 */

import React from 'react';

interface MetricsCardProps {
  label: string;
  value: string;
  icon?: string;
  onClick?: () => void;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  label,
  value,
  icon,
  onClick,
}) => {
  return (
    <div className="metrics-card" onClick={onClick}>
      {icon && <span className="metrics-icon">{icon}</span>}
      <div className="metrics-content">
        <div className="metrics-label">{label}</div>
        <div className="metrics-value">{value}</div>
      </div>
    </div>
  );
};

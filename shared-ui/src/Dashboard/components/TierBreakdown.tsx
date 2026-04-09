/**
 * TierBreakdown.tsx
 * Displays the 5-tier detection pipeline results
 */

import React from 'react';
import { TierResult } from '../types/dashboard';

interface TierBreakdownProps {
  tiers: TierResult[];
}

const getStatusIcon = (status: string): string => {
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
};

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'passed':
      return '#00ff00';
    case 'warning':
      return '#ffff00';
    case 'failed':
      return '#ff0000';
    case 'processing':
      return '#888888';
    default:
      return '#888888';
  }
};

export const TierBreakdown: React.FC<TierBreakdownProps> = ({ tiers }) => {
  return (
    <div className="tier-breakdown">
      <h3>BREAKDOWN BY TIER</h3>
      <div className="tier-list">
        {tiers.map((tier, idx) => (
          <div key={idx} className={`tier-item tier-${tier.status}`}>
            <div className="tier-status">
              <span
                className="status-icon"
                style={{ color: getStatusColor(tier.status) }}
              >
                {getStatusIcon(tier.status)}
              </span>
            </div>
            <div className="tier-info">
              <div className="tier-name">
                Tier {tier.tier} ({tier.name})
              </div>
              <div className="tier-details">
                <span className="status-text">{tier.status.charAt(0).toUpperCase() + tier.status.slice(1)}</span>
                <span className="confidence">
                  Confidence: {(tier.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            {tier.details && (
              <div className="tier-hint" title={tier.details}>
                ℹ️
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

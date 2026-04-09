/**
 * ScanResults.tsx
 * Displays current scan result header
 */

import React from 'react';
import { ScanResult, RiskLevel } from '../types/dashboard';

interface ScanResultsProps {
  scanResult: ScanResult;
}

const getRiskColor = (level: RiskLevel): string => {
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

const getRiskEmoji = (level: RiskLevel): string => {
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
};

export const ScanResults: React.FC<ScanResultsProps> = ({ scanResult }) => {
  const riskColor = getRiskColor(scanResult.riskLevel);
  const timestamp = new Date(scanResult.timestamp).toLocaleTimeString();

  return (
    <div className="scan-results">
      <h3>CURRENT PAGE SCAN RESULTS</h3>
      <div className="results-header">
        <div className="result-item">
          <span className="label">Risk Level:</span>
          <span
            className="value risk-level"
            style={{ color: riskColor }}
          >
            {getRiskEmoji(scanResult.riskLevel)} {scanResult.riskLevel.toUpperCase()}
          </span>
        </div>
        <div className="result-item">
          <span className="label">Confidence:</span>
          <span className="value">{(scanResult.confidence * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="results-details">
        <div className="detail-item">
          <span className="label">Page:</span>
          <span className="value url">{scanResult.url}</span>
        </div>
        <div className="detail-item">
          <span className="label">Timestamp:</span>
          <span className="value">{timestamp} UTC</span>
        </div>
      </div>
    </div>
  );
};

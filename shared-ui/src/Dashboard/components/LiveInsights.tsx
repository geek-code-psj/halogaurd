/**
 * LiveInsights.tsx
 * Main insights panel showing current scan results and tier breakdown
 */

import React from 'react';
import { ScanResult } from '../types/dashboard';
import { ScanResults } from './ScanResults';
import { TierBreakdown } from './TierBreakdown';
import { KeyFindings } from './KeyFindings';

interface LiveInsightsProps {
  scanResult: ScanResult | null;
  isLoading?: boolean;
}

export const LiveInsights: React.FC<LiveInsightsProps> = ({ scanResult, isLoading }) => {
  const handleRefresh = () => {
    // Trigger new scan
    console.log('Refreshing insights...');
  };

  return (
    <div className="live-insights">
      <div className="live-insights-header">
        <h2>📊 LIVE INSIGHTS</h2>
        <button className="refresh-btn" onClick={handleRefresh} title="Refresh">
          ↻
        </button>
      </div>

      {isLoading && <div className="loading">Loading scan results...</div>}

      {!scanResult && !isLoading && (
        <div className="empty-state">
          <p>No active scan. Start a new analysis to see results.</p>
        </div>
      )}

      {scanResult && (
        <>
          <ScanResults scanResult={scanResult} />
          <div className="insights-divider" />
          <TierBreakdown tiers={scanResult.tiers} />
          <div className="insights-divider" />
          <KeyFindings findings={scanResult.findings} />
          <div className="action-buttons">
            <button className="action-btn save-btn">☐ Save</button>
            <button className="action-btn share-btn">☐ Share</button>
            <button className="action-btn report-btn">☐ Report</button>
          </div>
        </>
      )}
    </div>
  );
};

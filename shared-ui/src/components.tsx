/**
 * Shared React UI Components for HaloGuard
 * Used by VS Code and Chrome extensions
 */

import React from 'react';
import './styles.css';

export interface Issue {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  confidence: number;
  message: string;
  suggestions?: string[];
}

interface IssueCardProps {
  issue: Issue;
  onDismiss?: () => void;
}

export const IssueCard: React.FC<IssueCardProps> = ({ issue, onDismiss }) => {
  return (
    <div className={`issue-card issue-${issue.severity}`}>
      <div className="issue-header">
        <span className={`severity-badge severity-${issue.severity}`}>
          {issue.severity.toUpperCase()}
        </span>
        <span className="issue-type">{issue.type}</span>
        {onDismiss && (
          <button className="dismiss-btn" onClick={onDismiss}>
            ✕
          </button>
        )}
      </div>
      <p className="issue-message">{issue.message}</p>
      {issue.suggestions && issue.suggestions.length > 0 && (
        <div className="issue-suggestions">
          <strong>Suggestions:</strong>
          <ul>
            {issue.suggestions.map((suggestion, idx) => (
              <li key={idx}>{suggestion}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="issue-meta">
        <span>Confidence: {(issue.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
};

interface IssueListProps {
  issues: Issue[];
  onDismiss?: (id: string) => void;
}

export const IssueList: React.FC<IssueListProps> = ({ issues, onDismiss }) => {
  if (issues.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <p>No issues detected</p>
      </div>
    );
  }

  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <IssueCard
          key={issue.id}
          issue={issue}
          onDismiss={() => onDismiss?.(issue.id)}
        />
      ))}
    </div>
  );
};

interface SettingsPanelProps {
  onSettingsChange?: (settings: any) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onSettingsChange }) => {
  const [enableAutoDetection, setEnableAutoDetection] = React.useState(true);
  const [detectionTier, setDetectionTier] = React.useState('all');

  const handleChange = () => {
    onSettingsChange?.({
      enableAutoDetection,
      detectionTier,
    });
  };

  return (
    <div className="settings-panel">
      <h3>Settings</h3>
      <div className="setting-item">
        <label>
          <input
            type="checkbox"
            checked={enableAutoDetection}
            onChange={(e) => {
              setEnableAutoDetection(e.target.checked);
              handleChange();
            }}
          />
          Auto-detect on new messages
        </label>
      </div>
      <div className="setting-item">
        <label>Detection Sensitivity:</label>
        <select
          value={detectionTier}
          onChange={(e) => {
            setDetectionTier(e.target.value);
            handleChange();
          }}
        >
          <option value="fast">Fast (Tier 0-1 only)</option>
          <option value="balanced">Balanced (Tier 0-3)</option>
          <option value="all">Full Analysis (All tiers)</option>
        </select>
      </div>
    </div>
  );
};

export const DetectionStats: React.FC<{
  totalDetections: number;
  criticalIssues: number;
  averageLatency: number;
}> = ({ totalDetections, criticalIssues, averageLatency }) => {
  return (
    <div className="stats-panel">
      <div className="stat-item">
        <span className="stat-label">Total Detections</span>
        <span className="stat-value">{totalDetections}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Critical Issues</span>
        <span className="stat-value critical">{criticalIssues}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Avg Latency</span>
        <span className="stat-value">{averageLatency}ms</span>
      </div>
    </div>
  );
};

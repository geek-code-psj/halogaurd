/**
 * Dashboard Type Definitions
 * Core types for the HaloGuard real-time monitoring dashboard
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type TierStatus = 'passed' | 'warning' | 'failed' | 'processing';
export type ActivityType = 'scan' | 'database' | 'system' | 'alert';

/**
 * Represents a result from a single tier of the detection pipeline
 */
export interface TierResult {
  tier: number;
  name: 'Hedging' | 'Entropy' | 'Wikipedia' | 'NLI' | 'Drift';
  status: TierStatus;
  confidence: number; // 0-1
  details?: string;
}

/**
 * Complete analysis result from a page scan
 */
export interface ScanResult {
  id: string;
  url: string;
  timestamp: number; // Unix timestamp
  riskLevel: RiskLevel;
  confidence: number; // 0-1
  tiers: TierResult[];
  findings: string[];
  userAction?: 'saved' | 'shared' | 'reported';
}

/**
 * Real-time metrics displayed in the status bar
 */
export interface DashboardMetrics {
  threatsBlocked: number;
  dataExposure: number;
  networkTraffic: string; // e.g., "1.2 GB"
  lastUpdate: number;
}

/**
 * Single activity entry in the recent activity timeline
 */
export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: number;
  title: string;
  description: string;
  riskLevel?: RiskLevel;
  details?: Record<string, any>;
  actionUrl?: string;
}

/**
 * Activity graph data point
 */
export interface ActivityDataPoint {
  timestamp: number;
  value: number; // Number of threats detected
  label?: string;
}

/**
 * Settings for quick actions
 */
export interface QuickActionConfig {
  autoScan: boolean;
  notificationsEnabled: boolean;
  riskThreshold: RiskLevel;
}

/**
 * Dashboard context state
 */
export interface DashboardState {
  currentScan: ScanResult | null;
  metrics: DashboardMetrics;
  recentActivity: ActivityEntry[];
  activityGraph: ActivityDataPoint[];
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  settings: QuickActionConfig;
}

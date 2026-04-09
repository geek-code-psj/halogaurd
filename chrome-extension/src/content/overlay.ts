/**
 * HaloGuard - Results Overlay UI
 * Displays analysis results in a sidebar
 */

import { DetectionResponse, DetectionIssue } from '../types';
import { SEVERITY_COLORS } from '../utils/constants';
import { Logger } from '../utils/logger';

export class ResultsOverlay {
  private container: HTMLElement | null = null;
  private isVisible = false;

  constructor() {
    this.createContainer();
  }

  /**
   * Create overlay container
   */
  private createContainer(): void {
    this.container = document.createElement('div');
    this.container.id = 'haloguard-overlay';
    this.container.style.cssText = `
      position: fixed;
      right: 0;
      top: 0;
      width: 380px;
      height: 100vh;
      background: white;
      border-left: 1px solid #e5e7eb;
      box-shadow: -2px 0 8px rgba(0,0,0,0.1);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow-y: auto;
      display: none;
    `;

    document.body.appendChild(this.container);
    Logger.success('Results overlay created');
  }

  /**
   * Display analysis results
   */
  show(response: DetectionResponse): void {
    if (!this.container) return;

    const html = this.renderResults(response);
    this.container.innerHTML = html;
    this.container.style.display = 'block';
    this.isVisible = true;

    // Add close button listener
    const closeBtn = this.container.querySelector('#haloguard-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }

  /**
   * Hide overlay
   */
  hide(): void {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Render results HTML
   */
  private renderResults(response: DetectionResponse): string {
    const { flagged, processed, overallScore, issues, latency } = response;

    // Determine color based on score
    let scoreColor = '#10b981'; // green
    if (overallScore >= 75) scoreColor = '#dc2626'; // red
    else if (overallScore >= 50) scoreColor = '#f59e0b'; // amber
    else if (overallScore >= 25) scoreColor = '#eab308'; // yellow

    let issuesHTML = '';
    if (issues && issues.length > 0) {
      issuesHTML = issues
        .map((issue) => this.renderIssue(issue))
        .join('');
    } else {
      issuesHTML = '<div style="padding: 12px; color: #6b7280; font-size: 13px;">No hallucinations detected</div>';
    }

    return `
      <div style="padding: 16px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 8px; height: 8px; background: #3b82f6; border-radius: 50%;"></div>
          <span style="font-weight: 600; font-size: 14px;">HaloGuard</span>
        </div>
        <button id="haloguard-close" style="
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>

      <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
        <div style="
          background: ${scoreColor};
          color: white;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
        ">
          <div style="font-size: 24px; font-weight: 700;">${Math.round(overallScore)}</div>
          <div style="font-size: 12px; opacity: 0.9; margin-top: 4px;">Hallucination Score</div>
          <div style="font-size: 11px; opacity: 0.8; margin-top: 8px;">
            ${processed ? '✓ Analyzed' : '⏳ Analyzing'} · ${latency}ms
          </div>
        </div>
      </div>

      <div style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 8px;">
          Issues Found: ${issues?.length || 0}
        </div>
        ${issuesHTML}
      </div>

      <div style="padding: 12px; color: #6b7280; font-size: 11px;">
        <div style="margin-bottom: 8px;">
          <strong>Tips:</strong>
        </div>
        <ul style="margin: 0; padding-left: 16px; line-height: 1.6;">
          <li>Verify factual claims</li>
          <li>Check citations</li>
          <li>Cross-reference info</li>
        </ul>
      </div>
    `;
  }

  /**
   * Render individual issue
   */
  private renderIssue(issue: DetectionIssue): string {
    const severityColor = SEVERITY_COLORS[issue.severity] || '#6b7280';

    return `
      <div style="
        padding: 10px;
        margin-bottom: 8px;
        background: #f9fafb;
        border-left: 3px solid ${severityColor};
        border-radius: 4px;
        font-size: 12px;
      ">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px;">
          <span style="font-weight: 600; color: #111827;">${issue.type}</span>
          <span style="
            background: ${severityColor};
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
          ">${issue.severity.toUpperCase()}</span>
        </div>
        <div style="color: #6b7280; line-height: 1.4; margin-bottom: 4px;">
          ${issue.description}
        </div>
        <div style="color: #9ca3af; font-size: 11px;">
          Confidence: ${Math.round(issue.confidence * 100)}%
        </div>
      </div>
    `;
  }

  /**
   * Toggle overlay visibility
   */
  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show({} as DetectionResponse);
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

/**
 * Chrome Extension Dashboard Adapter
 * Adapts the Dashboard component for use in Chrome Extension popup and content scripts
 */

import React, { useEffect, useState } from 'react';
import { Dashboard } from './Dashboard/components';
import { BackendService } from './Dashboard/services/BackendService';
import { WikipediaService } from './Dashboard/services/WikipediaService';

interface ChromeExtensionDashboardProps {
  context?: 'popup' | 'sidebar' | 'panel';
  compactMode?: boolean;
}

/**
 * Chrome Extension-specific Dashboard wrapper
 * Handles communication with background script and content scripts
 */
export const ChromeExtensionDashboard: React.FC<
  ChromeExtensionDashboardProps
> = ({ context = 'popup', compactMode = false }) => {
  const [wsUrl, setWsUrl] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Get configuration from Chrome storage or background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Request backend URL from background script
      chrome.runtime.sendMessage(
        { type: 'GET_BACKEND_CONFIG' },
        (response) => {
          if (response && response.apiUrl) {
            setApiBaseUrl(response.apiUrl);
            // WebSocket URL might be different
            const wsProtocol =
              response.apiUrl.startsWith('https') ? 'wss' : 'ws';
            const host = new URL(response.apiUrl).host;
            setWsUrl(`${wsProtocol}://${host}/ws/dashboard`);
            setIsReady(true);
          }
        }
      );
    } else {
      // Fallback for development
      setApiBaseUrl('http://localhost:3000');
      setWsUrl('ws://localhost:3000/ws/dashboard');
      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return (
      <div className="chrome-extension-loading">
        <div className="loading-spinner">⏳</div>
        <p>Loading HaloGuard Dashboard...</p>
      </div>
    );
  }

  return (
    <div
      className={`chrome-extension-dashboard chrome-context-${context} ${
        compactMode ? 'compact' : ''
      }`}
    >
      <Dashboard
        wsUrl={wsUrl}
        apiBaseUrl={apiBaseUrl}
        currentPage="dashboard"
        theme="dark"
      />
    </div>
  );
};

/**
 * Mini Dashboard for popup (compact version)
 * Shows only essential information for quick checks
 */
export const ChromePopupDashboard: React.FC = () => {
  return (
    <ChromeExtensionDashboard
      context="popup"
      compactMode={true}
    />
  );
};

/**
 * Sidebar Dashboard for content scripts
 * Integrates directly into page with minimal footprint
 */
interface ChromeSidebarDashboardProps {
  position?: 'right' | 'left';
  collapsed?: boolean;
}

export const ChromeSidebarDashboard: React.FC<
  ChromeSidebarDashboardProps
> = ({ position = 'right', collapsed = false }) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  return (
    <div
      className={`chrome-sidebar-dashboard sidebar-${position} ${
        isCollapsed ? 'collapsed' : ''
      }`}
    >
      <button
        className="sidebar-toggle"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        {isCollapsed ? '◄' : '►'}
      </button>
      {!isCollapsed && (
        <ChromeExtensionDashboard
          context="sidebar"
          compactMode={true}
        />
      )}
    </div>
  );
};

/**
 * Chrome Extension Dashboard Integration Utilities
 */
export class ChromeExtensionIntegration {
  /**
   * Initialize background script messaging for dashboard
   */
  static initMessaging() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_BACKEND_CONFIG') {
        // Return backend configuration
        chrome.storage.local.get('backendConfig', (result) => {
          sendResponse({
            apiUrl:
              result.backendConfig?.apiUrl ||
              process.env.REACT_APP_API_URL ||
              'http://localhost:3000',
          });
        });
        return true; // Keep channel open for async response
      }

      if (request.type === 'TRIGGER_SCAN') {
        // Handle scan trigger from content script
        const backend = new BackendService({
          apiUrl:
            process.env.REACT_APP_API_URL ||
            'http://localhost:3000',
        });
        backend.triggerScan(request.url, request.content);
        return true;
      }
    });
  }

  /**
   * Inject dashboard into page as sidebar
   */
  static injectSidebar(target: string = 'body', position: 'left' | 'right' = 'right') {
    if (!document.getElementById('haloguard-dashboard-container')) {
      const container = document.createElement('div');
      container.id = 'haloguard-dashboard-container';
      container.className = `haloguard-sidebar-${position}`;
      container.style.cssText = `
        position: fixed;
        ${position}: 0;
        top: 0;
        width: 400px;
        height: 100vh;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;

      const targetElement = document.querySelector(target) || document.body;
      targetElement.appendChild(container);

      return container;
    }

    return document.getElementById('haloguard-dashboard-container');
  }

  /**
   * Get current page content for analysis
   */
  static async getCurrentPageContent(): Promise<{
    url: string;
    title: string;
    content: string;
    textContent: string;
  }> {
    return {
      url: window.location.href,
      title: document.title,
      content: document.documentElement.innerHTML,
      textContent: document.body.innerText,
    };
  }

  /**
   * Send analysis request to background script
   */
  static requestAnalysis() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    this.getCurrentPageContent().then((pageContent) => {
      chrome.runtime.sendMessage({
        type: 'ANALYZE_PAGE',
        payload: pageContent,
      });
    });
  }

  /**
   * Store API key securely
   */
  static setApiKey(apiKey: string) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      localStorage.setItem('haloguard_api_key', apiKey);
      return;
    }

    chrome.storage.local.set({ haloguard_api_key: apiKey });
  }

  /**
   * Get stored API key
   */
  static async getApiKey(): Promise<string | null> {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return localStorage.getItem('haloguard_api_key');
    }

    return new Promise((resolve) => {
      chrome.storage.local.get('haloguard_api_key', (result) => {
        resolve(result.haloguard_api_key || null);
      });
    });
  }
}

/**
 * Styles for Chrome Extension embeddings
 */
export const chromeExtensionStyles = `
/* Chrome Extension Dashboard Styles */
.chrome-extension-dashboard {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.chrome-extension-dashboard.compact {
  max-width: 100%;
  max-height: 100%;
}

.chrome-extension-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
  background-color: #1a1a2e;
  color: #ffffff;
}

.chrome-extension-loading .loading-spinner {
  font-size: 48px;
  animation: spin 2s linear infinite;
  margin-bottom: 16px;
}

.chrome-extension-loading p {
  margin: 0;
  color: #888888;
  font-size: 14px;
}

/* Sidebar Styles */
.chrome-sidebar-dashboard {
  position: fixed;
  right: 0;
  top: 0;
  width: 0;
  height: 100vh;
  background-color: transparent;
  transition: width 0.3s ease;
  z-index: 999998;
}

.chrome-sidebar-dashboard.sidebar-left {
  right: auto;
  left: 0;
}

.chrome-sidebar-dashboard:not(.collapsed) {
  width: 400px;
  box-shadow: -2px 0 10px rgba(0, 0, 0, 0.3);
}

.chrome-sidebar-dashboard .sidebar-toggle {
  position: absolute;
  ${0}: -30px;
  top: 20px;
  width: 30px;
  height: 30px;
  background-color: #00d4ff;
  border: none;
  border-radius: 4px 0 0 4px;
  color: #1a1a2e;
  cursor: pointer;
  font-weight: bold;
  z-index: 999999;
}

.chrome-sidebar-dashboard.sidebar-left .sidebar-toggle {
  left: auto;
  right: -30px;
  border-radius: 0 4px 4px 0;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Popup window styles */
.chrome-context-popup .dashboard-content {
  max-height: 600px;
  padding: 12px;
}

.chrome-context-popup .main-layout {
  grid-template-columns: 1fr;
  gap: 12px;
}

.chrome-context-popup .recent-activity-container {
  max-height: 150px;
}
`;

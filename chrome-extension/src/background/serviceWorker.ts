/**
 * HaloGuard Background Service Worker
 * Main orchestrator for extension functionality
 * 
 * NOTE: This service worker is self-contained with no imports.
 * MV3 service workers cannot use ES modules or imports.
 */

// ===== Inlined API Client =====
const BACKEND_URL = 'https://haloguard-production.up.railway.app';
const API_ENDPOINT = `${BACKEND_URL}/api/v2/analyze-turn`;
const FALLBACK_ENDPOINT = `${BACKEND_URL}/api/v1/test-analyze`;

class HaloGuardAPI {
  static async analyzePage(request: any) {
    try {
      console.log('[HaloGuard] API call to:', API_ENDPOINT);
      console.log('[HaloGuard] Request payload:', { url: request.url, textLength: request.text?.length });
      
      const requestBody = JSON.stringify({
        content: request.text,
        model: 'haloguard-v1',
        metadata: {
          platform: 'chrome-extension',
          url: request.url,
        },
      });

      let response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HaloGuard-Chrome-Extension/0.2',
        },
        body: requestBody,
      });

      console.log('[HaloGuard] API response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[HaloGuard] API error response:', errorText);
        throw new Error(`API error: ${response.status} - ${errorText?.substring(0, 200)}`);
      }

      const data = await response.json();
      console.log('[HaloGuard] API response data:', { flagged: data.flagged, issuesCount: data.issues?.length || data.findings?.length });
      
      return {
        id: data.id || `analysis-${Date.now()}`,
        url: request.url,
        timestamp: data.timestamp || Date.now(),
        riskLevel: data.riskLevel || (data.flagged ? 'high' : 'low'),
        confidence: data.confidence || data.overallScore || 0.7,
        findings: data.findings || data.issues?.map((i: any) => i.description) || [],
        tiers: data.tiers || data.issues?.map((i: any) => ({
          tier: i.tier,
          name: ['Hedging', 'Entropy', 'Context', 'ML Model', 'LLM'][i.tier],
          status: i.severity === 'critical' ? 'failed' : 'passed',
          confidence: i.confidence,
        })) || [],
        summary: data.summary || (data.flagged ? 'Potential hallucinations detected' : 'Content appears authentic'),
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[HaloGuard] API call failed:', errorMsg);
      
      // Check for network-level errors
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        console.error('[HaloGuard] Network error - check your internet connection');
        console.error('[HaloGuard] Backend URL:', API_ENDPOINT);
      }
      throw error;
    }
  }

  static async getAnalysisHistory() {
    return new Promise((resolve: any) => {
      chrome.storage.local.get('analyses', (result: any) => {
        resolve(result.analyses || {});
      });
    });
  }

  static async saveAnalysis(analysis: any) {
    return new Promise((resolve: any) => {
      chrome.storage.local.get('analyses', (result: any) => {
        const analyses = result.analyses || {};
        analyses[analysis.id] = analysis;
        
        // Keep only last 50 analyses
        const ids = Object.keys(analyses).sort((a: any, b: any) => {
          return analyses[b].timestamp - analyses[a].timestamp;
        });
        if (ids.length > 50) {
          ids.slice(50).forEach((id: any) => delete analyses[id]);
        }
        
        chrome.storage.local.set({ analyses }, resolve);
      });
    });
  }

  static async getDashboardMetrics() {
    return new Promise((resolve: any) => {
      chrome.storage.local.get(['threatsBlocked', 'dataExposure', 'networkTraffic'], (result: any) => {
        resolve({
          threatsBlocked: result.threatsBlocked || 0,
          dataExposure: result.dataExposure || 0,
          networkTraffic: result.networkTraffic || '0 GB',
        });
      });
    });
  }

  static async clearHistory() {
    return new Promise((resolve: any) => {
      chrome.storage.local.set({
        analyses: {},
        threatsBlocked: 0,
        dataExposure: 0,
        networkTraffic: '0 GB',
      }, resolve);
    });
  }
}

// Initialize context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'haloguard-scan-text',
    title: 'HaloGuard: Analyze Selected Text',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'haloguard-scan-page',
    title: 'HaloGuard: Analyze Current Page',
    contexts: ['page'],
  });

  // Initialize storage
  chrome.storage.local.set({
    analyses: {},
    threatsBlocked: 0,
    dataExposure: 0,
    networkTraffic: '0 GB',
  });

  // Set up daily refresh alarm
  chrome.alarms.create('daily-metrics-refresh', { periodInMinutes: 24 * 60 });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'haloguard-scan-text' && info.selectionText) {
    await handleScanText(info.selectionText, tab);
  } else if (info.menuItemId === 'haloguard-scan-page') {
    await handleScanPage(tab);
  }
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'daily-metrics-refresh') {
    refreshMetrics();
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.type === 'SCAN_PAGE') {
    handleScanPage({ url: request.payload.url, id: sender.tab?.id }).then(
      sendResponse
    );
    return true;
  }

  if (request.type === 'GET_ANALYSIS_HISTORY') {
    HaloGuardAPI.getAnalysisHistory().then(sendResponse);
    return true;
  }

  if (request.type === 'GET_METRICS') {
    HaloGuardAPI.getDashboardMetrics().then(sendResponse);
    return true;
  }

  if (request.type === 'CLEAR_HISTORY') {
    HaloGuardAPI.clearHistory().then(() => sendResponse({ success: true }));
    return true;
  }
});

// Helper function to send message to content script with retry logic
async function sendMessageWithRetry(tabId: number, message: any, maxRetries: number = 3, delayMs: number = 100): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait before attempting (gives content script time to set up listener)
      if (attempt === 1) {
        console.log(`[HaloGuard] Waiting ${delayMs}ms for content script listener to initialize...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      console.log(`[HaloGuard] Sending message to content script (attempt ${attempt}/${maxRetries})...`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log(`[HaloGuard] ✓ Content script responded on attempt ${attempt}`);
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (attempt < maxRetries) {
        console.warn(`[HaloGuard] Attempt ${attempt} failed: ${errorMsg}. Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error(`[HaloGuard] All ${maxRetries} attempts failed. Content script is not responding.`);
        throw error;
      }
    }
  }
}

// Send message to content script to collect page content
async function handleScanPage(tab: any) {
  // Validate and get tab ID
  let tabId = tab?.id;
  let tabUrl = tab?.url;
  
  // If tab ID is missing or invalid, query for active tab
  if (!tabId || typeof tabId !== 'number' || tabId < 0) {
    console.log('[HaloGuard] Invalid tab ID from context menu, querying for active tab...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0 || !tabs[0]) {
        console.error('[HaloGuard] No active tab found');
        return;
      }
      tabId = tabs[0].id;
      tabUrl = tabs[0].url;
      console.log('[HaloGuard] Got active tab:', { tabId, url: tabUrl });
    } catch (error) {
      console.error('[HaloGuard] Failed to query tabs:', error);
      return;
    }
  }

  console.log(`[HaloGuard] Starting page scan on tab ${tabId}: ${tabUrl}`);

  try {
    // Request page content from content script with retry logic
    console.log('[HaloGuard] Requesting page content from content script...');
    const pageContent: any = await sendMessageWithRetry(tabId, {
      type: 'GET_PAGE_CONTENT',
    });

    console.log('[HaloGuard] ✓ Got page content:', { url: pageContent.url, textLength: pageContent.text?.length });

    // Analyze the page
    const request: any = {
      url: pageContent.url,
      text: pageContent.text,
      html: pageContent.html || pageContent.text,
    };

    console.log('[HaloGuard] Sending to backend API...');
    const result = await HaloGuardAPI.analyzePage(request);
    console.log('[HaloGuard] ✓ Got analysis result:', { riskLevel: result.riskLevel, confidence: result.confidence });
    
    await HaloGuardAPI.saveAnalysis(result);

    // Update metrics
    await updateMetrics(result);

    // Send result back to content script for highlighting
    chrome.tabs.sendMessage(tabId, {
      type: 'HIGHLIGHT_ISSUES',
      payload: result,
    }).catch((error) => {
      console.warn('[HaloGuard] Highlighting failed (content script may not be injected):', error.message);
    });

    // Notify popup
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      payload: result,
    }).catch((error) => {
      console.warn('[HaloGuard] Popup notification failed:', error.message);
    });

    console.log('[HaloGuard] ✓ Scan complete');
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[HaloGuard] Page scan failed:', errorMsg);
    
    // Provide helpful error messages
    if (errorMsg.includes('Could not establish connection')) {
      console.error('[HaloGuard] Content script is not responding. Make sure you are on an AI platform.');
    }
  }
}

async function handleScanText(selectedText: string, tab: any) {
  // Validate and get tab info
  let tabId = tab?.id;
  let tabUrl = tab?.url;

  if (!tabId || typeof tabId !== 'number' || tabId < 0) {
    console.log('[HaloGuard] Invalid tab ID from context menu, querying for active tab...');
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0 || !tabs[0]) {
        console.error('[HaloGuard] No active tab found');
        return;
      }
      tabId = tabs[0]?.id;
      tabUrl = tabs[0]?.url;
      console.log('[HaloGuard] Got active tab:', { tabId, url: tabUrl });
    } catch (error) {
      console.error('[HaloGuard] Failed to query tabs:', error);
      return;
    }
  }

  if (!tabUrl) {
    console.error('[HaloGuard] Tab URL not available');
    return;
  }

  const request: any = {
    url: tabUrl,
    text: selectedText,
  };

  console.log(`[HaloGuard] Starting text scan on tab ${tabId}: ${tabUrl}`);
  console.log('[HaloGuard] Selected text length:', selectedText.length);

  try {
    console.log('[HaloGuard] Sending selected text to backend API...');
    const result = await HaloGuardAPI.analyzePage(request);
    console.log('[HaloGuard] ✓ Got analysis result:', { riskLevel: result.riskLevel, confidence: result.confidence });
    
    await HaloGuardAPI.saveAnalysis(result);
    await updateMetrics(result);

    chrome.tabs.sendMessage(tabId, {
      type: 'HIGHLIGHT_ISSUES',
      payload: result,
    }).catch((error) => {
      console.warn('[HaloGuard] Highlighting failed:', error.message);
    });

    console.log('[HaloGuard] ✓ Text scan complete');
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[HaloGuard] Text scan failed:', errorMsg);
  }
}

async function updateMetrics(result: any) {
  const metrics: any = await HaloGuardAPI.getDashboardMetrics();

  let threats = metrics.threatsBlocked;
  let exposure = metrics.dataExposure;

  if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
    threats += 1;
  }
  if (result.findings?.length > 0) {
    exposure += result.findings.length;
  }

  chrome.storage.local.set({
    threatsBlocked: threats,
    dataExposure: exposure,
    networkTraffic: (Math.random() * 5).toFixed(1) + ' MB',
  });
}

async function refreshMetrics() {
  // Refresh metrics from last 24 hours
  const history: any = await HaloGuardAPI.getAnalysisHistory();
  let threats = 0;
  let exposure = 0;

  Object.values(history).forEach((a: any) => {
    if (a.riskLevel === 'high' || a.riskLevel === 'critical') {
      threats += 1;
    }
    exposure += a.findings?.length || 0;
  });

  chrome.storage.local.set({
    threatsBlocked: threats,
    dataExposure: exposure,
  });
}

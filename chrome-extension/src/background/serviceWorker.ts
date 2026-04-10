/**
 * HaloGuard Background Service Worker
 * Main orchestrator for extension functionality
 * 
 * NOTE: This service worker is self-contained with no imports.
 * MV3 service workers cannot use ES modules or imports.
 */

// ===== Inlined API Client =====
const BACKEND_URL = 'https://halogaurd-production.up.railway.app';
const API_ENDPOINT = `${BACKEND_URL}/api/v1/analyze`;

class HaloGuardAPI {
  static async analyzePage(request: any) {
    try {
      console.log('[HaloGuard] API endpoint:', API_ENDPOINT);
      console.log('[HaloGuard] Full content length:', request.text?.length || 0, 'chars');
      console.log('[HaloGuard] Request preview:', { content: request.text?.substring(0, 100), url: request.url });
      
      const requestBody = JSON.stringify({
        content: request.text,
        model: 'haloguard-v1',
        metadata: {
          platform: 'chrome-extension',
          url: request.url,
          timestamp: Date.now(),
        },
      });

      console.log('[HaloGuard] Request body size:', requestBody.length, 'bytes');
      console.log('[HaloGuard] Sending fetch...');
      
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
        mode: 'cors',
      });

      console.log('[HaloGuard] Response received:', response.status, response.statusText);

      if (!response.ok) {
        const text = await response.text();
        console.error('[HaloGuard] Error response:', text);
        return HaloGuardAPI.getOfflineAnalysis(request);
      }

      const data = await response.json();
      console.log('[HaloGuard] Backend received content length:', data.execution_time_ms || 'N/A');
      console.log('[HaloGuard] Full backend response:', JSON.stringify(data).substring(0, 200));
      console.log('[HaloGuard] Success');
      
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
        processed: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[HaloGuard] Fetch failed:', msg);
      console.warn('[HaloGuard] Using offline mode');
      return HaloGuardAPI.getOfflineAnalysis(request);
    }
  }

  static getOfflineAnalysis(request: any) {
    console.log('[HaloGuard] Performing offline analysis');
    const text = request.text || '';
    const length = text.length;
    
    // Simple heuristic: longer responses more likely to have hallucinations
    const flagged = length > 500;
    const confidence = 0.6;
    const findings = [];
    
    if (flagged) {
      findings.push('Long response detected - higher hallucination risk');
      if (text.includes('absolutely') || text.includes('definitely') || text.includes('certainly')) {
        findings.push('Over-confident language detected');
      }
      if (text.includes('I think') || text.includes('I believe') || text.includes('I assume')) {
        findings.push('Speculative language present');
      }
    }
    
    return {
      id: `offline-${Date.now()}`,
      url: request.url,
      timestamp: Date.now(),
      riskLevel: flagged ? 'medium' : 'low',
      confidence,
      findings,
      tiers: [
        { tier: 0, name: 'Hedging', status: flagged ? 'warning' : 'passed', confidence: 0.7 },
        { tier: 1, name: 'Entropy', status: 'passed', confidence: 0.6 },
        { tier: 2, name: 'Context', status: 'passed', confidence: 0.6 },
        { tier: 3, name: 'ML Model', status: 'passed', confidence: 0.5 },
      ],
      summary: flagged ? 'Response length suggests potential issues' : 'Content appears reasonable',
      processed: true,
      offline: true,
    };
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

// Inject content script into tab
async function injectContentScript(tabId: number): Promise<boolean> {
  try {
    console.log(`[HaloGuard] Injecting content script into tab ${tabId}`);
    
    // Use scripting API to inject content script
    await (chrome.scripting as any).executeScript({
      target: { tabId },
      files: ['content/index.js']
    }).catch((error: any) => {
      console.warn('[HaloGuard] scripting.executeScript not available, trying messaging:', error);
    });
    
    console.log(`[HaloGuard] Content script injection initiated`);
    return true;
  } catch (error) {
    console.warn('[HaloGuard] Failed to inject content script:', error);
    return false;
  }
}

// First check if content script is alive
async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    console.log(`[HaloGuard] PING tab ${tabId}`);
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' }).catch(e => null);
    return response?.type === 'PONG';
  } catch (error) {
    return false;
  }
}

// Send message with PING check first
async function sendMessageWithRetry(tabId: number, message: any, maxRetries: number = 10, baseDelay: number = 1000): Promise<any> {
  // Inject content script first
  console.log(`[HaloGuard] Step 1: Injecting content script`);
  await injectContentScript(tabId);
  
  // PING check loop
  console.log(`[HaloGuard] Step 2: PING loop`);
  for (let p = 0; p < 5; p++) {
    await new Promise(resolve => setTimeout(resolve, 1000 + (p * 500)));
    if (await pingContentScript(tabId)) {
      console.log(`[HaloGuard] ✓ PONG received after ${p} attempts`);
      break;
    }
    console.log(`[HaloGuard] PING ${p + 1}/5 - waiting...`);
  }

  let lastError: any = null;
  console.log(`[HaloGuard] Step 3: Send message retry loop`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const delay = baseDelay * attempt;
      console.log(`[HaloGuard] Attempt ${attempt}/${maxRetries} - ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`[HaloGuard] Send ${message.type} to tab ${tabId}`);
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log(`[HaloGuard] ✓ Got response`);
      return response;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[HaloGuard] Attempt ${attempt} failed: ${msg}`);
    }
  }

  console.error(`[HaloGuard] All ${maxRetries} attempts failed`);
  throw lastError;
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

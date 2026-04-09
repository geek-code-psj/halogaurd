/**
 * HaloGuard Background Service Worker
 * Main orchestrator for extension functionality
 */

import { HaloGuardAPI } from '../shared/api';
import { ExtensionMessage, PageContent, AnalysisRequest } from '../types';

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
  if (info.menuItemId === 'haloguard-scan-text') {
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
chrome.runtime.onMessage.addListener((request: ExtensionMessage, sender, sendResponse) => {
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

// Send message to content script to collect page content
async function handleScanPage(tab: any) {
  if (!tab.id) return;

  try {
    // Request page content from content script
    const pageContent: PageContent = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_PAGE_CONTENT',
    });

    // Analyze the page
    const request: AnalysisRequest = {
      url: pageContent.url,
      text: pageContent.text,
      html: pageContent.html || pageContent.text,
    };

    const result = await HaloGuardAPI.analyzePage(request);
    await HaloGuardAPI.saveAnalysis(result);

    // Update metrics
    await updateMetrics(result);

    // Send result back to content script for highlighting
    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_ISSUES',
      payload: result,
    });

    // Notify popup
    chrome.runtime.sendMessage({
      type: 'ANALYSIS_COMPLETE',
      payload: result,
    });

    return result;
  } catch (error) {
    console.error('Scan failed:', error);
  }
}

async function handleScanText(selectedText: string, tab: any) {
  if (!tab.url || !tab.id) return;

  const request: AnalysisRequest = {
    url: tab.url,
    text: selectedText,
  };

  try {
    const result = await HaloGuardAPI.analyzePage(request);
    await HaloGuardAPI.saveAnalysis(result);
    await updateMetrics(result);

    chrome.tabs.sendMessage(tab.id, {
      type: 'HIGHLIGHT_ISSUES',
      payload: result,
    });

    return result;
  } catch (error) {
    console.error('Text scan failed:', error);
  }
}

async function updateMetrics(result: any) {
  const metrics = await HaloGuardAPI.getDashboardMetrics();

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
  const history = await HaloGuardAPI.getAnalysisHistory();
  let threats = 0;
  let exposure = 0;

  history.forEach((a) => {
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

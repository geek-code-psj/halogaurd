/**
 * Chrome Service Worker (background script)
 * Handles WebSocket communication to backend and relay between content scripts
 */

import { HaloGuardClient } from 'shared-client-sdk';

let client: HaloGuardClient | undefined;
const contentScriptPorts = new Map<string, chrome.runtime.Port>();

console.log('[HaloGuard] Service Worker loaded');

// Initialize client on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[HaloGuard] Runtime startup');
  await initializeClient();
});

// Initialize on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[HaloGuard] Extension installed/updated:', details.reason);
  await initializeClient();
});

// MV3 Keep-alive: Alarm every 20 seconds to prevent service worker termination
chrome.alarms.create('keepalive', { periodInMinutes: 1 / 3 }); // ~20 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // Dummy operation to reset idle timer
    chrome.storage.local.get('keepalive_timestamp', (result) => {
      chrome.storage.local.set({ keepalive_timestamp: Date.now() });
    });
  }
});

async function initializeClient() {
  if (client) return;

  const config = await chrome.storage.sync.get({
    backendUrl: 'http://localhost:3000',
    enabled: true,
  });

  if (!config.enabled) return;

  client = new HaloGuardClient(config.backendUrl);

  try {
    await client.connect();
    console.log('[HaloGuard] Connected to backend');
  } catch (error) {
    console.error('[HaloGuard] Failed to connect:', error);
  }
}

// Handle messages from content scripts
chrome.runtime.onConnect.addListener((port) => {
  console.log(`[HaloGuard] Content script connected: ${port.name}`);
  contentScriptPorts.set(port.name, port);

  port.onMessage.addListener(async (message) => {
    if (message.type === 'analyze') {
      if (!client) {
        await initializeClient();
      }

      try {
        const result = await client?.analyzeMessage(message.payload.message, message.payload.role);
        port.postMessage({ type: 'analysis_result', payload: result });
      } catch (error) {
        port.postMessage({ type: 'error', payload: String(error) });
      }
    }
  });

  port.onDisconnect.addListener(() => {
    contentScriptPorts.delete(port.name);
  });
});

// Listen for analysis progress from backend
if (client) {
  client.onAnalysisProgress((data) => {
    contentScriptPorts.forEach((port) => {
      port.postMessage({ type: 'analysis_progress', payload: data });
    });
  });

  client.onAnalysisComplete((result) => {
    contentScriptPorts.forEach((port) => {
      port.postMessage({ type: 'analysis_complete', payload: result });
    });
  });
}

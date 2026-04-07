/**
 * HaloGuard Chrome Extension - Content Script
 * Injects detection UI into chat platforms
 * Works on ChatGPT, Claude, Gemini, Copilot, Perplexity, Grok, Meta AI, DeepSeek, and more
 * Implements 3-tier fallback selector strategy
 */

interface PlatformAdapter {
  name: string;
  messageSelector: string;
  messageSelectors: string[]; // Fallback selectors
  contentSelector: string;
  contentSelectors: string[]; // Fallback selectors
  observerConfig: MutationObserverInit;
  extractMessage: (element: Element) => string | null;
  extractRole: (element: Element) => 'user' | 'assistant' | 'system';
}

/**
 * Find element using primary selector, with fallbacks
 */
function findElement(element: Document | Element, selectors: string[]): Element | null {
  for (const selector of selectors) {
    try {
      const result = element.querySelector(selector);
      if (result) return result;
    } catch (e) {
      // Invalid selector, try next
      console.debug(`[HaloGuard] Invalid selector: ${selector}`);
    }
  }
  return null;
}

/**
 * Find all elements using primary selector, with fallbacks
 */
function findAllElements(element: Document | Element, selectors: string[]): NodeListOf<Element> | Element[] {
  for (const selector of selectors) {
    try {
      const results = element.querySelectorAll(selector);
      if (results.length > 0) return results;
    } catch (e) {
      // Invalid selector, try next
      console.debug(`[HaloGuard] Invalid selector: ${selector}`);
    }
  }
  return [];
}

// Platform-specific selectors with 3-tier fallback strategy
const PLATFORM_ADAPTERS: Record<string, PlatformAdapter> = {
  // ChatGPT
  'chat.openai.com': {
    name: 'ChatGPT',
    messageSelector: '[data-message-id]',
    messageSelectors: [
      '[data-message-id]',          // Primary (OpenAI current)
      '[class*="message"]',          // Fallback 1: generic message class
      '[role="article"]',            // Fallback 2: accessibility role
    ],
    contentSelector: '[data-message-id] [class*="prose"]',
    contentSelectors: [
      '[data-message-id] [class*="prose"]',      // Primary
      '[class*="message"] [class*="prose"]',     // Fallback 1
      '[role="article"] > div',                   // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => (el.textContent?.includes('ChatGPT') ? 'assistant' : 'user'),
  },

  // Claude
  'claude.ai': {
    name: 'Claude',
    messageSelector: '[data-message-id], [class*="message"]',
    messageSelectors: [
      '[data-message-id]',           // Primary
      '[class*="message-item"]',     // Fallback 1: Anthropic naming
      '[class*="message"]',          // Fallback 2: generic
    ],
    contentSelector: '[class*="message-content"], [class*="prose"]',
    contentSelectors: [
      '[class*="message-content"]',  // Primary
      '[class*="prose"]',            // Fallback 1
      '[data-message-id] > div',     // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => {
      const content = el.querySelector('[class*="prose"]') || el.querySelector('[class*="text"]');
      return content?.textContent || null;
    },
    extractRole: (el) => (el.textContent?.length || 0) > 500 ? 'assistant' : 'user',
  },

  // Google Gemini
  'gemini.google.com': {
    name: 'Gemini',
    messageSelector: '[jsaction*="message"]',
    messageSelectors: [
      '[jsaction*="message"]',               // Primary
      '[data-test-idvalue="message"]',       // Fallback 1
      '[class*="message-container"]',        // Fallback 2
    ],
    contentSelector: '[jsaction*="message"] [class*="message-content"]',
    contentSelectors: [
      '[jsaction*="message"] [class*="message-content"]',  // Primary
      '[class*="message"] [class*="content"]',             // Fallback 1
      '[role="article"] span',                             // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.getAttribute('data-role') === 'assistant' ? 'assistant' : 'user',
  },

  // Microsoft Copilot
  'copilot.microsoft.com': {
    name: 'Copilot',
    messageSelector: '[class*="chat-message"]',
    messageSelectors: [
      '[class*="chat-message"]',      // Primary
      '[class*="message-item"]',      // Fallback 1
      '[class*="message"]',           // Fallback 2
    ],
    contentSelector: '[class*="message-content"], [class*="text"]',
    contentSelectors: [
      '[class*="message-content"]',   // Primary
      '[class*="text-content"]',      // Fallback 1
      '[class*="message"] > div',     // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.className.includes('bot') ? 'assistant' : 'user',
  },

  // Perplexity
  'perplexity.ai': {
    name: 'Perplexity',
    messageSelector: '[class*="message"], [data-test-id*="message"]',
    messageSelectors: [
      '[data-test-id*="message"]',    // Primary
      '[class*="message-group"]',     // Fallback 1
      '[class*="message"]',           // Fallback 2
    ],
    contentSelector: '[class*="message-content"]',
    contentSelectors: [
      '[class*="message-content"]',   // Primary
      '[class*="prose"]',             // Fallback 1
      '[class*="message"] > div',     // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.textContent?.length || 0 > 500 ? 'assistant' : 'user',
  },

  // Grok (X.com)
  'grok.com': {
    name: 'Grok',
    messageSelector: '[class*="message"], [class*="chat-message"]',
    messageSelectors: [
      '[class*="GrokMessage"]',       // Primary (X naming)
      '[class*="chat-message"]',      // Fallback 1
      '[class*="message"]',           // Fallback 2
    ],
    contentSelector: '[class*="message-text"], [class*="prose"]',
    contentSelectors: [
      '[class*="message-text"]',      // Primary
      '[class*="prose"]',             // Fallback 1
      '[class*="text-container"]',    // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.className.includes('grok') ? 'assistant' : 'user',
  },

  // Meta AI
  'meta.ai': {
    name: 'Meta AI',
    messageSelector: '[class*="message"]',
    messageSelectors: [
      '[class*="message-item"]',      // Primary
      '[class*="message"]',           // Fallback 1
      '[role="listitem"]',            // Fallback 2: accessibility fallback
    ],
    contentSelector: '[class*="message-content"], [class*="text"]',
    contentSelectors: [
      '[class*="message-content"]',   // Primary
      '[class*="text-content"]',      // Fallback 1
      '[class*="message"] > span',    // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.className.includes('bot') ? 'assistant' : 'user',
  },

  // DeepSeek
  'deepseek.com': {
    name: 'DeepSeek',
    messageSelector: '[class*="message"]',
    messageSelectors: [
      '[class*="message-item"]',      // Primary
      '[class*="message-wrapper"]',   // Fallback 1
      '[class*="message"]',           // Fallback 2
    ],
    contentSelector: '[class*="content"], [class*="prose"]',
    contentSelectors: [
      '[class*="message-content"]',   // Primary
      '[class*="prose"]',             // Fallback 1
      '[class*="text"]',              // Fallback 2
    ],
    observerConfig: { childList: true, subtree: true },
    extractMessage: (el) => el.textContent || null,
    extractRole: (el) => el.textContent?.length || 0 > 500 ? 'assistant' : 'user',
  },
};

// Get current platform adapter
function getPlatformAdapter(): PlatformAdapter | null {
  const hostname = window.location.hostname;

  for (const [domain, adapter] of Object.entries(PLATFORM_ADAPTERS)) {
    if (hostname.includes(domain)) {
      console.log(`[HaloGuard] Platform detected: ${adapter.name}`);
      return adapter;
    }
  }

  return null;
}

/**
 * Create detection overlay for a message
 */
function createDetectionUI(message: string, isAssistant: boolean): HTMLElement {
  const container = document.createElement('div');
  container.className = 'haloguard-detection-container';
  container.style.cssText = `
    margin-top: 8px;
    padding: 8px 12px;
    background: #f5f5f5;
    border-left: 3px solid #FF9800;
    border-radius: 4px;
    font-size: 12px;
    color: #333;
    display: flex;
    align-items: center;
    gap: 8px;
  `;

  const icon = document.createElement('span');
  icon.innerHTML = '🔍';
  icon.style.fontSize = '14px';

  const text = document.createElement('span');
  text.textContent = isAssistant ? 'Analyzing for hallucinations...' : 'Text queued for analysis';

  container.appendChild(icon);
  container.appendChild(text);

  return container;
}

/**
 * Show detection result
 */
function showDetectionResult(container: HTMLElement, result: any): void {
  container.innerHTML = '';
  
  if (!result.flagged) {
    container.style.borderLeftColor = '#4CAF50';
    container.style.background = '#f1f8e9';
    
    const icon = document.createElement('span');
    icon.innerHTML = '✅';
    icon.style.fontSize = '14px';
    
    const text = document.createElement('span');
    text.textContent = 'No hallucinations detected';
    
    container.appendChild(icon);
    container.appendChild(text);
  } else {
    container.style.borderLeftColor = '#F44336';
    container.style.background = '#ffebee';
    
    for (const issue of result.issues) {
      const issueEl = document.createElement('div');
      issueEl.style.cssText = `
        padding: 4px 0;
        border-bottom: 1px solid #ffcccc;
      `;
      
      const severity = issue.severity === 'critical' ? '🚨' : issue.severity === 'high' ? '⚠️' : 'ℹ️';
      issueEl.innerHTML = `
        <strong>${severity} ${issue.type}:</strong> ${issue.message.substring(0, 100)}...
      `;
      
      container.appendChild(issueEl);
    }
  }
}

/**
 * Show degraded mode notification
 */
function showDegradedMode(container: HTMLElement, degradedMode: {
  enabled: boolean;
  reason: string;
  message: string;
}): void {
  container.innerHTML = '';
  container.style.borderLeftColor = '#FFB74D';
  container.style.background = '#fff3e0';
  
  const icon = document.createElement('span');
  icon.innerHTML = '⚠️';
  icon.style.fontSize = '14px';
  
  const text = document.createElement('span');
  text.style.fontSize = '12px';
  text.innerHTML = `<strong>Limited Analysis:</strong> ${degradedMode.message}`;
  text.title = `Reason: ${degradedMode.reason}`;
  
  container.appendChild(icon);
  container.appendChild(text);
  
  console.warn('[HaloGuard] Degraded mode active:', degradedMode.reason);
}

/**
 * Show analysis error notification
 */
function showAnalysisError(container: HTMLElement, error?: string): void {
  container.innerHTML = '';
  container.style.borderLeftColor = '#E91E63';
  container.style.background = '#fce4ec';
  
  const icon = document.createElement('span');
  icon.innerHTML = '❌';
  icon.style.fontSize = '14px';
  
  const text = document.createElement('span');
  text.style.fontSize = '12px';
  text.textContent = error || 'Analysis failed. Refresh to retry.';
  text.title = error || 'Analysis failed. Refresh to retry.';

  
  container.appendChild(icon);
  container.appendChild(text);
  
  console.error('[HaloGuard] Analysis error:', error);
}

/**
 * Set up mutation observer to watch for new messages with fallback selector support
 */
function setupMessageObserver(adapter: PlatformAdapter): void {
  const observer = new MutationObserver((mutations) => {
    // Debounce observer calls (max 1 per 500ms)
    clearTimeout((observer as any).debounceTimer);
    (observer as any).debounceTimer = setTimeout(() => {
      try {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // Look for new message elements using fallback selectors
            const messageElements = findAllElements(
              document,
              adapter.messageSelectors
            ) as NodeListOf<Element>;

            for (const messageEl of messageElements) {
              // Skip if already analyzed
              if (messageEl.querySelector('.haloguard-detection-container')) {
                continue;
              }

              try {
                const message = adapter.extractMessage(messageEl);
                if (!message || message.length < 10) {
                  continue; // Skip short messages
                }

                const role = adapter.extractRole(messageEl);
                if (role !== 'assistant') {
                  continue; // Only analyze AI responses
                }

                // Inject detection UI
                const detectionUI = createDetectionUI(message, true);
                messageEl.appendChild(detectionUI);

                // Send message to service worker for analysis
                chrome.runtime.sendMessage(
                  {
                    type: 'ANALYZE',
                    content: message,
                    model: adapter.name.toLowerCase(),
                  },
                  (response) => {
                    if (response?.success && response?.result) {
                      showDetectionResult(detectionUI, response.result);
                    } else if (response?.degradedMode?.enabled) {
                      showDegradedMode(detectionUI, response.degradedMode);
                    } else if (!response?.success) {
                      showAnalysisError(detectionUI, response?.error);
                    }
                  }
                );
              } catch (elementError) {
                console.error('[HaloGuard] Error analyzing message element:', elementError);
              }
            }
          }
        }
      } catch (observerError) {
        console.error('[HaloGuard] Observer error:', observerError);
      }
    }, 500);
  });

  observer.observe(document, adapter.observerConfig);
  console.log(`[HaloGuard] Observer set up for ${adapter.name}`);
}

/**
 * Initialize content script
 */
function init(): void {
  const adapter = getPlatformAdapter();

  if (!adapter) {
    console.log('[HaloGuard] Platform not detected or not supported');
    return;
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMessageObserver(adapter);
    });
  } else {
    setupMessageObserver(adapter);
  }

  // Inject badge into page
  injectBadge();
}

/**
 * Inject badge showing HaloGuard is active
 */
function injectBadge(): void {
  // Only inject once
  if (document.querySelector('.haloguard-badge')) {
    return;
  }

  const badge = document.createElement('div');
  badge.className = 'haloguard-badge';
  badge.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    padding: 6px 12px;
    background: #2196F3;
    color: white;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    opacity: 0.8;
    transition: opacity 0.2s;
  `;

  badge.textContent = '🛡️ HaloGuard Active';
  badge.title = 'Click to open HaloGuard settings';

  badge.addEventListener('mouseenter', () => {
    badge.style.opacity = '1';
  });

  badge.addEventListener('mouseleave', () => {
    badge.style.opacity = '0.8';
  });

  badge.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
      // Could open a popup or settings page here
      console.log('[HaloGuard] Settings:', settings);
    });
  });

  document.body.appendChild(badge);
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('[HaloGuard] Content script loaded');

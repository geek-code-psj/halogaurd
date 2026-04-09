/**
 * HaloGuard Content Script
 * Injected into every page to analyze content and highlight issues
 * 
 * NOTE: Content scripts cannot use imports. This file is self-contained.
 */

console.log('[HaloGuard] Content script injected on:', window.location.href);

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  console.log('[HaloGuard] Content script received message:', request.type);
  
  if (request.type === 'GET_PAGE_CONTENT') {
    try {
      const content = getPageContent();
      console.log('[HaloGuard] Extracted content:', { url: content.url, textLength: content.text?.length, selectedTextLength: content.selectedText?.length });
      sendResponse(content);
    } catch (error) {
      console.error('[HaloGuard] Error extracting page content:', error);
      sendResponse({ error: 'Failed to extract content' });
    }
  }

  if (request.type === 'HIGHLIGHT_ISSUES') {
    try {
      console.log('[HaloGuard] Highlighting issues:', request.payload?.findings?.length || 0, 'findings');
      highlightIssues(request.payload);
    } catch (error) {
      console.error('[HaloGuard] Error highlighting issues:', error);
    }
  }
});

/**
 * Extract page content for analysis
 * Enhanced to work with AI chat platforms
 */
function getPageContent(): any {
  // Try to extract chat messages from common AI platforms
  let enhancedText = document.body.innerText;
  
  // For ChatGPT/Claude/other chat interfaces - look for message containers
  const messageSelectors = [
    '[data-message-id]',           // Generic message container
    '[role="article"]',            // ARIA article role (Claude)
    '.message',                    // Common message class
    '[class*="message"]',          // Classes containing "message"
    '[class*="Message"]',          // PascalCase variants
    '[class*="chat"]',             // Chat-related selectors
    '.assistant',                  // Assistant message class
    '.user',                       // User message class
    '[role="document"]',           // Document role
  ];

  const messages: string[] = [];
  for (const selector of messageSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach((el) => {
          const text = el.textContent?.trim();
          if (text && text.length > 20) {
            messages.push(text);
          }
        });
        if (messages.length > 0) {
          console.log('[HaloGuard] Found messages using selector:', selector, 'Count:', messages.length);
          break;
        }
      }
    } catch (e) {
      // Ignore selector errors
    }
  }

  // If we found messages, use them instead of full body text
  if (messages.length > 0) {
    enhancedText = messages.join('\n\n');
    console.log('[HaloGuard] Using extracted messages, total length:', enhancedText.length);
  } else {
    console.log('[HaloGuard] No message containers found, using full body text');
  }

  const selectedText = window.getSelection()?.toString() || '';
  
  return {
    url: window.location.href,
    title: document.title,
    text: enhancedText?.substring(0, 50000) || '', // Limit to 50KB
    html: document.documentElement.innerHTML?.substring(0, 100000) || '', // Limit HTML
    selectedText: selectedText,
  };
}

/**
 * Highlight problematic elements on the page
 */
function highlightIssues(result: any) {
  if (!result.findings || result.findings.length === 0) {
    console.log('[HaloGuard] No findings to highlight');
    return;
  }

  console.log('[HaloGuard] Starting highlighting with', result.findings.length, 'findings');

  // Create a visual indicator badge for the page
  let badge = document.getElementById('haloguard-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'haloguard-badge';
    badge.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${result.riskLevel === 'high' || result.riskLevel === 'critical' ? '#ff0000' : '#00ff00'};
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      z-index: 10000;
      font-weight: bold;
      font-size: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
    `;
    badge.textContent = `🛡️ ${result.riskLevel.toUpperCase()} (${(result.confidence * 100) | 0}%)`;
    badge.onclick = () => {
      alert('HaloGuard Analysis:\n' + result.summary + '\n\nFindings:\n' + (result.findings.join('\n') || 'None'));
    };
    document.body.appendChild(badge);
  }

  // Highlight text containing potential issues
  const walkTree = (node: any) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      let shouldHighlight = false;

      // Check if any findings are in this text
      result.findings.forEach((finding: string) => {
        if (text.toLowerCase().includes(finding.toLowerCase())) {
          shouldHighlight = true;
        }
      });

      if (shouldHighlight && text.length > 10) {
        // Wrap the parent element
        const parent = node.parentElement;
        if (parent) {
          parent.style.backgroundColor = 'rgba(255, 102, 0, 0.2)';
          parent.style.borderLeft = '3px solid #ff6600';
          parent.style.paddingLeft = '6px';
          parent.title = 'HaloGuard detected potential issue';
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.id !== 'haloguard-badge' && node.className !== 'haloguard-warning') {
        Array.from(node.childNodes).forEach((child: any) => {
          walkTree(child);
        });
      }
    }
  };

  // Limit highlighting to avoid performance issues
  walkTree(document.body);
  console.log('[HaloGuard] Highlighting complete');
}

// Auto-scan on page load (optional - can be disabled in settings)
window.addEventListener('load', () => {
  chrome.storage.local.get(['autoScan'], (result) => {
    if (result.autoScan !== false) {
      chrome.runtime.sendMessage({ type: 'TRIGGER_AUTO_SCAN' });
    }
  });
});

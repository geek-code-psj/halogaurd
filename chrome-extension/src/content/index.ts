/**
 * HaloGuard Content Script
 * Injected into every page to analyze content and highlight issues
 * 
 * NOTE: Content scripts cannot use imports. This file is self-contained.
 */

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  if (request.type === 'GET_PAGE_CONTENT') {
    const content = getPageContent();
    sendResponse(content);
  }

  if (request.type === 'HIGHLIGHT_ISSUES') {
    highlightIssues(request.payload);
  }
});

/**
 * Extract page content for analysis
 */
function getPageContent(): any {
  return {
    url: window.location.href,
    title: document.title,
    text: document.body.innerText,
    html: document.documentElement.innerHTML,
    selectedText: window.getSelection()?.toString() || '',
  };
}

/**
 * Highlight problematic elements on the page
 */
function highlightIssues(result: any) {
  if (!result.findings || result.findings.length === 0) {
    return;
  }

  // Find and highlight form inputs, links, and suspicious elements
  const inputElements = document.querySelectorAll('input, textarea, button, a');

  inputElements.forEach((element) => {
    const text = element.textContent || (element as HTMLInputElement).value || '';

    // Check if element text matches any findings
    result.findings.forEach((finding: string) => {
      if (text.toLowerCase().includes(finding.toLowerCase())) {
        // Add warning styling
        const warning = document.createElement('div');
        warning.className = 'haloguard-warning';
        warning.style.cssText = `
          position: absolute;
          background: #ff6600;
          color: white;
          padding: 4px 8px;
          border-radius: 3px;
          font-size: 11px;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        `;
        warning.textContent = '⚠️ Potential Issue';

        const rect = element.getBoundingClientRect();
        warning.style.left = rect.left + 'px';
        warning.style.top = rect.top - 30 + 'px';
        document.body.appendChild(warning);

        // Also highlight the element itself
        const originalBorder = (element as HTMLElement).style.border;
        (element as HTMLElement).style.border = '2px solid #ff6600';

        // Remove highlighting after 5 seconds
        setTimeout(() => {
          warning.remove();
          (element as HTMLElement).style.border = originalBorder;
        }, 5000);
      }
    });
  });
}

// Auto-scan on page load (optional - can be disabled in settings)
window.addEventListener('load', () => {
  chrome.storage.local.get(['autoScan'], (result) => {
    if (result.autoScan !== false) {
      chrome.runtime.sendMessage({ type: 'TRIGGER_AUTO_SCAN' });
    }
  });
});

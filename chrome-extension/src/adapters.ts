/**
 * Chrome Extension Platform Adapters
 * Support for 8 AI chat platforms
 */

// ChatGPT Platform Adapter
export const ChatGPTAdapter = {
  domain: 'chatgpt.com',
  name: 'ChatGPT',
  messageSelector: '[data-testid="conversation-turn-12"] [data-message-id], .message',
  authorSelector: '[data-message-author-role]',
  getAuthor: (el: Element) => el.getAttribute('data-message-author-role') || 'unknown',
};

// Claude Platform Adapter
export const ClaudeAdapter = {
  domain: 'claude.ai',
  name: 'Claude',
  messageSelector: '.message-row[data-message-id]',
  authorSelector: '.message-role',
  getAuthor: (el: Element) => {
    const role = el.querySelector('.message-role')?.textContent || '';
    return role.toLowerCase().includes('assistant') ? 'assistant' : 'user';
  },
};

// Google Gemini Platform Adapter
export const GeminiAdapter = {
  domain: 'gemini.google.com',
  name: 'Google Gemini',
  messageSelector: '[data-message-id], .message-container',
  authorSelector: '[role="article"]',
  getAuthor: (el: Element) => {
    return el.classList.contains('assistant-message') || 
           el.parentElement?.classList.contains('assistant') ? 'assistant' : 'user';
  },
};

// Microsoft Copilot Platform Adapter
export const CopilotAdapter = {
  domain: 'copilot.microsoft.com',
  name: 'Microsoft Copilot',
  messageSelector: '.message, [data-message-id]',
  authorSelector: '.message-role',
  getAuthor: (el: Element) => {
    return el.classList.contains('assistant') || 
           el.classList.contains('copilot-message') ? 'assistant' : 'user';
  },
};

// Perplexity AI Platform Adapter
export const PerplexityAdapter = {
  domain: 'perplexity.ai',
  name: 'Perplexity',
  messageSelector: '.message-block, [data-message-id]',
  authorSelector: '.message-role',
  getAuthor: (el: Element) => {
    return el.classList.contains('assistant') ? 'assistant' : 'user';
  },
};

// Grok (X.com) Platform Adapter
export const GrokAdapter = {
  domain: 'grok.com',
  name: 'Grok',
  messageSelector: '[data-testid="messageTile"], .message',
  authorSelector: '[role="article"]',
  getAuthor: (el: Element) => {
    const parent = el.closest('[data-testid="messageTile"]');
    return parent?.querySelector('[aria-label*="Grok"]') ? 'assistant' : 'user';
  },
};

// Meta AI Platform Adapter
export const MetaAdapter = {
  domain: 'meta.ai',
  name: 'Meta AI',
  messageSelector: '[role="article"], .message',
  authorSelector: '.message-author',
  getAuthor: (el: Element) => {
    return el.classList.contains('meta-assistant') ? 'assistant' : 'user';
  },
};

// DeepSeek Platform Adapter
export const DeepSeekAdapter = {
  domain: 'deepseek.com',
  name: 'DeepSeek',
  messageSelector: '.message-item, [data-message-id]',
  authorSelector: '.message-role',
  getAuthor: (el: Element) => {
    return el.classList.contains('assistant-message') ? 'assistant' : 'user';
  },
};

// Platform registry
export const PLATFORM_ADAPTERS = [
  ChatGPTAdapter,
  ClaudeAdapter,
  GeminiAdapter,
  CopilotAdapter,
  PerplexityAdapter,
  GrokAdapter,
  MetaAdapter,
  DeepSeekAdapter,
];

/**
 * Detect current platform from URL
 */
export function detectPlatform() {
  const hostname = window.location.hostname;
  
  for (const adapter of PLATFORM_ADAPTERS) {
    if (hostname.includes(adapter.domain)) {
      return adapter;
    }
  }
  
  return null;
}

/**
 * Extract message from element using platform-specific selectors
 */
export function extractMessageFromElement(el: Element, adapter: typeof ChatGPTAdapter) {
  const messageText = el.textContent || el.innerText || '';
  const messageId = el.getAttribute('data-message-id') || el.id || '';
  
  try {
    const authorEl = el.querySelector(adapter.authorSelector);
    const author = authorEl ? adapter.getAuthor(authorEl) : 'unknown';
    
    return {
      id: messageId,
      content: messageText.trim(),
      author,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('[HaloGuard] Error extracting message:', error);
    return null;
  }
}

/**
 * Inject HaloGuard sidebar into page
 */
export function injectSidebar() {
  // Check if already injected
  if (document.getElementById('haloguard-root')) {
    return;
  }

  const container = document.createElement('div');
  container.id = 'haloguard-root';
  container.innerHTML = `
    <div id="haloguard-sidebar" style="
      position: fixed;
      right: 0;
      top: 0;
      width: 320px;
      height: 100vh;
      background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
      border-left: 1px solid #444;
      box-shadow: -4px 0 12px rgba(0,0,0,0.5);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e0e0e0;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    ">
      <div style="
        padding: 16px;
        border-bottom: 1px solid #444;
        flex-shrink: 0;
        background: rgba(0,0,0,0.4);
      ">
        <div style="
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 8px;
        ">
          <span>🛡️</span>
          <span>HaloGuard</span>
        </div>
        <div style="
          font-size: 11px;
          color: #999;
          margin-top: 4px;
        ">Hallucination Detection</div>
      </div>
      <div id="haloguard-content" style="
        flex: 1;
        overflow-y: auto;
        padding: 12px;
      ">
        <div style="
          color: #888;
          font-size: 12px;
          text-align: center;
          padding: 24px 12px;
        ">
          <div style="margin-bottom: 8px;">⏳</div>
          Monitoring conversation...
        </div>
      </div>
      <div style="
        padding: 12px;
        border-top: 1px solid #444;
        flex-shrink: 0;
        font-size: 11px;
        color: #666;
        text-align: center;
      ">
        v0.1.0
      </div>
    </div>
  `;

  document.body.appendChild(container);
}

/**
 * Update sidebar with detection results
 */
export function updateSidebar(results: any) {
  const content = document.getElementById('haloguard-content');
  if (!content) return;

  if (!results.flagged || results.issues.length === 0) {
    content.innerHTML = `
      <div style="
        color: #4a9d6f;
        font-size: 12px;
        text-align: center;
        padding: 24px 12px;
      ">
        <div style="margin-bottom: 8px; font-size: 18px;">✓</div>
        No issues detected
      </div>
    `;
    return;
  }

  const issueColors = {
    critical: '#ff3333',
    high: '#ff8844',
    medium: '#ffaa44',
    low: '#4488ff',
  };

  content.innerHTML = results.issues.map((issue: any) => `
    <div style="
      background: rgba(255,255,255,0.05);
      border-left: 3px solid ${issueColors[issue.severity] || '#888'};
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 3px;
      font-size: 11px;
    ">
      <div style="
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 6px;
        font-size: 10px;
        color: ${issueColors[issue.severity] || '#888'};
        letter-spacing: 0.5px;
      ">
        ${issue.severity}: ${issue.type}
      </div>
      <div style="
        color: #ccc;
        margin: 4px 0;
        line-height: 1.4;
      ">${issue.message}</div>
      <div style="
        color: #888;
        margin-top: 6px;
        font-size: 10px;
      ">
        Confidence: ${(issue.confidence * 100).toFixed(0)}%
      </div>
      ${issue.suggestions ? `
        <div style="
          color: #999;
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #444;
          font-size: 10px;
        ">
          💡 ${issue.suggestions[0]}
        </div>
      ` : ''}
    </div>
  `).join('');
}

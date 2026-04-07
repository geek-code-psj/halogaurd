/**
 * Content Script for Chrome Extension
 * Injects into AI chat pages and intercepts messages
 */

console.log('[HaloGuard] Content script loaded');

// Detect which platform we're on
const detectPlatform = () => {
  const hostname = window.location.hostname;
  if (hostname.includes('chatgpt.com')) return 'chatgpt';
  if (hostname.includes('claude.ai')) return 'claude';
  if (hostname.includes('gemini.google.com')) return 'gemini';
  if (hostname.includes('copilot.microsoft.com')) return 'copilot';
  if (hostname.includes('perplexity.ai')) return 'perplexity';
  if (hostname.includes('grok.com') || hostname.includes('x.com')) return 'grok';
  if (hostname.includes('meta.ai')) return 'meta';
  if (hostname.includes('deepseek.com')) return 'deepseek';
  return 'unknown';
};

const platform = detectPlatform();
console.log(`[HaloGuard] Detected platform: ${platform}`);

// Connect to service worker
const port = chrome.runtime.connect({ name: `content-${platform}` });

port.onMessage.addListener((message) => {
  if (message.type === 'analysis_result') {
    console.log('[HaloGuard] Analysis result:', message.payload);
    // TODO: Update sidebar UI with results
  }
});

port.onDisconnect.addListener(() => {
  console.warn('[HaloGuard] Disconnected from service worker');
});

// Platform-specific message interception
switch (platform) {
  case 'chatgpt':
    setupChatGPTInterception();
    break;
  case 'claude':
    setupClaudeInterception();
    break;
  case 'gemini':
    setupGeminiInterception();
    break;
  // TODO: Add other platforms
  default:
    console.warn(`[HaloGuard] No interception setup for ${platform}`);
}

function setupChatGPTInterception() {
  // TODO: Override fetch() to intercept /backend-api/conversation
  console.log('[HaloGuard] ChatGPT interception setup');
}

function setupClaudeInterception() {
  // TODO: Override fetch() to intercept /api/append_message
  console.log('[HaloGuard] Claude interception setup');
}

function setupGeminiInterception() {
  // TODO: Override fetch() to intercept GenerateContent
  console.log('[HaloGuard] Gemini interception setup');
}

// Inject sidebar UI
const injectSidebar = () => {
  const sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'haloguard-sidebar-container';
  sidebarContainer.style.cssText = `
    position: fixed;
    right: 0;
    top: 0;
    width: 350px;
    height: 100vh;
    background: var(--color-background);
    border-left: 1px solid var(--color-border);
    z-index: 10000;
    overflow-y: auto;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  sidebarContainer.innerHTML = `
    <div style="padding: 16px;">
      <h2 style="margin-top: 0;">🛡️ HaloGuard</h2>
      <p style="color: var(--color-text-secondary); font-size: 12px;">
        Real-time hallucination detection
      </p>
      <div id="haloguard-issues" style="margin-top: 16px;">
        <p style="color: var(--color-text-tertiary); font-size: 12px;">
          Monitoring conversation...
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(sidebarContainer);

  // Show sidebar with fade-in
  setTimeout(() => {
    sidebarContainer.style.opacity = '1';
  }, 100);

  console.log('[HaloGuard] Sidebar injected');
};

// Inject on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectSidebar);
} else {
  injectSidebar();
}

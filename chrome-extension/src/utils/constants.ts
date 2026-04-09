/**
 * HaloGuard - Constants & Configuration
 */

export const PLATFORMS = {
  CHATGPT: 'chatgpt',
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  COPILOT: 'copilot',
  PERPLEXITY: 'perplexity',
  GROK: 'grok',
  META: 'meta',
  DEEPSEEK: 'deepseek',
} as const;

export const PLATFORM_DOMAINS = {
  [PLATFORMS.CHATGPT]: ['chat.openai.com', 'chatgpt.com'],
  [PLATFORMS.CLAUDE]: ['claude.ai'],
  [PLATFORMS.GEMINI]: ['gemini.google.com'],
  [PLATFORMS.COPILOT]: ['copilot.microsoft.com'],
  [PLATFORMS.PERPLEXITY]: ['perplexity.ai'],
  [PLATFORMS.GROK]: ['grok.com', 'x.com/grok'],
  [PLATFORMS.META]: ['meta.ai', 'ai.meta.com'],
  [PLATFORMS.DEEPSEEK]: ['chat.deepseek.com', 'deepseek.com'],
} as const;

export const SEVERITY_COLORS = {
  low: '#4CAF50',
  medium: '#FFC107',
  high: '#FF9800',
  critical: '#F44336',
} as const;

export const SEVERITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;

export const MESSAGE_SELECTORS = {
  [PLATFORMS.CHATGPT]: {
    messages: '[data-message-id], .message-row',
    content: '.text-base, .whitespace-pre-wrap',
    assistant: '[data-message-author-role="assistant"]',
  },
  [PLATFORMS.CLAUDE]: {
    messages: '.message, [data-message-id]',
    content: '.md, .markdown',
    assistant: '[data-message-role="assistant"], .assistant-message',
  },
  [PLATFORMS.GEMINI]: {
    messages: '[role="article"], [data-message-id]',
    content: '.message-content, [data-message-content]',
    assistant: '.assistant-message, [role="article"] > div:last-child',
  },
  [PLATFORMS.COPILOT]: {
    messages: '.message, .message-item',
    content: '.message-content, .markdown',
    assistant: '.assistant, .bot-message',
  },
  [PLATFORMS.PERPLEXITY]: {
    messages: '.message-item, [data-message-id]',
    content: '.prose, .message-content',
    assistant: '.assistant, .perplexity-response',
  },
  [PLATFORMS.GROK]: {
    messages: '[data-testid="messageTile"], .message',
    content: '.text-base, .whitespace-pre-wrap',
    assistant: '[aria-label*="Grok"]',
  },
  [PLATFORMS.META]: {
    messages: '[role="article"], .message',
    content: '.message-content, span[role="textbox"]',
    assistant: '.assistant, [role="article"] > div:last-child',
  },
  [PLATFORMS.DEEPSEEK]: {
    messages: '.message-row, [data-message-id]',
    content: '.text-base, .message-content',
    assistant: '.assistant-message, [data-message-role="assistant"]',
  },
} as const;

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoAnalyze: true,
  showBadge: true,
  darkMode: false,
  threshold: 50,
  backendUrl: 'https://haloguard-production.up.railway.app',
} as const;

export const ANALYSIS_TIMEOUT = 10000; // 10 seconds
export const RETRY_ATTEMPTS = 3;
export const RETRY_DELAY = 1000; // 1 second

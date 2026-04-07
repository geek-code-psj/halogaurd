/**
 * PHASE 3 EPIC 1: Multi-Language Support Module
 * 
 * Public API for multi-language detection and verification
 * Exports all language-related functionality
 */

// Language detection
export {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  detectLanguageFromContent,
  detectLanguageByRegex,
  getBrowserLanguage,
  getWikipediaTld,
  getLanguageName,
  isSupportedLanguage,
  getAllLanguages,
  type SupportedLanguageCode,
} from './language-detector';

// Language configuration
export {
  CLAIM_PATTERNS,
  WIKIPEDIA_CONFIG,
  UI_LOCALE_KEYS,
  PLATFORM_SELECTORS,
  getWikipediaConfig,
  getClaimPatterns,
  getUILocaleKeys,
  getPlatformSelectors,
} from './language-config';

// Multi-language fact-checking
export {
  searchWikipediaMultiLang,
  verifyClaimMultiLang,
  extractEntitiesFromClaim,
  batchVerifyClaimsMultiLang,
} from './multi-language-wikipedia';

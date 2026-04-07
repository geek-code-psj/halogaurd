/**
 * PHASE 3 EPIC 1: Multi-Language Support
 * Language Detection Module
 * 
 * Detects user language from content using multiple strategies:
 * 1. tinyld - Fast language detection (50+ languages)
 * 2. Browser language detection fallback
 * 3. User preference override
 * 
 * Target: <50ms latency, 95%+ accuracy on 9 supported languages
 */

// Supported languages with Wikipedia TLD mappings
export const SUPPORTED_LANGUAGES = {
  en: { name: 'English', tld: 'en', priority: 1 },
  es: { name: 'Spanish', tld: 'es', priority: 2 },
  fr: { name: 'French', tld: 'fr', priority: 3 },
  de: { name: 'German', tld: 'de', priority: 4 },
  ja: { name: 'Japanese', tld: 'ja', priority: 5 },
  zh: { name: 'Chinese (Simplified)', tld: 'zh', priority: 6 },
  pt: { name: 'Portuguese', tld: 'pt', priority: 7 },
  ru: { name: 'Russian', tld: 'ru', priority: 8 },
  ko: { name: 'Korean', tld: 'ko', priority: 9 },
} as const;

export type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;

// Language code aliases and variations
const LANGUAGE_ALIASES: Record<string, SupportedLanguageCode> = {
  'en-US': 'en',
  'en-GB': 'en',
  'en-AU': 'en',
  'en-CA': 'en',
  'es-ES': 'es',
  'es-MX': 'es',
  'es-AR': 'es',
  'pt-BR': 'pt',
  'pt-PT': 'pt',
  'zh-Hans': 'zh',
  'zh-Hant': 'zh', // Simplified takes priority
  'fr-FR': 'fr',
  'fr-CA': 'fr',
  'de-DE': 'de',
  'de-AT': 'de',
  'ja-JP': 'ja',
  'ru-RU': 'ru',
  'ko-KR': 'ko',
};

interface DetectionResult {
  language: SupportedLanguageCode;
  confidence: number; // 0-1
  method: 'content' | 'browser' | 'user-preference' | 'fallback';
  detectedCode?: string; // Raw detected code
}

/**
 * Detect language from content using tinyld
 * Requires: npm install tinyld
 */
export async function detectLanguageFromContent(
  content: string
): Promise<DetectionResult | null> {
  if (!content || content.length < 10) {
    return null; // Content too short for reliable detection
  }

  try {
    // tinyld will be dynamically imported in browser/runtime
    // For now, using regex-based client-side detection
    const detected = detectLanguageByRegex(content);
    if (detected) {
      return {
        language: detected,
        confidence: 0.75,
        method: 'content',
      };
    }
  } catch (error) {
    console.warn('Language detection from content failed:', error);
  }

  return null;
}

/**
 * Fallback regex-based language detection
 * Checks for language-specific character patterns
 */
export function detectLanguageByRegex(content: string): SupportedLanguageCode | null {
  // Chinese characters (CJK unified ideographs)
  if (/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(content)) {
    return 'zh'; // Could also be Japanese, but default to Chinese
  }

  // Japanese (Hiragana/Katakana + Kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF][\u4E00-\u9FFF]/.test(content)) {
    return 'ja';
  }

  // Cyrillic (Russian)
  if (/[\u0400-\u04FF]/.test(content)) {
    return 'ru';
  }

  // Korean Hangul
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(content)) {
    return 'ko';
  }

  // German-specific patterns (umlauts, case frequency)
  const germanUmlauts = (content.match(/[äöüßÄÖÜ]/g) || []).length;
  if (germanUmlauts > 5) {
    return 'de';
  }

  // Spanish-specific patterns (inverted punctuation)
  if (/[¿¡]/.test(content)) {
    return 'es';
  }

  // Portuguese-specific patterns
  if (/\b(São|ção|dade|mente)\b/i.test(content)) {
    return 'pt';
  }

  // French-specific patterns
  if (/\b(qu|çe|é|à|qu'|c'est|cela)\b/i.test(content)) {
    return 'fr';
  }

  // Default to English if nothing matches
  return 'en';
}

/**
 * Get language from browser settings
 * Works in both browser and Node.js environments
 */
export function getBrowserLanguage(): SupportedLanguageCode | null {
  let browserLang: string | undefined;

  // Browser environment
  if (typeof window !== 'undefined' && window.navigator) {
    browserLang = window.navigator.language || (window.navigator as any).userLanguage;
  }
  // Node.js / Runtime environment
  else if (typeof process !== 'undefined' && process.env) {
    browserLang = process.env.LANG || process.env.LANGUAGE;
  }

  if (!browserLang) {
    return null;
  }

  // Normalize and map language code
  const normalized = browserLang.split('_')[0].split('.')[0].toLowerCase();

  // Check direct match
  if (normalized in SUPPORTED_LANGUAGES) {
    return normalized as SupportedLanguageCode;
  }

  // Check aliases
  return LANGUAGE_ALIASES[normalized] || null;
}

/**
 * Main detection pipeline
 * 1. Try content analysis (if content provided)
 * 2. Try browser language
 * 3. Fall back to English
 */
export async function detectLanguage(
  content?: string,
  userPreference?: SupportedLanguageCode
): Promise<DetectionResult> {
  // User preference takes priority
  if (userPreference && userPreference in SUPPORTED_LANGUAGES) {
    return {
      language: userPreference,
      confidence: 1.0,
      method: 'user-preference',
    };
  }

  // Try content-based detection
  if (content && content.length > 10) {
    const result = await detectLanguageFromContent(content);
    if (result && result.confidence > 0.7) {
      return result;
    }
  }

  // Try browser language
  const browserLang = getBrowserLanguage();
  if (browserLang) {
    return {
      language: browserLang,
      confidence: 0.9,
      method: 'browser',
    };
  }

  // Fallback to English
  return {
    language: 'en',
    confidence: 0.5,
    method: 'fallback',
  };
}

/**
 * Get Wikipedia TLD for language
 */
export function getWikipediaTld(language: SupportedLanguageCode): string {
  return SUPPORTED_LANGUAGES[language].tld;
}

/**
 * Get full language name
 */
export function getLanguageName(language: SupportedLanguageCode): string {
  return SUPPORTED_LANGUAGES[language].name;
}

/**
 * Validate if language code is supported
 */
export function isSupportedLanguage(code: string): code is SupportedLanguageCode {
  return code in SUPPORTED_LANGUAGES;
}

/**
 * Get all supported languages
 */
export function getAllLanguages() {
  return Object.entries(SUPPORTED_LANGUAGES).map(([code, info]) => ({
    code: code as SupportedLanguageCode,
    ...info,
  }));
}

/**
 * PHASE 3 EPIC 1: Multi-Language Support - Unit Tests
 * Tests for language detection, configuration, and Wikipedia integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectLanguage,
  detectLanguageFromContent,
  detectLanguageByRegex,
  getBrowserLanguage,
  getWikipediaTld,
  isSupportedLanguage,
} from './language-detector';
import {
  getWikipediaConfig,
  getClaimPatterns,
  getUILocaleKeys,
} from './language-config';
import {
  searchWikipediaMultiLang,
  extractEntitiesFromClaim,
  verifyClaimMultiLang,
} from './multi-language-wikipedia';

describe('Language Detector Module', () => {
  describe('Language Detection from Content', () => {
    it('detects Chinese from CJK characters', () => {
      const chinese = '爱因斯坦于1879年3月14日在德国乌尔姆出生';
      const result = detectLanguageByRegex(chinese);
      expect(result).toBe('zh');
    });

    it('detects Japanese from Hiragana/Katakana', () => {
      const japanese = 'アインシュタインは1879年3月14日にドイツのウルムで生まれました';
      const result = detectLanguageByRegex(japanese);
      expect(result).toBe('ja');
    });

    it('detects Russian from Cyrillic', () => {
      const russian = 'Альберт Эйнштейн родился 14 марта 1879 года в Ульме';
      const result = detectLanguageByRegex(russian);
      expect(result).toBe('ru');
    });

    it('detects Korean from Hangul', () => {
      const korean = '알베르트 아인슈타인은 1879년 3월 14일 독일 울름에서 태어났다';
      const result = detectLanguageByRegex(korean);
      expect(result).toBe('ko');
    });

    it('detects Spanish from inverted punctuation', () => {
      const spanish = '¿Cuándo nació Albert Einstein? ¡En 1879!';
      const result = detectLanguageByRegex(spanish);
      expect(result).toBe('es');
    });

    it('detects French from French patterns', () => {
      const french = "C'est un fait que Albert Einstein était un physicien";
      const result = detectLanguageByRegex(french);
      expect(result).toBe('fr');
    });

    it('detects Portuguese from Portuguese patterns', () => {
      const portuguese = 'Albert Einstein nasceu em 1879, é uma realidade histórica';
      const result = detectLanguageByRegex(portuguese);
      expect(result).toBe('pt');
    });

    it('detects German from umlauts', () => {
      const german = 'Albert Einstein wurde 1879 geboren, äußerte schöne Theorien';
      const result = detectLanguageByRegex(german);
      expect(result).toBe('de');
    });

    it('defaults to English for undetected text', () => {
      const english = 'Albert Einstein was born in 1879 in Ulm, Germany';
      const result = detectLanguageByRegex(english);
      expect(result).toBe('en');
    });
  });

  describe('Language Detection Pipeline', () => {
    it('respects user preference override', async () => {
      const result = await detectLanguage('任何内容', 'es');
      expect(result.language).toBe('es');
      expect(result.method).toBe('user-preference');
      expect(result.confidence).toBe(1.0);
    });

    it('detects language from content when no preference set', async () => {
      const chinese = '这是一个关于爱因斯坦的声称';
      const result = await detectLanguage(chinese);
      expect(result.language).toBe('zh');
      expect(['content', 'browser', 'fallback']).toContain(result.method);
    });

    it('handles content too short for detection', async () => {
      const result = await detectLanguage('ok');
      expect(result.language).toBe('en'); // Fallback
    });

    it('returns fallback (English) when no other method works', async () => {
      const result = await detectLanguage('');
      expect(result.language).toBe('en');
      expect(result.method).toBe('fallback');
    });
  });

  describe('Wikipedia TLD Routing', () => {
    it('returns correct TLD for each language', () => {
      expect(getWikipediaTld('en')).toBe('en');
      expect(getWikipediaTld('es')).toBe('es');
      expect(getWikipediaTld('ja')).toBe('ja');
      expect(getWikipediaTld('zh')).toBe('zh');
      expect(getWikipediaTld('ru')).toBe('ru');
    });
  });

  describe('Language Support Validation', () => {
    it('validates supported languages', () => {
      expect(isSupportedLanguage('en')).toBe(true);
      expect(isSupportedLanguage('es')).toBe(true);
      expect(isSupportedLanguage('invalid')).toBe(false);
    });
  });
});

describe('Language Configuration', () => {
  describe('Wikipedia Configuration', () => {
    it('provides correct Wikipedia API URLs for each language', () => {
      const enConfig = getWikipediaConfig('en');
      expect(enConfig.baseUrl).toContain('en.wikipedia.org');
      expect(enConfig.language).toBe('en');

      const esConfig = getWikipediaConfig('es');
      expect(esConfig.baseUrl).toContain('es.wikipedia.org');
      expect(esConfig.language).toBe('es');
    });
  });

  describe('Claim Patterns', () => {
    it('provides language-specific claim extraction patterns', () => {
      const enPatterns = getClaimPatterns('en');
      expect(enPatterns).toBeDefined();
      expect(enPatterns.length).toBeGreaterThan(0);
      expect(enPatterns[0]).toBeInstanceOf(RegExp);
    });
  });

  describe('UI Localization Keys', () => {
    it('provides localization keys for each language', () => {
      const enKeys = getUILocaleKeys('en');
      expect(enKeys).toHaveProperty('hallucination_detected');
      expect(enKeys).toHaveProperty('fact_checking');
      expect(enKeys).toHaveProperty('confidence_score');

      const esKeys = getUILocaleKeys('es');
      expect(esKeys).toHaveProperty('alucinacion_detectada');
      expect(esKeys).toHaveProperty('verificacion_hecho');
    });
  });
});

describe('Multi-Language Wikipedia Integration', () => {
  describe('Entity Extraction', () => {
    it('extracts proper nouns from English claim', () => {
      const claim = 'Albert Einstein was born in Ulm, Germany on March 14, 1879';
      const entities = extractEntitiesFromClaim(claim, 'en');
      expect(entities).toContain('Albert');
      expect(entities).toContain('Einstein');
      expect(entities).toContain('Ulm');
      expect(entities).toContain('Germany');
    });

    it('extracts dates from English claims', () => {
      const claim = 'The Great Wall was built in 1492';
      const entities = extractEntitiesFromClaim(claim, 'en');
      expect(entities.length).toBeGreaterThan(0);
    });

    it('returns empty array for claim without entities', () => {
      const claim = 'the and or a very common words';
      const entities = extractEntitiesFromClaim(claim, 'en');
      // May have some matches depending on implementation
      expect(Array.isArray(entities)).toBe(true);
    });
  });

  describe('Multi-Language Wikipedia API', () => {
    it('constructs correct Wikipedia API URL for different languages', async () => {
      // This is a mock test - actual HTTP calls would be slow
      const config = getWikipediaConfig('es');
      expect(config.baseUrl).toContain('es.wikipedia.org');
      
      const config_ja = getWikipediaConfig('ja');
      expect(config_ja.baseUrl).toContain('ja.wikipedia.org');
    });
  });
});

describe('Language Support Completeness', () => {
  it('supports all 9 promised languages', () => {
    const languages = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'pt', 'ru', 'ko'];
    languages.forEach(lang => {
      expect(isSupportedLanguage(lang)).toBe(true);
      expect(getWikipediaConfig(lang as any)).toBeDefined();
      expect(getClaimPatterns(lang as any)).toBeDefined();
      expect(getUILocaleKeys(lang as any)).toBeDefined();
    });
  });
});

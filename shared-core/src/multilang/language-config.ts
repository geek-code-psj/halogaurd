/**
 * PHASE 3 EPIC 1: Multi-Language Support
 * Language-Specific Configuration
 * 
 * Configuration for language-specific:
 * - Claim extraction patterns
 * - Wikipedia API parameters
 * - UI text localization (i18n keys)
 * - Platform-specific selectors for each language UI variant
 */

import { SupportedLanguageCode, SUPPORTED_LANGUAGES } from './language-detector';

/**
 * Language-specific claim extraction patterns
 * Identifies factual assertions in different languages
 */
export const CLAIM_PATTERNS: Record<SupportedLanguageCode, RegExp[]> = {
  en: [
    /\b(?:is|was|are|were)[\s\w]+\d{1,4}\b/i, // Date assertions
    /\b(?:born|died|created|founded)[\s\w]+(?:in|on)\b/i, // Life events
    /\b(?:the|a)\s+\w+\s+(?:is|are)\s+\w+/i, // Attribute statements
  ],
  es: [
    /\b(?:es|era|son)\s+\w+\s+(?:en|de)\s+\d{1,4}\b/i,
    /\b(?:nacido|nacida|fallecido|creado|fundado)\b/i,
    /\b(?:el|la)\s+\w+\s+(?:es|era)\s+\w+/i,
  ],
  fr: [
    /\b(?:est|était|sont)\s+\w+\s+(?:en|de)\s+\d{1,4}\b/i,
    /\b(?:né|née|décédé|créé|fondé)\b/i,
    /\b(?:le|la)\s+\w+\s+(?:est|était)\s+\w+/i,
  ],
  de: [
    /\b(?:ist|war|sind)\s+\w+\s+(?:in|von)\s+\d{1,4}\b/i,
    /\b(?:geboren|gestorben|gegründet)\b/i,
    /\bDie\s+\w+\s+(?:ist|war)\s+\w+/i,
  ],
  ja: [
    /\d{1,4}年(?:生|没|設立|創設)\b/,
    /は(?:、|\s)*\w+である/,
    /\w+は\d{1,4}年\w+\b/,
  ],
  zh: [
    /\d{1,4}年(?:生|卒|設立|創辦)\b/,
    /是\w+\d{1,4}年\b/,
    /\w+於\d{1,4}年\b/,
  ],
  pt: [
    /\b(?:é|era|são)\s+\w+\s+(?:em|de)\s+\d{1,4}\b/i,
    /\b(?:nascido|nascida|falecido|criado|fundado)\b/i,
    /\b(?:o|a)\s+\w+\s+(?:é|era)\s+\w+/i,
  ],
  ru: [
    /\b(?:является|был|была|были)\s+\w+\s+(?:в|из)\s+\d{1,4}\b/i,
    /\b(?:родился|родилась|умер|умерла|основан)\b/i,
    /\b\w+\s+(?:был|была)\s+\w+/i,
  ],
  ko: [
    /\d{1,4}년(?:생|사|설립|창설)\b/,
    /은\/는\s+\w+(?:이다|였다)/,
    /\w+은\s+\d{1,4}년\b/,
  ],
};

/**
 * Wikipedia API parameters for each language
 */
export const WIKIPEDIA_CONFIG: Record<
  SupportedLanguageCode,
  {
    baseUrl: string;
    language: string;
    textExtractFormat: string;
  }
> = {
  en: {
    baseUrl: 'https://en.wikipedia.org/w/api.php',
    language: 'en',
    textExtractFormat: 'plaintext',
  },
  es: {
    baseUrl: 'https://es.wikipedia.org/w/api.php',
    language: 'es',
    textExtractFormat: 'plaintext',
  },
  fr: {
    baseUrl: 'https://fr.wikipedia.org/w/api.php',
    language: 'fr',
    textExtractFormat: 'plaintext',
  },
  de: {
    baseUrl: 'https://de.wikipedia.org/w/api.php',
    language: 'de',
    textExtractFormat: 'plaintext',
  },
  ja: {
    baseUrl: 'https://ja.wikipedia.org/w/api.php',
    language: 'ja',
    textExtractFormat: 'plaintext',
  },
  zh: {
    baseUrl: 'https://zh.wikipedia.org/w/api.php',
    language: 'zh',
    textExtractFormat: 'plaintext',
  },
  pt: {
    baseUrl: 'https://pt.wikipedia.org/w/api.php',
    language: 'pt',
    textExtractFormat: 'plaintext',
  },
  ru: {
    baseUrl: 'https://ru.wikipedia.org/w/api.php',
    language: 'ru',
    textExtractFormat: 'plaintext',
  },
  ko: {
    baseUrl: 'https://ko.wikipedia.org/w/api.php',
    language: 'ko',
    textExtractFormat: 'plaintext',
  },
};

/**
 * UI localization keys for each language
 * Maps feature keys to translation keys for i18n system
 */
export const UI_LOCALE_KEYS: Record<SupportedLanguageCode, Record<string, string>> = {
  en: {
    hallucination_detected: 'hallucination_detected',
    fact_checking: 'fact_checking',
    confidence_score: 'confidence_score',
    view_analysis: 'view_analysis',
    verify_claim: 'verify_claim',
    low_confidence: 'low_confidence',
    medium_confidence: 'medium_confidence',
    high_confidence: 'high_confidence',
  },
  es: {
    hallucination_detected: 'alucinacion_detectada',
    fact_checking: 'verificacion_hecho',
    confidence_score: 'puntuacion_confianza',
    view_analysis: 'ver_analisis',
    verify_claim: 'verificar_afirmacion',
    low_confidence: 'baja_confianza',
    medium_confidence: 'confianza_media',
    high_confidence: 'alta_confianza',
  },
  fr: {
    hallucination_detected: 'hallucination_detectee',
    fact_checking: 'verification_faits',
    confidence_score: 'score_confiance',
    view_analysis: 'voir_analyse',
    verify_claim: 'verifier_affirmation',
    low_confidence: 'faible_confiance',
    medium_confidence: 'confiance_moyenne',
    high_confidence: 'haute_confiance',
  },
  de: {
    hallucination_detected: 'halluzination_erkannt',
    fact_checking: 'faktenprufung',
    confidence_score: 'zuverlassigkeitsscore',
    view_analysis: 'analyse_anzeigen',
    verify_claim: 'aussage_uberprfen',
    low_confidence: 'geringe_zuverlassigkeit',
    medium_confidence: 'mittlere_zuverlassigkeit',
    high_confidence: 'hohe_zuverlassigkeit',
  },
  ja: {
    hallucination_detected: '幻覚が検出されました',
    fact_checking: '事実確認',
    confidence_score: '信頼スコア',
    view_analysis: '分析を表示',
    verify_claim: 'クレームを確認',
    low_confidence: '低信頼度',
    medium_confidence: '中信頼度',
    high_confidence: '高信頼度',
  },
  zh: {
    hallucination_detected: '检测到幻觉',
    fact_checking: '事实核实',
    confidence_score: '置信度评分',
    view_analysis: '查看分析',
    verify_claim: '验证声明',
    low_confidence: '低置信度',
    medium_confidence: '中等置信度',
    high_confidence: '高置信度',
  },
  pt: {
    hallucination_detected: 'alucinacao_detectada',
    fact_checking: 'verificacao_fatos',
    confidence_score: 'pontuacao_confianca',
    view_analysis: 'ver_analise',
    verify_claim: 'verificar_afirmacao',
    low_confidence: 'baixa_confianca',
    medium_confidence: 'confianca_media',
    high_confidence: 'alta_confianca',
  },
  ru: {
    hallucination_detected: 'галлюцинация_обнаружена',
    fact_checking: 'проверка_фактов',
    confidence_score: 'оценка_доверия',
    view_analysis: 'просмотр_анализа',
    verify_claim: 'проверить_утверждение',
    low_confidence: 'низкое_доверие',
    medium_confidence: 'среднее_доверие',
    high_confidence: 'высокое_доверие',
  },
  ko: {
    hallucination_detected: '환각이_감지되었습니다',
    fact_checking: '사실_확인',
    confidence_score: '신뢰도_점수',
    view_analysis: '분석_보기',
    verify_claim: '클레임_확인',
    low_confidence: '낮은_신뢰도',
    medium_confidence: '중간_신뢰도',
    high_confidence: '높은_신뢰도',
  },
};

/**
 * Platform-specific DOM selectors for each language variant
 * Used for detecting messages across different platform UIs
 */
export const PLATFORM_SELECTORS: Record<
  SupportedLanguageCode,
  Record<string, string[]>
> = {
  en: {
    chatgpt: ['[data-message-id]', '[class*="message"]', '[role="article"]'],
    claude: ['[data-test*="message"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="response"]', '[data-turn="0"]'],
  },
  es: {
    chatgpt: ['[data-message-id]', '[class*="mensaje"]', '[role="article"]'],
    claude: ['[data-test*="mensaje"]', '[class*="Mensaje"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="respuesta"]', '[data-turn="0"]'],
  },
  fr: {
    chatgpt: ['[data-message-id]', '[class*="message"]', '[role="article"]'],
    claude: ['[data-test*="message"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="reponse"]', '[data-turn="0"]'],
  },
  de: {
    chatgpt: ['[data-message-id]', '[class*="nachricht"]', '[role="article"]'],
    claude: ['[data-test*="nachricht"]', '[class*="Nachricht"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="antwort"]', '[data-turn="0"]'],
  },
  ja: {
    chatgpt: ['[data-message-id]', '[class*="メッセージ"]', '[role="article"]'],
    claude: ['[data-test*="メッセージ"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="応答"]', '[data-turn="0"]'],
  },
  zh: {
    chatgpt: ['[data-message-id]', '[class*="消息"]', '[role="article"]'],
    claude: ['[data-test*="消息"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="回应"]', '[data-turn="0"]'],
  },
  pt: {
    chatgpt: ['[data-message-id]', '[class*="mensagem"]', '[role="article"]'],
    claude: ['[data-test*="mensagem"]', '[class*="Mensagem"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="resposta"]', '[data-turn="0"]'],
  },
  ru: {
    chatgpt: ['[data-message-id]', '[class*="сообщение"]', '[role="article"]'],
    claude: ['[data-test*="сообщение"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="ответ"]', '[data-turn="0"]'],
  },
  ko: {
    chatgpt: ['[data-message-id]', '[class*="메시지"]', '[role="article"]'],
    claude: ['[data-test*="메시지"]', '[class*="Message"]', 'div[class*="css"]'],
    gemini: ['[data-message-id]', '[class*="응답"]', '[data-turn="0"]'],
  },
};

/**
 * Get language-specific Wikipedia config
 */
export function getWikipediaConfig(language: SupportedLanguageCode) {
  return WIKIPEDIA_CONFIG[language];
}

/**
 * Get language-specific claim patterns
 */
export function getClaimPatterns(language: SupportedLanguageCode): RegExp[] {
  return CLAIM_PATTERNS[language] || CLAIM_PATTERNS.en;
}

/**
 * Get language-specific UI locale keys
 */
export function getUILocaleKeys(language: SupportedLanguageCode): Record<string, string> {
  return UI_LOCALE_KEYS[language] || UI_LOCALE_KEYS.en;
}

/**
 * Get language-specific platform selectors
 */
export function getPlatformSelectors(
  language: SupportedLanguageCode,
  platform: string
): string[] {
  const selectors = PLATFORM_SELECTORS[language];
  const platformSelectors = selectors && (selectors as any)[platform] ? (selectors as any)[platform] : (PLATFORM_SELECTORS.en as any)[platform] || [];
  return Array.isArray(platformSelectors) ? platformSelectors : [];
}

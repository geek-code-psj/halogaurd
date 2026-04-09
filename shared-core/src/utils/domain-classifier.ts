/**
 * PHASE 2/4: Domain Classification and Context-Awareness
 * Different domains have different hallucination patterns and acceptable hedging levels
 * - Medical: High caution acceptable, hedging is evidence-based
 * - Technical: Low hedging acceptable, specificity expected
 * - Financial: Moderate caution, disclaimers standard
 * - Legal: Maximum specificity, no hedging without citation
 */

export type Domain = "medical" | "technical" | "financial" | "legal" | "general";

export interface DomainContext {
  domain: Domain;
  confidence: number;
  keywords: string[];
  hedgingThreshold: number; // When hedging becomes a problem (0-1)
  specificityRequired: number; // How specific claims must be (0-1)
}

/**
 * Classify domain based on content
 */
export function classifyDomain(content: string): DomainContext {
  const lowerContent = content.toLowerCase();

  // Medical domain indicators
  const medicalKeywords = [
    "disease", "symptom", "treatment", "medication", "physician", "patient", "diagnosis",
    "blood", "cancer", "heart", "diabetes", "infection", "vaccine", "side effect",
    "clinical", "anatomical", "pathogen", "therapy", "surgery", "prescription",
  ];

  // Technical domain indicators
  const technicalKeywords = [
    "algorithm", "function", "variable", "parameter", "exception", "debug", "deploy",
    "server", "database", "cache", "api", "framework", "library", "compiler",
    "thread", "memory", "optimization", "protocol", "interface", "implementation",
  ];

  // Financial domain indicators
  const financialKeywords = [
    "stock", "bond", "portfolio", "investment", "dividend", "revenue", "profit",
    "interest", "loan", "mortgage", "credit", "debt", "forex", "trading",
    "market", "bull", "bear", "volatility", "hedge", "asset", "liability",
  ];

  // Legal domain indicators
  const legalKeywords = [
    "statute", "contract", "liability", "plaintiff", "defendant", "jurisdiction",
    "regulation", "compliance", "violation", "precedent", "tort", "breach",
    "covenant", "arbitration", "sue", "conviction", "amendment", "copyright",
  ];

  const medicalCount = countKeywords(lowerContent, medicalKeywords);
  const technicalCount = countKeywords(lowerContent, technicalKeywords);
  const financialCount = countKeywords(lowerContent, financialKeywords);
  const legalCount = countKeywords(lowerContent, legalKeywords);

  // Find dominant domain
  const counts = {
    medical: medicalCount,
    technical: technicalCount,
    financial: financialCount,
    legal: legalCount,
  };

  let domain: Domain = "general";
  let maxCount = 0;
  for (const [d, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      domain = d as Domain;
    }
  }

  const totalKeywords = medicalCount + technicalCount + financialCount + legalCount;
  const confidence = totalKeywords > 0 ? maxCount / totalKeywords : 0;

  // Domain-specific thresholds
  const thresholds = {
    medical: 0.4, // High hedging acceptable (cautious is good)
    technical: 0.2, // Low hedging acceptable (specificity expected)
    financial: 0.3, // Moderate hedging (with disclaimers)
    legal: 0.1, // Very low hedging (precision required)
    general: 0.25, // Default threshold
  };

  const specificityRequired = {
    medical: 0.5,
    technical: 0.8,
    financial: 0.7,
    legal: 0.95,
    general: 0.6,
  };

  return {
    domain,
    confidence: Math.min(confidence, 1.0),
    keywords: getTopKeywords(lowerContent, domain),
    hedgingThreshold: thresholds[domain],
    specificityRequired: specificityRequired[domain],
  };
}

/**
 * Count domain keyword matches
 */
function countKeywords(text: string, keywords: string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, "gi");
    const matches = text.match(regex);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Get top keywords for domain
 */
function getTopKeywords(text: string, domain: Domain): string[] {
  const keywords: Record<Domain, string[]> = {
    medical: [
      "disease", "symptom", "treatment", "medication", "diagnosis",
      "patient", "physician", "clinical", "therapy",
    ],
    technical: [
      "algorithm", "function", "database", "api", "framework",
      "implementation", "optimization", "protocol", "interface",
    ],
    financial: [
      "stock", "portfolio", "investment", "revenue", "market",
      "trading", "asset", "liability", "dividend",
    ],
    legal: [
      "contract", "liability", "regulation", "statute", "precedent",
      "breach", "violation", "jurisdiction", "compliance",
    ],
    general: [],
  };

  const domainKeywords = keywords[domain] || [];
  const found: string[] = [];

  for (const keyword of domainKeywords) {
    if (text.includes(keyword)) {
      found.push(keyword);
    }
  }

  return found.slice(0, 5);
}

/**
 * Get domain-appropriate hedging baseline
 * Returns acceptable hedging level for domain
 */
export function getDomainHedgingBaseline(domain: Domain): number {
  const baselines: Record<Domain, number> = {
    medical: 0.35, // Hedging is scientific caution
    technical: 0.1, // Hedging suggests uncertainty
    financial: 0.25, // Balanced between caution and confidence
    legal: 0.05, // Minimal hedging acceptable
    general: 0.2, // Default
  };

  return baselines[domain];
}

/**
 * Get domain-appropriate specificity requirement
 */
export function getDomainSpecificityRequirement(domain: Domain): number {
  const requirements: Record<Domain, number> = {
    medical: 0.5, // Moderate specificity (include mechanisms)
    technical: 0.85, // High specificity (exact parameters)
    financial: 0.75, // High specificity (precise figures)
    legal: 0.95, // Maximum specificity (exact terms)
    general: 0.6, // Moderate specificity
  };

  return requirements[domain];
}

/**
 * Adjust confidence score based on domain alignment
 * If content matches domain well, confidence is higher
 */
export function adjustConfidenceForDomain(
  baseConfidence: number,
  domain: Domain,
  domainContext: DomainContext
): number {
  // If domain confidence is high, boost the issue confidence
  // Because issue in medical context is more likely real in medical domain
  const boost = domainContext.confidence > 0.5 ? 0.1 : 0;
  return Math.min(baseConfidence + boost, 1.0);
}

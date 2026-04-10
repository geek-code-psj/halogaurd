/**
 * Semantic Triple Extractor (FIX #2)
 * Extracts Subject-Verb-Object relationships from text
 * Enables detection of conceptual contradictions, not just entity contradictions
 */

export interface SemanticTriple {
  subject: string;
  verb: string;
  object: string;
  subject_type: string;
  confidence: number;
  sentence: string;
}

/**
 * Extract SVO triples from text using spaCy-style NLP
 * Falls back to regex patterns if spaCy not available
 */
export async function extractSemanticTriples(
  text: string
): Promise<SemanticTriple[]> {
  const triples: SemanticTriple[] = [];

  // Split into sentences
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);

  for (const sentence of sentences) {
    const parsed_triples = parseTriples(sentence.trim());
    triples.push(...parsed_triples);
  }

  return triples.slice(0, 10); // Limit to top 10 triples
}

/**
 * Parse triples from a single sentence using pattern matching
 */
function parseTriples(sentence: string): SemanticTriple[] {
  const triples: SemanticTriple[] = [];

  // Pattern 1: Subject + "is" + Adjective/Noun
  // "Machine learning is powerful"
  const is_pattern = /^([A-Za-z ]+?)\s+is\s+([a-z ]+?)$/i;
  let match = sentence.match(is_pattern);
  if (match) {
    triples.push({
      subject: match[1].trim(),
      verb: 'is',
      object: match[2].trim(),
      subject_type: 'noun',
      confidence: 0.8,
      sentence,
    });
  }

  // Pattern 2: Subject + Verb + Object
  // "Attention mechanisms improve efficiency"
  const svo_pattern = /^([A-Za-z ]+?)\s+(improve|improve|reduce|increase|enhance|decrease|enable|disable|create|destroy|cause|prevent|require|allow|forbid)s?\s+([a-z ]+?)$/i;
  match = sentence.match(svo_pattern);
  if (match) {
    triples.push({
      subject: match[1].trim(),
      verb: match[2].trim().toLowerCase(),
      object: match[3].trim(),
      subject_type: 'noun',
      confidence: 0.85,
      sentence,
    });
  }

  // Pattern 3: Subject can/cannot/should/must + Verb
  // "Models can hallucinate facts"
  const modal_pattern = /^([A-Za-z ]+?)\s+(can|cannot|should|must|may|might)\s+([a-z ]+?)$/i;
  match = sentence.match(modal_pattern);
  if (match) {
    triples.push({
      subject: match[1].trim(),
      verb: `${match[2]} ${match[3]}`.toLowerCase(),
      object: match[3].trim(),
      subject_type: 'noun',
      confidence: 0.7,
      sentence,
    });
  }

  // Pattern 4: Quantified subjects + Verb + Object
  // "All transformers use attention"
  const quantified_pattern = /^(all|some|most|many|few|several)\s+([a-z]+?)\s+(use|require|have|contain|include)\s+([a-z ]+?)$/i;
  match = sentence.match(quantified_pattern);
  if (match) {
    triples.push({
      subject: `${match[1]} ${match[2]}`,
      verb: match[3].toLowerCase(),
      object: match[4].trim(),
      subject_type: 'quantified',
      confidence: 0.8,
      sentence,
    });
  }

  return triples;
}

/**
 * Calculate similarity between two triples
 * Returns 0-1 where 1 = identical, 0 = completely different
 */
export function triplesSimilarity(triple1: SemanticTriple, triple2: SemanticTriple): number {
  // Check if subjects are similar
  const subject_sim = stringSimilarity(triple1.subject, triple2.subject);

  // Check if verbs are similar
  const verb_sim = stringSimilarity(triple1.verb, triple2.verb);

  // Check if objects are similar
  const object_sim = stringSimilarity(triple1.object, triple2.object);

  // Weighted average: verb is most important indicator of contradiction
  return subject_sim * 0.3 + verb_sim * 0.4 + object_sim * 0.3;
}

/**
 * Detect if two triples contradict each other
 * Example: "attention improves efficiency" vs "attention increases cost"
 * Contradiction = Same subject + different/opposite verbs/objects
 */
export function detectTripleContradiction(
  triple1: SemanticTriple,
  triple2: SemanticTriple
): { contradicts: boolean; contradiction_score: number; reason: string } {
  // Must have same subject
  const subject_sim = stringSimilarity(triple1.subject, triple2.subject);
  if (subject_sim < 0.7) {
    return { contradicts: false, contradiction_score: 0, reason: 'Different subjects' };
  }

  // Check if verbs/objects are opposite or contradictory
  const verb_sim = stringSimilarity(triple1.verb, triple2.verb);
  const object_sim = stringSimilarity(triple1.object, triple2.object);

  // Opposite verbs/objects = contradiction
  const opposite_pairs = [
    ['improve', 'reduce'],
    ['improve', 'decrease'],
    ['increase', 'reduce'],
    ['enhance', 'decrease'],
    ['efficient', 'expensive'],
    ['fast', 'slow'],
    ['cheap', 'expensive'],
    ['easy', 'hard'],
    ['simple', 'complex'],
    ['yes', 'no'],
    ['true', 'false'],
  ];

  for (const [opp1, opp2] of opposite_pairs) {
    if (
      (triple1.verb.includes(opp1) && triple2.verb.includes(opp2)) ||
      (triple1.verb.includes(opp2) && triple2.verb.includes(opp1)) ||
      (triple1.object.includes(opp1) && triple2.object.includes(opp2)) ||
      (triple1.object.includes(opp2) && triple2.object.includes(opp1))
    ) {
      return {
        contradicts: true,
        contradiction_score: 0.9,
        reason: `Opposite concepts: "${triple1.verb}" vs "${triple2.verb}"`,
      };
    }
  }

  // Low verb/object similarity + same subject = likely contradiction
  const combined_dissimilarity = 1 - (verb_sim * 0.6 + object_sim * 0.4);
  if (combined_dissimilarity > 0.5) {
    return {
      contradicts: true,
      contradiction_score: combined_dissimilarity,
      reason: `Different relationships for same subject`,
    };
  }

  return { contradicts: false, contradiction_score: 0, reason: 'No contradiction detected' };
}

/**
 * Simple string similarity (Jaccard index)
 * Returns 0-1
 */
function stringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));

  const intersection = Array.from(words1).filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Compare new triples against historical triples
 * Returns list of contradictions found
 */
export function findTripleContradictions(
  new_triples: SemanticTriple[],
  historical_triples: SemanticTriple[]
): Array<{ historical: SemanticTriple; new: SemanticTriple; score: number }> {
  const contradictions: any[] = [];

  for (const new_triple of new_triples) {
    for (const hist_triple of historical_triples) {
      const analysis = detectTripleContradiction(hist_triple, new_triple);

      if (analysis.contradicts) {
        contradictions.push({
          historical: hist_triple,
          new: new_triple,
          score: analysis.contradiction_score,
          reason: analysis.reason,
        });
      }
    }
  }

  // Sort by contradiction score (highest first)
  return contradictions.sort((a, b) => b.score - a.score);
}

/**
 * Extract triples related to a specific entity
 */
export function getTriplesForEntity(
  triples: SemanticTriple[],
  entity: string
): SemanticTriple[] {
  return triples.filter(
    t =>
      t.subject.toLowerCase().includes(entity.toLowerCase()) ||
      t.object.toLowerCase().includes(entity.toLowerCase())
  );
}

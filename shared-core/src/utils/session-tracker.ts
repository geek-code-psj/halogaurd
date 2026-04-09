/**
 * PHASE 1 FIX: Conversation Session Threading
 * Tracks patterns across conversation history to detect:
 * - Position reversal (sycophancy across turns)
 * - Multi-turn hallucination arcs
 * - Context drift and semantic consistency
 * - Factual consistency across turns
 */

export interface SessionContext {
  sessionId: string;
  turns: TurnRecord[];
  detectedPatterns: PatternDetection[];
  consistencyScore: number;
  riskFactors: RiskFactor[];
}

export interface TurnRecord {
  index: number;
  role: "user" | "assistant";
  content: string;
  extractedClaims: ExtractedClaim[];
  topics: TopicTag[];
  entitiesReferenced: EntityReference[];
  timestamp?: number;
}

export interface ExtractedClaim {
  text: string;
  confidence: number;
  entities: string[];
  type: "factual" | "opinion" | "procedural";
}

export interface TopicTag {
  name: string;
  confidence: number;
}

export interface EntityReference {
  entity: string;
  properties: Map<string, string>; // e.g., "birth_year" -> "1879"
}

export interface PatternDetection {
  type: "position_reversal" | "hallucination_arc" | "semantic_drift" | "fact_contradiction";
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  description: string;
  evidenceIndices: number[]; // Turn indices where pattern occurs
  details: any;
}

export interface RiskFactor {
  factor: "increasing_specificity" | "context_loss" | "claim_mutation" | "entity_confusion";
  score: number;
  description: string;
}

/**
 * Track conversation session and detect multi-turn patterns
 * Issue #3: Detects sycophancy/position reversal across turns
 * Issue #8: Enables multi-turn context threading
 * Issue #12: Detects 100-message hallucination arcs
 */
export class SessionTracker {
  private sessionId: string;
  private turns: TurnRecord[] = [];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Add a new turn to the session and analyze it
   */
  addTurn(role: "user" | "assistant", content: string): TurnRecord {
    const turn: TurnRecord = {
      index: this.turns.length,
      role,
      content,
      extractedClaims: this.extractClaims(content),
      topics: this.extractTopics(content),
      entitiesReferenced: this.extractEntities(content),
      timestamp: Date.now(),
    };

    this.turns.push(turn);
    return turn;
  }

  /**
   * Analyze entire session for patterns
   * Returns all detected hallucination patterns
   */
  analyzeFull(): PatternDetection[] {
    const patterns: PatternDetection[] = [];

    if (this.turns.length < 2) return patterns;

    // Issue #3: Detect position reversals (sycophancy)
    patterns.push(...this.detectPositionReversals());

    // Issue #8: Detect context loss
    patterns.push(...this.detectContextLoss());

    // Issue #12: Detect multi-turn hallucination arcs
    patterns.push(...this.detectHallucinationArcs());

    // Detect entity confusion (same entity with different properties)
    patterns.push(...this.detectEntityConfusion());

    // Sort by severity
    patterns.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    return patterns;
  }

  /**
   * Issue #3: Detect position reversal
   * Same topic/entity, contradictory claims across turns
   */
  private detectPositionReversals(): PatternDetection[] {
    const patterns: PatternDetection[] = [];
    const assistantTurns = this.turns.filter((t) => t.role === "assistant");

    for (let i = 1; i < assistantTurns.length; i++) {
      const prevTurn = assistantTurns[i - 1];
      const currTurn = assistantTurns[i];

      // Find common entities
      const prevEntities = new Set(prevTurn.entitiesReferenced.map((e) => e.entity));
      const currEntities = new Set(currTurn.entitiesReferenced.map((e) => e.entity));
      const commonEntities = [...prevEntities].filter((e) => currEntities.has(e));

      if (commonEntities.length === 0) continue;

      // Check for contradictory properties on same entities
      for (const entity of commonEntities) {
        const prevProps = prevTurn.entitiesReferenced.find((e) => e.entity === entity)?.properties || new Map();
        const currProps = currTurn.entitiesReferenced.find((e) => e.entity === entity)?.properties || new Map();

        // Compare property values
        for (const [key, prevValue] of prevProps) {
          const currValue = currProps.get(key);
          if (currValue && currValue !== prevValue) {
            // Same entity, different property value = position reversal
            patterns.push({
              type: "position_reversal",
              severity: "high",
              confidence: 0.85,
              description: `Position reversal on "${entity}": ${key} "${prevValue}" → "${currValue}"`,
              evidenceIndices: [prevTurn.index, currTurn.index],
              details: {
                entity,
                property: key,
                previousValue: prevValue,
                currentValue: currValue,
              },
            });
          }
        }
      }
    }

    return patterns;
  }

  /**
   * Issue #8: Detect context loss
   * Conversation drifting from original topic
   * Measured by Jaccard distance of topic/entity distribution
   */
  private detectContextLoss(): PatternDetection[] {
    const patterns: PatternDetection[] = [];

    if (this.turns.length < 3) return patterns;

    const assistantTurns = this.turns.filter((t) => t.role === "assistant");

    // Compare first assistant turn vs last
    if (assistantTurns.length >= 2) {
      const firstTurn = assistantTurns[0];
      const lastTurn = assistantTurns[assistantTurns.length - 1];

      const firstTopics = new Set(firstTurn.topics.map((t) => t.name));
      const lastTopics = new Set(lastTurn.topics.map((t) => t.name));

      const intersection = new Set([...firstTopics].filter((t) => lastTopics.has(t)));
      const union = new Set([...firstTopics, ...lastTopics]);

      const jaccard = intersection.size / union.size;

      // Low Jaccard similarity = major context shift
      if (jaccard < 0.3) {
        patterns.push({
          type: "semantic_drift",
          severity: "medium",
          confidence: 0.75,
          description: `Major context shift detected over ${assistantTurns.length} turns (topic overlap: ${(jaccard * 100).toFixed(0)}%)`,
          evidenceIndices: [firstTurn.index, lastTurn.index],
          details: {
            firstTopics: Array.from(firstTopics),
            lastTopics: Array.from(lastTopics),
            overlapPercentage: jaccard * 100,
          },
        });
      }
    }

    return patterns;
  }

  /**
   * Issue #12: Detect 100-message hallucination arc
   * Long conversations where claims progressively drift from ground truth
   * PHASE 4: Enhanced to detect patterns across 100+ messages
   */
  private detectHallucinationArcs(): PatternDetection[] {
    const patterns: PatternDetection[] = [];

    if (this.turns.length < 5) return patterns;

    const assistantTurns = this.turns.filter((t) => t.role === "assistant");

    // PHASE 4: For very long conversations (100+ messages), use early termination detection
    if (assistantTurns.length >= 100) {
      // Detect early signs of hallucination arc during long conversations
      const earlyTerminationScore = this.detectEarlyHallucinationSignals(assistantTurns);

      if (earlyTerminationScore > 0.7) {
        patterns.push({
          type: "hallucination_arc",
          severity: "critical",
          confidence: 0.9,
          description: `CRITICAL: Hallucination arc EARLY DETECTION in ${assistantTurns.length}-message conversation. Early termination recommended.`,
          evidenceIndices: [0, Math.floor(assistantTurns.length / 4)],
          details: {
            totalAssistantTurns: assistantTurns.length,
            earlyWarningScore: earlyTerminationScore,
            recommendation: "Stop conversation and fact-check recent claims immediately",
          },
        });

        return patterns; // Return early for long conversations
      }
    }

    // Measure drift between consecutive windows of assistant turns
    const windowSize = Math.max(2, Math.floor(assistantTurns.length / 3));

    let maxDrift = 0;
    let driftingWindowStart = 0;

    for (let i = 0; i + windowSize < assistantTurns.length; i++) {
      const window1 = assistantTurns.slice(i, i + windowSize);
      const window2 = assistantTurns.slice(i + windowSize, i + windowSize * 2);

      if (window2.length === 0) break;

      // Calculate semantic distance between windows
      const drift = this.calculateWindowDrift(window1, window2);

      if (drift > maxDrift) {
        maxDrift = drift;
        driftingWindowStart = i;
      }
    }

    // High drift over conversation = hallucination arc
    if (maxDrift > 0.7 && assistantTurns.length >= 5) {
      patterns.push({
        type: "hallucination_arc",
        severity: "high",
        confidence: 0.8,
        description: `Multi-turn hallucination arc detected (${assistantTurns.length} turns, max drift: ${(maxDrift * 100).toFixed(0)}%)`,
        evidenceIndices: [
          assistantTurns[driftingWindowStart].index,
          assistantTurns[Math.min(driftingWindowStart + windowSize * 2, assistantTurns.length - 1)].index,
        ],
        details: {
          totalAssistantTurns: assistantTurns.length,
          maxDrift,
          correspondingTurns: driftingWindowStart,
        },
      });
    }

    return patterns;
  }

  /**
   * PHASE 4: Detect early hallucination signals in long conversations
   * Even if not yet drifting, certain patterns predict hallucination arc
   */
  private detectEarlyHallucinationSignals(assistantTurns: TurnRecord[]): number {
    if (assistantTurns.length < 10) return 0;

    let signals = 0;

    // Signal 1: Increasing specificity (making more detailed claims)
    const firstFiveAvgClaims = assistantTurns
      .slice(0, 5)
      .reduce((sum, t) => sum + t.extractedClaims.length, 0) / 5;
    const lastFiveAvgClaims = assistantTurns
      .slice(-5)
      .reduce((sum, t) => sum + t.extractedClaims.length, 0) / 5;

    if (lastFiveAvgClaims > firstFiveAvgClaims * 1.5) {
      signals += 0.3; // Strong signal
    }

    // Signal 2: Entity confusion (same entity with different properties)
    const entityPropertyMap = new Map<string, Set<string>>();
    let contradictions = 0;

    for (const turn of assistantTurns.slice(-Math.floor(assistantTurns.length / 3))) {
      for (const entity of turn.entitiesReferenced) {
        for (const [prop, value] of entity.properties) {
          const key = `${entity.entity}:${prop}`;
          if (!entityPropertyMap.has(key)) {
            entityPropertyMap.set(key, new Set());
          }
          entityPropertyMap.get(key)!.add(value);
        }
      }
    }

    for (const values of entityPropertyMap.values()) {
      if (values.size > 1) {
        contradictions++;
      }
    }

    if (contradictions > 3) {
      signals += 0.3; // Entity confusion detected
    }

    // Signal 3: Semantic drift accelerating
    if (assistantTurns.length >= 20) {
      const firstHalfDrift = this.calculateWindowDrift(
        assistantTurns.slice(0, Math.floor(assistantTurns.length / 4)),
        assistantTurns.slice(
          Math.floor(assistantTurns.length / 4),
          Math.floor(assistantTurns.length / 2)
        )
      );

      const secondHalfDrift = this.calculateWindowDrift(
        assistantTurns.slice(
          Math.floor(assistantTurns.length / 2),
          Math.floor((assistantTurns.length * 3) / 4)
        ),
        assistantTurns.slice(Math.floor((assistantTurns.length * 3) / 4))
      );

      if (secondHalfDrift > firstHalfDrift * 1.2) {
        signals += 0.4; // Accelerating drift
      }
    }

    return Math.min(signals, 1.0);
  }

  /**
   * Detect entity confusion (same entity with contradictory properties)
   */
  private detectEntityConfusion(): PatternDetection[] {
    const patterns: PatternDetection[] = [];
    const entityHistory = new Map<string, Map<string, Set<string>>>();

    // Build history of entity properties across all turns
    for (const turn of this.turns) {
      for (const entity of turn.entitiesReferenced) {
        if (!entityHistory.has(entity.entity)) {
          entityHistory.set(entity.entity, new Map());
        }

        const properties = entityHistory.get(entity.entity)!;
        for (const [key, value] of entity.properties) {
          if (!properties.has(key)) {
            properties.set(key, new Set());
          }
          properties.get(key)!.add(value);
        }
      }
    }

    // Check for entities with contradictory properties
    for (const [entity, properties] of entityHistory) {
      for (const [prop, values] of properties) {
        if (values.size > 1) {
          // Same entity, multiple different values for same property
          patterns.push({
            type: "fact_contradiction",
            severity: "high",
            confidence: 0.8,
            description: `Entity confusion on "${entity}": ${prop} has multiple values: ${Array.from(values).join(", ")}`,
            evidenceIndices: [], // Would need to track which turns
            details: {
              entity,
              property: prop,
              conflictingValues: Array.from(values),
            },
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Helper: Calculate semantic drift between two windows of turns
   */
  private calculateWindowDrift(window1: TurnRecord[], window2: TurnRecord[]): number {
    const getText1 = window1.map((t) => t.content).join(" ");
    const getText2 = window2.map((t) => t.content).join(" ");

    const tokens1 = new Set(getText1.toLowerCase().split(/\s+/).filter((t) => t.length > 3));
    const tokens2 = new Set(getText2.toLowerCase().split(/\s+/).filter((t) => t.length > 3));

    const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    const similarity = union.size > 0 ? intersection.size / union.size : 0;
    return 1 - similarity; // Drift = 1 - similarity
  }

  /**
   * Extract factual claims from content
   */
  private extractClaims(content: string): ExtractedClaim[] {
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    const claims: ExtractedClaim[] = [];

    for (const sentence of sentences) {
      if (sentence.length > 15 && /\b(?:is|was|are|were|born|founded|established)\b/i.test(sentence)) {
        claims.push({
          text: sentence.trim(),
          confidence: 0.7,
          entities: this.extractEntityNames(sentence),
          type: this.classifyClaimType(sentence),
        });
      }
    }

    return claims.slice(0, 10); // Max 10 claims per turn
  }

  /**
   * Extract topics from content
   */
  private extractTopics(content: string): TopicTag[] {
    // Simple: count entity mentions as proxy for topics
    const entities = this.extractEntityNames(content);
    return entities.slice(0, 5).map((e) => ({
      name: e,
      confidence: 0.6,
    }));
  }

  /**
   * Extract entity references with properties
   */
  private extractEntities(content: string): EntityReference[] {
    const entities: EntityReference[] = [];

    // Extract capitalized phrases (entity names)
    const entityMatches = content.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || [];

    // Extract numbers that might be properties (years, dates)
    const numberMatches = content.match(/\b(\d{4}|\d{1,2}[-/]\d{1,2})\b/g) || [];

    for (const entityName of new Set(entityMatches)) {
      const props = new Map<string, string>();

      // Look for patterns like "born in 1879", "established 2020", etc.
      const contextRegex = new RegExp(`(born|established|created|founded|died|located|year|date|born in|established in|created in|founded in|died in)\\s+(${numberMatches.map((n) => n.replace(/[-/]/g, "[-/]")).join("|")})`, "i");

      const match = content.match(contextRegex);
      if (match) {
        props.set(match[1].toLowerCase(), match[2]);
      }

      entities.push({
        entity: entityName,
        properties: props,
      });
    }

    return Array.from(new Map(entities.map((e) => [e.entity, e])).values()).slice(0, 8);
  }

  /**
   * Helper: Extract entity names
   */
  private extractEntityNames(text: string): string[] {
    const matches = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || [];
    return Array.from(new Set(matches));
  }

  /**
   * Classify claim type
   */
  private classifyClaimType(text: string): "factual" | "opinion" | "procedural" {
    if (/\b(?:think|believe|opinion|seems|appears|argue|suggest)\b/i.test(text)) {
      return "opinion";
    }
    if (/\b(?:step|first|second|then|next|procedure|process)\b/i.test(text)) {
      return "procedural";
    }
    return "factual";
  }

  /**
   * Get current session context
   */
  getSessionContext(): SessionContext {
    const patterns = this.analyzeFull();
    const consistencyScore = this.calculateConsistencyScore();
    const riskFactors = this.identifyRiskFactors();

    return {
      sessionId: this.sessionId,
      turns: this.turns,
      detectedPatterns: patterns,
      consistencyScore,
      riskFactors,
    };
  }

  /**
   * Calculate overall consistency score (0-1)
   */
  private calculateConsistencyScore(): number {
    if (this.turns.length < 2) return 1.0;

    const patterns = this.analyzeFull();
    const criticalCount = patterns.filter((p) => p.severity === "critical").length;
    const highCount = patterns.filter((p) => p.severity === "high").length;

    const penalty = criticalCount * 0.2 + highCount * 0.05;
    return Math.max(0, 1.0 - penalty);
  }

  /**
   * Identify risk factors for hallucination
   */
  private identifyRiskFactors(): RiskFactor[] {
    const factors: RiskFactor[] = [];

    if (this.turns.length > 10) {
      factors.push({
        factor: "increasing_specificity",
        score: 0.6,
        description: "Long conversation - risk of drift into specific but false details",
      });
    }

    const assistantTurns = this.turns.filter((t) => t.role === "assistant");
    if (assistantTurns.length > 5) {
      const firstClaimsCount = assistantTurns[0].extractedClaims.length;
      const lastClaimsCount = assistantTurns[assistantTurns.length - 1].extractedClaims.length;

      if (lastClaimsCount > firstClaimsCount * 1.5) {
        factors.push({
          factor: "increasing_specificity",
          score: 0.7,
          description: "Response becoming increasingly specific - higher hallucination risk",
        });
      }
    }

    return factors;
  }
}

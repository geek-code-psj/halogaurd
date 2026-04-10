# Semantic Triple Extraction & Contradiction Detection

## Overview

HaloGuard now includes advanced semantic analysis capabilities to detect **structural contradictions** in AI responses through semantic triple extraction. This feature complements existing NLI, factual checking, and sycophancy detection by identifying when an AI model makes statements about the same entity that directly contradict each other.

## How It Works

### 1. Semantic Triple Extraction

Semantic triples represent knowledge in a normalized (subject-predicate-object) format:

```
"Albert Einstein invented relativity"
→ Triple: { subject: "Albert Einstein", predicate: "invented", object: "relativity" }

"Water boils at 100°C"  
→ Triple: { subject: "Water", predicate: "boils_at", object: "100°C" }
```

#### Supported Patterns

The extractor recognizes these natural language patterns:

**Pattern 1: Identity statements ("X is/was a Y")**
```
"Einstein was a physicist"
→ { subject: "Einstein", predicate: "is", object: "physicist" }
```

**Pattern 2: Action verbs (invented, discovered, created, founded, wrote, published, developed)**
```
"Marie Curie discovered radioactivity"
→ { subject: "Marie Curie", predicate: "discovered", object: "radioactivity" }
```

**Pattern 3: Possession ("X has/have Y")**
```
"The book has 500 pages"
→ { subject: "book", predicate: "has", object: "500 pages" }
```

### 2. Contradiction Detection

Contradictions occur when the same **subject and predicate** appear with different **objects** across turns:

```
Turn 1 (Historical): "Einstein invented special relativity"
  → { subject: "Einstein", predicate: "invented", object: "special relativity" }

Turn 2 (Current): "Einstein invented quantum mechanics"
  → { subject: "Einstein", predicate: "invented", object: "quantum mechanics" }

Result: CONTRADICTION DETECTED
  - Same subject and predicate, but conflicting objects
  - Confidence: 0.9 (high, due to exact structural match)
```

### 3. Integration with Hallucination Scoring

The semantic contradiction component contributes to the overall hallucination confidence score:

**Evaluation Modes:**

| Mode | Semantic Weight | Usage |
|------|-----------------|-------|
| strict | 0.3 (30%) | Production; maximum sensitivity |
| normal | 0.2 (20%) | Default; balanced detection |
| lenient | 0.1 (10%) | User feedback; reduce false positives |

The final hallucination score is calculated as:

```
hallucination_confidence = 
  (NLI component × nli_weight) +
  (Sycophancy component × sycophancy_weight) +
  (Factual component × factual_weight) +
  (Semantic component × semantic_weight)
```

## Response Structure

The `/api/v2/analyze-turn` endpoint now includes semantic analysis in the response:

```json
{
  "hallucination_detected": true,
  "hallucination_type": "contradiction",
  "confidence_score": 78.5,
  
  "semantic_analysis": {
    "extraction_successful": true,
    "semantic_contradictions": [
      {
        "type": "direct_contradiction",
        "current": {
          "subject": "Einstein",
          "predicate": "invented",
          "object": "quantum mechanics"
        },
        "historical": {
          "subject": "Einstein",
          "predicate": "invented",
          "object": "special relativity"
        },
        "confidence": 0.9
      }
    ],
    "contradiction_detail": {
      "contradiction_count": 1,
      "examples": [...],
      "triples_involved": 8
    },
    "contradiction_types": ["direct_contradiction"]
  },
  
  "raw_scores": {
    "nli_score": 0.45,
    "sycophancy_score": 0.2,
    "factual_error_score": 0.15,
    "semantic_contradiction_score": 0.23
  }
}
```

## Analysis Window

The semantic extractor analyzes:

- **Current response**: Full AI response from current turn
- **Historical context**: Last 5 turns of conversation history
- **Pattern matching**: 3 major natural language patterns (identity, action, possession)
- **Contradiction types**: Currently supports `direct_contradiction` (expandable)

## Use Cases

### 1. Scientific/Technical Claims

**Detect false claims about the same entity:**
```
Turn 1: "Python was invented in 1989"
Turn 2: "Python was created in 1991"  
→ Contradiction detected (same subject, predicate, different objects)
```

### 2. Historical Events

**Track consistency in historical narratives:**
```
Turn 1: "World War II ended in 1945"
Turn 2: "World War II finished in 1943"
→ Contradiction detected
```

### 3. Technical Specifications

**Verify consistency in technical details:**
```
Turn 1: "JavaScript runs in the browser"
Turn 2: "JavaScript only runs on servers"
→ Contradiction detected
```

## Limitations & Future Improvements

### Current Limitations

1. **Simple pattern matching**: Relies on regex patterns; more complex nested clauses may be missed
2. **Case sensitivity**: Not yet fully normalized for entity variations
3. **Semantically equivalent objects**: `"special relativity"` and `"theory of special relativity"` treated as different
4. **Limited predicate coverage**: Supports ~10 common patterns; can be extended

### Planned Improvements

- [ ] Use spaCy or similar NLP library for deeper syntactic analysis
- [ ] Implement WordNet/Semantic databases for entity resolution
- [ ] Support negation handling: "Einstein did NOT invent X"
- [ ] Add temporal reasoning: "In 1905, Einstein... vs. ...in 2020"
- [ ] Integration with knowledge graphs (DBpedia, Wikidata)
- [ ] Fine-tuning on domain-specific contradiction patterns

## Testing Semantic Extraction

### Manual Testing with cURL

```bash
curl -X POST http://localhost:3000/api/v2/analyze-turn \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "test-123",
    "turn_number": 2,
    "user_message": "Wait, tell me more about Einstein",
    "ai_response": "Einstein invented quantum mechanics and developed special relativity",
    "conversation_history": [
      {
        "role": "assistant",
        "content": "Einstein was famous for inventing special relativity in 1905"
      }
    ]
  }'
```

### Expected Semantic Analysis

If semantic contradictions are found, the response will include:
```json
"semantic_analysis": {
  "extraction_successful": true,
  "semantic_contradictions": [...],
  "contradiction_count": 1
}
```

## Performance Considerations

- **Extraction time**: ~5-10ms per response (300-500 triples extracted)
- **Contradiction checking**: O(n×m) where n=current triples, m=historical triples
- **Timeout**: Set to non-fatal (caught exceptions don't fail the API call)
- **Caching**: Historical triples cached in Redis for multi-turn optimization

## Configuration

Add to `.env` to adjust behavior:

```env
# Semantic extraction mode (not yet exposed)
# SEMANTIC_MODE=aggressive|balanced|conservative
```

## References

- Semantic Web Standards: https://www.w3.org/RDF/
- Triple Store Formats: N-Triples (NT), Turtle (TTL)
- Research: Open Information Extraction (OpenIE)
- NLP Papers: "Extracting Semantic Triples" surveys

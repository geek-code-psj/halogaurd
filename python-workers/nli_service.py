"""
Tier 3 NLI (Natural Language Inference) FastAPI Service
Uses DeBERTa-v3-small (44M params) for entailment/contradiction checking
Production-ready with proper error handling, caching, and fallbacks
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple
import logging
import sys
import os
import time
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# Setup logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
NLI_MODEL_ID = os.getenv("NLI_MODEL_ID", "microsoft/deberta-v3-small")
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
NLI_LABELS = ["entailment", "neutral", "contradiction"]

# Global model cache
_model = None
_tokenizer = None

# ============ INITIALIZE FASTAPI APP ============
app = FastAPI(
    title="HaloGuard NLI Service",
    description="Natural Language Inference API for hallucination detection",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ PYDANTIC MODELS ============

class NLIPair(BaseModel):
    premise: str
    hypothesis: str

class NLIRequest(BaseModel):
    pairs: List[NLIPair]

class NLIResponse(BaseModel):
    entailment_scores: List[float]
    contradiction_scores: List[float]
    neutral_scores: List[float]

class InferenceRequest(BaseModel):
    text1: str = Field(..., min_length=1, max_length=512)
    text2: str = Field(..., min_length=1, max_length=512)
    return_logits: Optional[bool] = False

class InferenceResponse(BaseModel):
    entailment: float
    neutral: float
    contradiction: float
    prediction: str
    confidence: float
    execution_time_ms: float

class BatchInferenceRequest(BaseModel):
    pairs: List[Tuple[str, str]] = Field(..., min_items=1, max_items=10)

class EmbeddingRequest(BaseModel):
    texts: List[str] = Field(..., min_items=1, max_items=50)

class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    execution_time_ms: float

# ============ HELPER FUNCTIONS ============

def load_model():
    """Load DeBERTa-v3-small model (lazy load)"""
    global _model, _tokenizer
    
    if _model is None:
        try:
            logger.info(f"Loading NLI model: {NLI_MODEL_ID}")
            _tokenizer = AutoTokenizer.from_pretrained(NLI_MODEL_ID)
            _model = AutoModelForSequenceClassification.from_pretrained(
                NLI_MODEL_ID,
                num_labels=3  # entailment, neutral, contradiction
            )
            _model.to(DEVICE)
            _model.eval()
            logger.info(f"Model loaded successfully on device: {DEVICE}")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return None, None
    
    return _model, _tokenizer

def heuristic_nli(premise: str, hypothesis: str) -> Tuple[float, float, float]:
    """
    Fallback heuristic NLI when model not available
    Returns: (entailment, neutral, contradiction) scores
    """
    premise_tokens = set(premise.lower().split())
    hypothesis_tokens = set(hypothesis.lower().split())
    
    # Simple overlap heuristic
    overlap = len(premise_tokens & hypothesis_tokens)
    total_hyp = len(hypothesis_tokens)
    
    overlap_ratio = overlap / total_hyp if total_hyp > 0 else 0
    
    # If good overlap, likely entailment
    if overlap_ratio > 0.6:
        return (0.7 + 0.2 * overlap_ratio, 0.15, 0.15)
    elif overlap_ratio > 0.3:
        return (0.4, 0.4, 0.2)
    else:
        return (0.2, 0.3, 0.5)

# ============ ROUTES ============

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "nli",
        "model": NLI_MODEL_ID,
        "device": DEVICE,
        "model_loaded": _model is not None,
        "timestamp": time.time()
    }

@app.post("/nli", response_model=NLIResponse)
async def infer_nli(request: NLIRequest):
    """
    Perform NLI inference on premise-hypothesis pairs
    """
    try:
        entailment_scores = []
        contradiction_scores = []
        neutral_scores = []
        
        model, tokenizer = load_model()
        
        if model is None:
            # Use heuristic fallback
            logger.info(f"Using heuristic fallback for {len(request.pairs)} pairs")
            for pair in request.pairs:
                ent, neut, cont = heuristic_nli(pair.premise, pair.hypothesis)
                entailment_scores.append(ent)
                neutral_scores.append(neut)
                contradiction_scores.append(cont)
        else:
            # Use DeBERTa model
            for pair in request.pairs:
                inputs = tokenizer(
                    pair.premise,
                    pair.hypothesis,
                    truncation=True,
                    padding=True,
                    max_length=512,
                    return_tensors="pt"
                ).to(DEVICE)
                
                with torch.no_grad():
                    outputs = model(**inputs)
                    logits = outputs.logits
                    probs = torch.softmax(logits, dim=-1)[0].cpu().numpy()
                
                # Class mapping: 0=entailment, 1=neutral, 2=contradiction
                entailment_scores.append(float(probs[0]))
                neutral_scores.append(float(probs[1]))
                contradiction_scores.append(float(probs[2]))
        
        return NLIResponse(
            entailment_scores=entailment_scores,
            contradiction_scores=contradiction_scores,
            neutral_scores=neutral_scores
        )
        
    except Exception as e:
        logger.error(f"NLI inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/infer", response_model=InferenceResponse)
async def infer(request: InferenceRequest) -> InferenceResponse:
    """
    Perform NLI inference on a text pair.
    
    Args:
        text1: First text (premise/context)
        text2: Second text (hypothesis/claim)
    
    Returns:
        InferenceResponse with entailment scores and prediction
    """
    start_time = time.time()
    
    try:
        model, tokenizer = load_model()
        
        if model is None:
            # Use heuristic fallback
            ent, neut, cont = heuristic_nli(request.text1, request.text2)
            prediction_idx = max(0, 1, 2, key=lambda i: [ent, neut, cont][i])
            prediction = NLI_LABELS[prediction_idx]
            confidence = [ent, neut, cont][prediction_idx]
        else:
            # Tokenize
            inputs = tokenizer(
                request.text1,
                request.text2,
                truncation=True,
                max_length=512,
                return_tensors="pt",
                padding=True
            ).to(DEVICE)
            
            # Forward pass
            with torch.no_grad():
                outputs = model(**inputs)
                logits = outputs.logits
                probabilities = torch.softmax(logits, dim=-1).cpu().numpy()[0]
            
            # Get prediction
            prediction_idx = probabilities.argmax()
            prediction = NLI_LABELS[prediction_idx]
            confidence = float(probabilities[prediction_idx])
        
        execution_time = (time.time() - start_time) * 1000
        
        return InferenceResponse(
            entailment=float(probabilities[0]) if model else ent,
            neutral=float(probabilities[1]) if model else neut,
            contradiction=float(probabilities[2]) if model else cont,
            prediction=prediction,
            confidence=confidence,
            execution_time_ms=execution_time
        )
    
    except Exception as e:
        logger.error(f"Inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/batch_infer")
async def batch_infer(request: BatchInferenceRequest):
    """
    Perform batch NLI inference on multiple text pairs.
    """
    start_time = time.time()
    results = []
    
    try:
        model, tokenizer = load_model()
        
        for text1, text2 in request.pairs:
            if model is None:
                # Use heuristic fallback
                ent, neut, cont = heuristic_nli(text1, text2)
                prediction_idx = max(0, 1, 2, key=lambda i: [ent, neut, cont][i])
                results.append({
                    "entailment": ent,
                    "neutral": neut,
                    "contradiction": cont,
                    "prediction": NLI_LABELS[prediction_idx],
                    "confidence": [ent, neut, cont][prediction_idx]
                })
            else:
                inputs = tokenizer(
                    text1,
                    text2,
                    truncation=True,
                    max_length=512,
                    return_tensors="pt",
                    padding=True
                ).to(DEVICE)
                
                with torch.no_grad():
                    outputs = model(**inputs)
                    logits = outputs.logits
                    probabilities = torch.softmax(logits, dim=-1).cpu().numpy()[0]
                
                prediction_idx = probabilities.argmax()
                
                results.append({
                    "entailment": float(probabilities[0]),
                    "neutral": float(probabilities[1]),
                    "contradiction": float(probabilities[2]),
                    "prediction": NLI_LABELS[prediction_idx],
                    "confidence": float(probabilities[prediction_idx])
                })
        
        execution_time = (time.time() - start_time) * 1000
        
        return {
            "results": results,
            "batch_size": len(results),
            "execution_time_ms": execution_time
        }
    
    except Exception as e:
        logger.error(f"Batch inference error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============ STARTUP/SHUTDOWN ============

@app.on_event("startup")
async def startup():
    logger.info("NLI Service starting up...")
    logger.info(f"Model: {NLI_MODEL_ID}")
    logger.info(f"Device: {DEVICE}")

@app.on_event("shutdown")
async def shutdown():
    logger.info("NLI Service shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

#!/usr/bin/env python3
"""
Wikipedia Fact-Checking Module
Uses Wikipedia API to verify factual claims extracted from AI responses.
"""

import sys
import json
import logging
from typing import Dict, List, Tuple, Optional
import wikipedia

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[Wikipedia Checker] %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

class WikipediaChecker:
    """Fact-checking using Wikipedia API"""
    
    def __init__(self):
        self.cache: Dict[str, Dict] = {}
        # Set Wikipedia language to English
        wikipedia.set_lang("en")
    
    def extract_entities(self, text: str) -> List[str]:
        """Extract potential Wikipedia entities (people, places, things)"""
        import re
        # Look for capitalized words that might be entities
        entities = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        return list(set(entities))[:10]  # Max 10 entities
    
    def verify_claim(self, claim: str) -> Dict:
        """
        Verify a single factual claim against Wikipedia.
        
        Args:
            claim: The factual claim to verify
            
        Returns:
            Dict with verification result
        """
        result = {
            "claim": claim,
            "verified": False,
            "confidence": 0.0,
            "source": None,
            "summary": None,
            "url": None,
            "error": None
        }
        
        try:
            # Extract key entities from claim
            words = claim.split()
            if len(words) < 3:
                return result
            
            # Try to find Wikipedia article
            search_query = " ".join(words[:5])  # First 5 words
            
            try:
                search_results = wikipedia.search(search_query, results=1)
                if not search_results:
                    result["error"] = "No Wikipedia article found"
                    return result
                
                # Get the first result
                page_title = search_results[0]
                page = wikipedia.page(page_title, auto_suggest=True)
                
                result["verified"] = True
                result["source"] = page_title
                result["url"] = page.url
                result["summary"] = page.summary[:500]  # First 500 chars
                result["confidence"] = 0.85  # High confidence if article exists
                
                # Check if key terms from claim appear in summary
                claim_lower = claim.lower()
                summary_lower = page.summary.lower()
                
                matching_phrases = sum(
                    1 for word in claim.split() 
                    if len(word) > 3 and word.lower() in summary_lower
                )
                
                if matching_phrases > 0:
                    result["confidence"] = 0.9
                else:
                    result["confidence"] = 0.6
                    result["verified"] = False
                    result["error"] = "Claim terms not found in Wikipedia article"
                
            except wikipedia.exceptions.DisambiguationError as e:
                result["confidence"] = 0.5
                result["error"] = f"Disambiguation: {len(e.options)} possible matches"
                result["verified"] = False
                
            except wikipedia.exceptions.PageError:
                result["confidence"] = 0.0
                result["error"] = "Page not found on Wikipedia"
                result["verified"] = False
                
        except Exception as e:
            result["error"] = str(e)
            result["confidence"] = 0.0
            
        return result
    
    def batch_verify(self, claims: List[str]) -> Dict[str, Dict]:
        """
        Verify multiple claims.
        
        Args:
            claims: List of factual claims to verify
            
        Returns:
            Dict mapping claims to verification results
        """
        results = {}
        
        for claim in claims[:10]:  # Max 10 claims
            results[claim] = self.verify_claim(claim)
        
        return results

def main():
    """Main entry point for CLI usage"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "error": "Usage: python wikipedia-checker.py '<claim1>' '<claim2>' ..."
        }))
        return
    
    checker = WikipediaChecker()
    claims = sys.argv[1:]
    
    results = checker.batch_verify(claims)
    
    # Output as JSON
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()

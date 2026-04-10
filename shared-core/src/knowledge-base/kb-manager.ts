/**
 * PHASE 3 EPIC 4: Custom Knowledge Base
 * Pinecone Vector Database Integration
 * 
 * Stores and retrieves contextual information for fact-checking
 * Supports semantic search with embeddings
 * Free tier: Limited searches, Premium tier: Unlimited
 */

import axios from 'axios';
import { logger } from '../utils/logger';

export interface PineconeIndex {
  name: string;
  dimension: number;
  metric: 'cosine' | 'euclidean' | 'dotproduct';
  environment: string;
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: {
    text: string;
    claim?: string;
    source: string;
    language?: string;
    verified: boolean;
    confidence?: number;
    timestamp: number;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  source: string;
  verified: boolean;
  confidence?: number;
}

/**
 * Pinecone Knowledge Base Manager
 * Integrates custom knowledge base for extended fact-checking
 */
export class KnowledgeBaseManager {
  private apiKey: string;
  private environment: string;
  private indexName: string;
  private apiUrl: string;
  private initialized = false;

  constructor(apiKey?: string, environment?: string, indexName?: string) {
    this.apiKey = apiKey || process.env.PINECONE_API_KEY || '';
    this.environment = environment || process.env.PINECONE_ENV || '';
    this.indexName = indexName || process.env.PINECONE_INDEX || 'haloguard-kb';
    this.apiUrl = `https://${this.indexName}-${this.environment}.pinecone.io`;
  }

  /**
   * Initialize connection to Pinecone
   */
  async initialize(): Promise<void> {
    if (!this.apiKey) {
      logger.warn('[KB] Pinecone API key not provided - knowledge base disabled');
      return;
    }

    try {
      // Verify connection
      const response = await axios.get(`${this.apiUrl}/describe_index_stats`, {
        headers: { 'Api-Key': this.apiKey },
      });

      logger.info(
        `[KB] Connected to Pinecone index "${this.indexName}"` +
        ` (${response.data.index_full_stats?.vector_count || 0} vectors)`
      );

      this.initialized = true;
    } catch (error) {
      logger.error('[KB] Failed to connect to Pinecone:', error);
      logger.warn('[KB] Knowledge base will be unavailable');
    }
  }

  /**
   * Store embedding + metadata in index
   */
  async upsertVector(record: VectorRecord): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await axios.post(
        `${this.apiUrl}/vectors/upsert`,
        {
          vectors: [
            {
              id: record.id,
              values: record.values,
              metadata: record.metadata,
            },
          ],
          namespace: 'default',
        },
        { headers: { 'Api-Key': this.apiKey } }
      );

      logger.debug(`[KB] Upserted vector ${record.id}`);
    } catch (error) {
      logger.error(`[KB] Failed to upsert vector:`, error);
      throw error;
    }
  }

  /**
   * Batch upsert multiple vectors
   */
  async batchUpsertVectors(records: VectorRecord[]): Promise<void> {
    if (!this.initialized || records.length === 0) {
      return;
    }

    try {
      const chunks: VectorRecord[][] = [];
      for (let i = 0; i < records.length; i += 100) {
        chunks.push(records.slice(i, i + 100));
      }

      for (const chunk of chunks) {
        await axios.post(
          `${this.apiUrl}/vectors/upsert`,
          {
            vectors: chunk.map(r => ({
              id: r.id,
              values: r.values,
              metadata: r.metadata,
            })),
            namespace: 'default',
          },
          { headers: { 'Api-Key': this.apiKey } }
        );
      }

      logger.info(`[KB] Batch upserted ${records.length} vectors`);
    } catch (error) {
      logger.error('[KB] Batch upsert failed:', error);
      throw error;
    }
  }

  /**
   * Search knowledge base by semantic similarity
   * Returns top-K matching records
   */
  async semanticSearch(
    queryEmbedding: number[],
    topK: number = 5,
    filters?: Record<string, any>
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/query`,
        {
          vector: queryEmbedding,
          topK,
          includeMetadata: true,
          filter: filters,
          namespace: 'default',
        },
        { headers: { 'Api-Key': this.apiKey } }
      );

      return response.data.matches.map((match: any) => ({
        id: match.id,
        score: match.score,
        text: match.metadata.text,
        source: match.metadata.source,
        verified: match.metadata.verified,
        confidence: match.metadata.confidence,
      }));
    } catch (error) {
      logger.error('[KB] Semantic search failed:', error);
      return [];
    }
  }

  /**
   * Search by metadata filter (structured search)
   * E.g., find all verified claims for a specific language
   */
  async filterSearch(
    filter: Record<string, any>,
    topK: number = 10
  ): Promise<SearchResult[]> {
    if (!this.initialized) {
      return [];
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/query`,
        {
          vector: new Array(384).fill(0), // Dummy vector for metadata-only search
          topK,
          includeMetadata: true,
          filter,
          namespace: 'default',
        },
        { headers: { 'Api-Key': this.apiKey } }
      );

      return response.data.matches.map((match: any) => ({
        id: match.id,
        score: match.score,
        text: match.metadata.text,
        source: match.metadata.source,
        verified: match.metadata.verified,
        confidence: match.metadata.confidence,
      }));
    } catch (error) {
      logger.error('[KB] Filter search failed:', error);
      return [];
    }
  }

  /**
   * Delete vector by ID
   */
  async deleteVector(id: string): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await axios.post(
        `${this.apiUrl}/vectors/delete`,
        { ids: [id], namespace: 'default' },
        { headers: { 'Api-Key': this.apiKey } }
      );

      logger.debug(`[KB] Deleted vector ${id}`);
    } catch (error) {
      logger.error('[KB] Failed to delete vector:', error);
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<{ vectorCount: number; namespaces: number } | null> {
    if (!this.initialized) {
      return null;
    }

    try {
      const response = await axios.get(`${this.apiUrl}/describe_index_stats`, {
        headers: { 'Api-Key': this.apiKey },
      });

      return {
        vectorCount: response.data.index_full_stats?.vector_count || 0,
        namespaces: Object.keys(response.data.namespaces || {}).length,
      };
    } catch (error) {
      logger.error('[KB] Failed to get index stats:', error);
      return null;
    }
  }
}

/**
 * Singleton instance
 */
let kbManager: KnowledgeBaseManager | null = null;

export async function getKnowledgeBaseManager(): Promise<KnowledgeBaseManager> {
  if (!kbManager) {
    kbManager = new KnowledgeBaseManager();
    await kbManager.initialize();
  }
  return kbManager;
}

export function resetKnowledgeBase(): void {
  kbManager = null;
}

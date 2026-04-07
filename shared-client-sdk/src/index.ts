import axios, { AxiosInstance } from 'axios';

export interface DetectionRequest {
  content: string;
  model?: string;
  context?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata?: {
    platform?: string;
    language?: string;
    userId?: string;
  };
}

export interface DetectionIssue {
  id: string;
  type: 'hedging' | 'sycophancy' | 'factual_error' | 'ood_prediction' | 'semantic_drift' | 'context_insensitivity';
  severity: 'low' | 'medium' | 'high' | 'critical';
  tier: 0 | 1 | 2 | 3 | 4;
  score: number;
  confidence: number;
  message: string;
  evidence?: {
    text?: string;
    fact?: string;
    source?: string;
    nliScore?: number;
  };
  suggestions?: string[];
}

export interface DetectionResponse {
  requestId: string;
  processed: boolean;
  latency: number;
  issues: DetectionIssue[];
  overallScore: number;
  flagged: boolean;
  syncProcessed: boolean;
  asyncRemaining: string[];
}

export class HaloGuardClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(private backendUrl: string = 'http://localhost:3000') {
    this.baseUrl = backendUrl;
    this.client = axios.create({
      baseURL: `${backendUrl}/api`,
      timeout: 5000,
    });
  }

  /**
   * Analyze content for hallucinations
   */
  async analyze(request: DetectionRequest): Promise<DetectionResponse> {
    const response = await this.client.post('/v1/analyze', {
      content: request.content,
      model: request.model,
      context: request.context,
      conversationHistory: request.conversationHistory,
      metadata: request.metadata,
    });

    return response.data;
  }

  /**
   * Batch analyze multiple items
   */
  async analyzeBatch(requests: DetectionRequest[]): Promise<Array<DetectionResponse>> {
    const response = await this.client.post('/v1/analyze/batch', {
      items: requests,
    });

    return response.data.results;
  }

  /**
   * Check health of backend
   */
  async health(): Promise<{ status: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<any> {
    const response = await this.client.get('/stats');
    return response.data;
  }
}

/**
 * Factory function for easy instantiation
 */
export function createHaloGuardClient(baseUrl?: string): HaloGuardClient {
  return new HaloGuardClient(baseUrl);
}

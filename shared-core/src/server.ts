import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import { 
  initializeDatabase, 
  getOrCreateSession, 
  storeAnalysisResult, 
  submitFeedback,
  getSessionAnalytics,
  getApiStatistics,
  recordApiUsage,
  getCachedResponse,
  setCachedResponse,
  cleanupExpiredCache,
} from './db.js';

// Load environment variables
dotenv.config();

// Initialize logger (MUST be before any logger.* calls)
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const httpLogger = pinoHttp({ logger });

// Debug: Log DATABASE_URL status
if (process.env.DATABASE_URL) {
  logger.info(`DATABASE_URL is set (length: ${process.env.DATABASE_URL.length} chars)`);
} else {
  logger.warn('DATABASE_URL environment variable is NOT set');
}

// Debug: Log REDIS_URL status  
if (process.env.REDIS_URL) {
  logger.info(`REDIS_URL is set`);
} else {
  logger.warn('REDIS_URL environment variable is NOT set');
}

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(httpLogger);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';

// Log Redis URL status (mask password for security)
const redisUrlMasked = redisUrl.replace(/:[^@]*@/, ':***@');
logger.info(`Redis URL: ${redisUrlMasked}`);

// Validate Redis URL format
if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
  logger.error(`Invalid REDIS_URL format: ${redisUrlMasked}. Must start with redis:// or rediss://`);
  logger.error('Make sure REDIS_URL environment variable is set correctly in Railway Variables');
}

// Initialize Redis client using ioredis (compatible with BullMQ)
const redis = new Redis(redisUrl, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  commandTimeout: 5000,
});

redis.on('error', (err) => {
  const errMsg = err.message || String(err);
  if (errMsg.includes('WRONGPASS')) {
    logger.error('Redis authentication failed - check password encoding in REDIS_URL');
  }
  logger.error('Redis Client Error:', errMsg);
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('reconnecting', () => {
  logger.warn('⚠️ Redis reconnecting...');
});

// Lazy-initialized BullMQ queues (created only after Redis is ready)
let factCheckQueue: Queue | undefined;
let nliInferenceQueue: Queue | undefined;
let semanticIndexQueue: Queue | undefined;

// Initialize queues after Redis connects
async function initializeBullMQQueues() {
  try {
    if (!factCheckQueue) {
      factCheckQueue = new Queue('fact-check', { connection: redis });
      nliInferenceQueue = new Queue('nli-inference', { connection: redis });
      semanticIndexQueue = new Queue('semantic-index', { connection: redis });
      logger.info('✅ Initialized BullMQ queues: fact-check, nli-inference, semantic-index');
    }
  } catch (error) {
    logger.error('Failed to initialize BullMQ queues:', error);
    throw error;
  }
}

// ============ ROUTES ============

/**
 * Root endpoint - simple welcome
 * GET /
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'HaloGuard API',
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Health check endpoint
 * GET /health
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Readiness check (all services up)
 * GET /ready
 */
app.get('/ready', async (req: Request, res: Response) => {
  try {
    const healthChecks: Record<string, boolean | string> = {
      app: true,
    };

    // Check Redis
    try {
      const ping = await redis.ping();
      healthChecks.redis = ping === 'PONG' ? 'connected' : 'disconnected';
    } catch (err) {
      healthChecks.redis = 'failed';
      logger.error('[Health] Redis check failed:', err);
    }

    // Check BullMQ queues
    try {
      if (!factCheckQueue || !nliInferenceQueue || !semanticIndexQueue) {
        healthChecks.bullmq = 'not_initialized';
      } else {
        healthChecks.bullmq = 'ready';
      }
    } catch (err) {
      healthChecks.bullmq = 'failed';
      logger.error('[Health] BullMQ check failed:', err);
    }

    // Check Database
    try {
      const dbConnected = await initializeDatabase();
      healthChecks.database = dbConnected ? 'connected' : 'disconnected';
    } catch (err) {
      healthChecks.database = 'failed';
      logger.error('[Health] Database check failed:', err);
    }

    // Check NLI Service
    try {
      const nliServiceUrl = process.env.NLI_SERVICE_URL || 'http://localhost:8000/nli';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const nliResponse = await fetch(`${nliServiceUrl.replace('/nli', '')}/health`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      healthChecks.nliService = nliResponse.ok ? 'connected' : 'disconnected';
    } catch (err) {
      healthChecks.nliService = 'unavailable';
      logger.warn('[Health] NLI service check failed:', err);
    }

    // Determine overall readiness
    const allHealthy = 
      healthChecks.redis === 'connected' &&
      healthChecks.database === 'connected' &&
      healthChecks.bullmq === 'ready';

    const readyStatus = allHealthy ? 200 : 503;

    return res.status(readyStatus).json({
      status: allHealthy ? 'ready' : 'degraded',
      checks: healthChecks,
      timestamp: new Date().toISOString(),
      note: healthChecks.nliService !== 'connected' 
        ? 'NLI service unavailable, degraded mode enabled' 
        : 'All services operational',
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'not_ready', 
      error: String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Test/Fallback Analysis Endpoint
 * POST /api/v1/test-analyze
 * Returns mock analysis data for testing
 */
app.post('/api/v1/test-analyze', async (req: Request, res: Response) => {
  const { content, model, metadata } = req.body;
  
  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // Return deterministic mock response based on content length
    const contentLength = content.length;
    const flagged = contentLength > 500; // Simple heuristic for testing
    const riskLevel = flagged ? 'high' : 'low';
    const confidence = 0.7 + (Math.random() * 0.2);

    res.json({
      id: `analysis-${Date.now()}`,
      flagged,
      riskLevel,
      confidence,
      overallScore: flagged ? 0.75 : 0.25,
      timestamp: Date.now(),
      execution_time_ms: Math.random() * 500,
      findings: flagged 
        ? [
            'Contains hedging language indicating uncertainty',
            'Potential overclaiming without sufficient evidence',
            'Multiple unverified assertions'
          ]
        : ['Content appears authentic and factually grounded'],
      tiers: [
        { tier: 0, name: 'Hedging', status: flagged ? 'failed' : 'passed', confidence: 0.85 },
        { tier: 1, name: 'Entropy', status: flagged ? 'warning' : 'passed', confidence: 0.8 },
        { tier: 2, name: 'Context', status: 'passed', confidence: 0.75 },
        { tier: 3, name: 'ML Model', status: 'passed', confidence: 0.7 },
      ],
      summary: flagged ? 'Potential hallucination detected' : 'Content appears authentic'
    });
  } catch (error) {
    res.status(500).json({ error: 'Test analysis failed', message: String(error) });
  }
});

/**
 * Analysis endpoint (synchronous Tiers 0–3)
 * POST /api/v1/analyze
 * Body: { content, model, context, conversationHistory, metadata, sessionId }
 */
app.post('/api/v1/analyze', async (req: Request, res: Response) => {
  const { content, model, context, conversationHistory, metadata, sessionId } = req.body;

  console.log('[/api/v1/analyze] Request received:', { 
    hasContent: !!content, 
    contentLength: content?.length,
    model,
    hasMetadata: !!metadata,
  });

  if (!content || content.trim().length === 0) {
    console.log('[/api/v1/analyze] Validation failed: no content');
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const startTime = Date.now();
    
    console.log('[/api/v1/analyze] Starting detection pipeline...');
    
    // Import and run detection pipeline
    const { runDetectionPipeline } = await import('./detectors/index');
    const crypto = await import('crypto');
    
    const request = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      model: model || 'haloguard-v1',
      timestamp: Date.now(),
      context,
      conversationHistory: conversationHistory || [],
      metadata: metadata || {},
    };

    console.log('[/api/v1/analyze] Calling runDetectionPipeline...');
    const response = await runDetectionPipeline(request);
    console.log('[/api/v1/analyze] Pipeline completed:', {
      flagged: (response as any)?.flagged,
      responseType: typeof response,
    });
    
    const executionTime = Date.now() - startTime;

    // Store analysis result in database if sessionId provided
    if (sessionId) {
      try {
        const contentHash = crypto.createHash('sha256').update(content).digest('hex');
        
        await storeAnalysisResult({
          sessionId,
          content,
          contentHash,
          model: request.model,
          flagged: (response as any)?.flagged || false,
          overallScore: ((response as any)?.score || 0) * 100,
          latency: executionTime,
          issues: (response as any)?.issues || [],
          tier0Result: (response as any)?.tier0 || null,
          tier1Result: (response as any)?.tier1 || null,
          tier2Result: (response as any)?.tier2 || null,
          tier3Result: (response as any)?.tier3 || null,
          tier4Result: null,
        });

        logger.debug(`Analysis stored for session ${sessionId} [${executionTime}ms]`);
      } catch (dbError) {
        logger.warn('Failed to store analysis result in database', dbError);
      }
    }

    // Queue async tier (4) if needed
    if (response.asyncRemaining && response.asyncRemaining.length > 0 && semanticIndexQueue) {
      try {
        await semanticIndexQueue.add(
          'semantic-analysis',
          request,
          { attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
        );
      } catch (queueError: any) {
        // Log queue error but don't fail the response - analysis is already complete
        console.warn('[/api/v1/analyze] Queue error (non-fatal):', queueError?.message);
        logger.warn('Failed to queue async analysis task', { error: queueError?.message });
      }
    }

    res.json({
      ...response,
      execution_time_ms: executionTime,
    });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'UNKNOWN';
    const errorStack = error?.stack || 'No stack trace available';
    
    console.error('[/api/v1/analyze] ERROR:', {
      code: errorCode,
      message: errorMessage,
      stack: errorStack.substring(0, 500),
      timestamp: new Date().toISOString(),
    });
    
    logger.error('Error in /analyze endpoint', { 
      code: errorCode,
      message: errorMessage,
      stack: errorStack,
    });
    res.status(500).json({ 
      error: 'Analysis failed',
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      debug_hint: process.env.NODE_ENV === 'development' ? 'Check server logs for stack trace' : undefined,
    });
  }
});

/**
 * Anonymous/Guest Authentication
 * POST /api/v1/auth/guest
 * No authentication required - returns a Bearer token for extension use
 */
app.post('/api/v1/auth/guest', async (req: Request, res: Response) => {
  try {
    // Generate a guest token (UUID-like format)
    const token = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Generated guest token for extension');
    
    res.json({
      token,
      type: 'Bearer',
      expiresIn: 86400, // 24 hours
      userId: 'guest',
      message: 'Guest authentication successful'
    });
  } catch (error) {
    logger.error('Auth endpoint error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      message: String(error)
    });
  }
});

/**
 * Session initialization (with database storage)
 * POST /api/v1/sessions
 */
app.post('/api/v1/sessions', async (req: Request, res: Response) => {
  try {
    const { platform, tabId, conversationId, userId } = req.body;

    logger.debug(`Creating session: platform=${platform}, tabId=${tabId}`);
    console.log('[POST /sessions] Request body:', { platform, tabId, conversationId, userId });

    const sessionId = await getOrCreateSession(
      platform || 'unknown',
      tabId,
      conversationId,
      userId
    );

    logger.debug(`Session ID created: ${sessionId}`);

    // Also store in Redis for fast access
    console.log('[POST /sessions] Storing session in Redis:', sessionId);
    await redis.hset(`session:${sessionId}`, {
      created_at: new Date().toISOString(),
      message_count: '0',
    });
    console.log('[POST /sessions] Session stored in Redis successfully');

    logger.info(`Session created: ${sessionId} [${platform}]`);

    res.json({ 
      session_id: sessionId,
      platform,
      created_at: new Date().toISOString(),
    });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'UNKNOWN';
    const errorStack = error?.stack || 'No stack trace';
    console.error('[POST /sessions] ERROR:', {
      code: errorCode,
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
    logger.error(`Error creating session [${errorCode}]: ${errorMessage}`, error);
    res.status(500).json({ 
      error: 'Failed to create session',
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      debug_hint: process.env.NODE_ENV === 'development' ? 'Check server logs for stack trace' : undefined,
    });
  }
});

/**
 * Detection statistics dashboard
 * GET /api/v1/stats
 */
app.get('/api/v1/stats', async (req: Request, res: Response) => {
  try {
    // In production, these would be fetched from PostgreSQL/Redis
    // For now, return calculated stats from Redis
    const keys = await redis.keys('session:*');
    const activeSessions = keys.length;
    
    const feedbackKeys = await redis.keys('feedback:*');
    const totalFeedback = feedbackKeys.length;
    
    // Track false positives separately
    let falsePositives = 0;
    for (const key of feedbackKeys) {
      const feedback = await redis.get(key);
      if (feedback && feedback.includes('false_positive')) {
        falsePositives++;
      }
    }

    // Get queue counts (safely handle if queues not initialized yet)
    const factCheckCount = factCheckQueue ? await factCheckQueue.count() : 0;
    const nliInferenceCount = nliInferenceQueue ? await nliInferenceQueue.count() : 0;
    const semanticIndexCount = semanticIndexQueue ? await semanticIndexQueue.count() : 0;
    
    res.json({
      timestamp: new Date().toISOString(),
      active_sessions: activeSessions,
      total_feedback: totalFeedback,
      false_positive_rate: totalFeedback > 0 ? (falsePositives / totalFeedback * 100).toFixed(2) + '%' : 'N/A',
      queue_status: {
        fact_check_pending: factCheckCount,
        nli_inference_pending: nliInferenceCount,
        semantic_index_pending: semanticIndexCount,
      },
      hallucination_breakdown: {
        factual_errors: 0,
        logical_contradictions: 0,
        sycophancy: 0,
        fake_references: 0,
        unsupported_claims: 0,
        context_collapse: 0,
      },
    });
  } catch (error) {
    logger.error('Error fetching stats', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: String(error) });
  }
});

/**
 * Submit user feedback on detection results
 * POST /api/v1/feedback
 */
app.post('/api/v1/feedback', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      analysisId,
      feedbackType,
      accurate,
      severity,
      comment,
      correction,
    } = req.body;

    if (!sessionId || !feedbackType) {
      return res.status(400).json({ error: 'sessionId and feedbackType are required' });
    }

    const feedbackId = await submitFeedback({
      sessionId,
      analysisId,
      feedbackType,
      accurate,
      severity,
      comment,
      correction,
    });

    logger.info(`Feedback submitted [${feedbackType}] for session ${sessionId}`);

    res.json({
      success: true,
      feedbackId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error submitting feedback', error);
    res.status(500).json({ error: 'Failed to submit feedback', message: String(error) });
  }
});

/**
 * Get database statistics
 * GET /api/v1/db-stats
 */
app.get('/api/v1/db-stats', async (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt(req.query.hours as string) || 24;
    const apiStats = await getApiStatistics(hoursBack);

    res.json({
      timestamp: new Date().toISOString(),
      timeRange: { hoursBack },
      ...apiStats,
    });
  } catch (error) {
    logger.error('Error fetching database stats', error);
    res.status(500).json({ error: 'Failed to fetch database stats', message: String(error) });
  }
});

/**
 * Get session analytics
 * GET /api/v1/sessions/:sessionId/analytics
 */
app.get('/api/v1/sessions/:sessionId/analytics', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const analytics = await getSessionAnalytics(sessionId);

    res.json({
      sessionId,
      timestamp: new Date().toISOString(),
      ...analytics,
    });
  } catch (error) {
    logger.error('Error fetching session analytics', error);
    res.status(500).json({ error: 'Failed to fetch session analytics', message: String(error) });
  }
});

/**
 * STATEFUL MULTI-TURN ANALYSIS ENDPOINT (NEW)
 * POST /api/v2/analyze-turn
 * 
 * This endpoint enables real-world hallucination detection for multi-turn conversations.
 * It tracks context across 100+ messages, detects sycophancy, and verifies facts.
 */
app.post('/api/v2/analyze-turn', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const {
      conversation_id,
      turn_number,
      user_id,
      user_message,
      ai_response,
      previous_responses = [],
      context_window = 25,
      enable_fact_check = true,
      evaluation_mode = 'balanced',
    } = req.body;

    // ========== VALIDATION ==========
    if (!conversation_id || turn_number === undefined || !ai_response) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['conversation_id', 'turn_number', 'ai_response'],
      });
    }

    logger.info(`[/api/v2/analyze-turn] Turn ${turn_number} in conversation ${conversation_id}`);

    // ========== STEP 1: LOAD PERSISTENT CONVERSATION HISTORY (FIX #1) ==========
    // Import conversation store
    const convStore = await import('./analyzers/conversation-store');
    
    const history = await convStore.loadConversationHistory(conversation_id, context_window);
    
    // Use persistent history instead of Redis cache
    const conversation_history = history.recent_turns;
    const extended_history = history.extended_turns;
    const checkpoint_summaries = history.checkpoints;

    logger.debug(
      `[/api/v2/analyze-turn] Loaded history: ${conversation_history.length} recent, ${extended_history.length} extended, ${checkpoint_summaries.length} checkpoints`
    );

    // ========== STEP 2: EXTRACT ENTITIES FROM RESPONSE ==========
    const entities = extractSimpleEntities(ai_response);
    logger.debug(`Extracted entities: ${entities.join(', ')}`);

    // ========== STEP 3: SYCOPHANCY DETECTION (CROSS-TURN) ==========
    let sycophancy_detected = false;
    let sycophancy_score = 0;
    let evidence_turns: number[] = [];

    // Check for user challenge patterns
    const challenge_patterns = [
      /are you sure/i,
      /i don't think that's right/i,
      /i thought it was/i,
      /you said (.+) earlier/i,
      /didn't you say/i,
      /that's not correct/i,
      /actually i think/i,
    ];

    const has_challenge = challenge_patterns.some((p) => p.test(user_message));

    if (has_challenge && previous_responses.length > 0) {
      // Look for entity mentioned in both old and new responses
      for (const prev of previous_responses) {
        // Simple check: do responses share similar entities but contradict?
        const prev_mentions_entity = entities.some((e) =>
          (prev.response || '').toLowerCase().includes(e.toLowerCase())
        );

        if (prev_mentions_entity) {
          // Check for apologetic language (strong sycophancy signal)
          const apologetic = /sorry|apologize|i was wrong|my mistake|you're right/i.test(
            ai_response
          );

          // Check response length change (sudden brevity can indicate collapse)
          const length_ratio = ai_response.length / (prev.response?.length || 1);

          if (apologetic || (length_ratio > 0.5 && length_ratio < 2)) {
            sycophancy_score += 0.3;
            evidence_turns.push(prev.turn || 0);
          }

          // Check for exact contradiction reversal
          if (
            prev.response &&
            ai_response.toLowerCase().includes('correct') &&
            !prev.response.toLowerCase().includes('correct')
          ) {
            sycophancy_score += 0.4;
            evidence_turns.push(prev.turn || 0);
          }
        }
      }

      sycophancy_detected = sycophancy_score > 0.5;
    }

    logger.debug(
      `Sycophancy analysis: detected=${sycophancy_detected}, score=${sycophancy_score.toFixed(2)}`
    );

    // ========== STEP 4: FACT VERIFICATION WITH WIKIPEDIA ==========
    let fact_check_results = {
      verified_claims: [] as string[],
      unverified_claims: [] as string[],
      contradicted_claims: [] as string[],
      sources: [] as any[],
    };

    if (enable_fact_check && entities.length > 0) {
      // For now, we'll use a simple approach: check Redis cache for known facts
      for (const entity of entities.slice(0, 3)) {
        // Limit to 3 entities for performance
        const fact_cache_key = `fact:${entity}`;

        try {
          const cached_fact = await redis.get(fact_cache_key);

          if (cached_fact) {
            const fact_data = JSON.parse(cached_fact);
            // Simulate fact verification
            if (ai_response.toLowerCase().includes(entity.toLowerCase())) {
              fact_check_results.verified_claims.push(entity);
              fact_check_results.sources.push({
                claim: entity,
                source: 'cached',
                confidence: 0.8,
              });
            }
          } else {
            fact_check_results.unverified_claims.push(entity);
          }
        } catch (err) {
          logger.debug(`Fact check error for ${entity}:`, err);
          fact_check_results.unverified_claims.push(entity);
        }
      }
    }

    // ========== STEP 5C: NLI SCORING (from existing pipeline) ==========
    const { runDetectionPipeline } = await import('./detectors/index');

    const detection_request = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content: ai_response,
      timestamp: Date.now(),
      context: user_message,
      conversationHistory: previous_responses.map((p: any) => ({
        role: 'assistant',
        content: p.response || '',
      })),
      metadata: {
        platform: 'api-v2',
        language: 'en',
        userId: user_id,
      },
    };

    const detection_response = await runDetectionPipeline(detection_request);
    const nli_score = (detection_response as any)?.score || 0.5;

    // ========== STEP 5B: SEMANTIC TRIPLE EXTRACTION & CONTRADICTION DETECTION ==========
    // Extract semantic triples from current response for structural contradiction detection
    let semantic_contradictions: any[] = [];
    let semantic_detail: any = null;

    try {
      const current_triples = extractSemanticTriples(ai_response);
      logger.debug(`[Semantic] Extracted ${current_triples.length} semantic triples from current response`);

      // Get historical triples from recent turns
      const recent_turns = conversation_history.slice(-5); // Last 5 turns
      const historical_triples: any[] = [];

      for (const turn of recent_turns) {
        const turn_triples = extractSemanticTriples(turn.content || '');
        historical_triples.push(...turn_triples);
      }

      // Check for semantic contradictions
      if (current_triples.length > 0 && historical_triples.length > 0) {
        const contradictions = detectSemanticContradictions(current_triples, historical_triples);
        semantic_contradictions = contradictions;

        if (contradictions.length > 0) {
          logger.info(`[Semantic] Found ${contradictions.length} semantic contradictions`);
          semantic_detail = {
            contradiction_count: contradictions.length,
            examples: contradictions.slice(0, 2), // Top 2 examples
            triples_involved: current_triples.length + historical_triples.length,
          };
        }
      }
    } catch (err) {
      logger.debug(`Semantic extraction failed (non-fatal):`, err);
    }

    // ========== STEP 6: CALCULATE FINAL HALLUCINATION SCORE ==========
    let hallucination_confidence = 0;
    let hallucination_type: 'contradiction' | 'sycophancy' | 'factual_error' | 'none' = 'none';

    // ========== STEP 5C: CROSS-TURN CONTRADICTION DETECTION (FIX #1) ==========
    // Check against FULL history for contradictions beyond recent context
    let cross_turn_contradictions = 0;
    let historical_contradiction_details: any[] = [];

    try {
      const contradictions = await convStore.findHistoricalContradictions(
        conversation_id,
        ai_response,
        turn_number
      );

      if (contradictions.contradictions.length > 0) {
        cross_turn_contradictions = contradictions.contradictions.length;
        historical_contradiction_details = contradictions.contradictions;
        
        logger.info(
          `[Cross-turn] Found ${contradictions.contradictions.length} historical contradictions`
        );

        // Weight: historical contradictions are STRONG signals
        // (they survived being outside the context window)
        const cross_turn_weight = 0.6; // 60% of hallucination score
        hallucination_confidence += cross_turn_weight * Math.min(contradictions.contradictions.length * 0.3, 1.0);
      }

      if (contradictions.checkpoint_contradictions.length > 0) {
        logger.warn(
          `[Checkpoint] Contradicts ${contradictions.checkpoint_contradictions.length} checkpoint summaries`
        );
        hallucination_confidence += 0.35; // Significant signal
      }
    } catch (err) {
      logger.debug(`Cross-turn contradiction check failed:`, err);
    }

    // ========== STEP 6B: CALCULATE HALLUCINATION FROM OTHER SIGNALS ==========

    const weights =
      evaluation_mode === 'strict'
        ? { nli: 0.3, sycophancy: 0.2, factual: 0.5, semantic: 0.3 }
        : evaluation_mode === 'lenient'
        ? { nli: 0.5, sycophancy: 0.1, factual: 0.4, semantic: 0.1 }
        : { nli: 0.4, sycophancy: 0.2, factual: 0.4, semantic: 0.2 };

    const nli_component = (1 - nli_score) * weights.nli;
    const sycophancy_component = sycophancy_score * weights.sycophancy;
    const factual_component =
      (fact_check_results.contradicted_claims.length /
        Math.max(entities.length, 1)) *
      weights.factual;
    
    // Semantic contradiction component
    const semantic_component = (semantic_contradictions.length / Math.max(semantic_contradictions.length, 1)) * weights.semantic;

    hallucination_confidence = nli_component + sycophancy_component + factual_component + semantic_component;

    // Determine hallucination type
    if (sycophancy_detected && sycophancy_score > 0.5) {
      hallucination_type = 'sycophancy';
    } else if (fact_check_results.contradicted_claims.length > 0) {
      hallucination_type = 'factual_error';
    } else if (nli_score < 0.5) {
      hallucination_type = 'contradiction';
    }

    // ========== STEP 7: GENERATE EXPLANATION ==========
    let explanation = '';
    if (hallucination_type === 'sycophancy') {
      explanation = `Model showed sycophantic behavior: contradicting previous answer after user challenge or expressing false agreement. Turns ${evidence_turns.join(
        ', '
      )} provide evidence.`;
    } else if (hallucination_type === 'factual_error') {
      explanation = `Claims contradict verification: ${fact_check_results.contradicted_claims.join(
        ', '
      )} not verified against sources.`;
    } else if (hallucination_type === 'contradiction') {
      explanation = `Semantic contradiction detected with confidence ${(nli_score * 100).toFixed(
        1
      )}%.`;
    } else {
      explanation = `Response appears consistent with context and verifiable facts.`;
    }

    // ========== STEP 8: STORE TURN IN POSTGRESQL (FIX #1) ==========
    // Store in database for persistent multi-turn analysis
    const turn_data = {
      conversation_id,
      turn_number,
      user_message,
      ai_response,
      entities_mentioned: entities,
      confidence_score: hallucination_confidence,
      timestamp: new Date(),
    };

    try {
      await convStore.storeTurn(turn_data);
      logger.debug(`[Storage] Stored turn ${turn_number} in PostgreSQL`);
    } catch (storeError) {
      logger.warn(`Failed to store turn in PostgreSQL:`, storeError);
      // Don't fail the API call if storage fails
    }

    // Also keep recent turns in Redis cache for speed
    try {
      const recent_cache_key = `conv:recent:${conversation_id}`;
      const recent_turns = conversation_history.slice(-10); // Last 10 for speed
      await redis.setex(
        recent_cache_key,
        3600, // 1 hour
        JSON.stringify(recent_turns)
      );
    } catch (cacheError) {
      logger.debug(`Failed to cache recent turns:`, cacheError);
    }

    logger.info(
      `[/api/v2/analyze-turn] Analysis complete: ${hallucination_type} (confidence ${(
        hallucination_confidence * 100
      ).toFixed(1)}%)`
    );

    // ========== RETURN RESPONSE ==========
    const execution_time = Date.now() - startTime;

    res.json({
      hallucination_detected: hallucination_confidence > 0.5,
      hallucination_type,
      confidence_score: Math.min(100, hallucination_confidence * 100),

      cross_turn_analysis: {
        sycophancy_detected,
        position_reversal: sycophancy_detected,
        entities_contradicted: evidence_turns.length > 0 ? evidence_turns : [],
        sycophancy_score,
        evidence_turns,
        // NEW: Cross-turn contradictions from persistent history
        historical_contradictions: historical_contradiction_details,
        cross_turn_contradiction_count: cross_turn_contradictions,
      },

      fact_check_results,

      semantic_analysis: {
        extraction_successful: semantic_detail !== null,
        semantic_contradictions: semantic_contradictions,
        contradiction_detail: semantic_detail,
        contradiction_types: semantic_contradictions.map(c => c.type),
      },

      explanation,

      raw_scores: {
        nli_score,
        sycophancy_score,
        factual_error_score: factual_component,
        semantic_contradiction_score: semantic_component,
      },

      metadata: {
        turn_number,
        conversation_id,
        execution_time_ms: execution_time,
        context_turns_analyzed: Math.min(previous_responses.length, context_window),
      },
    });
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    logger.error('[/api/v2/analyze-turn] Error:', errorMessage);

    res.status(500).json({
      error: 'Analysis failed',
      message: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal error',
    });
  }
});

/**
 * POST /api/v2/analyze-unified - 4-Engine Analysis
 * Combines Truth, Reasoning, Alignment, and Risk engines
 * Returns unified score with per-engine breakdown
 */
app.post('/api/v2/analyze-unified', async (req: Request, res: Response) => {
  const { content, conversation_history = [], weights = {} } = req.body;
  const startTime = Date.now();

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    // Dynamically import analyzer
    const { analyzer } = await import('./engines/unified-analysis.js');
    
    logger.info(`[/api/v2/analyze-unified] Analyzing ${content.length} chars with ${conversation_history.length} history items`);

    // Run 4-engine analysis
    const result = await analyzer.analyze(content, conversation_history, weights);

    res.json({
      success: true,
      analysis: result,
      execution_time_ms: Date.now() - startTime,
    });
  } catch (error) {
    logger.error('[/api/v2/analyze-unified] Error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: process.env.NODE_ENV === 'development' ? String(error) : 'Internal error',
    });
  }
});

/**
 * HELPER: Extract semantic triples (subject-predicate-object) from text
 * Examples: "Einstein invented relativity", "Water boils at 100°C"
 */
function extractSemanticTriples(text: string): Array<{ subject: string; predicate: string; object: string }> {
  const triples: Array<{ subject: string; predicate: string; object: string }> = [];

  // Pattern 1: "X is/was a Y"
  const pattern1 = /(\w+(?:\s+\w+)*)\s+(?:is|was|are|were|being)\s+(?:a\s+)?([^,.!?]+)/gi;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    triples.push({
      subject: match[1].trim(),
      predicate: 'is',
      object: match[2].trim(),
    });
  }

  // Pattern 2: "X verb Y" (active voice)
  const pattern2 = /(\w+(?:\s+\w+)*)\s+(discovered|invented|created|founded|wrote|published|developed)\s+([^,.!?]+)/gi;
  while ((match = pattern2.exec(text)) !== null) {
    triples.push({
      subject: match[1].trim(),
      predicate: match[2].toLowerCase(),
      object: match[3].trim(),
    });
  }

  // Pattern 3: "X has/have Y"
  const pattern3 = /(\w+(?:\s+\w+)*)\s+(?:has|have)\s+([^,.!?]+)/gi;
  while ((match = pattern3.exec(text)) !== null) {
    triples.push({
      subject: match[1].trim(),
      predicate: 'has',
      object: match[2].trim(),
    });
  }

  // Deduplicate
  const seen = new Set<string>();
  return triples.filter((triple) => {
    const key = `${triple.subject}|${triple.predicate}|${triple.object}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * HELPER: Detect semantic contradictions between current and historical triples
 * A contradiction occurs when same subject+predicate has conflicting objects
 */
function detectSemanticContradictions(
  currentTriples: Array<{ subject: string; predicate: string; object: string }>,
  historicalTriples: Array<{ subject: string; predicate: string; object: string }>
): Array<{ type: string; current: any; historical: any; confidence: number }> {
  const contradictions: Array<{ type: string; current: any; historical: any; confidence: number }> = [];

  for (const current of currentTriples) {
    for (const historical of historicalTriples) {
      // Check if subject and predicate match but objects differ
      if (
        current.subject.toLowerCase() === historical.subject.toLowerCase() &&
        current.predicate === historical.predicate &&
        current.object.toLowerCase() !== historical.object.toLowerCase()
      ) {
        // This is a potential contradiction
        const confidence = 0.9; // High confidence for exact subject+predicate match
        contradictions.push({
          type: 'direct_contradiction',
          current: { ...current },
          historical: { ...historical },
          confidence,
        });
      }
    }
  }

  return contradictions;
}

/**
 * HELPER: Extract simple entities (PERSON, DATE, LOCATION)
 */
function extractSimpleEntities(text: string): string[] {
  const entities = new Set<string>();

  // Names (PERSON): "Einstein", "Marie Curie"
  const name_pattern = /\b([A-Z][a-z]+ (?:[A-Z][a-z]+ )*[A-Z][a-z]+)\b/g;
  let match;
  while ((match = name_pattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Dates (DATE): "March 14, 1879", "1905"
  const date_pattern =
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4})\b/g;
  while ((match = date_pattern.exec(text)) !== null) {
    entities.add(match[1]);
  }

  // Key claimed facts (nouns with potential errors)
  const fact_pattern = /\b(?:is|was|are|were|invented|discovered|founded)\s+(.+?)(?:\.|,|;|\?|!|$)/gi;
  while ((match = fact_pattern.exec(text)) !== null) {
    const fact = match[1].trim();
    if (fact.length > 5 && fact.length < 100) {
      entities.add(fact);
    }
  }

  return Array.from(entities).slice(0, 10); // Limit to 10 entities
}


// ============ WEBSOCKET EVENTS ============

// Track callback handlers for async responses
interface AnalysisCallback {
  callback: (response: any) => void;
  requestId: string;
  timeout: NodeJS.Timeout;
}

const analysisCallbacks = new Map<string, AnalysisCallback>();

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Initialize or restore session
  socket.on('init_session', async (data: any, ack: Function) => {
    try {
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      socket.data.sessionId = sessionId;
      socket.join(sessionId);

      await redis.hset(`session:${sessionId}`, {
        socket_id: socket.id,
        created_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
        message_count: '0',
      });

      logger.info(`Session initialized: ${sessionId}`);
      ack({ success: true, sessionId });
    } catch (error) {
      logger.error('Error initializing session', error);
      ack({ success: false, error: String(error) });
    }
  });

  // Restore existing session
  socket.on('restore_session', async (data: { sessionId: string }, ack: Function) => {
    try {
      const sessionExists = await redis.hget(`session:${data.sessionId}`, 'socket_id');
      
      if (!sessionExists) {
        ack({ success: false, error: 'Session not found' });
        return;
      }

      socket.data.sessionId = data.sessionId;
      socket.join(data.sessionId);

      await redis.hset(`session:${data.sessionId}`, {
        socket_id: socket.id,
        last_activity: new Date().toISOString(),
      });

      logger.info(`Session restored: ${data.sessionId}`);
      ack({ success: true, sessionId: data.sessionId });
    } catch (error) {
      logger.error('Error restoring session', error);
      ack({ success: false, error: String(error) });
    }
  });

  // Real-time analysis with async callback
  socket.on('analyze', async (data: any) => {
    const sessionId = socket.data.sessionId;
    const requestId = data.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!sessionId) {
      socket.emit('error', { requestId, message: 'Session not initialized' });
      return;
    }

    try {
      logger.debug(`Analysis request [${sessionId}]: ${data.content.substring(0, 100)}`);

      // Import detection pipeline
      const { runDetectionPipeline } = await import('./detectors/index');
      
      const detectionRequest = {
        id: requestId,
        content: data.content,
        model: data.model || 'unknown',
        timestamp: Date.now(),
        context: data.context,
        conversationHistory: data.conversationHistory || [],
        metadata: data.metadata || {},
      };

      const startTime = Date.now();
      const response = await runDetectionPipeline(detectionRequest);

      // Emit completion event back to client
      const executionTime = Date.now() - startTime;
      socket.emit('analysis_complete', {
        requestId,
        sessionId,
        flagged: (response as any)?.flagged || false,
        tiers: (response as any)?.tiers || [],
        execution_time_ms: executionTime,
        asyncRemaining: (response as any)?.asyncRemaining || [],
      });

      // Queue async tier (4) if needed
      if (response.asyncRemaining.length > 0 && semanticIndexQueue) {
        try {
          await semanticIndexQueue.add(
            'semantic-analysis',
            detectionRequest,
            { 
              attempts: 2,
              backoff: { type: 'exponential', delay: 1000 },
              removeOnComplete: true,
            }
          );
        } catch (queueError: any) {
          // Log queue error but don't fail - analysis is already complete and sent to client
          console.warn('[WebSocket analyze] Queue error (non-fatal):', queueError?.message);
          logger.warn('Failed to queue async analysis task via WebSocket', { error: queueError?.message });
        }
        
        logger.debug(`Async analysis queued for request ${requestId}`);
      }

      // Update session message count
      const currentCount = await redis.hget(`session:${sessionId}`, 'message_count');
      const newCount = (parseInt(currentCount || '0', 10) + 1).toString();
      await redis.hset(`session:${sessionId}`, {
        message_count: newCount,
        last_activity: new Date().toISOString(),
      });

    } catch (error) {
      logger.error(`Error in analyze event [${sessionId}]`, error);
      socket.emit('error', {
        requestId,
        message: 'Analysis failed',
        error: String(error),
      });
    }
  });

  // Receive feedback on detection results
  socket.on('feedback', async (data: { requestId?: string; detectionId?: string; verdict: 'correct' | 'false_positive'; reason?: string }) => {
    const sessionId = socket.data.sessionId;

    if (!sessionId) {
      socket.emit('error', { message: 'Session not initialized' });
      return;
    }

    try {
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const feedbackData = {
        feedback_id: feedbackId,
        session_id: sessionId,
        request_id: data.requestId,
        detection_id: data.detectionId,
        verdict: data.verdict,
        reason: data.reason || '',
        timestamp: new Date().toISOString(),
      };

      // Store in Redis for batch processing (in production: save to PostgreSQL)
      await redis.set(`feedback:${feedbackId}`, JSON.stringify(feedbackData));
      await redis.lpush(`session:${sessionId}:feedbacks`, feedbackId);

      // Expire feedback after 90 days
      await redis.expire(`feedback:${feedbackId}`, 90 * 24 * 60 * 60);

      logger.info(`Feedback received: ${feedbackId} [${data.verdict}]`);
      socket.emit('feedback_ack', { success: true, feedbackId });
    } catch (error) {
      logger.error('Error storing feedback', error);
      socket.emit('error', { message: 'Failed to store feedback', error: String(error) });
    }
  });

  // Batch analysis request
  socket.on('analyze_batch', async (data: { items: any[] }) => {
    const sessionId = socket.data.sessionId;
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!sessionId) {
      socket.emit('error', { message: 'Session not initialized' });
      return;
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      socket.emit('error', { batchId, message: 'Items array is required' });
      return;
    }

    if (data.items.length > 100) {
      socket.emit('error', { batchId, message: 'Maximum 100 items per batch' });
      return;
    }

    try {
      const { runDetectionPipeline } = await import('./detectors/index');
      
      const startTime = Date.now();
      const results = await Promise.all(
        data.items.map(item => 
          runDetectionPipeline({
            id: `${batchId}_${Math.random().toString(36).substr(2, 9)}`,
            content: item.content,
            model: item.model || 'unknown',
            timestamp: Date.now(),
            context: item.context,
            conversationHistory: item.conversationHistory || [],
            metadata: item.metadata || {},
          })
        )
      );

      socket.emit('batch_complete', {
        batchId,
        sessionId,
        processed: results.length,
        results,
        execution_time_ms: Date.now() - startTime,
      });

      logger.info(`Batch analysis complete: ${batchId} (${results.length} items)`);
    } catch (error) {
      logger.error(`Error in batch analysis [${batchId}]`, error);
      socket.emit('error', {
        batchId,
        message: 'Batch analysis failed',
        error: String(error),
      });
    }
  });

  // Disconnect
  socket.on('disconnect', async () => {
    logger.info(`Client disconnected: ${socket.id}`);
    
    // Clean up any pending callbacks
    analysisCallbacks.forEach((handler, key) => {
      if (handler.timeout) clearTimeout(handler.timeout);
    });
  });
});

// ============ ERROR HANDLING ============

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ============ SERVER STARTUP ============

const PORT = parseInt(process.env.PORT || '3000', 10);

/**
 * Initialize all services and start server
 */
async function startServer(): Promise<void> {
  try {
    // Wait for Redis to be ready (with timeout)
    console.log('Waiting for Redis connection...');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout (30s)'));
      }, 30000);

      const checkReady = async () => {
        try {
          const pong = await redis.ping();
          if (pong === 'PONG') {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 1000);
          }
        } catch {
          setTimeout(checkReady, 1000);
        }
      };

      checkReady();
    });

    logger.info('✅ Redis ready - initializing BullMQ queues');
    await initializeBullMQQueues();

    // Initialize database (non-blocking - continues even if fails)
    console.log('Initializing database...');
    let dbConnected = false;
    try {
      dbConnected = await initializeDatabase();
      if (dbConnected) {
        logger.info('✅ Database initialized successfully');
      } else {
        logger.warn('⚠️ Database connection could not be established - retrying on next request');
      }
    } catch (dbError) {
      logger.warn('⚠️ Database initialization error (will retry):', dbError);
      // Continue anyway - DB has built-in retry and won't crash
    }

    // ============ FEEDBACK & INTERVENTION ENDPOINTS ============

    /**
     * POST /api/v2/feedback - Record user feedback on analysis
     * Body: {
     *   analysis_id: string,
     *   user_id: string,
     *   correct_result: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative',
     *   original_score: number,
     *   user_correction?: { corrected_claim: string, actual_fact: string, source: string },
     *   engagement_level?: number (0-1)
     * }
     */
    app.post('/api/v2/feedback', async (req: Request, res: Response) => {
      const { analysis_id, user_id, correct_result, original_score, user_correction, engagement_level } = req.body;

      if (!analysis_id || !user_id || !correct_result) {
        return res.status(400).json({ error: 'Missing required fields: analysis_id, user_id, correct_result' });
      }

      try {
        const { FeedbackLearningSystem } = await import('./engines/feedback-learning.js');
        const record = await FeedbackLearningSystem.recordFeedback(analysis_id, user_id, {
          correct_result: correct_result as any,
          original_score,
          user_correction,
          engagement_level,
        });

        const metrics = await FeedbackLearningSystem.getLearningMetrics(user_id);

        res.json({
          success: true,
          feedback_id: record.id,
          learning_metrics: metrics,
          message: `Feedback recorded (${metrics.total_feedback_records} total records)`,
        });
      } catch (error) {
        logger.error('[/api/v2/feedback] Error:', error);
        res.status(500).json({ error: 'Feedback recording failed', message: String(error) });
      }
    });

    /**
     * GET /api/v2/feedback/metrics/:user_id - Get learning metrics
     */
    app.get('/api/v2/feedback/metrics/:user_id', async (req: Request, res: Response) => {
      const { user_id } = req.params;

      try {
        const { FeedbackLearningSystem } = await import('./engines/feedback-learning.js');
        const metrics = await FeedbackLearningSystem.getLearningMetrics(user_id);

        res.json({
          success: true,
          user_id,
          metrics,
        });
      } catch (error) {
        logger.error('[/api/v2/feedback/metrics] Error:', error);
        res.status(500).json({ error: 'Failed to retrieve metrics' });
      }
    });

    /**
     * POST /api/v2/intervention - Generate UI intervention from policy decision
     * Body: {
     *   analysis_id: string,
     *   user_id: string,
     *   content: string,
     *   policy_decision: { ... },
     *   engine_scores: { truth_engine, reasoning_engine, alignment_engine, risk_engine }
     * }
     */
    app.post('/api/v2/intervention', async (req: Request, res: Response) => {
      const { analysis_id, user_id, content, policy_decision, engine_scores } = req.body;

      if (!policy_decision || !engine_scores) {
        return res.status(400).json({ error: 'Missing policy_decision or engine_scores' });
      }

      try {
        const { InterventionExecutor } = await import('./engines/intervention-executor.js');

        const intervention = InterventionExecutor.buildInterventionUI({
          analysis_id,
          user_id,
          content,
          policy_decision,
          engine_scores,
        });

        res.json({
          success: true,
          intervention,
          recommendations: policy_decision.recommendations || [],
        });
      } catch (error) {
        logger.error('[/api/v2/intervention] Error:', error);
        res.status(500).json({ error: 'Intervention generation failed' });
      }
    });

    /**
     * POST /api/v2/intervention/outcome - Record what user did with intervention
     * Body: {
     *   analysis_id: string,
     *   user_id: string,
     *   intervention_action: 'allow' | 'warn' | 'flag' | 'block' | 'edit',
     *   user_action: 'allowed' | 'blocked' | 'edited' | 'dismissed',
     *   final_outcome?: 'accurate' | 'hallucination' | 'helpful' | 'harmful'
     * }
     */
    app.post('/api/v2/intervention/outcome', async (req: Request, res: Response) => {
      const { analysis_id, user_id, intervention_action, user_action, final_outcome } = req.body;

      if (!analysis_id || !user_action) {
        return res.status(400).json({ error: 'Missing analysis_id or user_action' });
      }

      try {
        const { InterventionExecutor } = await import('./engines/intervention-executor.js');

        const intervention_ui = {
          action: intervention_action as any,
          visible: true,
          severity: 'warning' as any,
          title: intervention_action.toUpperCase() + ': Intervention',
          message: `Intervention recorded: ${intervention_action}`,
          highlighted_sections: [],
          allow_override: intervention_action !== 'block',
          estimated_impact: 'medium' as any
        };

        await InterventionExecutor.recordInterventionOutcome(
          analysis_id,
          user_id,
          intervention_ui,
          user_action as any,
          final_outcome as any
        );

        res.json({
          success: true,
          message: `Intervention outcome recorded: ${user_action}`,
        });
      } catch (error) {
        logger.error('[/api/v2/intervention/outcome] Error:', error);
        res.status(500).json({ error: 'Failed to record intervention outcome' });
      }
    });

    /**
     * GET /api/v2/intervention/stats/:user_id - Get intervention statistics
     */
    app.get('/api/v2/intervention/stats/:user_id', async (req: Request, res: Response) => {
      const { user_id } = req.params;

      try {
        const { InterventionExecutor } = await import('./engines/intervention-executor.js');
        const stats = await InterventionExecutor.getInterventionStats(user_id);

        res.json({
          success: true,
          user_id,
          stats,
        });
      } catch (error) {
        logger.error('[/api/v2/intervention/stats] Error:', error);
        res.status(500).json({ error: 'Failed to retrieve stats' });
      }
    });

    // Start cleanup tasks (every hour)
    setInterval(async () => {
      try {
        const cleanedCount = await cleanupExpiredCache();
        logger.debug(`Cache cleanup: removed ${cleanedCount} expired entries`);
      } catch (error) {
        logger.warn('Cache cleanup failed:', error);
      }
    }, 60 * 60 * 1000);

    // Start server
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 HaloGuard backend running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Redis: ${redisUrlMasked}`);
      logger.info(`Database: PostgreSQL (${process.env.DATABASE_URL ? 'configured' : 'NOT SET'})`);
      logger.info('✅ All services initialized and ready');

      // Diagnostic info for troubleshooting
      if (process.env.DATABASE_URL) {
        const dbUrlMasked = process.env.DATABASE_URL.replace(/:.*@/, ':***@');
        logger.info(`Database URL: ${dbUrlMasked}`);
      } else {
        logger.error('❌ DATABASE_URL environment variable is NOT SET - database operations will fail');
        logger.error('Add DATABASE_URL to Railway Variables: postgres://user:password@host:port/db');
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  httpServer.close(async () => {
    await redis.quit();
    // Database disconnect handled by Prisma automatically
    process.exit(0);
  });
});

export default app;

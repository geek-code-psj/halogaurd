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
      await semanticIndexQueue.add(
        'semantic-analysis',
        request,
        { attempts: 2, backoff: { type: 'exponential', delay: 1000 } }
      );
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
        await semanticIndexQueue.add(
          'semantic-analysis',
          detectionRequest,
          { 
            attempts: 2,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: true,
          }
        );
        
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

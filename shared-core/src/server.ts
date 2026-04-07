import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import pino from 'pino';
import pinoHttp from 'pino-http';
import Redis from 'redis';
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

// Initialize logger
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

// Validate Redis URL format
if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
  logger.error(`Invalid REDIS_URL format: ${redisUrl}. Must start with redis:// or rediss://`);
  logger.error('Make sure REDIS_URL environment variable is set correctly in Railway Variables');
}

const redis = Redis.createClient({ url: redisUrl });

redis.on('error', (err) => logger.error('Redis Client Error', err));
redis.connect().catch((err) => logger.error('Failed to connect Redis', err));

// BullMQ queues for async jobs
const factCheckQueue = new Queue('fact-check', { connection: redis as any });
const nliInferenceQueue = new Queue('nli-inference', { connection: redis as any });
const semanticIndexQueue = new Queue('semantic-index', { connection: redis as any });

logger.info('Initialized BullMQ queues: fact-check, nli-inference, semantic-index');

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

    // Check Database
    try {
      const dbCheck = await initializeDatabase();
      healthChecks.database = 'connected';
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
        timeout: 5000,
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
      healthChecks.database === 'connected';

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
 * Analysis endpoint (synchronous Tiers 0–3)
 * POST /api/v1/analyze
 * Body: { content, model, context, conversationHistory, metadata, sessionId }
 */
app.post('/api/v1/analyze', async (req: Request, res: Response) => {
  const { content, model, context, conversationHistory, metadata, sessionId } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Content is required' });
  }

  try {
    const startTime = Date.now();
    
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

    const response = await runDetectionPipeline(request);
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
          flagged: response.flagged || false,
          overallScore: (response.score || 0) * 100,
          latency: executionTime,
          issues: response.issues || [],
          tier0Result: response.tier0 || null,
          tier1Result: response.tier1 || null,
          tier2Result: response.tier2 || null,
          tier3Result: response.tier3 || null,
          tier4Result: null,
        });

        logger.debug(`Analysis stored for session ${sessionId} [${executionTime}ms]`);
      } catch (dbError) {
        logger.warn('Failed to store analysis result in database', dbError);
      }
    }

    // Queue async tier (4) if needed
    if (response.asyncRemaining && response.asyncRemaining.length > 0) {
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
  } catch (error) {
    logger.error('Error in /analyze endpoint', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Session initialization (with database storage)
 * POST /api/v1/sessions
 */
app.post('/api/v1/sessions', async (req: Request, res: Response) => {
  try {
    const { platform, tabId, conversationId, userId } = req.body;

    const sessionId = await getOrCreateSession(
      platform || 'unknown',
      tabId,
      conversationId,
      userId
    );

    // Also store in Redis for fast access
    await redis.hSet(`session:${sessionId}`, {
      created_at: new Date().toISOString(),
      message_count: '0',
    });

    logger.info(`Session created: ${sessionId} [${platform}]`);

    res.json({ 
      session_id: sessionId,
      platform,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error creating session', error);
    res.status(500).json({ error: 'Failed to create session' });
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
    
    const falsePositives = feedback.filter((f: any) => f.verdict === 'false_positive').length;
    
    res.json({
      timestamp: new Date().toISOString(),
      active_sessions: activeSessions,
      total_feedback: totalFeedback,
      false_positive_rate: totalFeedback > 0 ? (falsePositives / totalFeedback * 100).toFixed(2) + '%' : 'N/A',
      queue_status: {
        fact_check_pending: await factCheckQueue.count(),
        nli_inference_pending: await nliInferenceQueue.count(),
        semantic_index_pending: await semanticIndexQueue.count(),
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

      await redis.hSet(`session:${sessionId}`, {
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
      const sessionExists = await redis.hGet(`session:${data.sessionId}`, 'socket_id');
      
      if (!sessionExists) {
        ack({ success: false, error: 'Session not found' });
        return;
      }

      socket.data.sessionId = data.sessionId;
      socket.join(data.sessionId);

      await redis.hSet(`session:${data.sessionId}`, {
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
        ...response,
        execution_time_ms: executionTime,
      });

      // Queue async tier (4) if needed
      if (response.asyncRemaining.length > 0) {
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
      const currentCount = await redis.hGet(`session:${sessionId}`, 'message_count');
      const newCount = (parseInt(currentCount || '0', 10) + 1).toString();
      await redis.hSet(`session:${sessionId}`, {
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
      await redis.hSet(`feedback:${feedbackId}`, feedbackData);
      await redis.lPush(`session:${sessionId}:feedbacks`, feedbackId);

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
    // Initialize database
    console.log('Initializing database...');
    await initializeDatabase();
    logger.info('✅ Database initialized');

    // Start cleanup tasks (every hour)
    setInterval(async () => {
      const cleanedCount = await cleanupExpiredCache();
      logger.debug(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }, 60 * 60 * 1000);

    // Start server
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 HaloGuard backend running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Redis: ${redisUrl}`);
      logger.info(`Database: PostgreSQL (configured)`);
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

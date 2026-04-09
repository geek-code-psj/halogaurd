/**
 * Express API Routes for HaloGuard Detection
 * 
 * HTTP Status Codes:
 * - 200: Success
 * - 400: Invalid request (missing/invalid parameters)
 * - 401: Unauthorized (missing or invalid authentication token)
 * - 429: Rate limit exceeded (too many requests)
 * - 500: Internal server error
 * - 503: Service unavailable (dependency failure)
 */

import express, { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth";
import {
  runDetectionPipeline,
  processAsyncDetection,
} from "../detectors/index";
import { DetectionRequest, DetectionResponse } from "../types/detector";
import { Queue } from "bullmq";

const router = Router();

// BullMQ queue for async processing
export let detectionQueue: Queue | null = null;

export function setDetectionQueue(queue: Queue) {
  detectionQueue = queue;
}

/**
 * POST /api/v1/analyze
 * Main hallucination detection endpoint
 * Requires bearer token authentication
 */
router.post("/api/v1/analyze", requireAuth, async (req: Request, res: Response) => {
  try {
    const { content, model, context, conversationHistory, metadata } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Content is required" });
    }

    const detectionRequest: DetectionRequest = {
      id: uuidv4(),
      content,
      model: model || "unknown",
      timestamp: Date.now(),
      context,
      conversationHistory: conversationHistory || [],
      metadata: metadata || {},
    };

    // Run synchronous tiers (0-3)
    const response = await runDetectionPipeline(detectionRequest);

    // Queue async tier (4) if detection queue available
    if (detectionQueue && response.asyncRemaining.length > 0) {
      await detectionQueue.add("async-detection", detectionRequest, {
        attempts: 2,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
      });
    }

    res.json(response);
  } catch (error: any) {
    console.error("Detection error:", error);
    
    // Check for specific error conditions
    if (error.message && error.message.includes("rate limit")) {
      return res.status(429).json({ 
        error: "Rate limit exceeded", 
        message: "Too many requests. Please retry after some time.",
        retryAfter: 60
      });
    }
    
    // Service unavailable (e.g., queue failure, external service down)
    if (error.message && error.message.includes("unavailable")) {
      return res.status(503).json({ 
        error: "Service unavailable", 
        message: "Detection service is temporarily unavailable. Please try again later."
      });
    }
    
    // Default internal server error
    res.status(500).json({ 
      error: "Detection failed", 
      message: error.message || "Unknown error occurred" 
    });
  }
});

/**
 * POST /api/v1/analyze/batch
 * Batch hallucination detection for multiple items
 * Requires bearer token authentication
 * Maximum 100 items per batch request
 */
router.post("/api/v1/analyze/batch", requireAuth, async (req: Request, res: Response) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    if (items.length > 100) {
      return res
        .status(400)
        .json({ error: "Maximum 100 items per batch request" });
    }

    // Validate and prepare requests
    const requests = items.map((item: any) => ({
      id: `batch_${Date.now()}_${Math.random()}`,
      content: item.content,
      model: item.model || "unknown",
      timestamp: Date.now(),
      context: item.context,
      conversationHistory: item.conversationHistory || [],
      metadata: item.metadata || {},
    }));

    // Process in parallel
    const responses = await Promise.all(
      requests.map((req) => runDetectionPipeline(req))
    );

    res.json({
      processed: responses.length,
      results: responses,
    });
  } catch (error: any) {
    console.error("Batch detection error:", error);
    
    // Check for specific error conditions
    if (error.message && error.message.includes("rate limit")) {
      return res.status(429).json({ 
        error: "Rate limit exceeded", 
        message: "Too many requests. Please retry after some time.",
        retryAfter: 60
      });
    }
    
    if (error.message && error.message.includes("unavailable")) {
      return res.status(503).json({ 
        error: "Service unavailable", 
        message: "Detection service is temporarily unavailable. Please try again later."
      });
    }
    
    res.status(500).json({ 
      error: "Batch detection failed", 
      message: error.message || "Unknown error occurred" 
    });
  }
});

/**
 * GET /api/v1/health
 * Health check endpoint
 */
router.get("/api/v1/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/v1/stats
 * Detection statistics and metrics
 */
router.get("/api/v1/stats", (req: Request, res: Response) => {
  // In production, would fetch from database
  res.json({
    totalDetections: 0,
    averageLatency: 0,
    criticalIssues: 0,
    platformBreakdown: {
      vscode: 0,
      chrome: 0,
      api: 0,
    },
  });
});

export default router;

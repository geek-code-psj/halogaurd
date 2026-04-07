/**
 * Express API Routes for HaloGuard Detection
 */

import express, { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "crypto";
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
 * POST /api/detect
 * Main detection endpoint
 */
router.post("/detect", async (req: Request, res: Response) => {
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
    res.status(500).json({ error: "Detection failed", message: error.message });
  }
});

/**
 * POST /api/detect/batch
 * Batch detection for multiple items
 */
router.post("/detect/batch", async (req: Request, res: Response) => {
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

    const requests = items.map((item: any) => ({
      id: uuidv4(),
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
    res
      .status(500)
      .json({ error: "Batch detection failed", message: error.message });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /api/stats
 * Detection statistics
 */
router.get("/stats", (req: Request, res: Response) => {
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

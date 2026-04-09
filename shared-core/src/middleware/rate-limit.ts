/**
 * Rate Limiting Middleware
 * Enforces request limits to prevent abuse
 * Default: 100 requests per minute per API key
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Simple in-memory rate limiter (for single-server deployments)
// For distributed deployments, use Redis-based rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window per key

/**
 * Get rate limit key from request
 * Prioritizes API key in header, falls back to user ID, then falls back to IP
 */
function getRateLimitKey(req: Request): string {
  // API key from Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return `api_${authHeader.substring(7).substring(0, 20)}`; // Use first 20 chars
  }

  // User ID if authenticated
  if (req.user?.id) {
    return `user_${req.user.id}`;
  }

  // Fallback to IP address (less reliable but works for basic limiting)
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip_${ip}`;
}

/**
 * Middleware to enforce rate limiting
 * Returns 429 Too Many Requests if limit exceeded
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Response | void {
  try {
    const key = getRateLimitKey(req);
    const now = Date.now();

    let limitData = requestCounts.get(key);

    // Initialize or reset if window has expired
    if (!limitData || now > limitData.resetTime) {
      limitData = {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW,
      };
      requestCounts.set(key, limitData);
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', RATE_LIMIT_MAX_REQUESTS - 1);
      res.setHeader('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());
      
      return next();
    }

    // Increment request count
    limitData.count++;

    // Set rate limit headers
    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - limitData.count);
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());

    // Check if limit exceeded
    if (limitData.count > RATE_LIMIT_MAX_REQUESTS) {
      logger.warn(
        { key, count: limitData.count, limit: RATE_LIMIT_MAX_REQUESTS },
        'Rate limit exceeded'
      );

      const retryAfter = Math.ceil((limitData.resetTime - now) / 1000);
      res.set('Retry-After', retryAfter.toString());
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute allowed`,
        retryAfter,
      });
    }

    return next();
  } catch (error) {
    logger.error({ error }, 'Rate limiting middleware error');
    // Continue on error instead of blocking (fail open)
    next();
  }
}

/**
 * Cleanup old rate limit entries periodically
 * Prevents memory leak from stale entries
 */
export function cleanupRateLimitCache(): void {
  try {
    const now = Date.now();
    for (const [key, data] of requestCounts.entries()) {
      if (now > data.resetTime + 60000) { // Clean up entries older than 2 minutes
        requestCounts.delete(key);
      }
    }
  } catch (error) {
    logger.error({ error }, 'Rate limit cache cleanup error');
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupRateLimitCache, 5 * 60 * 1000);

export default rateLimitMiddleware;

/**
 * Authentication Middleware
 * Handles JWT token verification and user context injection
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Extend Express Request to include user context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string;
      };
    }
  }
}

/**
 * Middleware to verify JWT token and inject user context
 * Token should be in Authorization header: "Bearer <token>"
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);

    // TODO: Implement JWT verification
    // For now, parse from token or use mock data
    const decoded = {
      id: 'user-123',
      email: 'user@example.com',
      name: 'User',
    };

    req.user = decoded;
    next();
  } catch (error) {
    logger.error({ error }, 'Auth middleware error');
    res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Optional authentication middleware
 * Doesn't fail if token is missing, just skips user injection
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      // TODO: Implement JWT verification
      const decoded = {
        id: 'user-123',
        email: 'user@example.com',
        name: 'User',
      };
      
      req.user = decoded;
    }
    
    next();
  } catch (error) {
    logger.error({ error }, 'Optional auth middleware error');
    next(); // Continue anyway
  }
}

export default requireAuth;

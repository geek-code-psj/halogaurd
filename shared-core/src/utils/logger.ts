/**
 * Logger Module - Pino-based Structured Logging
 * Provides consistent logging across the application
 */

import pino from 'pino';
import pinoHttp from 'pino-http';

// Create base logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

// HTTP logger middleware for Express
export function httpLogger() {
  return pinoHttp({
    logger,
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
  });
}

// Utility functions for different log levels
export const log = {
  debug: (msg: string, data?: unknown) => logger.debug(data, msg),
  info: (msg: string, data?: unknown) => logger.info(data, msg),
  warn: (msg: string, data?: unknown) => logger.warn(data, msg),
  error: (msg: string, data?: unknown) => logger.error(data, msg),
  fatal: (msg: string, data?: unknown) => logger.fatal(data, msg),
};

export default logger;

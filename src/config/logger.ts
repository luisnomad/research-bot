/**
 * Logging utility using Pino
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Create logger instance
 */
export const createLogger = (name?: string, logFile?: string) => {
  const isDevelopment = process.env['NODE_ENV'] !== 'production';
  const logLevel = process.env['LOG_LEVEL'] || 'info';

  // Ensure log directory exists if log file is specified
  if (logFile) {
    const dir = dirname(logFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  const baseConfig: pino.LoggerOptions = {
    level: logLevel,
    name: name || 'knowledge-base',
  };

  // Development: pretty print to console
  if (isDevelopment) {
    return pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  // Production: structured JSON logs
  if (logFile) {
    return pino(
      baseConfig,
      pino.destination({
        dest: logFile,
        sync: false,
      })
    );
  }

  return pino(baseConfig);
};

/**
 * Default logger instance
 */
export const logger = createLogger('knowledge-base', process.env['LOG_FILE']);

/**
 * Create child logger with context
 */
export const createChildLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

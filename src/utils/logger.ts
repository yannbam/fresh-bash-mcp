import winston from 'winston';
import path from 'path';
import fs from 'fs-extra';
import { MCPConfig } from '../types/index.js';

/**
 * Create and configure the logger
 */
export function createLogger(config: MCPConfig): winston.Logger {
  const logDir = path.dirname(config.logging.file);

  // Ensure log directory exists
  fs.ensureDirSync(logDir);

  return winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    defaultMeta: { service: 'bash-mcp' },
    transports: [
      // Console transport
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
      // File transport
      new winston.transports.File({
        filename: config.logging.file,
        maxsize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles,
      }),
    ],
  });
}

// Create a default logger that will be replaced once config is loaded
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

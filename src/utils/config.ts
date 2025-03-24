import fs from 'fs-extra';
import { MCPConfig } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Load and validate the configuration
 */
export async function loadConfig(configPath: string): Promise<MCPConfig> {
  try {
    // Check if the file exists
    if (!(await fs.pathExists(configPath))) {
      throw new Error(`Config file not found at ${configPath}`);
    }

    // Read and parse the config file
    const configContent = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(configContent) as MCPConfig;

    // Validate the config
    validateConfig(config);

    return config;
  } catch (error) {
    logger.error(
      `Failed to load config: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Validate the configuration
 */
function validateConfig(config: MCPConfig): void {
  // Check required fields
  if (!config.allowedCommands || !Array.isArray(config.allowedCommands)) {
    throw new Error('Config error: allowedCommands must be an array');
  }

  if (!config.allowedDirectories || !Array.isArray(config.allowedDirectories)) {
    throw new Error('Config error: allowedDirectories must be an array');
  }

  if (!config.session || typeof config.session !== 'object') {
    throw new Error('Config error: session configuration is required');
  }

  if (!config.security || typeof config.security !== 'object') {
    throw new Error('Config error: security configuration is required');
  }

  if (!config.logging || typeof config.logging !== 'object') {
    throw new Error('Config error: logging configuration is required');
  }

  // Validate numeric fields
  if (typeof config.session.timeout !== 'number' || config.session.timeout <= 0) {
    throw new Error('Config error: session.timeout must be a positive number');
  }

  if (
    typeof config.session.maxActiveSessions !== 'number' ||
    config.session.maxActiveSessions <= 0
  ) {
    throw new Error('Config error: session.maxActiveSessions must be a positive number');
  }

  if (typeof config.security.maxOutputSize !== 'number' || config.security.maxOutputSize <= 0) {
    throw new Error('Config error: security.maxOutputSize must be a positive number');
  }

  if (typeof config.security.commandTimeout !== 'number' || config.security.commandTimeout <= 0) {
    throw new Error('Config error: security.commandTimeout must be a positive number');
  }

  // Validate session mode
  if (config.session.defaultMode !== 'stateless' && config.session.defaultMode !== 'stateful') {
    throw new Error('Config error: session.defaultMode must be "stateless" or "stateful"');
  }

  // Validate logging level
  const validLogLevels = ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'];
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(`Config error: logging.level must be one of ${validLogLevels.join(', ')}`);
  }

  logger.info('Configuration validated successfully');
}

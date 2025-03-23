import path from 'path';
import { MCPConfig } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Validates if a command is allowed based on the configuration
 */
export function isCommandAllowed(command: string, config: MCPConfig): boolean {
  if (!command || typeof command !== 'string') {
    return false;
  }

  // Extract the base command (e.g., "ls" from "ls -la")
  const baseCommand = command.trim().split(' ')[0];

  // Check if the base command is in the allowed list
  const isAllowed = config.allowedCommands.includes(baseCommand);

  if (!isAllowed) {
    // logger.warn(`Command "${baseCommand}" is not in the allowed list`);
  }

  return isAllowed;
}

/**
 * Validates if a directory is allowed based on the configuration
 */
export function isDirectoryAllowed(directory: string, config: MCPConfig): boolean {
  if (!directory || typeof directory !== 'string') {
    return false;
  }

  // Normalize the path to handle different formats
  const normalizedDir = path.normalize(directory);

  // Check if the directory is in the allowed list or is a subdirectory of an allowed directory
  const isAllowed = config.allowedDirectories.some((allowedDir: string) => {
    const normalizedAllowedDir = path.normalize(allowedDir);
    return (
      normalizedDir === normalizedAllowedDir ||
      normalizedDir.startsWith(normalizedAllowedDir + path.sep)
    );
  });

  if (!isAllowed) {
    // logger.warn(`Directory "${directory}" is not allowed`);
  }

  return isAllowed;
}

/**
 * Sanitize command output to remove any potentially harmful content
 * This is a simple implementation - for production you might want more sophisticated sanitization
 */
export function sanitizeOutput(output: string, config: MCPConfig): string {
  if (!config.security.sanitizeOutput) {
    return output;
  }

  // Truncate output if it exceeds the maximum size
  if (output.length > config.security.maxOutputSize) {
    const truncatedOutput = output.substring(0, config.security.maxOutputSize);
    return truncatedOutput + '\n[Output truncated due to size limits]';
  }

  return output;
}

/**
 * Validate a command string for potential security issues
 */
export function validateCommand(
  command: string,
  config: MCPConfig
): { isValid: boolean; reason?: string } {
  if (!command || typeof command !== 'string') {
    return { isValid: false, reason: 'Command cannot be empty' };
  }

  // Check for basic command injection patterns
  const dangerousPatterns = [
    ';',
    '&&',
    '||',
    '`',
    '$(', // Command chaining/substitution
    '>',
    '>>',
    '<',
    '<<', // Redirection
    '|', // Piping
    '\\', // Escaping
    '--', // Long options that might bypass restrictions
  ];

  // If strict validation is enabled, don't allow dangerous patterns
  if (config.security.validateCommandsStrictly) {
    for (const pattern of dangerousPatterns) {
      if (command.includes(pattern)) {
        return { isValid: false, reason: `Command contains forbidden pattern: ${pattern}` };
      }
    }
  }

  // Check if the base command is allowed
  if (!isCommandAllowed(command, config)) {
    return { isValid: false, reason: 'Command is not in the allowed list' };
  }

  return { isValid: true };
}

/**
 * Configuration for the Bash MCP
 */
export interface MCPConfig {
  allowedCommands: string[];
  allowedDirectories: string[];
  session: {
    timeout: number;
    maxActiveSessions: number;
    defaultMode: 'stateless' | 'stateful';
  };
  security: {
    validateCommandsStrictly: boolean;
    sanitizeOutput: boolean;
    maxOutputSize: number;
    commandTimeout: number;
  };
  logging: {
    level: string;
    file: string;
    maxSize: number;
    maxFiles: number;
  };
}

/**
 * Session information for stateful execution
 */
import { IPty } from 'node-pty';

export interface Session {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  process: IPty; // Properly typed with node-pty implementation
  cwd: string;
  user?: string;
  isInteractive: boolean;
}

/**
 * Command execution options
 */
export interface ExecutionOptions {
  sessionId?: string;
  timeout?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Result of command execution
 */
export interface ExecutionResult {
  success: boolean;
  output: string;
  exitCode?: number;
  error?: string;
  sessionId?: string;
  command: string;
  isInteractive?: boolean;
  waitingForInput?: boolean;
}

/**
 * Input for an interactive session
 */
export interface SessionInput {
  sessionId: string;
  input: string;
}

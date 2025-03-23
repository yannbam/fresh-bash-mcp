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
 * Possible states for a PTY session
 */
export type SessionState = 'IDLE' | 'RUNNING_COMMAND' | 'INTERACTIVE_PROGRAM';

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
  state: SessionState;
  initialized: boolean;
  currentParser?: CommandOutputParser;
  pendingCommands?: string[];
}

/**
 * Parser for command output with markers
 */
export interface CommandOutputParser {
  state: 'IDLE' | 'COLLECTING' | 'COMPLETED';
  output: string;
  exitCode: number | null;
  command: string;
  startTime?: Date;
  endTime?: Date;
  
  processOutput(chunk: string): void;
  isComplete(): boolean;
  getResult(): CommandParseResult;
  reset(): void;
}

/**
 * Result from the command output parser
 */
export interface CommandParseResult {
  output: string;
  exitCode: number | null;
  duration?: number; // in milliseconds
  command: string;
  isInteractive?: boolean;
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
  duration?: number; // in milliseconds
}

/**
 * Input for an interactive session
 */
export interface SessionInput {
  sessionId: string;
  input: string;
  timeout?: number; // Timeout in milliseconds for collecting output
}

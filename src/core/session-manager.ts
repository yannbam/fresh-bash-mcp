import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { MCPConfig, Session, ExecutionResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { isDirectoryAllowed } from '../utils/validator.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private config: MCPConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: MCPConfig) {
    this.config = config;
    this.startCleanupInterval();
  }

  /**
   * Create a new session with a PTY process
   */
  public createSession(cwd: string): Session | null {
    // Validate the directory
    if (!isDirectoryAllowed(cwd, this.config)) {
      logger.error(`Cannot create session: directory ${cwd} is not allowed`);
      return null;
    }

    // Check if we've reached the maximum number of sessions
    if (this.sessions.size >= this.config.session.maxActiveSessions) {
      logger.error('Cannot create session: maximum number of sessions reached');
      return null;
    }

    try {
      // Create a unique ID for the session
      const sessionId = uuidv4();

      // Create a PTY process
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      // Convert process.env to the required format (string values only, no undefined)
      const envVars: { [key: string]: string } = {};
      Object.entries(process.env).forEach(([key, value]) => {
        if (value !== undefined) {
          envVars[key] = value;
        }
      });

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd,
        env: envVars,
      });

      // Create the session object
      const session: Session = {
        id: sessionId,
        createdAt: new Date(),
        lastActivity: new Date(),
        process: ptyProcess,
        cwd,
        isInteractive: true,
      };

      // Add the session to our map
      this.sessions.set(sessionId, session);

      // logger.info(`Created new session: ${sessionId}`);
      return session;
    } catch (error) {
      logger.error(
        `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Get a session by ID
   */
  public getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Execute a command in an existing session
   */
  public executeInSession(sessionId: string, command: string): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const session = this.sessions.get(sessionId);

      if (!session) {
        resolve({
          success: false,
          output: '',
          error: `Session ${sessionId} not found`,
          command,
        });
        return;
      }

      // Update last activity
      session.lastActivity = new Date();

      // Set up output collection
      let output = '';
      
      // Add data listener and get the disposable
      const dataDisposable = session.process.onData((data: string) => {
        output += data;
      });

      // Write the command to the PTY
      session.process.write(`${command}\n`);

      // For simplicity, we'll just collect output for a short time and then resolve
      // In a real implementation, you'd need a more sophisticated approach to detect when
      // the command has completed or is waiting for input
      setTimeout(() => {
        // Dispose the data listener
        dataDisposable.dispose();

        resolve({
          success: true,
          output,
          sessionId,
          command,
          isInteractive: true,
          waitingForInput: this.isWaitingForInput(output), // This would need a proper implementation
        });
      }, 1000); // This timeout would need adjustment or a better approach
    });
  }

  /**
   * Send input to an interactive session
   */
  public sendInput(sessionId: string, input: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.error(`Cannot send input: Session ${sessionId} not found`);
      return false;
    }

    // Update last activity
    session.lastActivity = new Date();

    // Write the input to the PTY
    session.process.write(`${input}\n`);
    logger.debug(`Sent input to session ${sessionId}`);

    return true;
  }

  /**
   * Close a session
   */
  public closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`Cannot close session: Session ${sessionId} not found`);
      return false;
    }

    try {
      // Kill the PTY process
      session.process.kill();

      // Remove the session from our map
      this.sessions.delete(sessionId);

      // logger.info(`Closed session: ${sessionId}`);
      return true;
    } catch (error) {
      logger.error(
        `Error closing session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * List all active sessions
   */
  public listSessions(): { id: string; createdAt: Date; lastActivity: Date; cwd: string }[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cwd: session.cwd,
    }));
  }

  /**
   * Start the cleanup interval to remove expired sessions
   */
  private startCleanupInterval(): void {
    // Clear any existing interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Set up a new interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Check every minute
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const sessionTimeout = this.config.session.timeout * 1000; // Convert to milliseconds

    for (const [sessionId, session] of this.sessions.entries()) {
      const timeSinceLastActivity = now.getTime() - session.lastActivity.getTime();

      if (timeSinceLastActivity > sessionTimeout) {
        // logger.info(`Session ${sessionId} has expired and will be closed`);
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Simple heuristic to determine if a process is waiting for input
   * This would need a more sophisticated implementation in production
   */
  private isWaitingForInput(output: string): boolean {
    // Look for common shell prompts
    const promptPatterns = [
      /[$>] *$/m, // Standard shell prompts
      /Password: *$/m, // Password prompts
      /\(y\/n\) *$/m, // Yes/no prompts
      /Continue\? *$/m, // Continue prompts
      /Press Enter/i, // Press Enter prompts
    ];

    return promptPatterns.some((pattern) => pattern.test(output));
  }

  /**
   * Clean up resources when shutting down
   */
  public shutdown(): void {
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }

    // logger.info('Session manager shut down');
  }
}

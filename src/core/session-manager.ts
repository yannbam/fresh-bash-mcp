import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import { MCPConfig, Session, ExecutionResult, SessionState } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { isDirectoryAllowed } from '../utils/validator.js';
import { DefaultCommandOutputParser, isInteractiveCommand, isWaitingForInput } from '../utils/command-parser.js';
import { BASH_INIT_SCRIPT, BASH_INIT_SCRIPT_NONINTERACTIVE, wrapCommand, isInitializationComplete } from '../utils/bash-init.js';

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
   * @param cwd Working directory for the session
   * @param interactive Whether this session is for interactive use (affects terminal settings)
   */
  public createSession(cwd: string, interactive: boolean = false): Promise<Session | null> {
    return new Promise((resolve) => {
      // Validate the directory
      if (!isDirectoryAllowed(cwd, this.config)) {
        logger.error(`Cannot create session: directory ${cwd} is not allowed`);
        resolve(null);
        return;
      }

      // Check if we've reached the maximum number of sessions
      if (this.sessions.size >= this.config.session.maxActiveSessions) {
        logger.error('Cannot create session: maximum number of sessions reached');
        resolve(null);
        return;
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
          state: 'IDLE',
          initialized: false,
          pendingCommands: []
        };

        // Add the session to our map
        this.sessions.set(sessionId, session);

        logger.debug(`Creating new session with ID: ${sessionId}, interactive: ${interactive}`);

        // Initialize the session with our script
        let output = '';
        
        const dataHandler = (data: string) => {
          output += data;
          if (isInitializationComplete(output)) {
            // Cleanup
            session.initialized = true;
            session.state = 'IDLE';
            ptyProcess.off('data', dataHandler);
            logger.debug(`Session ${sessionId} initialized successfully`);
            resolve(session);
          }
        };

        ptyProcess.onData(dataHandler);
        
        // Choose the appropriate initialization script based on the interactive flag
        const initScript = interactive ? BASH_INIT_SCRIPT : BASH_INIT_SCRIPT_NONINTERACTIVE;
        ptyProcess.write(`${initScript}\n`);

        // Set a timeout in case initialization never completes
        setTimeout(() => {
          if (!session.initialized) {
            logger.error(`Session initialization timeout: ${sessionId}`);
            this.closeSession(sessionId);
            resolve(null);
          }
        }, 5000); // 5-second timeout for initialization
      } catch (error) {
        logger.error(
          `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
        );
        resolve(null);
      }
    });
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
    return new Promise((resolve, reject) => {
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

      // Check if the session is initialized
      if (!session.initialized) {
        resolve({
          success: false,
          output: '',
          error: `Session ${sessionId} is not initialized`,
          command,
        });
        return;
      }

      // Update last activity
      session.lastActivity = new Date();

      // Check if the session is busy
      if (session.state !== 'IDLE') {
        resolve({
          success: false,
          output: '',
          error: `Session ${sessionId} is busy (${session.state})`,
          command,
        });
        return;
      }

      // Check if this is an interactive command
      const isInteractive = isInteractiveCommand(command);
      if (isInteractive) {
        session.state = 'INTERACTIVE_PROGRAM';
      } else {
        session.state = 'RUNNING_COMMAND';
      }

      // Create a parser for this command
      const parser = new DefaultCommandOutputParser(command);
      session.currentParser = parser;
      
      // Get the unique command ID
      const commandId = parser.getCommandId();
      
      logger.debug(`Executing command in session ${sessionId}: ${command} (ID: ${commandId})`);

      // Set up output collection
      const dataDisposable = session.process.onData((data: string) => {
        if (parser.state !== 'COMPLETED') {
          parser.processOutput(data);
          
          if (parser.isComplete()) {
            // Command has completed
            dataDisposable.dispose();
            const result = parser.getResult();
            
            // Update session state
            if (isInteractive) {
              session.state = 'INTERACTIVE_PROGRAM';
            } else {
              session.state = 'IDLE';
            }
            
            logger.debug(`Command completed in session ${sessionId}: ${command} (ID: ${commandId}, exitCode: ${result.exitCode})`);
            
            resolve({
              success: result.exitCode === 0,
              output: result.output,
              exitCode: result.exitCode || undefined,
              sessionId,
              command,
              isInteractive,
              waitingForInput: isWaitingForInput(result.output),
              duration: result.duration
            });
          }
        }
      });

      // Wrap the command with our markers and the unique command ID
      const wrappedCommand = wrapCommand(command, commandId);
      
      // Write the command to the PTY
      session.process.write(`${wrappedCommand}\n`);

      // Set a timeout in case the command never completes
      const timeoutMs = (this.config.security.commandTimeout || 30) * 1000;
      const timeoutId = setTimeout(() => {
        if (parser.state !== 'COMPLETED') {
          // Clean up
          dataDisposable.dispose();
          session.state = 'IDLE';
          session.currentParser = undefined;
          
          logger.warn(`Command timed out in session ${sessionId}: ${command} (ID: ${commandId})`);
          
          resolve({
            success: false,
            output: `Command timed out after ${this.config.security.commandTimeout} seconds`,
            error: `Command timed out after ${this.config.security.commandTimeout} seconds`,
            sessionId,
            command,
          });
        }
      }, timeoutMs);

      // Clear the timeout when the command completes
      const completeCheck = setInterval(() => {
        if (parser.isComplete()) {
          clearTimeout(timeoutId);
          clearInterval(completeCheck);
        }
      }, 100);
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
    logger.debug(`Sent input to session ${sessionId}: ${input}`);

    return true;
  }

  /**
   * Send input to an interactive session and collect the resulting output
   */
  public collectOutputAfterInput(
    sessionId: string, 
    input: string, 
    timeout: number = 1000
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const session = this.sessions.get(sessionId);

      if (!session) {
        resolve({
          success: false,
          output: '',
          error: `Session ${sessionId} not found`,
          command: input,
        });
        return;
      }

      // Update last activity
      session.lastActivity = new Date();

      // Set up output collection
      let output = '';
      let resultSent = false;
      
      logger.debug(`Collecting output after input in session ${sessionId}: ${input}`);
      
      // Add data listener and get the disposable
      const dataDisposable = session.process.onData((data: string) => {
        output += data;
        
        // If the output appears to stabilize and is waiting for input, return early
        if (output.length > 0 && isWaitingForInput(output) && !resultSent) {
          resultSent = true;
          
          // Wait a short time for any additional output
          setTimeout(() => {
            dataDisposable.dispose();
            
            logger.debug(`Output stabilized after input in session ${sessionId}, waiting for input detected`);
            
            resolve({
              success: true,
              output,
              sessionId,
              command: input,
              isInteractive: true,
              waitingForInput: true,
            });
          }, 100);
        }
      });

      // Write the input to the PTY
      session.process.write(`${input}\n`);

      // Set a timeout for returning results
      setTimeout(() => {
        if (!resultSent) {
          resultSent = true;
          dataDisposable.dispose();
          
          logger.debug(`Timeout after input in session ${sessionId}, collected output length: ${output.length}`);
          
          resolve({
            success: true,
            output,
            sessionId,
            command: input,
            isInteractive: true,
            waitingForInput: isWaitingForInput(output),
          });
        }
      }, timeout);
    });
  }

  /**
   * Close a session
   */
  public closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      // logger.warn(`Cannot close session: Session ${sessionId} not found`);
      return false;
    }

    try {
      // Kill the PTY process
      session.process.kill();

      // Remove the session from our map
      this.sessions.delete(sessionId);

      logger.debug(`Closed session: ${sessionId}`);
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
  public listSessions(): { id: string; createdAt: Date; lastActivity: Date; cwd: string; state: SessionState }[] {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cwd: session.cwd,
      state: session.state,
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
        logger.debug(`Session ${sessionId} has expired and will be closed`);
        this.closeSession(sessionId);
      }
    }
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

    logger.debug('Session manager shut down');
  }
}

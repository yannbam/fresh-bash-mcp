import { MCPConfig, ExecutionOptions, ExecutionResult, SessionInput } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { CommandExecutor } from './command-executor.js';
import { SessionManager } from './session-manager.js';

export class BashMCP {
  private config: MCPConfig;
  private commandExecutor: CommandExecutor;
  private sessionManager: SessionManager;

  constructor(config: MCPConfig) {
    this.config = config;
    this.commandExecutor = new CommandExecutor(config);
    this.sessionManager = new SessionManager(config);

    // logger.info('Bash MCP initialized');
  }

  /**
   * Execute a command with the given options
   */
  public async executeCommand(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    try {
      // Check if this is a stateful command (using an existing session)
      if (options.sessionId) {
        // logger.info(`Executing command in existing session: ${options.sessionId}`);
        return this.sessionManager.executeInSession(options.sessionId, command);
      }

      // Determine if we should create a new session or execute stateless
      if (options.cwd && this.config.session.defaultMode === 'stateful') {
        // Create a new session
        const session = this.sessionManager.createSession(options.cwd);

        if (!session) {
          return {
            success: false,
            output: '',
            error: 'Failed to create session',
            command,
          };
        }

        // logger.info(`Created new session ${session.id} for command execution`);
        return this.sessionManager.executeInSession(session.id, command);
      }

      // Execute stateless
      // logger.info('Executing stateless command');
      return this.commandExecutor.executeCommand(command, options);
    } catch (error) {
      logger.error(
        `Error executing command: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        command,
      };
    }
  }

  /**
   * Send input to an interactive session
   */
  public sendInput(input: SessionInput): Promise<ExecutionResult> {
    const { sessionId, input: inputText } = input;

    logger.info(`Sending input to session: ${sessionId}`);

    // Get the session
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return Promise.resolve({
        success: false,
        output: '',
        error: `Session ${sessionId} not found`,
        command: inputText,
      });
    }

    // Calculate timeout based on config
    const timeout = input.timeout || this.config.security.commandTimeout * 1000;

    // Use the new method to send input and collect output
    return this.sessionManager.collectOutputAfterInput(sessionId, inputText, timeout);
  }

  /**
   * Create a new interactive session
   */
  public createSession(cwd: string): { success: boolean; sessionId?: string; error?: string } {
    // logger.info(`Creating new session in directory: ${cwd}`);
    const session = this.sessionManager.createSession(cwd);

    if (!session) {
      return {
        success: false,
        error: 'Failed to create session',
      };
    }

    return {
      success: true,
      sessionId: session.id,
    };
  }

  /**
   * Close a session
   */
  public closeSession(sessionId: string): { success: boolean; error?: string } {
    // logger.info(`Closing session: ${sessionId}`);
    const success = this.sessionManager.closeSession(sessionId);

    if (!success) {
      return {
        success: false,
        error: `Failed to close session ${sessionId}`,
      };
    }

    return {
      success: true,
    };
  }

  /**
   * List all active sessions
   */
  public listSessions() {
    return this.sessionManager.listSessions();
  }

  /**
   * Shut down the MCP
   */
  public shutdown(): void {
    // logger.info('Shutting down Bash MCP');
    this.sessionManager.shutdown();
  }
}

import { spawn } from 'child_process';
import { MCPConfig, ExecutionOptions, ExecutionResult } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { validateCommand, sanitizeOutput, isDirectoryAllowed } from '../utils/validator.js';

export class CommandExecutor {
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
  }

  /**
   * Execute a command in non-interactive mode
   */
  public async executeCommand(
    command: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    // Use default options if not provided
    const timeout = options.timeout || this.config.security.commandTimeout;
    const cwd = options.cwd || process.cwd();

    // Handle environment variables - ensure all values are strings
    let env = options.env;
    if (!env) {
      env = {};
      Object.entries(process.env).forEach(([key, value]) => {
        if (value !== undefined) {
          env![key] = value;
        }
      });
    }

    // Validate the command
    const validation = validateCommand(command, this.config);
    if (!validation.isValid) {
      logger.warn(`Command validation failed: ${validation.reason}`);
      return {
        success: false,
        output: `Command validation failed: ${validation.reason}`,
        error: validation.reason,
        command,
      };
    }

    // Validate the directory
    if (!isDirectoryAllowed(cwd, this.config)) {
      logger.warn(`Directory not allowed: ${cwd}`);
      return {
        success: false,
        output: `Directory not allowed: ${cwd}\nAllowed directories: ${this.config.allowedDirectories}`,
        error: '',
        command,
      };
    }

    // Log the command execution
    logger.info(`Executing command: ${command} in directory: ${cwd}`);

    try {
      // Execute the command
      const result = await this.spawnCommand(command, cwd, env, timeout);

      // Sanitize the output
      const sanitizedOutput = sanitizeOutput(result.output, this.config);

      return {
        ...result,
        output: sanitizedOutput,
        command,
      };
    } catch (error) {
      logger.error(
        `Command execution error: ${error instanceof Error ? error.message : String(error)}`
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
   * Spawn a child process to execute the command
   */
  private spawnCommand(
    command: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeoutSeconds: number
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      // Split the command into the executable and arguments
      const [cmd, ...args] = command.split(' ');

      // Create the child process
      const childProcess = spawn(cmd, args, {
        cwd,
        env,
        shell: true,
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Collect stdout
      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      childProcess.on('close', (code) => {
        if (killed) {
          resolve({
            success: false,
            output: stdout + stderr,
            exitCode: code || undefined,
            error: 'Command execution timed out',
            command,
          });
        } else {
          resolve({
            success: code === 0,
            output: stdout + stderr,
            exitCode: code || undefined,
            error: code !== 0 ? `Command exited with code ${code}` : undefined,
            command,
          });
        }
      });

      // Handle process errors
      childProcess.on('error', (error) => {
        resolve({
          success: false,
          output: stdout + stderr,
          error: error.message,
          command,
        });
      });

      // Set a timeout to kill the process if it runs too long
      const timeoutId = setTimeout(() => {
        logger.warn(`Command timed out after ${timeoutSeconds} seconds: ${command}`);
        killed = true;
        childProcess.kill();
      }, timeoutSeconds * 1000);

      // Clear the timeout if the process completes before the timeout
      childProcess.on('close', () => {
        clearTimeout(timeoutId);
      });
    });
  }
}

import { CommandOutputParser, CommandParseResult } from '../types/index.js';
import { logger } from './logger.js';

/**
 * Parser that processes command output with special markers to reliably detect
 * when commands have completed execution and extract their exit codes.
 */
export class DefaultCommandOutputParser implements CommandOutputParser {
  public state: 'IDLE' | 'COLLECTING' | 'COMPLETED' = 'IDLE';
  public output = '';
  public exitCode: number | null = null;
  public command: string;
  public startTime?: Date;
  public endTime?: Date;
  private buffer = '';
  private commandId: string;

  /**
   * Create a new command output parser
   * @param command The command being executed
   */
  constructor(command: string) {
    this.command = command;
    // Generate a unique ID for this command execution
    this.commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  /**
   * Process a chunk of output from the PTY
   * @param chunk The output chunk to process
   */
  public processOutput(chunk: string): void {
    // Add the new chunk to our buffer
    this.buffer += chunk;
    
    logger.debug(`Parser state: ${this.state}, chunk length: ${chunk.length}`);
    logger.debug(`Chunk preview: ${chunk.substring(0, Math.min(50, chunk.length)).replace(/\n/g, '\\n')}...`);
    
    // Process the buffer based on current state
    if (this.state === 'IDLE') {
      this.processStart();
    } 
    
    if (this.state === 'COLLECTING') {
      this.processEnd();
    }
  }

  /**
   * Process the buffer to look for the start marker
   */
  private processStart(): void {
    // Look for the complete start marker with our command ID
    const startPattern = new RegExp(`MCP_CMD_START\\|([0-9.]+)\\|${this.commandId}`);
    const startMatch = this.buffer.match(startPattern);
    
    if (startMatch) {
      // We found our specific start marker
      logger.debug(`Found start marker for command: ${this.command}, ID: ${this.commandId}`);
      
      try {
        // Convert the timestamp to a Date object
        const timestamp = parseFloat(startMatch[1]);
        this.startTime = new Date(timestamp * 1000);
      } catch (e) {
        logger.warn(`Failed to parse command start timestamp: ${e}`);
        this.startTime = new Date();
      }
      
      // Move to the COLLECTING state
      this.state = 'COLLECTING';
      
      // Find the position after the start marker (end of the line)
      const markerIndex = this.buffer.indexOf(startMatch[0]);
      const lineEndIndex = this.buffer.indexOf('\n', markerIndex);
      
      if (lineEndIndex !== -1) {
        // Remove everything up to and including the start marker line
        this.buffer = this.buffer.substring(lineEndIndex + 1);
      } else {
        // If there's no newline, clear the buffer as it's just the marker
        this.buffer = '';
      }
    }
  }

  /**
   * Process the buffer to look for the end marker
   */
  private processEnd(): void {
    // Look for the complete end marker with our command ID
    const endPattern = new RegExp(`MCP_CMD_END\\|([0-9.]+)\\|${this.commandId}\\|(\\d+)`);
    const endMatch = this.buffer.match(endPattern);
    
    if (endMatch) {
      // We found our specific end marker
      logger.debug(`Found end marker for command: ${this.command}, ID: ${this.commandId}`);
      
      try {
        // Save the exit code
        this.exitCode = parseInt(endMatch[2], 10);
        
        // Save the end timestamp
        const timestamp = parseFloat(endMatch[1]);
        this.endTime = new Date(timestamp * 1000);
      } catch (e) {
        logger.warn(`Failed to parse command end marker: ${e}`);
        this.exitCode = 1; // Assume failure
        this.endTime = new Date();
      }
      
      // Extract output (everything before the end marker)
      const markerIndex = this.buffer.indexOf(endMatch[0]);
      this.output = this.buffer.substring(0, markerIndex);
      
      // Clean up the output
      this.cleanOutput();
      
      // Switch to the COMPLETED state
      this.state = 'COMPLETED';
      logger.debug(`Command completed: ${this.command}, Exit code: ${this.exitCode}`);
    }
  }

  /**
   * Check if the command has completed execution
   */
  public isComplete(): boolean {
    return this.state === 'COMPLETED';
  }

  /**
   * Get the parsed result
   */
  public getResult(): CommandParseResult {
    let duration: number | undefined;
    
    if (this.startTime && this.endTime) {
      duration = this.endTime.getTime() - this.startTime.getTime();
    }
    
    return {
      output: this.output,
      exitCode: this.exitCode,
      command: this.command,
      duration
    };
  }

  /**
   * Reset the parser to its initial state
   */
  public reset(): void {
    this.state = 'IDLE';
    this.output = '';
    this.buffer = '';
    this.exitCode = null;
    this.startTime = undefined;
    this.endTime = undefined;
  }

  /**
   * Get the unique ID for this command execution
   */
  public getCommandId(): string {
    return this.commandId;
  }

  /**
   * Clean the output by removing MCP-specific markers and formatting
   */
  private cleanOutput(): void {
    // Remove our custom PS1 prompt lines
    this.output = this.output.replace(/MCP_PROMPT\|\d+\|#\s*/g, '');
    
    // Trim leading/trailing whitespace
    this.output = this.output.trim();
  }
}

/**
 * Detect if a command is likely to be an interactive program
 * @param command The command to check
 */
export function isInteractiveCommand(command: string): boolean {
  // Common interactive commands
  const interactiveCommands = [
    /^top\b/, /^vim\b/, /^nano\b/, /^less\b/, /^more\b/,
    /^ssh\b/, /^man\b/, /^vi\b/, /^emacs\b/, /^python\b/,
    /^node\b/, /^mysql\b/, /^psql\b/, /^ftp\b/, /^sftp\b/,
    /^telnet\b/, /^gdb\b/, /^debug\b/, /htop\b/, /^screen\b/,
    /^tmux\b/, /^watch\b/, /^tail -f\b/, /^grep --line-buffered\b/
  ];
  
  // Check if the command matches any known interactive pattern
  return interactiveCommands.some(pattern => pattern.test(command.trim()));
}

/**
 * Detect if the command output indicates that it's waiting for user input
 * @param output The command output to check
 */
export function isWaitingForInput(output: string): boolean {
  // Common prompt patterns
  const promptPatterns = [
    /[$#>] *$/m, // Standard shell prompts (bash, zsh, etc.)
    /Password: *$/m, // Password prompts
    /\(y\/n\)[^\n]*$/m, // Yes/no prompts
    /\(Y\/n\)[^\n]*$/m, // Yes/no prompts (capital Y variant)
    /\[y\/N\][^\n]*$/m, // Yes/no prompts (square brackets variant)
    /Continue\?[^\n]*$/m, // Continue prompts
    /Press [Ee]nter[^\n]*$/m, // Press Enter prompts
    /:\s*$/m, // Colon at end of line (often indicates input prompt)
    /[Mm]ore[^\n]*$/m, // More prompts (for pagers like less, more)
    /\? *$/m, // Question mark at end (common for interactive prompts)
    /[Pp]rompt[^\n]*: *$/m, // Explicit prompts
    /^\s*> *$/m, // Simple > prompt on its own line
    /\([^)]*\) *$/m, // Parenthesized prompts like (y/n)
  ];

  // Check if any of these patterns match at the end of the output
  const trimmedOutput = output.trimEnd();
  return promptPatterns.some(pattern => pattern.test(trimmedOutput));
}

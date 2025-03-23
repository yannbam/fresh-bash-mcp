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

  /**
   * Create a new command output parser
   * @param command The command being executed
   */
  constructor(command: string) {
    this.command = command;
  }

  /**
   * Process a chunk of output from the PTY
   * @param chunk The output chunk to process
   */
  public processOutput(chunk: string): void {
    // Add the new chunk to our buffer
    this.buffer += chunk;

    // Look for the start marker
    if (this.state === 'IDLE') {
      const startMarkerIndex = this.buffer.indexOf('MCP_CMD_START|');
      if (startMarkerIndex !== -1) {
        // We found the start marker
        const startTimestampMatch = this.buffer.match(/MCP_CMD_START\|([0-9.]+)/);
        if (startTimestampMatch) {
          try {
            // Convert the timestamp to a Date object
            const timestamp = parseFloat(startTimestampMatch[1]);
            this.startTime = new Date(timestamp * 1000);
          } catch (e) {
            logger.warn(`Failed to parse command start timestamp: ${e}`);
            this.startTime = new Date();
          }
        }

        // Move to the COLLECTING state
        this.state = 'COLLECTING';
        
        // Remove everything up to and including the start marker
        const contentAfterMarker = this.buffer.substring(startMarkerIndex + 'MCP_CMD_START|'.length);
        
        // Find the first newline after the marker (to remove timestamp line)
        const firstNewline = contentAfterMarker.indexOf('\n');
        if (firstNewline !== -1) {
          this.buffer = contentAfterMarker.substring(firstNewline + 1);
        } else {
          // If there's no newline, clear the buffer as it's just the marker
          this.buffer = '';
        }
      }
    }
    
    // If we're collecting output, check for the end marker
    if (this.state === 'COLLECTING') {
      const endMarkerIndex = this.buffer.indexOf('MCP_CMD_END|');
      if (endMarkerIndex !== -1) {
        // We found the end marker
        
        // Extract everything before the end marker
        this.output = this.buffer.substring(0, endMarkerIndex);
        
        // Extract the exit code
        const endMatch = this.buffer.match(/MCP_CMD_END\|([0-9.]+)\|(\d+)/);
        if (endMatch) {
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
        } else {
          // If we can't extract the exit code, assume it's a failure
          this.exitCode = 1;
          this.endTime = new Date();
        }
        
        // Switch to the COMPLETED state
        this.state = 'COMPLETED';
        
        // Clean up any prompt strings that might be left in the output
        this.cleanOutput();
      }
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

import path from 'path';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BashMCP } from './core/bash-mcp.js';
import { loadConfig } from './utils/config.js';
import { createLogger, logger } from './utils/logger.js';
import { ExecutionOptions, SessionInput, ExecutionResult } from './types/index.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';

// Fix the __dirname issue in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define schemas for the tools API
const ToolsListRequestSchema = z.object({
  method: z.literal('tools/list'),
  params: z.object({}).optional(),
});

// Define a schema for tool execution
const ToolCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any()).optional(),
  }),
});

// Export types
export * from './types/index.js';

// Export the BashMCP class
export { BashMCP } from './core/bash-mcp.js';

/**
 * Initialize the Bash MCP with the given config path
 */
export async function initBashMCP(
  configPath: string = path.join(__dirname, '../config/default.json')
): Promise<BashMCP> {
  try {
    // Load the configuration
    const config = await loadConfig(configPath);

    // Update the logger with the loaded configuration
    const updatedLogger = createLogger(config);
    Object.assign(logger, updatedLogger);

    // Create and return the BashMCP instance
    return new BashMCP(config);
  } catch (error) {
    logger.error(
      `Failed to initialize Bash MCP: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Execute a command using the MCP
 */
export async function executeCommand(
  command: string,
  options: ExecutionOptions = {},
  configPath?: string
): Promise<ExecutionResult> {
  // Initialize the MCP
  const mcp = await initBashMCP(configPath);

  try {
    // Execute the command
    return await mcp.executeCommand(command, options);
  } finally {
    // Clean up
    mcp.shutdown();
  }
}

/**
 * Send input to an interactive session
 */
export async function sendInput(
  input: SessionInput,
  configPath?: string
): Promise<ExecutionResult> {
  // Initialize the MCP
  const mcp = await initBashMCP(configPath);

  try {
    // Send the input
    return await mcp.sendInput(input);
  } finally {
    // We don't shut down the MCP here because we want to keep the session alive
  }
}

/**
 * Start an interactive bash session for testing
 * Creates a session and enters a REPL where commands are sent to the session
 * and output is displayed
 */
export async function startInteractiveSession(cwd: string = process.cwd()) {
  // Initialize the MCP
  const mcp = await initBashMCP();
  let sessionId: string | undefined;
  
  try {
    // Create a session - explicitly set as interactive
    console.log(`Creating interactive session in: ${cwd}`);
    const result = await mcp.createSession(cwd, true);
    
    if (!result.success || !result.sessionId) {
      console.error(`Failed to create session: ${result.error || 'Unknown error'}`);
      process.exit(1);
    }
    
    sessionId = result.sessionId;
    console.log(`Session created with ID: ${sessionId}`);
    console.log('Type commands to execute them. Type \'exit\' or \'quit\' to end the session.');
    console.log('---------------------------------------------------');
    
    // Set up readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ '
    });
    
    // Start the REPL loop
    rl.prompt();
    
    rl.on('line', async (line) => {
      // Check for exit command
      const input = line.trim();
      if (input === 'exit' || input === 'quit') {
        console.log('Exiting interactive session...');
        rl.close();
        return;
      }
      
      try {
        // Send the input to the session
        // Use the default timeout from security.commandTimeout (convert to ms)
        const timeoutMs = mcp.getConfig().security.commandTimeout * 1000;
        
        // We've already checked sessionId earlier, but TypeScript needs reassurance
        if (!sessionId) {
          throw new Error('Session ID not available');
        }
        
        const response = await mcp.sendInput({ sessionId, input, timeout: timeoutMs });
        
        // Display the output
        console.log(response.output);
        
        // Indicate if the session is waiting for input
        if (response.waitingForInput) {
          console.log('(Waiting for input...)');
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Prompt for the next command
      rl.prompt();
    });
    
    rl.on('close', () => {
      console.log('Closing session...');
      if (sessionId) {
        mcp.closeSession(sessionId);
      }
      mcp.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error(`Session error: ${error instanceof Error ? error.message : String(error)}`);
    // Try to clean up the session if it was created
    if (sessionId) {
      try {
        mcp.closeSession(sessionId);
      } catch (closeError) {
        console.error(`Error closing session: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
      }
    }
    mcp.shutdown();
    throw error;
  }
}

/**
 * Create a timeout promise for race conditions
 * @param timeoutMs Timeout in milliseconds
 * @param command Command being executed (for error reporting)
 */
function createTimeoutPromise(timeoutMs: number, command: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: false,
        output: `Command timed out after ${timeoutMs/1000} seconds`,
        error: 'Execution timeout',
        command
      });
    }, timeoutMs);
  });
}

/**
 * Start an MCP server that exposes the Bash MCP functionality
 */
export async function startMcpServer(configPath: string = path.join(__dirname, '../config/default.json')) {
  try {
    // Load the MCP configuration
    const config = await loadConfig(configPath);

    // Create a BashMCP instance
    const bashMcp = new BashMCP(config);

    // Create an MCP server
    const server = new Server(
      {
        name: 'bash-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
      }
    );

    // Register the tools/list handler
    server.setRequestHandler(ToolsListRequestSchema, async () => {
      logger.debug('Handling tools/list request');
      return {
        tools: [
          {
            name: 'execute_command',
            description: 'Execute a Bash command with security safeguards',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'The bash command to execute' },
                cwd: { type: 'string', description: 'Working directory for the command (must be in an allowed directory)' },
                timeout: { type: 'number', description: 'Timeout in seconds (defaults to config setting)' },
                sessionId: { type: 'string', description: 'Session ID for stateful commands (if omitted, a stateless command is executed)' },
              },
              required: ['command'],
            },
          },
          // {
          //   name: 'create_session',
          //   description: 'Create a new interactive bash session',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {
          //       cwd: { type: 'string', description: 'Working directory for the session (must be in an allowed directory)' },
          //     },
          //     required: ['cwd'],
          //   },
          // },
          // {
          //   name: 'send_session_input',
          //   description: 'Send input to an interactive bash session',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {
          //       sessionId: { type: 'string', description: 'Session ID of the interactive session' },
          //       input: { type: 'string', description: 'The input to send to the session' },
          //       timeout: { type: 'number', description: 'Timeout in seconds for output collection (defaults to config setting)' },
          //     },
          //     required: ['sessionId', 'input'],
          //   },
          // },
          // {
          //   name: 'close_session',
          //   description: 'Close an interactive bash session',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {
          //       sessionId: { type: 'string', description: 'Session ID of the interactive session to close' },
          //     },
          //     required: ['sessionId'],
          //   },
          // },
          // {
          //   name: 'list_sessions',
          //   description: 'List all active bash sessions',
          //   inputSchema: {
          //     type: 'object',
          //     properties: {},
          //   },
          },
        ],
      };
    });

    // Register the tools/call handler for executing tools
    server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      logger.debug(`Handling tools/call request for: ${request.params.name}`);
      
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      // Handle execute_command
      if (toolName === 'execute_command') {
        try {
          logger.debug(`MCP: Executing command: ${args.command}`);
          
          // Get timeout from args or config
          const timeoutSec = args.timeout || config.security.commandTimeout;
          const timeoutMs = timeoutSec * 1000;
          
          // Create a promise for the command execution
          const commandPromise = bashMcp.executeCommand(args.command, { 
            cwd: args.cwd, 
            timeout: timeoutSec, 
            sessionId: args.sessionId 
          });
          
          // Create a timeout promise
          const timeoutPromise = createTimeoutPromise(timeoutMs, args.command);
          
          // Race the command execution against the timeout
          const result = await Promise.race([commandPromise, timeoutPromise]);
          
          logger.debug(`MCP: Command execution completed with success=${result.success}`);

          return {
            content: [
              {
                type: 'text',
                text: result.output,
              },
            ],
            isError: !result.success,
          };
        } catch (error) {
          logger.error(`MCP tool error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: 'text',
                text: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Handle create_session
      else if (toolName === 'create_session') {
        try {
          logger.debug(`MCP: Creating session in: ${args.cwd}`);
          
          // Create a non-interactive session for MCP use (works better with tools)
          const result = await bashMcp.createSession(args.cwd, false);

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Failed to create session: ${result.error || 'unknown error'}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Created new session with ID: ${result.sessionId}`,
              },
            ],
          };
        } catch (error) {
          logger.error(`MCP tool error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: 'text',
                text: `Error creating session: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Handle send_session_input
      else if (toolName === 'send_session_input') {
        try {
          logger.debug(`MCP: Sending input to session: ${args.sessionId}`);
          
          // Convert timeout from seconds to milliseconds if provided
          const timeoutSec = args.timeout || config.security.commandTimeout;
          const timeoutMs = timeoutSec * 1000;
          
          // Create a promise for the input operation
          const inputPromise = bashMcp.sendInput({ 
            sessionId: args.sessionId, 
            input: args.input,
            timeout: timeoutMs
          });
          
          // Create a timeout promise
          const timeoutPromise = createTimeoutPromise(timeoutMs, args.input);
          
          // Race the input operation against the timeout
          const result = await Promise.race([inputPromise, timeoutPromise]);
          
          logger.debug(`MCP: Session input completed with success=${result.success}`);

          return {
            content: [
              {
                type: 'text',
                text: result.output,
              },
            ],
            isError: !result.success,
          };
        } catch (error) {
          logger.error(`MCP tool error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: 'text',
                text: `Error sending input: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Handle close_session
      else if (toolName === 'close_session') {
        try {
          logger.debug(`MCP: Closing session: ${args.sessionId}`);
          
          const result = bashMcp.closeSession(args.sessionId);

          if (!result.success) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Failed to close session: ${result.error || 'unknown error'}`,
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: `Session ${args.sessionId} closed successfully`,
              },
            ],
          };
        } catch (error) {
          logger.error(`MCP tool error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: 'text',
                text: `Error closing session: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Handle list_sessions
      else if (toolName === 'list_sessions') {
        try {
          logger.debug('MCP: Listing all sessions');
          
          const sessions = bashMcp.listSessions();
          
          if (sessions.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'No active sessions',
                },
              ],
            };
          }

          const sessionList = sessions.map((s) => 
            `ID: ${s.id}\nCreated: ${s.createdAt.toISOString()}\nLast Activity: ${s.lastActivity.toISOString()}\nDirectory: ${s.cwd}\nState: ${s.state}`
          ).join('\n\n');

          return {
            content: [
              {
                type: 'text',
                text: `Active sessions:\n\n${sessionList}`,
              },
            ],
          };
        } catch (error) {
          logger.error(`MCP tool error: ${error instanceof Error ? error.message : String(error)}`);
          return {
            content: [
              {
                type: 'text',
                text: `Error listing sessions: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
      }
      
      // Unknown tool
      else {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${toolName}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Connect the server using stdio transport
    const transport = new StdioServerTransport();
    
    // Set up cleanup on exit
    process.on('SIGINT', () => {
      logger.debug('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.debug('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    // Start the server
    await server.connect(transport);
    logger.debug('MCP server running');

  } catch (error) {
    logger.error(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Command-line interface
// In ES modules, we can check if this file is being run directly using import.meta.url
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const args = process.argv.slice(2);
  
  // Check if we should run in MCP server mode
  if (args.length > 0 && args[0] === '--mcp-server') {
    // Start the MCP server
    startMcpServer().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  } 
  // Check if we should run in interactive mode
  else if (args.includes('--interactive') || args.includes('-i')) {
    // Extract the working directory if specified
    let cwd = process.cwd();
    const cwdIndex = args.indexOf('--cwd');
    if (cwdIndex !== -1 && args.length > cwdIndex + 1) {
      cwd = args[cwdIndex + 1];
    }
    
    // Start interactive REPL
    startInteractiveSession(cwd).catch((error) => {
      console.error('Interactive session error:', error);
      process.exit(1);
    });
  }
  // Regular CLI mode for single command execution
  else {
    if (args.length === 0) {
      console.log('Usage: bash-mcp <command> [options]');
      console.log('       bash-mcp --mcp-server (to start MCP server mode)');
      console.log('       bash-mcp --interactive [--cwd <directory>] (to start interactive mode)');
      process.exit(1);
    }

    const command = args[0];
    const options: ExecutionOptions = {};

    // Simple option parsing
    for (let i = 1; i < args.length; i += 2) {
      const option = args[i];
      const value = args[i + 1];

      if (option === '--session') {
        options.sessionId = value;
      } else if (option === '--cwd') {
        options.cwd = value;
      } else if (option === '--timeout') {
        options.timeout = parseInt(value, 10);
      }
    }

    // Execute the command
    executeCommand(command, options)
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      })
      .catch((error) => {
        console.error('Error:', error);
        process.exit(1);
      });
  }
}

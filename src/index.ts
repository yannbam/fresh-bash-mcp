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
      logger.info('Handling tools/list request');
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
          {
            name: 'create_session',
            description: 'Create a new interactive bash session',
            inputSchema: {
              type: 'object',
              properties: {
                cwd: { type: 'string', description: 'Working directory for the session (must be in an allowed directory)' },
              },
              required: ['cwd'],
            },
          },
          {
            name: 'send_session_input',
            description: 'Send input to an interactive bash session',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'Session ID of the interactive session' },
                input: { type: 'string', description: 'The input to send to the session' },
              },
              required: ['sessionId', 'input'],
            },
          },
          {
            name: 'close_session',
            description: 'Close an interactive bash session',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string', description: 'Session ID of the interactive session to close' },
              },
              required: ['sessionId'],
            },
          },
          {
            name: 'list_sessions',
            description: 'List all active bash sessions',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Register the tools/call handler for executing tools
    server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      logger.info(`Handling tools/call request for: ${request.params.name}`);
      
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      // Handle execute_command
      if (toolName === 'execute_command') {
        try {
          logger.info(`MCP: Executing command: ${args.command}`);
          
          const result = await bashMcp.executeCommand(args.command, { 
            cwd: args.cwd, 
            timeout: args.timeout, 
            sessionId: args.sessionId 
          });

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
          logger.info(`MCP: Creating session in: ${args.cwd}`);
          
          const result = bashMcp.createSession(args.cwd);

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
          logger.info(`MCP: Sending input to session: ${args.sessionId}`);
          
          const result = await bashMcp.sendInput({ sessionId: args.sessionId, input: args.input });

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
          logger.info(`MCP: Closing session: ${args.sessionId}`);
          
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
          logger.info('MCP: Listing all sessions');
          
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

          const sessionList = sessions.map((s: { id: string, createdAt: Date, lastActivity: Date, cwd: string }) => 
            `ID: ${s.id}\nCreated: ${s.createdAt.toISOString()}\nLast Activity: ${s.lastActivity.toISOString()}\nDirectory: ${s.cwd}`
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
      logger.info('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    // Start the server
    await server.connect(transport);
    logger.info('MCP server running');

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
  } else {
    // Regular CLI mode
    if (args.length === 0) {
      console.log('Usage: bash-mcp <command> [options]');
      console.log('       bash-mcp --mcp-server (to start MCP server mode)');
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

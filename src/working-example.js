/**
 * Working MCP server example that uses the correct API for SDK version 0.5.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { BashMCP } from './core/bash-mcp.js';
import { loadConfig } from './utils/config.js';

// Define schemas for the tools API
import { z } from 'zod';

// Fix the __dirname issue in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define a simple tools schema
const ToolsListRequestSchema = z.object({
  method: z.literal('tools/list'),
  params: z.object({}).optional(),
});

const ToolsListResultSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.object({
      type: z.literal('object'),
      properties: z.record(z.any()).optional(),
      required: z.array(z.string()).optional(),
    }),
  })),
});

// Define a schema for tool execution
const ToolCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any()).optional(),
  }),
});

const ToolCallResultSchema = z.object({
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
  })),
  isError: z.boolean().optional(),
});

async function startMcpServer() {
  try {
    // Load the MCP configuration
    const configPath = path.join(__dirname, '../config/default.json');
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
      console.log('Handling tools/list request');
      return {
        tools: [
          {
            name: 'execute_command',
            description: 'Execute a Bash command with security safeguards',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'The bash command to execute' },
                cwd: { type: 'string', description: 'Working directory for the command' },
                timeout: { type: 'number', description: 'Timeout in seconds' },
                sessionId: { type: 'string', description: 'Session ID for stateful commands' },
              },
              required: ['command'],
            },
          },
        ],
      };
    });

    // Register the tools/call handler for executing commands
    server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      console.log('Handling tools/call request for:', request.params.name);
      
      if (request.params.name === 'execute_command') {
        try {
          const args = request.params.arguments || {};
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
          console.error('Error executing command:', error);
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

      return {
        content: [
          {
            type: 'text',
            text: `Unknown tool: ${request.params.name}`,
          },
        ],
        isError: true,
      };
    });

    // Connect to the server using stdin/stdout
    const transport = new StdioServerTransport();
    
    // Set up cleanup on exit
    process.on('SIGINT', () => {
      console.log('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down MCP server');
      bashMcp.shutdown();
      process.exit(0);
    });

    // Start the server
    await server.connect(transport);
    console.error('MCP Server running on stdio');

  } catch (error) {
    console.error(`Failed to start MCP server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Start the server
startMcpServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

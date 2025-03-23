// Simple JavaScript version that doesn't need TypeScript compilation
// This can be used as a fallback if the TypeScript version has issues
// Updated to use SDK version 1.0.1

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './utils/config.js';
import { BashMCP } from './core/bash-mcp.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define request schemas for tools
const ToolsListRequestSchema = z.object({
  method: z.literal('tools/list'),
  params: z.object({}).optional(),
});

const ToolCallRequestSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.any()).optional(),
  }),
});

// Create a simple MCP server that exposes bash command execution
async function startMcpServer() {
  try {
    // Load configuration
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
            description: 'Execute a bash command',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'The command to execute' },
                cwd: { type: 'string', description: 'Working directory' },
              },
              required: ['command'],
            },
          },
        ],
      };
    });
    
    // Register the tools/call handler
    server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      console.log('Handling tools/call request for:', request.params.name);
      
      if (request.params.name === 'execute_command') {
        try {
          const args = request.params.arguments || {};
          const result = await bashMcp.executeCommand(args.command, { cwd: args.cwd });
          
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
    
    // Connect the server
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
    
    await server.connect(transport);
    console.error('MCP Server running on stdio');
  } catch (error) {
    console.error('Error starting MCP server:', error);
    process.exit(1);
  }
}

// Start the server
startMcpServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

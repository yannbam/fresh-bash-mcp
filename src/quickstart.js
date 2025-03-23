/**
 * This is a minimal example based on the quickstart example from the MCP docs
 * Updated to use SDK version 1.0.1
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Define request schema for tools
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

// Create server instance
const server = new Server(
  {
    name: "bash-mcp",
    version: "1.0.0",
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
        name: 'echo',
        description: 'Echo back a message',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to echo back' },
          },
          required: ['message'],
        },
      },
    ],
  };
});

// Register the tools/call handler
server.setRequestHandler(ToolCallRequestSchema, async (request) => {
  console.log('Handling tools/call request for:', request.params.name);
  
  if (request.params.name === 'echo') {
    try {
      const message = request.params.arguments?.message || '';
      return {
        content: [
          {
            type: 'text',
            text: `You said: ${message}`,
          },
        ],
      };
    } catch (error) {
      console.error('Error in echo tool:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

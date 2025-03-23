// This file is deprecated and has been merged into src/index.ts
// Please use `npm run mcp` or `node dist/index.js --mcp-server` to run the MCP server

// This file simply re-exports from index.ts for backward compatibility
import { startMcpServer } from '../index.js';

export { startMcpServer };

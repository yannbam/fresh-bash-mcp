# Bash MCP Server Documentation

This document explains how to use the Bash MCP server, which implements the Model Context Protocol (MCP) to provide secure bash command execution capabilities.

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Starting the MCP Server

```bash
# Start the MCP server
npm run mcp
```

## Using with MCP Inspector

You can use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to interact with the server:

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

This will start the MCP Inspector web interface, which allows you to test the server's tools.

## Available Tools

The Bash MCP server exposes the following tools:

### Execute Command

Executes a bash command with security safeguards.

**Tool name:** `execute_command`

**Parameters:**
- `command` (string, required): The bash command to execute.
- `cwd` (string, optional): Working directory for the command (must be in an allowed directory).
- `timeout` (number, optional): Timeout in seconds (defaults to config setting).
- `sessionId` (string, optional): Session ID for stateful commands (if omitted, a stateless command is executed).

### Create Session

Creates a new interactive bash session.

**Tool name:** `create_session`

**Parameters:**
- `cwd` (string, required): Working directory for the session (must be in an allowed directory).

### Send Session Input

Sends input to an existing interactive bash session.

**Tool name:** `send_session_input`

**Parameters:**
- `sessionId` (string, required): Session ID of the interactive session.
- `input` (string, required): The input to send to the session.

### Close Session

Closes an interactive bash session.

**Tool name:** `close_session`

**Parameters:**
- `sessionId` (string, required): Session ID of the interactive session to close.

### List Sessions

Lists all active bash sessions.

**Tool name:** `list_sessions`

**Parameters:** None

## Security Considerations

The MCP server inherits all the security mechanisms of the underlying Bash MCP library:

- Commands are validated against a whitelist
- Directories are restricted to allowed paths
- Output is sanitized
- Command execution has timeouts
- Session management includes automatic cleanup

## Configuration

The MCP server uses the same configuration file as the Bash MCP library, located at `config/default.json`. See the main README.md for configuration details.

## Example Usage with MCP Inspector

1. Start the MCP server with the Inspector: 
   ```bash
   npx @modelcontextprotocol/inspector node dist/mcp-server.js
   ```

2. Open the Inspector web interface (usually at http://localhost:5173)

3. Navigate to the Tools tab

4. Try executing a command:
   - Tool: `execute_command`
   - Parameters: 
     ```json
     {
       "command": "ls -la",
       "cwd": "/tmp"
     }
     ```

5. Create a session:
   - Tool: `create_session`
   - Parameters:
     ```json
     {
       "cwd": "/tmp"
     }
     ```
   - Note the session ID from the response

6. Send input to the session:
   - Tool: `send_session_input`
   - Parameters:
     ```json
     {
       "sessionId": "[SESSION_ID_FROM_PREVIOUS_STEP]",
       "input": "echo Hello, world!"
     }
     ```

7. List active sessions:
   - Tool: `list_sessions`
   - No parameters needed

8. Close the session when done:
   - Tool: `close_session`
   - Parameters:
     ```json
     {
       "sessionId": "[SESSION_ID_FROM_PREVIOUS_STEP]"
     }
     ```

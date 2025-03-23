# Bash MCP (Model Context Protocol)

A TypeScript application that allows Claude to safely execute bash commands with security safeguards. This project implements the Model Context Protocol (MCP) to provide a secure interface for executing bash commands from AI assistants like Claude.

## Features

- Execute bash commands in a controlled environment
- Support for both stateless and stateful (interactive) command execution
- Reliable command execution with accurate output capture
- Security safeguards:
  - Whitelisted commands
  - Whitelisted directories
  - Command validation
  - Output sanitization
- Session management for interactive commands
- Intelligent session state tracking
- Command output parsing with reliable completion detection
- Comprehensive logging
- MCP server implementation for AI integration

## How It Works

Bash MCP uses several techniques to ensure reliable command execution and output capture:

1. **Custom Shell Initialization**: Each bash session is initialized with special markers and a custom prompt that makes command completion detection reliable.

2. **Command Wrapping**: Commands are wrapped with start and end markers to precisely track when they begin and finish executing.

3. **Output Parsing**: A sophisticated parsing mechanism processes terminal output to extract command results accurately.

4. **Session State Management**: Sessions track their state (IDLE, RUNNING_COMMAND, INTERACTIVE_PROGRAM) to properly handle different execution contexts.

5. **Interactive Program Detection**: The system can detect and properly handle interactive programs that require user input.

## Installation

```bash
npm install
npm run build
```

## Configuration

The configuration is stored in `config/default.json`. You can customize:

- Allowed commands
- Allowed directories
- Session settings
- Security settings
- Logging settings

Example configuration:

```json
{
  "allowedCommands": ["ls", "cat", "echo", "pwd"],
  "allowedDirectories": ["/tmp", "/home"],
  "session": {
    "timeout": 300,
    "maxActiveSessions": 5,
    "defaultMode": "stateless"
  },
  "security": {
    "validateCommandsStrictly": true,
    "sanitizeOutput": true,
    "maxOutputSize": 1048576,
    "commandTimeout": 30
  },
  "logging": {
    "level": "info",
    "file": "logs/bash-mcp.log",
    "maxSize": 10485760,
    "maxFiles": 5
  }
}
```

## Usage

### As a Library

#### Simple Command Execution

```typescript
import { executeCommand } from 'bash-mcp';

const result = await executeCommand('ls -la', { cwd: '/home/user' });
console.log(result.output);
```

#### Interactive Sessions

```typescript
import { initBashMCP } from 'bash-mcp';

const mcp = await initBashMCP();

// Create a session
const sessionResult = await mcp.createSession('/home/user');
if (sessionResult.success && sessionResult.sessionId) {
  const sessionId = sessionResult.sessionId;

  // Execute a command in the session
  const result1 = await mcp.executeCommand('ls -la', { sessionId });
  console.log(result1.output);

  // Send input to the session
  const result2 = await mcp.sendInput({ sessionId, input: 'echo "Hello, world!"' });
  console.log(result2.output);

  // Close the session when done
  mcp.closeSession(sessionId);
}

// Clean up
mcp.shutdown();
```

### As an MCP Server

This project includes an MCP server implementation that can be used with Claude Desktop or other MCP clients:

```bash
# Start the TypeScript MCP server
npm run mcp

# Start the JavaScript MCP server
npm run mcp-js

# Start with MCP Inspector
npm run inspector
```

See `MCP.md` for detailed documentation on the MCP server implementation.

### Command Line Interface

For quick testing and debugging, you can use the command line interface:

```bash
# Execute a single command
node dist/index.js "ls -la" --cwd /home/user

# Start an interactive shell session
node dist/index.js --interactive --cwd /home/user
```

## Security Considerations

This MCP is designed with security in mind, but it's important to:

- Keep the allowed commands and directories list as restrictive as possible
- Regularly review and update the configuration
- Monitor the logs for suspicious activity
- Keep the MCP and its dependencies up to date

## Technical Details

### Command Output Parsing

The command output parser is a state machine that processes output in chunks as they arrive from the PTY:

1. IDLE: Waiting for a command to start
2. COLLECTING: Gathering output from an active command
3. COMPLETED: Command has finished executing

For each command, we track:
- Actual output text
- Exit code
- Execution duration
- Interactive status

### Session State Management

Sessions track their state for proper command handling:

- IDLE: Ready to accept new commands
- RUNNING_COMMAND: A command is currently executing
- INTERACTIVE_PROGRAM: An interactive program is running

This state-aware approach ensures that commands aren't executed when the session is busy and that interactive programs are handled appropriately.

## Development

### Building

```bash
npm run build
```

### Linting and Formatting

To check for linting issues:
```bash
npm run lint
```

To automatically fix linting and formatting issues:
```bash
./fix-lint.sh
```

Or manually:
```bash
npm run lint:fix  # Fix linting issues
npm run format    # Format code
```

### Testing

```bash
npm test
```

## MCP SDK Version

This project uses MCP SDK version 1.0.1.

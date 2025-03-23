# Bash MCP (Master Control Program)

A TypeScript application that allows Claude to safely execute bash commands with security safeguards.

## Features

- Execute bash commands in a controlled environment
- Support for both stateless and stateful (interactive) command execution
- Security safeguards:
  - Whitelisted commands
  - Whitelisted directories
  - Command validation
  - Output sanitization
- Session management for interactive commands
- Comprehensive logging

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

### Simple Command Execution

```typescript
import { executeCommand } from 'bash-mcp';

const result = await executeCommand('ls -la', { cwd: '/home/user' });
console.log(result.output);
```

### Interactive Sessions

```typescript
import { initBashMCP } from 'bash-mcp';

const mcp = await initBashMCP();

// Create a session
const session = mcp.createSession('/home/user');
const sessionId = session.sessionId;

// Execute a command in the session
const result1 = await mcp.executeCommand('ls -la', { sessionId });
console.log(result1.output);

// Send input to the session
const result2 = await mcp.sendInput({ sessionId, input: 'echo "Hello, world!"' });
console.log(result2.output);

// Close the session when done
mcp.closeSession(sessionId);
```

## Security Considerations

This MCP is designed with security in mind, but it's important to:

- Keep the allowed commands and directories list as restrictive as possible
- Regularly review and update the configuration
- Monitor the logs for suspicious activity
- Keep the MCP and its dependencies up to date

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

/**
 * Bash initialization script to set up the environment for reliable command execution
 */
export const BASH_INIT_SCRIPT = `
# MCP Bash Session Initialization
# This script sets up the bash environment for the MCP session

# Save original prompt if it exists
if [ -z "$MCP_ORIGINAL_PS1" ]; then
  export MCP_ORIGINAL_PS1="$PS1"
fi

# Custom prompt with exit code - will help us detect command completion
export PS1="MCP_PROMPT|\\$?|# "

# Control history behavior - don't store MCP control commands
export HISTCONTROL=ignorespace

# Define command marker functions
function __mcp_cmd_start {
  echo "MCP_CMD_START|$(date +%s.%N)"
}

function __mcp_cmd_end {
  local rc=$?
  echo "MCP_CMD_END|$(date +%s.%N)|$rc"
  return $rc
}

# Turn off command echoing to avoid duplicate output
set +o verbose
set +o xtrace

# Set reasonable terminal environment
export TERM=xterm-color
stty -echo -icanon

# Echo a marker to indicate initialization is complete
echo "MCP_INIT_COMPLETE"
`;

/**
 * Wrap a command with start and end markers for reliable execution monitoring
 * @param command The command to wrap
 * @returns The wrapped command
 */
export function wrapCommand(command: string): string {
  return `__mcp_cmd_start
${command}
__mcp_cmd_end`;
}

/**
 * Check if bash initialization has completed
 * @param output The output to check
 * @returns True if initialization is complete
 */
export function isInitializationComplete(output: string): boolean {
  return output.includes('MCP_INIT_COMPLETE');
}

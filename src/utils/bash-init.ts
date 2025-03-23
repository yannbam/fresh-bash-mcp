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

# Define command marker functions with command ID support
function __mcp_cmd_start {
  local cmdid="$1"
  echo "MCP_CMD_START|$(date +%s.%N)|$cmdid"
}

function __mcp_cmd_end {
  local rc=$?
  local cmdid="$1"
  echo "MCP_CMD_END|$(date +%s.%N)|$cmdid|$rc"
  return $rc
}

# Turn off command echoing to avoid duplicate output
set +o verbose
set +o xtrace

# Set reasonable terminal environment
export TERM=xterm-color

# Echo a marker to indicate initialization is complete
echo "MCP_INIT_COMPLETE"
`;

/**
 * Non-interactive version of the initialization script
 * Includes TTY settings that make programmatic control easier
 * but break normal interactive use
 */
export const BASH_INIT_SCRIPT_NONINTERACTIVE = `
${BASH_INIT_SCRIPT}
# Disable terminal echo for programmatic use
stty -echo -icanon
`;

/**
 * Wrap a command with start and end markers for reliable execution monitoring
 * @param command The command to wrap
 * @param commandId Unique identifier for this command execution
 * @returns The wrapped command
 */
export function wrapCommand(command: string, commandId: string): string {
  // Ensure the command runs in a subshell to avoid contaminating the main shell
  // and to properly capture exit codes
  return `
# Run the command with start and end markers
(
  __mcp_cmd_start "${commandId}"
  (${command})
  CMD_EXIT_CODE=$?
  __mcp_cmd_end "${commandId}"
  exit $CMD_EXIT_CODE
)`;
}

/**
 * Check if bash initialization has completed
 * @param output The output to check
 * @returns True if initialization is complete
 */
export function isInitializationComplete(output: string): boolean {
  return output.includes('MCP_INIT_COMPLETE');
}

// First mock the dependencies that cause issues
jest.mock('node-pty', () => ({
  spawn: jest.fn().mockReturnValue({
    onData: jest.fn(),
    on: jest.fn(),
    write: jest.fn(),
    kill: jest.fn(),
    off: jest.fn(),
  })
}));

// Then import everything else
import { initBashMCP } from '../../src/index';
import path from 'path';
import { loadTestConfig, createMockConfig } from '../helpers/mocks';

describe('Basic Integration Flow', () => {
  // Mock the config loading to return our test config
  jest.mock('../../src/utils/config', () => ({
    loadConfig: jest.fn().mockResolvedValue(createMockConfig())
  }));

  describe('Safe Integration Tests', () => {
    it('should initialize and shutdown properly', async () => {
      const mcp = await initBashMCP();
      
      // Just verify we can create and shutdown without errors
      expect(mcp).toBeDefined();
      mcp.shutdown();
    });
    
    it('should reject disallowed commands', async () => {
      const mcp = await initBashMCP();
      
      try {
        // Indirectly test the configuration by checking allowed commands
        const result = await mcp.executeCommand('invalid-command', { cwd: '/tmp' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not in the allowed list/);
      } finally {
        mcp.shutdown();
      }
    });

    it('should create and manage sessions', async () => {
      const mcp = await initBashMCP();
      
      try {
        // Create a session
        const createResult = mcp.createSession('/tmp');
        expect(createResult.success).toBe(true);
        expect(createResult.sessionId).toBeDefined();
        
        // List sessions
        const sessions = mcp.listSessions();
        expect(sessions.length).toBe(1);
        expect(sessions[0].id).toBe(createResult.sessionId);
        
        // Close the session
        const closeResult = mcp.closeSession(createResult.sessionId!);
        expect(closeResult.success).toBe(true);
        
        // Verify session is gone
        const sessionsAfterClose = mcp.listSessions();
        expect(sessionsAfterClose.length).toBe(0);
      } finally {
        mcp.shutdown();
      }
    });
  });

  // These tests would execute actual commands, so they're skipped
  describe.skip('Command Execution', () => {
    it('should execute a simple echo command', async () => {
      const mcp = await initBashMCP();
      
      try {
        const result = await mcp.executeCommand('echo "Integration test"', { cwd: '/tmp' });
        
        expect(result.success).toBe(true);
        expect(result.output).toContain('Integration test');
      } finally {
        mcp.shutdown();
      }
    });
  });
});

// Properly mock node-pty BEFORE any imports that might use it
jest.mock('node-pty', () => ({
  spawn: jest.fn().mockReturnValue({
    onData: jest.fn(),
    on: jest.fn(),
    write: jest.fn(),
    kill: jest.fn(),
    off: jest.fn(),
  })
}));

// Mock the dependencies
jest.mock('../../src/core/command-executor');
jest.mock('../../src/core/session-manager');

// Then import everything else
import { BashMCP } from '../../src/core/bash-mcp';
import { CommandExecutor } from '../../src/core/command-executor';
import { SessionManager } from '../../src/core/session-manager';
import { createMockConfig } from '../helpers/mocks';

describe('BashMCP', () => {
  const config = createMockConfig();
  let mcp: BashMCP;
  let mockCommandExecutor: any;
  let mockSessionManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Setup mocks with explicit functions instead of mock implementations
    const commandExecutorMock = {
      executeCommand: jest.fn().mockResolvedValue({
        success: true,
        output: 'Command executed successfully',
        command: 'test command',
      }),
    };

    const sessionManagerMock = {
      createSession: jest.fn().mockReturnValue({
        id: 'test-session-id',
        createdAt: new Date(),
        lastActivity: new Date(),
        process: {},
        cwd: '/tmp',
        isInteractive: true,
      }),
      executeInSession: jest.fn().mockResolvedValue({
        success: true,
        output: 'Session command executed',
        sessionId: 'test-session-id',
        command: 'test command',
        isInteractive: true,
      }),
      sendInput: jest.fn().mockReturnValue(true),
      closeSession: jest.fn().mockReturnValue(true),
      listSessions: jest.fn().mockReturnValue([]),
      shutdown: jest.fn(),
      getSession: jest.fn().mockReturnValue({
        id: 'test-session-id',
        createdAt: new Date(),
        lastActivity: new Date(),
        process: {},
        cwd: '/tmp',
        isInteractive: true,
      }),
    };

    (CommandExecutor as jest.Mock).mockImplementation(() => commandExecutorMock);
    (SessionManager as jest.Mock).mockImplementation(() => sessionManagerMock);

    // Create instance with mocks
    mcp = new BashMCP(config);
    mockCommandExecutor = (mcp as any).commandExecutor;
    mockSessionManager = (mcp as any).sessionManager;
  });

  describe('executeCommand', () => {
    it('should execute stateless commands', async () => {
      const result = await mcp.executeCommand('echo test', { cwd: '/tmp' });

      expect(result.success).toBe(true);
      expect(mockCommandExecutor.executeCommand).toHaveBeenCalledWith('echo test', expect.objectContaining({
        cwd: '/tmp',
      }));
      expect(mockSessionManager.executeInSession).not.toHaveBeenCalled();
    });

    it('should execute commands in existing sessions', async () => {
      const result = await mcp.executeCommand('echo test', { sessionId: 'test-session-id' });

      expect(result.success).toBe(true);
      expect(mockCommandExecutor.executeCommand).not.toHaveBeenCalled();
      expect(mockSessionManager.executeInSession).toHaveBeenCalledWith('test-session-id', 'echo test');
    });

    it('should create a new session when defaultMode is stateful', async () => {
      // Create a new MCP with stateful default mode
      const statefulConfig = { ...config, session: { ...config.session, defaultMode: 'stateful' } };
      
      // Setup fresh mocks for this test
      const newSessionManagerMock = {
        createSession: jest.fn().mockReturnValue({
          id: 'new-session-id',
          createdAt: new Date(),
          lastActivity: new Date(),
          process: {},
          cwd: '/tmp',
          isInteractive: true,
        }),
        executeInSession: jest.fn().mockResolvedValue({
          success: true,
          output: 'Session command executed',
          sessionId: 'new-session-id',
          command: 'test command',
          isInteractive: true,
        }),
        shutdown: jest.fn(),
      };
      
      (SessionManager as jest.Mock).mockImplementation(() => newSessionManagerMock);
      const statefulMcp = new BashMCP(statefulConfig);

      const result = await statefulMcp.executeCommand('echo test', { cwd: '/tmp' });

      expect(result.success).toBe(true);
      expect(newSessionManagerMock.createSession).toHaveBeenCalledWith('/tmp');
      expect(newSessionManagerMock.executeInSession).toHaveBeenCalledWith('new-session-id', 'echo test');
    });

    it('should handle errors gracefully', async () => {
      // Don't try to throw errors - directly mock the error response
      mockCommandExecutor.executeCommand = jest.fn().mockResolvedValue({
        success: false,
        output: '',
        error: 'Command execution failed',
        command: 'echo test'
      });

      const result = await mcp.executeCommand('echo test');
      
      // Verify results - we should get the error result directly
      expect(result.success).toBe(false);
      expect(result.error).toBe('Command execution failed');
    });
  });

  describe('sendInput', () => {
    it('should send input to an existing session', async () => {
      // Add collectOutputAfterInput mock method
      mockSessionManager.collectOutputAfterInput = jest.fn().mockResolvedValue({
        success: true,
        output: 'Real output from command',
        sessionId: 'test-session-id',
        command: 'test input',
        isInteractive: true,
        waitingForInput: true
      });
      
      const input = { sessionId: 'test-session-id', input: 'test input' };
      const result = await mcp.sendInput(input);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Real output from command');
      expect(mockSessionManager.collectOutputAfterInput).toHaveBeenCalledWith('test-session-id', 'test input', undefined);
    });

    it('should handle non-existent sessions', async () => {
      mockSessionManager.getSession.mockReturnValue(undefined);

      const input = { sessionId: 'non-existent-id', input: 'test input' };
      const result = await mcp.sendInput(input);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Session.*not found/);
    });

    it('should pass timeout to collectOutputAfterInput', async () => {
      // Add collectOutputAfterInput mock method
      mockSessionManager.collectOutputAfterInput = jest.fn().mockResolvedValue({
        success: true,
        output: 'Output with custom timeout',
        sessionId: 'test-session-id',
        command: 'test input',
        isInteractive: true,
        waitingForInput: true
      });
      
      const input = { sessionId: 'test-session-id', input: 'test input', timeout: 5000 };
      const result = await mcp.sendInput(input);

      expect(result.success).toBe(true);
      expect(mockSessionManager.collectOutputAfterInput).toHaveBeenCalledWith('test-session-id', 'test input', 5000);
    });
  });

  describe('createSession', () => {
    it('should create a new session', () => {
      const result = mcp.createSession('/tmp');

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('test-session-id');
      expect(mockSessionManager.createSession).toHaveBeenCalledWith('/tmp');
    });

    it('should handle session creation failures', () => {
      mockSessionManager.createSession.mockReturnValue(null);

      const result = mcp.createSession('/etc');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Failed to create session/);
    });
  });

  describe('closeSession', () => {
    it('should close an existing session', () => {
      const result = mcp.closeSession('test-session-id');

      expect(result.success).toBe(true);
      expect(mockSessionManager.closeSession).toHaveBeenCalledWith('test-session-id');
    });

    it('should handle session closing failures', () => {
      mockSessionManager.closeSession.mockReturnValue(false);

      const result = mcp.closeSession('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Failed to close session/);
    });
  });

  describe('listSessions', () => {
    it('should return the list of sessions', () => {
      const mockSessions = [
        { id: 'session-1', createdAt: new Date(), lastActivity: new Date(), cwd: '/tmp' },
        { id: 'session-2', createdAt: new Date(), lastActivity: new Date(), cwd: '/tmp' },
      ];
      mockSessionManager.listSessions.mockReturnValue(mockSessions);

      const sessions = mcp.listSessions();

      expect(sessions).toEqual(mockSessions);
      expect(mockSessionManager.listSessions).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should shut down the session manager', () => {
      mcp.shutdown();

      expect(mockSessionManager.shutdown).toHaveBeenCalled();
    });
  });
});

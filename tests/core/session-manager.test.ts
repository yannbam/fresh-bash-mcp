import { createMockConfig } from '../helpers/mocks';
import { Session } from '../../src/types';

// Define mocks before importing the module that uses them
const mockPtyInstance = {
  onData: jest.fn(),
  on: jest.fn(),
  write: jest.fn(),
  kill: jest.fn(),
  off: jest.fn(),
};

const mockPty = {
  spawn: jest.fn().mockReturnValue(mockPtyInstance)
};

// Mock uuid directly here
const mockUuidv4 = jest.fn();

// Mock the uuid module
jest.mock('uuid', () => ({
  v4: () => mockUuidv4()
}));

// Mock node-pty
jest.mock('node-pty', () => mockPty);

// Now import the module under test
import { SessionManager } from '../../src/core/session-manager';
import { v4 as uuidv4 } from 'uuid';

describe('SessionManager', () => {
  const config = createMockConfig();
  let sessionManager: SessionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidv4.mockReset(); // Reset the mock before each test
    sessionManager = new SessionManager(config);
  });

  afterEach(() => {
    // Clean up
    sessionManager.shutdown();
  });

  describe('createSession', () => {
    it('should create a new session in an allowed directory', () => {
      // Set up the UUID for this specific test
      mockUuidv4.mockReturnValue('test-session-id-1');
      
      const session = sessionManager.createSession('/tmp');

      expect(session).not.toBeNull();
      expect(session?.id).toBe('test-session-id-1');
      expect(session?.cwd).toBe('/tmp');
      expect(session?.isInteractive).toBe(true);
      expect(mockPty.spawn).toHaveBeenCalled();
    });

    it('should return null for disallowed directories', () => {
      const session = sessionManager.createSession('/etc');

      expect(session).toBeNull();
      expect(mockPty.spawn).not.toHaveBeenCalled();
    });

    it('should limit the number of active sessions', () => {
      // Override maxActiveSessions to a smaller number for this test
      const testConfig = {
        ...config,
        session: {
          ...config.session,
          maxActiveSessions: 2  // Only allow 2 sessions
        }
      };
      
      // Create a new session manager with this config
      const limitedSessionManager = new SessionManager(testConfig);
      
      try {
        // Mock specific UUIDs for this test
        mockUuidv4
          .mockReturnValueOnce('session-limit-1')
          .mockReturnValueOnce('session-limit-2')
          .mockReturnValueOnce('session-limit-3');
        
        // Create max number of sessions
        const session1 = limitedSessionManager.createSession('/tmp');
        expect(session1).not.toBeNull();
        
        const session2 = limitedSessionManager.createSession('/tmp');
        expect(session2).not.toBeNull();
        
        // Try to create one more
        const extraSession = limitedSessionManager.createSession('/tmp');
        expect(extraSession).toBeNull();
      } finally {
        limitedSessionManager.shutdown();
      }
    });
  });

  describe('executeInSession', () => {
    it('should execute a command in an existing session', async () => {
      // Set up the UUID for this specific test
      mockUuidv4.mockReturnValue('execute-session-id');
      
      // Create a session
      const session = sessionManager.createSession('/tmp');
      expect(session).not.toBeNull();
      
      // Mock the process write function
      mockPtyInstance.write.mockClear();
      
      // Execute in session
      const result = await sessionManager.executeInSession(session!.id, 'echo test');

      // Verify results
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(session!.id);
      expect(result.command).toBe('echo test');
      expect(mockPtyInstance.write).toHaveBeenCalledWith('echo test\n');
    });

    it('should fail for non-existent sessions', async () => {
      const result = await sessionManager.executeInSession('non-existent-id', 'echo test');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Session.*not found/);
    });
  });

  describe('sendInput', () => {
    it('should send input to an existing session', () => {
      // Set up the UUID for this specific test
      mockUuidv4.mockReturnValue('input-session-id');
      
      // Create a session
      const session = sessionManager.createSession('/tmp');
      expect(session).not.toBeNull();
      
      // Mock the process write function
      mockPtyInstance.write.mockClear();
      
      // Send input
      const result = sessionManager.sendInput(session!.id, 'test input');

      // Verify results
      expect(result).toBe(true);
      expect(mockPtyInstance.write).toHaveBeenCalledWith('test input\n');
    });

    it('should return false for non-existent sessions', () => {
      const result = sessionManager.sendInput('non-existent-id', 'test input');
      expect(result).toBe(false);
    });
  });

  describe('collectOutputAfterInput', () => {
    it('should collect output after sending input', async () => {
      // Set up the UUID for this specific test
      mockUuidv4.mockReturnValue('collect-output-session-id');
      
      // Create a session
      const session = sessionManager.createSession('/tmp');
      expect(session).not.toBeNull();
      
      // Set up a mock data handler that fires immediately when onData is called
      let dataHandler: (data: string) => void;
      mockPtyInstance.onData.mockImplementation((handler) => {
        dataHandler = handler;
        return { dispose: jest.fn() };
      });
      
      // Mock the write function to trigger the data handler
      mockPtyInstance.write.mockImplementation(() => {
        // Simulate some output after the command
        setTimeout(() => {
          if (dataHandler) {
            dataHandler('Command output\nuser@host:~$ ');
          }
        }, 10);
        return true;
      });
      
      // Collect output after input
      const result = await sessionManager.collectOutputAfterInput(session!.id, 'test command', 100);

      // Verify results
      expect(result.success).toBe(true);
      expect(result.output).toContain('Command output');
      expect(result.sessionId).toBe(session!.id);
      expect(result.command).toBe('test command');
      expect(result.isInteractive).toBe(true);
      expect(result.waitingForInput).toBe(true); // Our mock output has a prompt at the end
    });

    it('should handle non-existent sessions', async () => {
      const result = await sessionManager.collectOutputAfterInput('non-existent-id', 'test command', 100);
      
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Session.*not found/);
    });
  });

  describe('closeSession', () => {
    it('should close an existing session', () => {
      // Set up the UUID for this specific test
      mockUuidv4.mockReturnValue('close-session-id');
      
      // Create a session
      const session = sessionManager.createSession('/tmp');
      expect(session).not.toBeNull();
      
      // Mock the process kill function
      mockPtyInstance.kill.mockClear();
      
      // Close the session
      const result = sessionManager.closeSession(session!.id);

      // Verify results
      expect(result).toBe(true);
      expect(mockPtyInstance.kill).toHaveBeenCalled();
      
      // Verify session is removed
      expect(sessionManager.getSession(session!.id)).toBeUndefined();
    });

    it('should return false for non-existent sessions', () => {
      const result = sessionManager.closeSession('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('listSessions', () => {
    it('should list all active sessions', () => {
      // Create a new session manager for this test to ensure a clean state
      const testSessionManager = new SessionManager(config);
      
      try {
        // Reset and set up the UUID mocks specifically for this test
        mockUuidv4.mockReset();
        mockUuidv4
          .mockReturnValueOnce('list-session-id-1')
          .mockReturnValueOnce('list-session-id-2');
        
        // Create two sessions with different IDs
        const session1 = testSessionManager.createSession('/tmp');
        expect(session1).not.toBeNull();
        expect(session1?.id).toBe('list-session-id-1');
        
        const session2 = testSessionManager.createSession('/tmp');
        expect(session2).not.toBeNull();
        expect(session2?.id).toBe('list-session-id-2');
        
        // List sessions
        const sessions = testSessionManager.listSessions();
        
        // Verify results
        expect(sessions.length).toBe(2);
        expect(sessions[0].id).toBe('list-session-id-1');
        expect(sessions[1].id).toBe('list-session-id-2');
      } finally {
        testSessionManager.shutdown();
      }
    });

    it('should return an empty array when no sessions exist', () => {
      const sessions = sessionManager.listSessions();
      expect(sessions).toEqual([]);
    });
  });
});

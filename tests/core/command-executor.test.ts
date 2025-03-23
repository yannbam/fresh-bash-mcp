import { createMockConfig } from '../helpers/mocks';
import { ExecutionOptions } from '../../src/types';

// Create mocks before importing the module
const mockChildProcess = {
  spawn: jest.fn().mockImplementation(() => {
    const mockProcess = {
      stdout: {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === 'data') {
            cb('Mock stdout output');
          }
        }),
      },
      stderr: {
        on: jest.fn().mockImplementation((event, cb) => {
          if (event === 'data') {
            cb('');
          }
        }),
      },
      on: jest.fn().mockImplementation((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 100);
        }
      }),
      kill: jest.fn(),
    };
    return mockProcess;
  }),
};

// Mock child_process module
jest.mock('child_process', () => mockChildProcess);

// Now import the module under test
import { CommandExecutor } from '../../src/core/command-executor';

describe('CommandExecutor', () => {
  const config = createMockConfig();
  let executor: CommandExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    executor = new CommandExecutor(config);
  });

  describe('executeCommand', () => {
    it('should execute a valid command successfully', async () => {
      // Execute test
      const result = await executor.executeCommand('echo test', { cwd: '/tmp' });

      // Verify results
      expect(result.success).toBe(true);
      expect(result.output).toContain('Mock stdout output');
      expect(result.command).toBe('echo test');
      expect(mockChildProcess.spawn).toHaveBeenCalledWith('echo', ['test'], expect.any(Object));
    });

    it('should fail for disallowed commands', async () => {
      // Execute test
      const result = await executor.executeCommand('rm -rf /', { cwd: '/tmp' });

      // Verify results
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/not in the allowed list/);
      expect(mockChildProcess.spawn).not.toHaveBeenCalled();
    });

    it('should fail for disallowed directories', async () => {
      // Execute test
      const result = await executor.executeCommand('echo test', { cwd: '/etc' });

      // Verify results
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Directory not allowed/);
      expect(mockChildProcess.spawn).not.toHaveBeenCalled();
    });

    it('should handle command options correctly', async () => {
      // Prepare options
      const options: ExecutionOptions = {
        cwd: '/tmp',
        timeout: 10,
        env: { TEST_VAR: 'test_value' },
      };

      // Execute test
      await executor.executeCommand('echo $TEST_VAR', options);

      // Verify options were passed correctly
      expect(mockChildProcess.spawn).toHaveBeenCalledWith('echo', ['$TEST_VAR'], expect.objectContaining({
        cwd: '/tmp',
        env: expect.any(Object),
        shell: true,
      }));
    });

    it('should use default options if none provided', async () => {
      // Mock process.cwd()
      const originalCwd = process.cwd;
      process.cwd = jest.fn().mockReturnValue('/tmp');

      try {
        // Execute test
        await executor.executeCommand('echo test');

        // Verify default options
        expect(mockChildProcess.spawn).toHaveBeenCalledWith('echo', ['test'], expect.objectContaining({
          cwd: '/tmp',
          shell: true,
        }));
      } finally {
        // Restore original process.cwd
        process.cwd = originalCwd;
      }
    });
  });
});

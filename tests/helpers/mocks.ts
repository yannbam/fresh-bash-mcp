import { MCPConfig } from '../../src/types';
import fs from 'fs-extra';
import path from 'path';

/**
 * Create a mock config for testing
 */
export function createMockConfig(): MCPConfig {
  return {
    allowedCommands: ['echo', 'pwd', 'ls', 'cat', 'wc'],
    allowedDirectories: ['/tmp', '/home/test'],
    session: {
      timeout: 30,
      maxActiveSessions: 3,
      defaultMode: 'stateless',
    },
    security: {
      validateCommandsStrictly: true,
      sanitizeOutput: true,
      maxOutputSize: 10240,
      commandTimeout: 5,
    },
    logging: {
      level: 'info',
      file: 'logs/test-bash-mcp.log',
      maxSize: 1048576,
      maxFiles: 1,
    },
  };
}

/**
 * Load the test config from file
 */
export function loadTestConfig(): MCPConfig {
  // Return a hardcoded config instead of reading from file to avoid test issues
  return createMockConfig();
}

/**
 * Mock for node-pty
 */
export const mockPty = {
  spawn: jest.fn().mockImplementation(() => ({
    onData: jest.fn(),
    on: jest.fn(),
    write: jest.fn(),
    kill: jest.fn(),
    off: jest.fn(),
  })),
};

/**
 * Mock for child_process
 */
export const mockChildProcess = {
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

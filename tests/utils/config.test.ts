import { loadConfig } from '../../src/utils/config';
import fs from 'fs-extra';
import path from 'path';
import { loadTestConfig } from '../helpers/mocks';

// Mock the fs-extra module
jest.mock('fs-extra');

describe('Config Utility', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load a valid config file', async () => {
      // Prepare test data
      const testConfig = await loadTestConfig();
      const mockConfigPath = '/mock/config/path.json';
      
      // Setup the mocks
      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(testConfig));

      // Execute the test
      const config = await loadConfig(mockConfigPath);

      // Verify the results
      expect(fs.pathExists).toHaveBeenCalledWith(mockConfigPath);
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
      
      expect(config).toEqual(testConfig);
      expect(config.allowedCommands).toContain('echo');
      expect(config.allowedDirectories).toContain('/tmp');
      expect(config.session.timeout).toBe(30);
    });

    it('should throw an error if the config file does not exist', async () => {
      // Setup the mock
      const mockConfigPath = '/non/existent/config.json';
      (fs.pathExists as jest.Mock).mockResolvedValue(false);

      // Execute the test and verify it throws
      await expect(loadConfig(mockConfigPath)).rejects.toThrow(/Config file not found/);
      expect(fs.pathExists).toHaveBeenCalledWith(mockConfigPath);
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should throw an error if the config file is invalid JSON', async () => {
      // Setup the mocks
      const mockConfigPath = '/mock/invalid/config.json';
      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue('{ invalid json }');

      // Execute the test and verify it throws
      await expect(loadConfig(mockConfigPath)).rejects.toThrow();
      expect(fs.pathExists).toHaveBeenCalledWith(mockConfigPath);
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
    });

    it('should throw an error if required fields are missing', async () => {
      // Setup the mocks
      const mockConfigPath = '/mock/incomplete/config.json';
      const incompleteConfig = { allowedCommands: ['ls'] }; // Missing other required fields
      
      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(incompleteConfig));

      // Execute the test and verify it throws
      await expect(loadConfig(mockConfigPath)).rejects.toThrow(/Config error/);
      expect(fs.pathExists).toHaveBeenCalledWith(mockConfigPath);
      expect(fs.readFile).toHaveBeenCalledWith(mockConfigPath, 'utf8');
    });
  });
});

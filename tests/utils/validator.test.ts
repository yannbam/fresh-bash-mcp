import { isCommandAllowed, isDirectoryAllowed, validateCommand, sanitizeOutput } from '../../src/utils/validator';
import { createMockConfig } from '../helpers/mocks';

describe('Validator Utility', () => {
  const config = createMockConfig();

  describe('isCommandAllowed', () => {
    it('should return true for allowed commands', () => {
      expect(isCommandAllowed('echo', config)).toBe(true);
      expect(isCommandAllowed('pwd', config)).toBe(true);
      expect(isCommandAllowed('ls', config)).toBe(true);
    });

    it('should return true for allowed commands with arguments', () => {
      expect(isCommandAllowed('echo "hello world"', config)).toBe(true);
      expect(isCommandAllowed('ls -la', config)).toBe(true);
    });

    it('should return false for disallowed commands', () => {
      expect(isCommandAllowed('rm', config)).toBe(false);
      expect(isCommandAllowed('sudo', config)).toBe(false);
      expect(isCommandAllowed('bash', config)).toBe(false);
    });

    it('should return false for empty or invalid input', () => {
      expect(isCommandAllowed('', config)).toBe(false);
      expect(isCommandAllowed(undefined as any, config)).toBe(false);
      expect(isCommandAllowed(null as any, config)).toBe(false);
    });
  });

  describe('isDirectoryAllowed', () => {
    it('should return true for allowed directories', () => {
      expect(isDirectoryAllowed('/tmp', config)).toBe(true);
      expect(isDirectoryAllowed('/home/test', config)).toBe(true);
    });

    it('should return true for subdirectories of allowed directories', () => {
      expect(isDirectoryAllowed('/tmp/subdir', config)).toBe(true);
      expect(isDirectoryAllowed('/home/test/subdir', config)).toBe(true);
    });

    it('should return false for disallowed directories', () => {
      expect(isDirectoryAllowed('/etc', config)).toBe(false);
      expect(isDirectoryAllowed('/root', config)).toBe(false);
    });

    it('should return false for empty or invalid input', () => {
      expect(isDirectoryAllowed('', config)).toBe(false);
      expect(isDirectoryAllowed(undefined as any, config)).toBe(false);
      expect(isDirectoryAllowed(null as any, config)).toBe(false);
    });

    it('should handle directory path normalization', () => {
      expect(isDirectoryAllowed('/tmp/', config)).toBe(true);
      expect(isDirectoryAllowed('/home/test/../test', config)).toBe(true);
      expect(isDirectoryAllowed('/home/test/./subdir', config)).toBe(true);
    });
  });

  describe('validateCommand', () => {
    it('should validate allowed commands', () => {
      expect(validateCommand('echo hello', config)).toEqual({ isValid: true });
      expect(validateCommand('ls -la', config)).toEqual({ isValid: true });
    });

    it('should reject disallowed commands', () => {
      const result = validateCommand('rm -rf /', config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/not in the allowed list/);
    });

    it('should reject command chaining when strict validation is enabled', () => {
      const result = validateCommand('echo hello && pwd', config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/forbidden pattern/);
    });

    it('should reject command substitution when strict validation is enabled', () => {
      const result = validateCommand('echo `ls`', config);
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/forbidden pattern/);
    });

    it('should validate commands when strict validation is disabled', () => {
      const nonStrictConfig = { ...config, security: { ...config.security, validateCommandsStrictly: false } };
      const result = validateCommand('echo hello && pwd', nonStrictConfig);
      
      // When strict validation is disabled, we don't check for patterns like &&
      // but we still check if the base command is allowed
      expect(result.isValid).toBe(true);
    });
  });

  describe('sanitizeOutput', () => {
    it('should pass through output when sanitization is disabled', () => {
      const nonSanitizeConfig = { ...config, security: { ...config.security, sanitizeOutput: false } };
      const output = 'some output';
      expect(sanitizeOutput(output, nonSanitizeConfig)).toBe(output);
    });

    it('should truncate output that exceeds maxOutputSize', () => {
      const output = 'a'.repeat(config.security.maxOutputSize + 100);
      const sanitized = sanitizeOutput(output, config);
      
      expect(sanitized.length).toBeLessThan(output.length);
      expect(sanitized).toContain('truncated');
    });

    it('should not modify output within size limits', () => {
      const output = 'normal sized output';
      expect(sanitizeOutput(output, config)).toBe(output);
    });
  });
});

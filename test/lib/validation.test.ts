import { describe, it, expect, vi } from 'vitest';
import {
  validateCalloutType,
  validateVaultPath,
  validateApiKey,
  ALLOWED_CALLOUT_TYPES,
} from '../../src/lib/validation';

describe('validateCalloutType', () => {
  it('accepts valid callout types', () => {
    expect(validateCalloutType('NOTE', 'NOTE')).toBe('NOTE');
    expect(validateCalloutType('QUESTION', 'NOTE')).toBe('QUESTION');
    expect(validateCalloutType('WARNING', 'NOTE')).toBe('WARNING');
  });

  it('normalizes case', () => {
    expect(validateCalloutType('note', 'NOTE')).toBe('NOTE');
    expect(validateCalloutType('Question', 'NOTE')).toBe('QUESTION');
  });

  it('trims whitespace', () => {
    expect(validateCalloutType('  NOTE  ', 'NOTE')).toBe('NOTE');
  });

  it('returns default for invalid types', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateCalloutType('INVALID', 'NOTE')).toBe('NOTE');
    expect(validateCalloutType('RANDOM', 'QUESTION')).toBe('QUESTION');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('validates all allowed types', () => {
    ALLOWED_CALLOUT_TYPES.forEach(type => {
      expect(validateCalloutType(type, 'NOTE')).toBe(type);
    });
  });
});

describe('validateVaultPath', () => {
  it('accepts valid paths', () => {
    expect(validateVaultPath('AI/Gemini')).toBe('AI/Gemini');
    expect(validateVaultPath('notes/ai-chat')).toBe('notes/ai-chat');
  });

  it('allows empty path', () => {
    expect(validateVaultPath('')).toBe('');
    expect(validateVaultPath('   ')).toBe('');
  });

  it('trims whitespace', () => {
    expect(validateVaultPath('  AI/Gemini  ')).toBe('AI/Gemini');
  });

  it('throws on path traversal', () => {
    expect(() => validateVaultPath('../secret')).toThrow('invalid characters');
    expect(() => validateVaultPath('/etc/passwd')).toThrow('invalid characters');
  });

  it('throws on path too long', () => {
    const longPath = 'a'.repeat(201);
    expect(() => validateVaultPath(longPath)).toThrow('too long');
  });

  it('accepts maximum length path', () => {
    const maxPath = 'a'.repeat(200);
    expect(validateVaultPath(maxPath)).toBe(maxPath);
  });
});

describe('validateApiKey', () => {
  it('accepts valid API keys', () => {
    const validKey = 'a'.repeat(64);
    expect(validateApiKey(validKey)).toBe(validKey);
  });

  it('trims whitespace', () => {
    const validKey = 'a'.repeat(64);
    expect(validateApiKey(`  ${validKey}  `)).toBe(validKey);
  });

  it('throws on empty key', () => {
    expect(() => validateApiKey('')).toThrow('required');
    expect(() => validateApiKey('   ')).toThrow('required');
  });

  it('throws on too short key', () => {
    expect(() => validateApiKey('abc')).toThrow('too short');
    expect(() => validateApiKey('a'.repeat(15))).toThrow('too short');
  });

  it('accepts minimum length key', () => {
    const minKey = 'a'.repeat(16);
    expect(validateApiKey(minKey)).toBe(minKey);
  });

  it('warns on non-standard length', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nonStandardKey = 'a'.repeat(32);
    expect(validateApiKey(nonStandardKey)).toBe(nonStandardKey);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('length is 32')
    );
    consoleSpy.mockRestore();
  });

  it('warns on non-hex characters', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const nonHexKey = 'g'.repeat(64);
    expect(validateApiKey(nonHexKey)).toBe(nonHexKey);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('non-hexadecimal')
    );
    consoleSpy.mockRestore();
  });

  it('accepts valid hex key without warnings', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const validHexKey = 'abcdef0123456789'.repeat(4);
    expect(validateApiKey(validHexKey)).toBe(validHexKey);
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  ObsidianApiClient,
  isObsidianApiError,
  getErrorMessage,
} from '../../src/lib/obsidian-api';

describe('ObsidianApiClient', () => {
  let client: ObsidianApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new ObsidianApiClient(27123, 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('constructs with port and API key', () => {
      const client = new ObsidianApiClient(28000, 'my-key');
      // Verify by making a request and checking the URL
      mockFetch.mockResolvedValue({ ok: true });
      void client.testConnection();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:28000/',
        expect.any(Object)
      );
    });
  });

  describe('testConnection', () => {
    it('returns true when connection succeeds', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer test-api-key' },
        })
      );
    });

    it('returns false when connection fails with error status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 });

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getFile', () => {
    it('returns file content when file exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('# File Content'),
      });

      const content = await client.getFile('path/to/file.md');

      expect(content).toBe('# File Content');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/path%2Fto%2Ffile.md',
        expect.any(Object)
      );
    });

    it('returns null when file does not exist (404)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const content = await client.getFile('non-existent.md');

      expect(content).toBeNull();
    });

    it('throws error for other status codes', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getFile('path/to/file.md')).rejects.toEqual({
        status: 500,
        message: 'Failed to get file: Internal Server Error',
      });
    });

    it('throws timeout error for network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.getFile('path/to/file.md')).rejects.toEqual({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('throws timeout error for AbortError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      await expect(client.getFile('path/to/file.md')).rejects.toEqual({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('encodes path correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('content'),
      });

      await client.getFile('AI/Gemini/test file.md');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/AI%2FGemini%2Ftest%20file.md',
        expect.any(Object)
      );
    });
  });

  describe('putFile', () => {
    it('creates or updates file successfully', async () => {
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      await client.putFile('path/to/file.md', '# New Content');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:27123/vault/path%2Fto%2Ffile.md',
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'text/markdown',
          },
          body: '# New Content',
        })
      );
    });

    it('throws error for failed response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toEqual({
        status: 403,
        message: 'Failed to save file: Forbidden',
      });
    });

    it('throws timeout error for network errors', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toEqual({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });

    it('throws timeout error for TimeoutError', async () => {
      const timeoutError = new DOMException('The operation timed out', 'TimeoutError');
      mockFetch.mockRejectedValue(timeoutError);

      await expect(client.putFile('path/to/file.md', 'content')).rejects.toEqual({
        status: 0,
        message: 'Request timed out. Please check your connection.',
      });
    });
  });

  describe('fileExists', () => {
    it('returns true when file exists', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('content'),
      });

      const exists = await client.fileExists('path/to/file.md');

      expect(exists).toBe(true);
    });

    it('returns false when file does not exist', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      const exists = await client.fileExists('non-existent.md');

      expect(exists).toBe(false);
    });

    it('returns false on error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const exists = await client.fileExists('path/to/file.md');

      expect(exists).toBe(false);
    });
  });
});

describe('isObsidianApiError', () => {
  it('returns true for valid ObsidianApiError', () => {
    expect(isObsidianApiError({ status: 404, message: 'Not found' })).toBe(true);
  });

  it('returns true for error with extra properties', () => {
    expect(
      isObsidianApiError({ status: 500, message: 'Error', extra: 'data' })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isObsidianApiError(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isObsidianApiError('error')).toBe(false);
    expect(isObsidianApiError(123)).toBe(false);
  });

  it('returns false for object missing status', () => {
    expect(isObsidianApiError({ message: 'Error' })).toBe(false);
  });

  it('returns false for object missing message', () => {
    expect(isObsidianApiError({ status: 404 })).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns message for network error (status 0)', () => {
    const error = { status: 0, message: 'Timeout' };
    expect(getErrorMessage(error)).toBe(
      'Obsidian REST API is not running. Please ensure Obsidian is open and the Local REST API plugin is enabled.'
    );
  });

  it('returns message for auth error (status 401)', () => {
    const error = { status: 401, message: 'Unauthorized' };
    expect(getErrorMessage(error)).toBe(
      'Invalid API key. Please check your settings.'
    );
  });

  it('returns message for auth error (status 403)', () => {
    const error = { status: 403, message: 'Forbidden' };
    expect(getErrorMessage(error)).toBe(
      'Invalid API key. Please check your settings.'
    );
  });

  it('returns message for not found error (status 404)', () => {
    const error = { status: 404, message: 'Not Found' };
    expect(getErrorMessage(error)).toBe('File not found in vault.');
  });

  it('returns original message for other status codes', () => {
    const error = { status: 500, message: 'Internal Server Error' };
    expect(getErrorMessage(error)).toBe('Internal Server Error');
  });

  it('returns Error.message for Error instances', () => {
    const error = new Error('Something went wrong');
    expect(getErrorMessage(error)).toBe('Something went wrong');
  });

  it('returns default message for unknown error types', () => {
    expect(getErrorMessage('string error')).toBe('An unknown error occurred');
    expect(getErrorMessage(123)).toBe('An unknown error occurred');
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
    expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
  });
});

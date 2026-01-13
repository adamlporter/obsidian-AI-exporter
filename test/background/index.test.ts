/**
 * Background service worker tests
 *
 * Tests the message handling, validation, and API integration of the background script.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ObsidianNote } from '../../src/lib/types';

// Mock client instance - defined at module level
const mockClient = {
  testConnection: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  fileExists: vi.fn(),
};

// Default settings
const defaultSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianPort: 27123,
  vaultPath: 'AI/Gemini',
  templateOptions: {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout' as const,
    userCalloutType: 'QUESTION' as const,
    assistantCalloutType: 'NOTE' as const,
  },
};

let mockGetSettings = vi.fn(() => Promise.resolve(defaultSettings));

// Capture the message listener
let capturedListener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | undefined;

// Setup mocks before any imports
vi.mock('../../src/lib/obsidian-api', () => ({
  ObsidianApiClient: class MockObsidianApiClient {
    testConnection = mockClient.testConnection;
    getFile = mockClient.getFile;
    putFile = mockClient.putFile;
    fileExists = mockClient.fileExists;
  },
  getErrorMessage: (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return (error as { message: string }).message;
    }
    return 'An unknown error occurred';
  },
  isObsidianApiError: (error: unknown) => {
    return typeof error === 'object' && error !== null && 'status' in error && 'message' in error;
  },
}));

vi.mock('../../src/lib/storage', () => ({
  getSettings: () => mockGetSettings(),
  migrateSettings: vi.fn(() => Promise.resolve()),
}));

describe('background/index', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockClient.testConnection.mockReset();
    mockClient.getFile.mockReset();
    mockClient.putFile.mockReset();
    mockGetSettings = vi.fn(() => Promise.resolve(defaultSettings));

    // Capture message listener when addListener is called
    vi.mocked(chrome.runtime.onMessage.addListener).mockImplementation((listener) => {
      capturedListener = listener;
    });

    // Import module fresh - use dynamic import
    vi.resetModules();

    // Re-register mocks after resetModules
    vi.doMock('../../src/lib/obsidian-api', () => ({
      ObsidianApiClient: class MockObsidianApiClient {
        testConnection = mockClient.testConnection;
        getFile = mockClient.getFile;
        putFile = mockClient.putFile;
        fileExists = mockClient.fileExists;
      },
      getErrorMessage: (error: unknown) => {
        if (typeof error === 'object' && error !== null && 'message' in error) {
          return (error as { message: string }).message;
        }
        return 'An unknown error occurred';
      },
      isObsidianApiError: (error: unknown) => {
        return typeof error === 'object' && error !== null && 'status' in error && 'message' in error;
      },
    }));

    vi.doMock('../../src/lib/storage', () => ({
      getSettings: () => mockGetSettings(),
      migrateSettings: vi.fn(() => Promise.resolve()),
    }));

    await import('../../src/background/index');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('registers message listener', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(capturedListener).toBeDefined();
    });
  });

  describe('sender validation', () => {
    it('accepts messages from extension popup', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { url: `chrome-extension://${chrome.runtime.id}/popup.html` } as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized' })
      );
    });

    it('accepts messages from gemini.google.com', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'https://gemini.google.com/app/123' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Unauthorized' })
      );
    });

    it('rejects messages from unauthorized origins', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'https://evil.com' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });

    it('rejects messages with no sender info', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        {} as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });

    it('handles invalid URLs gracefully', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        { tab: { url: 'not-a-valid-url' } } as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });
  });

  describe('message validation', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('rejects unknown actions', () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'unknownAction' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
    });

    it('accepts valid actions', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).not.toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid message content' })
      );
    });

    describe('saveToObsidian validation', () => {
      const validNote: ObsidianNote = {
        fileName: 'test.md',
        body: '# Test',
        contentHash: 'abc123',
        frontmatter: {
          id: 'test-id',
          title: 'Test Title',
          source: 'gemini',
          url: 'https://gemini.google.com/app/123',
          created: '2024-01-01',
          modified: '2024-01-01',
          tags: ['test'],
          message_count: 2,
        },
      };

      it('rejects missing fileName', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, fileName: undefined } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects empty fileName', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, fileName: '' } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects fileName over 200 chars', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, fileName: 'a'.repeat(201) } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects body over 1MB', () => {
        const sendResponse = vi.fn();
        capturedListener(
          { action: 'saveToObsidian', data: { ...validNote, body: 'a'.repeat(1024 * 1024 + 1) } },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects invalid source', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToObsidian',
            data: { ...validNote, frontmatter: { ...validNote.frontmatter, source: 'invalid' } },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });

      it('rejects more than 50 tags', () => {
        const sendResponse = vi.fn();
        capturedListener(
          {
            action: 'saveToObsidian',
            data: { ...validNote, frontmatter: { ...validNote.frontmatter, tags: Array(51).fill('tag') } },
          },
          validSender as chrome.runtime.MessageSender,
          sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Invalid message content' });
      });
    });
  });

  describe('getSettings handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns settings', async () => {
      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getSettings' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          obsidianApiKey: 'test-api-key',
          obsidianPort: 27123,
        })
      );
    });
  });

  describe('testConnection handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns success on successful connection and authentication', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: true,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('returns error when server is unreachable', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: false,
        authenticated: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });
    });

    it('returns error when API key is invalid', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: false,
        error: 'Invalid API key',
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key',
      });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'API key not configured',
      });
    });
  });

  describe('saveToObsidian handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
    const validNote: ObsidianNote = {
      fileName: 'test.md',
      body: '# Test Content',
      contentHash: 'abc123',
      frontmatter: {
        id: 'test-id',
        title: 'Test Title',
        source: 'gemini',
        url: 'https://gemini.google.com/app/123',
        created: '2024-01-01',
        modified: '2024-01-01',
        tags: ['test'],
        message_count: 2,
      },
    };

    it('saves new file successfully', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(mockClient.putFile).toHaveBeenCalledWith('AI/Gemini/test.md', expect.any(String));
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isNewFile: true });
    });

    it('updates existing file', async () => {
      mockClient.getFile.mockResolvedValue('# Old Content');
      mockClient.putFile.mockResolvedValue(undefined);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, isNewFile: false });
    });

    it('handles save errors', async () => {
      mockClient.getFile.mockResolvedValue(null);
      mockClient.putFile.mockRejectedValue({ status: 500, message: 'Server error' });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Server error' });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'saveToObsidian', data: validNote },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'API key not configured. Please check settings.',
      });
    });
  });

  describe('getExistingFile handler', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('returns file content when exists', async () => {
      mockClient.getFile.mockResolvedValue('# File Content');

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md', vaultPath: 'AI/Gemini' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, content: '# File Content' });
    });

    it('returns undefined content when file not found', async () => {
      mockClient.getFile.mockResolvedValue(null);

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: true, content: undefined });
    });

    it('returns error when API key not configured', async () => {
      mockGetSettings = vi.fn(() => Promise.resolve({ ...defaultSettings, obsidianApiKey: '' }));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'API key not configured' });
    });

    it('handles getFile errors gracefully', async () => {
      mockClient.getFile.mockRejectedValue(new Error('Network timeout'));

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'getExistingFile', fileName: 'test.md' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Network timeout' });
    });
  });

  describe('testConnection additional scenarios', () => {
    const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };

    it('uses fallback error message when reachable is false without error', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: false,
        authenticated: false,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Cannot reach Obsidian. Is it running?',
      });
    });

    it('uses fallback error message when authenticated is false without error', async () => {
      mockClient.testConnection.mockResolvedValue({
        reachable: true,
        authenticated: false,
      });

      const sendResponse = vi.fn();
      capturedListener(
        { action: 'testConnection' },
        validSender as chrome.runtime.MessageSender,
        sendResponse
      );

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid API key. Please check your settings.',
      });
    });
  });
});

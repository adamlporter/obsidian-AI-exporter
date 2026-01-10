import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendMessage } from '../../src/lib/messaging';

describe('sendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset lastError
    (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError =
      null;
  });

  it('sends message and resolves with response', async () => {
    const mockResponse = { setting: 'value' };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({ action: 'getSettings' });
    expect(result).toEqual(mockResponse);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'getSettings' },
      expect.any(Function)
    );
  });

  it('rejects with error when chrome.runtime.lastError is set', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        (
          chrome.runtime as { lastError: chrome.runtime.LastError | null }
        ).lastError = { message: 'Extension context invalidated' };
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Extension context invalidated'
    );
  });

  it('rejects with "Unknown error" when lastError has no message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        (
          chrome.runtime as { lastError: chrome.runtime.LastError | null }
        ).lastError = {} as chrome.runtime.LastError;
        if (callback) callback(undefined);
      }
    );

    await expect(sendMessage({ action: 'getSettings' })).rejects.toThrow(
      'Unknown error'
    );
  });

  it('handles testConnection action', async () => {
    const mockResponse = { success: true };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({ action: 'testConnection' });
    expect(result).toEqual({ success: true });
  });

  it('handles saveToObsidian action', async () => {
    const mockResponse = { success: true, filePath: '/path/to/file.md' };
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback(mockResponse);
      }
    );

    const result = await sendMessage({
      action: 'saveToObsidian',
      data: {} as Parameters<typeof sendMessage>[0] extends { data?: infer D }
        ? D
        : never,
    } as Parameters<typeof sendMessage>[0]);
    expect(result).toEqual({ success: true, filePath: '/path/to/file.md' });
  });
});

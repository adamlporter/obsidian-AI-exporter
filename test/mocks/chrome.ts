import { vi } from 'vitest';

/**
 * Chrome Storage Mock with Promise support and internal store access
 * Based on Chrome Extension API specification
 */
export function createStorageMock() {
  const localStore: Record<string, unknown> = {};
  const syncStore: Record<string, unknown> = {};

  return {
    local: {
      get: vi.fn((keys?: string | string[] | null) => {
        if (!keys) {
          return Promise.resolve({ ...localStore });
        }
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          if (key in localStore) {
            result[key] = localStore[key];
          }
        });
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(localStore, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => delete localStore[key]);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        Object.keys(localStore).forEach((key) => delete localStore[key]);
        return Promise.resolve();
      }),
      _store: localStore, // For test inspection
    },
    sync: {
      get: vi.fn((keys?: string | string[] | null) => {
        if (!keys) {
          return Promise.resolve({ ...syncStore });
        }
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          if (key in syncStore) {
            result[key] = syncStore[key];
          }
        });
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(syncStore, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => delete syncStore[key]);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        Object.keys(syncStore).forEach((key) => delete syncStore[key]);
        return Promise.resolve();
      }),
      _store: syncStore, // For test inspection
    },
  };
}

/**
 * Chrome Runtime Mock with message listener support
 */
export function createRuntimeMock() {
  const listeners: Array<
    (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => boolean | void
  > = [];

  return {
    sendMessage: vi.fn(
      (
        message: unknown,
        callback?: (response: unknown) => void
      ): Promise<unknown> => {
        // Simulate async response
        if (callback) {
          setTimeout(() => callback(undefined), 0);
        }
        return Promise.resolve(undefined);
      }
    ),
    onMessage: {
      addListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void
          ) => boolean | void
        ) => {
          listeners.push(listener);
        }
      ),
      removeListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void
          ) => boolean | void
        ) => {
          const index = listeners.indexOf(listener);
          if (index > -1) listeners.splice(index, 1);
        }
      ),
      hasListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: chrome.runtime.MessageSender,
            sendResponse: (response?: unknown) => void
          ) => boolean | void
        ) => {
          return listeners.includes(listener);
        }
      ),
      _listeners: listeners, // For test inspection
    },
    lastError: null as chrome.runtime.LastError | null,
    id: 'test-extension-id',
    getURL: vi.fn((path: string) => `chrome-extension://test-extension-id/${path}`),
    // For offscreen document detection
    getContexts: vi.fn(() => Promise.resolve([])),
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  };
}

/**
 * Chrome Downloads Mock for file download testing
 */
export function createDownloadsMock() {
  return {
    download: vi.fn(
      (
        options: {
          url: string;
          filename: string;
          saveAs?: boolean;
          conflictAction?: string;
        },
        callback?: (downloadId: number | undefined) => void
      ) => {
        // Default: successful download with ID 1
        if (callback) {
          setTimeout(() => callback(1), 0);
        }
        return 1;
      }
    ),
  };
}

/**
 * Chrome Offscreen Mock for clipboard operations
 */
export function createOffscreenMock() {
  return {
    createDocument: vi.fn(() => Promise.resolve()),
    closeDocument: vi.fn(() => Promise.resolve()),
    Reason: { CLIPBOARD: 'CLIPBOARD' },
  };
}

/**
 * Chrome i18n Mock with language support
 */
export function createI18nMock(language = 'en') {
  const messages: Record<string, string> = {};

  return {
    getMessage: vi.fn((key: string, substitutions?: string | string[]) => {
      if (key in messages) {
        let message = messages[key];
        if (substitutions) {
          const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
          subs.forEach((sub, i) => {
            message = message.replace(`$${i + 1}`, sub);
          });
        }
        return message;
      }
      return key;
    }),
    getUILanguage: vi.fn(() => language),
    _messages: messages, // For test inspection - add custom messages here
  };
}

/**
 * Complete Chrome Mock combining all APIs
 */
export function createChromeMock(options: { language?: string } = {}) {
  return {
    storage: createStorageMock(),
    runtime: createRuntimeMock(),
    i18n: createI18nMock(options.language),
    downloads: createDownloadsMock(),
    offscreen: createOffscreenMock(),
  };
}

/**
 * Reset all stores and listeners in chrome mock
 */
export function resetChromeMock(chromeMock: ReturnType<typeof createChromeMock>) {
  // Clear local storage
  Object.keys(chromeMock.storage.local._store).forEach(
    (key) => delete chromeMock.storage.local._store[key]
  );
  // Clear sync storage
  Object.keys(chromeMock.storage.sync._store).forEach(
    (key) => delete chromeMock.storage.sync._store[key]
  );
  // Clear listeners
  chromeMock.runtime.onMessage._listeners.length = 0;
  // Reset lastError
  chromeMock.runtime.lastError = null;
  // Clear i18n messages
  Object.keys(chromeMock.i18n._messages).forEach(
    (key) => delete chromeMock.i18n._messages[key]
  );
}

/**
 * Helper to simulate chrome.runtime.lastError
 */
export function setLastError(
  chromeMock: ReturnType<typeof createChromeMock>,
  message: string | null
) {
  chromeMock.runtime.lastError = message ? { message } : null;
}

/**
 * Helper to trigger message listeners (for testing background script)
 */
export function triggerMessage(
  chromeMock: ReturnType<typeof createChromeMock>,
  message: unknown,
  sender: Partial<chrome.runtime.MessageSender> = {}
): Promise<unknown> {
  return new Promise((resolve) => {
    const fullSender: chrome.runtime.MessageSender = {
      id: 'test-extension-id',
      ...sender,
    };
    let responded = false;
    const sendResponse = (response?: unknown) => {
      if (!responded) {
        responded = true;
        resolve(response);
      }
    };

    for (const listener of chromeMock.runtime.onMessage._listeners) {
      const result = listener(message, fullSender, sendResponse);
      if (result === true) {
        // Listener will respond asynchronously
        return;
      }
    }

    // No async response, resolve with undefined
    if (!responded) {
      resolve(undefined);
    }
  });
}

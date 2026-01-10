import { vi, beforeEach } from 'vitest';

// Mock chrome API
const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
  },
};

vi.stubGlobal('chrome', chromeMock);

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// Export for test use
export { chromeMock };

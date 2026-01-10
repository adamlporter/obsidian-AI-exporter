# Test Implementation Specification v0.3.1

## Document Information

| Item | Value |
|------|-------|
| Version | 0.3.1-rev1 |
| Target Coverage | 100% (phased approach) |
| Framework | Vitest 4.0.16 + v8 coverage |
| Environment | jsdom |
| Created | 2025-01-10 |
| Revised | 2025-01-10 |

---

## 1. Executive Summary

### 1.1 Current State

| Metric | Current | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|--------|---------|---------|---------|---------|---------|---------|
| Statement | 6.79% | 30% | 50% | 70% | 85% | 100% |
| Branch | 10.08% | 30% | 50% | 70% | 85% | 100% |
| Function | 7.2% | 30% | 50% | 70% | 85% | 100% |
| Line | 6.48% | 30% | 50% | 70% | 85% | 100% |

**Current Tests**: 44 tests across 3 files
**Estimated Additional Tests**: ~210 tests
**Total Estimated Tests**: ~254 tests

### 1.2 Tested Files (100% Coverage)

- `src/lib/path-utils.ts` - 13 tests
- `src/lib/validation.ts` - 19 tests
- `src/lib/yaml-utils.ts` - 12 tests

### 1.3 Untested Files (0% Coverage)

| Priority | File | LOC | Complexity | Mock Requirements |
|----------|------|-----|------------|-------------------|
| P1 | `lib/hash.ts` | 13 | Low | None |
| P1 | `lib/sanitize.ts` | 30 | Low | DOMPurify (jsdom) |
| P2 | `content/markdown.ts` | 208 | Medium | Turndown (real) |
| P2 | `content/extractors/base.ts` | 117 | Medium | DOM |
| P3 | `lib/messaging.ts` | 37 | Medium | chrome.runtime |
| P3 | `lib/storage.ts` | 205 | High | chrome.storage |
| P3 | `lib/obsidian-api.ts` | 216 | High | fetch API |
| P4 | `content/extractors/gemini.ts` | 318 | High | DOM + fixtures |
| P4 | `background/index.ts` | 329 | High | chrome.runtime |
| P4 | `content/ui.ts` | 282 | High | DOM |
| P4 | `content/index.ts` | 222 | High | All content mocks |
| P5 | `popup/index.ts` | 319 | High | chrome.* + DOM |

---

## 2. Test Infrastructure Design

### 2.1 Directory Structure

> **Note**: Structure aligned with existing `test/` layout.

```
test/
├── setup.ts                    # Global test setup (chrome mock) [existing]
├── mocks/                      # Mock utilities [existing directory]
│   ├── chrome.ts               # Enhanced Chrome API mocks
│   └── fetch.ts                # Fetch API mock utilities
├── fixtures/                   # DOM fixtures [existing directory]
│   ├── dom-helpers.ts          # DOM fixture utilities
│   ├── gemini-conversation.html
│   └── gemini-minimal.html
├── lib/                        # Library tests [existing]
│   ├── hash.test.ts
│   ├── sanitize.test.ts
│   ├── messaging.test.ts
│   ├── storage.test.ts
│   ├── obsidian-api.test.ts
│   ├── path-utils.test.ts      # [existing]
│   ├── validation.test.ts      # [existing]
│   └── yaml-utils.test.ts      # [existing]
├── content/                    # Content script tests [existing directory]
│   ├── markdown.test.ts
│   ├── ui.test.ts
│   └── index.test.ts
├── extractors/                 # Extractor tests [existing directory]
│   ├── base.test.ts
│   └── gemini.test.ts
├── background/
│   └── index.test.ts
└── popup/
    └── index.test.ts
```

### 2.2 Vitest Configuration Update

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/lib/types.ts',      // Type definitions only
        'src/popup/index.ts',    // P5 - exclude until Phase 5
      ],
      // Phased thresholds - update as coverage improves
      thresholds: {
        statements: 30,  // Phase 1 target
        branches: 30,
        functions: 30,
        lines: 30,
      },
    },
    // Performance optimization
    pool: 'forks',
    isolate: true,
    // Clear mocks between tests
    clearMocks: true,
    restoreMocks: true,
  },
});
```

---

## 3. Mock Strategy Design

### 3.1 Chrome Extension API Mock

**Source**: [Vitest vi.stubGlobal](https://vitest.dev/api/vi.html#vi-stubglobal)

**File**: `test/mocks/chrome.ts`

```typescript
import { vi } from 'vitest';

/**
 * Chrome Storage Mock with Promise support
 * Based on Chrome Extension API specification
 */
export function createStorageMock() {
  const localStore: Record<string, unknown> = {};
  const syncStore: Record<string, unknown> = {};

  return {
    local: {
      get: vi.fn((keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
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
      _store: localStore,  // For test inspection
    },
    sync: {
      get: vi.fn((keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach(key => {
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
      _store: syncStore,  // For test inspection
    },
  };
}

/**
 * Chrome Runtime Mock
 */
export function createRuntimeMock() {
  const listeners: Array<(message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => void> = [];

  return {
    sendMessage: vi.fn((message: unknown, callback?: (response: unknown) => void) => {
      // Simulate async response
      if (callback) {
        setTimeout(() => callback(undefined), 0);
      }
    }),
    onMessage: {
      addListener: vi.fn((listener) => {
        listeners.push(listener);
      }),
      removeListener: vi.fn((listener) => {
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
      }),
      _listeners: listeners,  // For test inspection
    },
    lastError: null as chrome.runtime.LastError | null,
    id: 'test-extension-id',
  };
}

/**
 * Chrome i18n Mock
 */
export function createI18nMock() {
  return {
    getMessage: vi.fn((key: string) => key),
    getUILanguage: vi.fn(() => 'en'),
  };
}

/**
 * Complete Chrome Mock
 */
export function createChromeMock() {
  return {
    storage: createStorageMock(),
    runtime: createRuntimeMock(),
    i18n: createI18nMock(),
  };
}

/**
 * Reset all stores
 */
export function resetChromeMock(chromeMock: ReturnType<typeof createChromeMock>) {
  Object.keys(chromeMock.storage.local._store).forEach(
    key => delete chromeMock.storage.local._store[key]
  );
  Object.keys(chromeMock.storage.sync._store).forEach(
    key => delete chromeMock.storage.sync._store[key]
  );
  chromeMock.runtime.onMessage._listeners.length = 0;
  chromeMock.runtime.lastError = null;
}
```

### 3.2 Fetch API Mock

**Source**: [Vitest Mocking Functions](https://vitest.dev/guide/mocking.html)

**File**: `test/mocks/fetch.ts`

```typescript
import { vi } from 'vitest';

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}

interface FetchMockOptions {
  status?: number;
  statusText?: string;
  body?: string | object;
  headers?: Record<string, string>;
}

/**
 * Create a mock Response object
 */
export function createMockResponse(options: FetchMockOptions = {}): MockResponse {
  const {
    status = 200,
    statusText = 'OK',
    body = '',
  } = options;

  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(bodyText),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
  };
}

/**
 * Setup fetch mock with configurable responses
 */
export function setupFetchMock() {
  const mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Configure fetch to return success response
 */
export function mockFetchSuccess(
  mockFetch: ReturnType<typeof vi.fn>,
  body: string | object = '',
  status = 200
) {
  mockFetch.mockResolvedValue(createMockResponse({ status, body }));
}

/**
 * Configure fetch to return error response
 */
export function mockFetchError(
  mockFetch: ReturnType<typeof vi.fn>,
  status: number,
  statusText: string
) {
  mockFetch.mockResolvedValue(createMockResponse({ status, statusText }));
}

/**
 * Configure fetch to throw network error
 */
export function mockFetchNetworkError(
  mockFetch: ReturnType<typeof vi.fn>,
  message = 'Failed to fetch'
) {
  mockFetch.mockRejectedValue(new TypeError(message));
}

/**
 * Configure fetch to timeout (AbortError)
 */
export function mockFetchTimeout(mockFetch: ReturnType<typeof vi.fn>) {
  const error = new DOMException('The operation was aborted', 'AbortError');
  mockFetch.mockRejectedValue(error);
}
```

### 3.3 DOM Fixture Strategy

**Source**: [jsdom README](https://github.com/jsdom/jsdom)

**File**: `test/fixtures/dom-helpers.ts`

```typescript
/**
 * Load DOM fixture into document
 */
export function loadFixture(html: string): void {
  document.body.innerHTML = html;
}

/**
 * Create minimal Gemini conversation DOM
 */
export function createGeminiConversationDOM(messages: Array<{
  role: 'user' | 'assistant';
  content: string;
}>): string {
  const turns = messages.reduce((acc, msg, index, arr) => {
    // Group user + assistant into conversation containers
    if (msg.role === 'user') {
      const assistantMsg = arr[index + 1];
      const userHtml = `
        <user-query>
          <p class="query-text-line">${msg.content}</p>
        </user-query>
      `;
      const assistantHtml = assistantMsg ? `
        <model-response>
          <div class="markdown markdown-main-panel">${assistantMsg.content}</div>
        </model-response>
      ` : '';

      acc.push(`
        <div class="conversation-container">
          ${userHtml}
          ${assistantHtml}
        </div>
      `);
    }
    return acc;
  }, [] as string[]);

  return turns.join('\n');
}

/**
 * Set window.location for Gemini tests
 */
export function setGeminiLocation(conversationId: string): void {
  Object.defineProperty(window, 'location', {
    value: {
      hostname: 'gemini.google.com',
      pathname: `/app/${conversationId}`,
      href: `https://gemini.google.com/app/${conversationId}`,
    },
    writable: true,
  });
}
```

---

## 4. Verified Behavior Reference

### 4.1 DOMPurify Actual Output (Verified 2025-01-10)

| Input | Output |
|-------|--------|
| `<p>Hello</p>` | `<p>Hello</p>` |
| `<strong>Bold</strong>` | `<strong>Bold</strong>` |
| `<script>alert(1)</script>` | `` (empty) |
| `<div onclick="alert(1)">Content</div>` | `<div>Content</div>` |
| `<a href="javascript:alert(1)">Click</a>` | `<a>Click</a>` |
| `<style>body{display:none}</style>` | `` (empty) |
| `<div data-id="secret">Content</div>` | `<div>Content</div>` |
| `<a href="https://example.com" title="Link">Click</a>` | `<a href="https://example.com" title="Link">Click</a>` |

### 4.2 generateHash Actual Output (Verified 2025-01-10)

| Input | Output |
|-------|--------|
| `""` (empty) | `00000000` |
| `"a"` | `00000061` |
| `"hello"` | `05e918d2` |
| `"world"` | `06c11b92` |
| `"test content"` | `5b9662eb` |
| `"こんにちは世界"` | `09bec111` |

---

## 5. Test Specifications by Module

### 5.1 Priority 1: Pure Functions (No Mocks)

#### 5.1.1 `lib/hash.ts`

**Functions**: `generateHash(content: string): string`

**Estimated Tests**: 7

```typescript
// test/lib/hash.test.ts
import { describe, it, expect } from 'vitest';
import { generateHash } from '../../src/lib/hash';

describe('generateHash', () => {
  it('returns 00000000 for empty input', () => {
    expect(generateHash('')).toBe('00000000');
  });

  it('returns consistent hash for same input', () => {
    const input = 'test content';
    expect(generateHash(input)).toBe(generateHash(input));
    expect(generateHash(input)).toBe('5b9662eb');
  });

  it('returns different hash for different input', () => {
    expect(generateHash('hello')).toBe('05e918d2');
    expect(generateHash('world')).toBe('06c11b92');
    expect(generateHash('hello')).not.toBe(generateHash('world'));
  });

  it('handles Unicode characters', () => {
    const hash = generateHash('こんにちは世界');
    expect(hash).toBe('09bec111');
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns 8-character padded hex string', () => {
    const hash = generateHash('a');
    expect(hash).toBe('00000061');
    expect(hash).toHaveLength(8);
  });

  it('handles very long strings', () => {
    const longString = 'a'.repeat(100000);
    const hash = generateHash(longString);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('produces deterministic output', () => {
    const inputs = ['test1', 'test2', 'test3'];
    const hashes1 = inputs.map(generateHash);
    const hashes2 = inputs.map(generateHash);
    expect(hashes1).toEqual(hashes2);
  });
});
```

#### 5.1.2 `lib/sanitize.ts`

**Functions**: `sanitizeHtml(html: string): string`

**Estimated Tests**: 10

```typescript
// test/lib/sanitize.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../src/lib/sanitize';

describe('sanitizeHtml', () => {
  describe('preserves safe HTML', () => {
    it('keeps paragraph tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('<p>Hello</p>');
    });

    it('keeps formatting tags', () => {
      expect(sanitizeHtml('<strong>Bold</strong>')).toBe('<strong>Bold</strong>');
      expect(sanitizeHtml('<em>Italic</em>')).toBe('<em>Italic</em>');
    });

    it('keeps allowed attributes', () => {
      const html = '<a href="https://example.com" title="Link">Click</a>';
      expect(sanitizeHtml(html)).toBe('<a href="https://example.com" title="Link">Click</a>');
    });

    it('keeps class attribute', () => {
      expect(sanitizeHtml('<div class="container">Content</div>'))
        .toBe('<div class="container">Content</div>');
    });
  });

  describe('removes XSS vectors', () => {
    it('removes script tags completely', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
    });

    it('removes event handlers', () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Content</div>'))
        .toBe('<div>Content</div>');
    });

    it('removes javascript: URLs', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">Click</a>'))
        .toBe('<a>Click</a>');
    });

    it('removes nested XSS', () => {
      expect(sanitizeHtml('<div><script>alert(1)</script>Safe</div>'))
        .toBe('<div>Safe</div>');
    });
  });

  describe('removes CSS injection', () => {
    it('removes style tags completely', () => {
      expect(sanitizeHtml('<style>body{display:none}</style>')).toBe('');
    });
  });

  describe('enforces attribute restrictions', () => {
    it('removes data-* attributes', () => {
      expect(sanitizeHtml('<div data-id="secret">Content</div>'))
        .toBe('<div>Content</div>');
    });
  });
});
```

### 5.2 Priority 2: DOM Processing

#### 5.2.1 `content/markdown.ts`

**Functions**:
- `htmlToMarkdown(html: string): string`
- `generateFileName(title: string, conversationId: string): string`
- `generateContentHash(content: string): string`
- `conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote`

**Estimated Tests**: 25

```typescript
// test/content/markdown.test.ts
import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  generateFileName,
  generateContentHash,
  conversationToNote
} from '../../src/content/markdown';

describe('htmlToMarkdown', () => {
  describe('basic formatting', () => {
    it('converts paragraphs', () => {
      expect(htmlToMarkdown('<p>Hello World</p>')).toBe('Hello World');
    });

    it('converts bold text', () => {
      expect(htmlToMarkdown('<strong>Bold</strong>')).toBe('**Bold**');
    });

    it('converts italic text', () => {
      expect(htmlToMarkdown('<em>Italic</em>')).toBe('*Italic*');
    });

    it('converts headings', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title');
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks with language', () => {
      const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('converts inline code', () => {
      expect(htmlToMarkdown('Use <code>npm install</code>')).toBe('Use `npm install`');
    });
  });

  describe('tables', () => {
    it('converts HTML tables to markdown', () => {
      const html = `
        <table>
          <thead><tr><th>A</th><th>B</th></tr></thead>
          <tbody><tr><td>1</td><td>2</td></tr></tbody>
        </table>
      `;
      const result = htmlToMarkdown(html);
      expect(result).toContain('| A | B |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| 1 | 2 |');
    });
  });

  describe('whitespace handling', () => {
    it('converts <br> to newlines', () => {
      expect(htmlToMarkdown('Line 1<br>Line 2')).toContain('\n');
    });

    it('converts &nbsp; to spaces', () => {
      expect(htmlToMarkdown('Hello&nbsp;World')).toBe('Hello World');
    });
  });
});

describe('generateFileName', () => {
  it('creates filename from title and ID', () => {
    expect(generateFileName('Hello World', 'abc123def456'))
      .toBe('hello-world-abc123de.md');
  });

  it('preserves Japanese characters', () => {
    const result = generateFileName('日本語テスト', 'abc123def456');
    expect(result).toContain('日本語テスト');
  });

  it('removes special characters', () => {
    expect(generateFileName('Test: Special!', 'abc123def456'))
      .toBe('test-special-abc123de.md');
  });

  it('truncates long titles to 50 characters', () => {
    const longTitle = 'a'.repeat(100);
    const result = generateFileName(longTitle, 'abc123def456');
    // 50 chars title + '-' + 8 char ID suffix + '.md'
    expect(result.length).toBeLessThanOrEqual(50 + 1 + 8 + 3);
  });

  it('handles empty title with fallback', () => {
    expect(generateFileName('', 'abc123def456')).toBe('conversation-abc123de.md');
  });
});

describe('generateContentHash', () => {
  it('returns consistent hash', () => {
    const content = 'test content';
    expect(generateContentHash(content)).toBe(generateContentHash(content));
  });

  it('delegates to generateHash', () => {
    // Verify behavior matches generateHash
    expect(generateContentHash('test content')).toBe('5b9662eb');
  });
});

describe('conversationToNote', () => {
  const mockData = {
    id: 'conv123',
    title: 'Test Conversation',
    url: 'https://gemini.google.com/app/conv123',
    source: 'gemini' as const,
    messages: [
      { id: 'msg1', role: 'user' as const, content: 'Hello', index: 0 },
      { id: 'msg2', role: 'assistant' as const, content: '<p>Hi there!</p>', index: 1 },
    ],
    extractedAt: new Date('2025-01-10'),
    metadata: {
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      hasCodeBlocks: false,
    },
  };

  const defaultOptions = {
    includeId: true,
    includeTitle: true,
    includeTags: true,
    includeSource: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout' as const,
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  };

  it('generates frontmatter with required fields', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.frontmatter.id).toBe('gemini_conv123');
    expect(note.frontmatter.title).toBe('Test Conversation');
    expect(note.frontmatter.source).toBe('gemini');
  });

  it('formats messages as callouts', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('[!QUESTION]');
    expect(note.body).toContain('[!NOTE]');
  });

  it('converts HTML to markdown in assistant messages', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('Hi there!');
    expect(note.body).not.toContain('<p>');
  });

  it('generates content hash', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('formats as blockquote when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'blockquote' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).toContain('**Gemini:**');
  });

  it('formats as plain when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'plain' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).not.toContain('[!');
    expect(note.body).not.toContain('> ');
  });
});
```

#### 5.2.2 `content/extractors/base.ts`

**Test Strategy**: Create a concrete implementation for testing protected methods.

**Estimated Tests**: 15

```typescript
// test/extractors/base.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseExtractor } from '../../src/content/extractors/base';
import type { ExtractionResult, ConversationMessage } from '../../src/lib/types';

// Concrete implementation for testing
class TestExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  canExtract(): boolean { return true; }
  getConversationId(): string | null { return 'test-id'; }
  getTitle(): string { return 'Test Title'; }
  extractMessages(): ConversationMessage[] { return []; }

  async extract(): Promise<ExtractionResult> {
    return { success: true, data: undefined as any };
  }

  // Expose protected methods for testing
  public testSanitizeText(text: string): string {
    return this.sanitizeText(text);
  }

  public testQueryWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): T | null {
    return this.queryWithFallback(selectors, parent);
  }

  public testQueryAllWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): NodeListOf<T> | T[] {
    return this.queryAllWithFallback(selectors, parent);
  }

  public testGenerateHashValue(content: string): string {
    return this.generateHashValue(content);
  }
}

describe('BaseExtractor', () => {
  let extractor: TestExtractor;

  beforeEach(() => {
    extractor = new TestExtractor();
    document.body.innerHTML = '';
  });

  describe('validate', () => {
    it('returns invalid for failed extraction', () => {
      const result: ExtractionResult = { success: false, error: 'Failed' };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Failed');
    });

    it('returns invalid for null data', () => {
      const result: ExtractionResult = { success: true, data: undefined as any };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No data extracted');
    });

    it('returns invalid for empty messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [],
          extractedAt: new Date(),
          metadata: { messageCount: 0, userMessageCount: 0, assistantMessageCount: 0, hasCodeBlocks: false },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No messages found in conversation');
    });

    it('warns on very few messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
          ],
          extractedAt: new Date(),
          metadata: { messageCount: 1, userMessageCount: 1, assistantMessageCount: 0, hasCodeBlocks: false },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings).toContain(expect.stringContaining('Very few messages'));
    });

    it('warns on unbalanced message count', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
            { id: '2', role: 'user', content: 'Hello again', index: 1 },
            { id: '3', role: 'user', content: 'Hello once more', index: 2 },
          ],
          extractedAt: new Date(),
          metadata: { messageCount: 3, userMessageCount: 3, assistantMessageCount: 0, hasCodeBlocks: false },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings).toContain(expect.stringContaining('Unbalanced'));
    });

    it('warns on empty content', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: '', index: 0 },
            { id: '2', role: 'assistant', content: 'Response', index: 1 },
          ],
          extractedAt: new Date(),
          metadata: { messageCount: 2, userMessageCount: 1, assistantMessageCount: 1, hasCodeBlocks: false },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings).toContain(expect.stringContaining('empty content'));
    });
  });

  describe('sanitizeText', () => {
    it('collapses multiple spaces', () => {
      expect(extractor.testSanitizeText('hello    world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(extractor.testSanitizeText('  hello  ')).toBe('hello');
    });

    it('handles newlines and tabs', () => {
      expect(extractor.testSanitizeText('hello\n\tworld')).toBe('hello world');
    });
  });

  describe('queryWithFallback', () => {
    it('returns first matching element', () => {
      document.body.innerHTML = '<div class="target">Found</div>';
      const result = extractor.testQueryWithFallback<HTMLDivElement>(['.missing', '.target']);
      expect(result?.textContent).toBe('Found');
    });

    it('returns null if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const result = extractor.testQueryWithFallback(['.missing1', '.missing2']);
      expect(result).toBeNull();
    });

    it('searches within parent element', () => {
      document.body.innerHTML = `
        <div id="parent"><span class="target">Inside</span></div>
        <span class="target">Outside</span>
      `;
      const parent = document.getElementById('parent')!;
      const result = extractor.testQueryWithFallback<HTMLSpanElement>(['.target'], parent);
      expect(result?.textContent).toBe('Inside');
    });
  });

  describe('queryAllWithFallback', () => {
    it('returns all matching elements for first successful selector', () => {
      document.body.innerHTML = `
        <div class="item">1</div>
        <div class="item">2</div>
      `;
      const results = extractor.testQueryAllWithFallback<HTMLDivElement>(['.missing', '.item']);
      expect(results.length).toBe(2);
    });

    it('returns empty array if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const results = extractor.testQueryAllWithFallback(['.missing']);
      expect(results.length).toBe(0);
    });
  });

  describe('generateHashValue', () => {
    it('delegates to hash function', () => {
      const hash = extractor.testGenerateHashValue('test content');
      expect(hash).toBe('5b9662eb');
    });
  });
});
```

### 5.3 Priority 3-5: Specifications

> **Note**: Due to document length, detailed specifications for P3-P5 are summarized below. Full test code will be added to this document as each phase is implemented, following the same patterns established in P1-P2.

#### 5.3.1 `lib/messaging.ts` (P3) - 5 tests

- Success response handling
- `chrome.runtime.lastError` handling
- Undefined error message fallback

#### 5.3.2 `lib/storage.ts` (P3) - 20 tests

- Default settings on empty storage
- Local + sync merge logic
- API key isolation
- Migration transaction safety
- Last sync CRUD operations

#### 5.3.3 `lib/obsidian-api.ts` (P3) - 25 tests

- Constructor URL building
- `testConnection()` success/failure/timeout
- `getFile()` with 404 handling
- `putFile()` with error handling
- `fileExists()` logic
- Error message generation

#### 5.3.4 `content/extractors/gemini.ts` (P4) - 25 tests

- `canExtract()` hostname check
- `getConversationId()` URL parsing
- `getTitle()` extraction with fallbacks
- `extractMessages()` with fixtures
- `extract()` full flow
- XSS sanitization verification

#### 5.3.5 `background/index.ts` (P4) - 20 tests

- Message handler dispatch
- Sender validation
- Save/test connection flows
- Error propagation

#### 5.3.6 `content/ui.ts` (P4) - 20 tests

- Style injection (once only)
- Sync button injection
- Toast notifications (all types)
- Loading states
- HTML escaping

#### 5.3.7 `popup/index.ts` (P5) - 25 tests

- Form initialization
- Settings population
- Save handler
- Test connection handler
- API key toggle
- i18n integration

#### 5.3.8 `content/index.ts` (P4) - 15 tests

- Initialization flow
- Sync handler
- Throttling logic
- Error handling

---

## 6. Test Execution Plan

### 6.1 Phased Implementation

| Phase | Files | Est. Tests | Target Coverage | Est. Effort |
|-------|-------|------------|-----------------|-------------|
| 1 | hash.ts, sanitize.ts | 17 | 30% | 2 hours |
| 2 | markdown.ts, base.ts | 40 | 50% | 4 hours |
| 3 | messaging.ts, storage.ts, obsidian-api.ts | 50 | 70% | 6 hours |
| 4 | gemini.ts, background/index.ts, ui.ts, content/index.ts | 80 | 85% | 8 hours |
| 5 | popup/index.ts + edge cases | 27 | 100% | 4 hours |

### 6.2 CI Configuration

**File**: `.github/workflows/test.yml`

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - name: Check coverage
        run: |
          # Thresholds are enforced by vitest.config.ts
          npm run test:coverage
```

### 6.3 Threshold Update Schedule

| Milestone | statements | branches | functions | lines |
|-----------|------------|----------|-----------|-------|
| Phase 1 Complete | 30 | 30 | 30 | 30 |
| Phase 2 Complete | 50 | 50 | 50 | 50 |
| Phase 3 Complete | 70 | 70 | 70 | 70 |
| Phase 4 Complete | 85 | 85 | 85 | 85 |
| Phase 5 Complete | 100 | 100 | 100 | 100 |

---

## 7. Action Items

### Before Implementation

- [ ] Create `test/mocks/chrome.ts` with enhanced mock
- [ ] Create `test/mocks/fetch.ts` with fetch mock utilities
- [ ] Create `test/fixtures/dom-helpers.ts` with DOM helpers
- [ ] Update `vitest.config.ts` to exclude `src/lib/types.ts`

### Phase 1 (P1)

- [ ] Implement `test/lib/hash.test.ts`
- [ ] Implement `test/lib/sanitize.test.ts`
- [ ] Verify 30% coverage threshold

### Phase 2 (P2)

- [ ] Implement `test/content/markdown.test.ts`
- [ ] Implement `test/extractors/base.test.ts`
- [ ] Update thresholds to 50%

### Phase 3-5

- [ ] Continue with remaining tests
- [ ] Update thresholds incrementally
- [ ] Final 100% verification

---

## 8. References

### 8.1 Official Documentation Sources

| Library | Source | Usage |
|---------|--------|-------|
| Vitest | [vitest.dev](https://vitest.dev) | Test framework, mocking, coverage |
| jsdom | [github.com/jsdom/jsdom](https://github.com/jsdom/jsdom) | DOM testing environment |
| DOMPurify | [github.com/cure53/DOMPurify](https://github.com/cure53/DOMPurify) | HTML sanitization |
| Turndown | [github.com/mixmark-io/turndown](https://github.com/mixmark-io/turndown) | HTML to Markdown |
| Chrome Extension | [developer.chrome.com](https://developer.chrome.com/docs/extensions/) | Extension API reference |

### 8.2 Key Vitest Patterns Used

| Pattern | API | Source |
|---------|-----|--------|
| Global mocking | `vi.stubGlobal()` | [Vitest vi.stubGlobal](https://vitest.dev/api/vi.html#vi-stubglobal) |
| Module mocking | `vi.mock()` | [Vitest Mocking](https://vitest.dev/guide/mocking.html) |
| Spy functions | `vi.fn()`, `vi.spyOn()` | [Vitest Mock Functions](https://vitest.dev/api/vi.html#vi-fn) |
| Async mocking | `mockResolvedValue()` | [Vitest Mock API](https://vitest.dev/api/mock.html) |
| Environment | `@vitest-environment jsdom` | [Vitest Environment](https://vitest.dev/guide/environment.html) |
| Coverage | `v8` provider | [Vitest Coverage](https://vitest.dev/config/coverage.html) |

---

## 9. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.3.1 | 2025-01-10 | Initial specification |
| 0.3.1-rev1 | 2025-01-10 | - Aligned directory structure with existing layout<br>- Added verified behavior reference<br>- Implemented phased coverage targets<br>- Fixed hash test expectations<br>- Corrected DOMPurify output expectations |
| 0.3.1-rev2 | 2025-01-10 | - Added `src/popup/index.ts` to coverage exclusions (P5)<br>- Renamed `helpers.ts` to `dom-helpers.ts` for clarity<br>- Clarified P3-P5 specs to be expanded during implementation |

---

## 10. Approval

This specification requires explicit approval before implementation begins.

**Status**: PENDING APPROVAL

---

*End of Test Implementation Specification v0.3.1-rev1*

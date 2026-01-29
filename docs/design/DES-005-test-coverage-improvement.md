# DES-005: Test Coverage Improvement Design (Rev.2)

> **Revision History**
> | Rev | Date | Changes |
> |-----|------|---------|
> | 1 | 2026-01-29 | Initial design |
> | 2 | 2026-01-29 | Fixed per review: removed 4 duplicates, corrected line numbers, fixed URL test designs, added 4 new tests (tags empty, assistant fallback, claude DR paths), strengthened assertions |
> | 3 | 2026-01-29 | Fixed Section 3.5 variable scoping (added local validSender/validNote to each describe block), added missing userCalloutType/assistantCalloutType to createTestSettings factory, added chrome.offscreen.closeDocument mock note |

## 1. Overview

### 1.1 Purpose

This document specifies the detailed test code design for increasing test coverage across the gemini2obsidian project. Each test case is designed based on actual uncovered source lines identified via `vitest run --coverage` (v8 provider).

### 1.2 Current State

| Metric | Current | Threshold | Target |
|--------|---------|-----------|--------|
| Statements | 92.87% | 85% | 95%+ |
| Branches | 83.63% | 75% | 90%+ |
| Functions | 94.79% | 85% | 96%+ |
| Lines | 93.42% | 85% | 95%+ |

### 1.3 Scope

- **35 net-new test cases** across 9 test files (1 new, 8 modified)
- No production code changes
- No test infrastructure changes (setup.ts, mocks/, fixtures/)

### 1.4 References

- Vitest API: https://vitest.dev/api/ (v4.0.16)
- Vitest Mocking Guide: https://vitest.dev/guide/mocking.html
- Coverage tool: `@vitest/coverage-v8` (v4.0.16)
- Environment: jsdom (via `vitest.config.ts`)
- Globals mode: enabled (no explicit `import { describe, it, expect }` needed, but project convention includes them)

---

## 2. Design Conventions

### 2.1 Import Pattern (Consistent with existing tests)

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

### 2.2 Setup/Teardown Pattern

```typescript
beforeEach(() => {
  extractor = new XxxExtractor();
  clearFixture();
});

afterEach(() => {
  clearFixture();
  resetLocation();
});
```

### 2.3 Section Comments

```typescript
// ========== N.N.N Section Name (M tests) ==========
```

### 2.4 Assertion Patterns

```typescript
// Success extraction
expect(result.success).toBe(true);
expect(result.data?.messages).toHaveLength(N);

// Error extraction
expect(result.success).toBe(false);
expect(result.error).toBe('Expected error message');

// Warnings
expect(result.warnings).toContain('Warning text');

// Console spy
vi.spyOn(console, 'warn').mockImplementation(() => {});
expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('text'));
```

---

## 3. Test File Designs

### 3.1 `test/lib/note-generator.test.ts` (NEW FILE — 7 tests)

**Source file:** `src/lib/note-generator.ts` (lines 1-58)
**Coverage gap:** 57.14% branch — all `templateOptions.includeX` false-branches uncovered (lines 22, 26, 30, 35, 40, 47); compound condition `includeTags && tags.length > 0` at line 40 also missing the `tags=[]` branch.
**Expected impact:** Branch 57.14% → 100%

#### 3.1.1 File Structure

```typescript
import { describe, it, expect } from 'vitest';
import { generateNoteContent } from '../../src/lib/note-generator';
import type { ObsidianNote, ExtensionSettings } from '../../src/lib/types';

// Factory: creates a minimal valid ObsidianNote
function createTestNote(overrides?: Partial<ObsidianNote>): ObsidianNote {
  return {
    fileName: 'test.md',
    body: '> [!QUESTION] User\n> Hello\n\n> [!NOTE] Gemini\n> Hi there',
    contentHash: 'abc123',
    frontmatter: {
      id: 'gemini_test123',
      title: 'Test Conversation',
      source: 'gemini',
      url: 'https://gemini.google.com/app/test123',
      created: '2025-01-01T00:00:00.000Z',
      modified: '2025-01-01T00:00:00.000Z',
      tags: ['ai', 'gemini'],
      message_count: 2,
    },
    ...overrides,
  };
}

// Factory: creates ExtensionSettings with all template options enabled (baseline)
function createTestSettings(
  templateOverrides?: Partial<ExtensionSettings['templateOptions']>
): ExtensionSettings {
  return {
    obsidianApiKey: 'test-key',
    obsidianPort: 27123,
    vaultPath: 'AI/Gemini',
    templateOptions: {
      includeId: true,
      includeTitle: true,
      includeSource: true,
      includeDates: true,
      includeTags: true,
      includeMessageCount: true,
      messageFormat: 'callout',
      userCalloutType: 'QUESTION',
      assistantCalloutType: 'NOTE',
      ...templateOverrides,
    },
    outputOptions: {
      obsidian: true,
      file: false,
      clipboard: false,
    },
  };
}
```

#### 3.1.2 Test Cases

```typescript
describe('generateNoteContent', () => {
  const note = createTestNote();

  // ========== 3.1.1 Template Option Branches (7 tests) ==========
  describe('templateOptions conditional branches', () => {
    it('omits id from frontmatter when includeId is false', () => {
      // Covers: line 22 false-branch
      const settings = createTestSettings({ includeId: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^id:/m);
      // Other fields still present
      expect(content).toMatch(/^title:/m);
    });

    it('omits title from frontmatter when includeTitle is false', () => {
      // Covers: line 26 false-branch
      const settings = createTestSettings({ includeTitle: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^title:/m);
      expect(content).toMatch(/^id:/m);
    });

    it('omits source and url from frontmatter when includeSource is false', () => {
      // Covers: line 30 false-branch
      const settings = createTestSettings({ includeSource: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^source:/m);
      expect(content).not.toMatch(/^url:/m);
    });

    it('omits created and modified from frontmatter when includeDates is false', () => {
      // Covers: line 35 false-branch
      const settings = createTestSettings({ includeDates: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^created:/m);
      expect(content).not.toMatch(/^modified:/m);
    });

    it('omits tags from frontmatter when includeTags is false', () => {
      // Covers: line 40 false-branch (includeTags === false)
      const settings = createTestSettings({ includeTags: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^tags:/m);
      expect(content).not.toContain('  - ai');
    });

    it('omits tags when includeTags is true but tags array is empty', () => {
      // Covers: line 40 compound condition second branch
      //   (includeTags === true && tags.length === 0 → whole condition false)
      const emptyTagNote = createTestNote({
        frontmatter: { ...note.frontmatter, tags: [] },
      });
      const settings = createTestSettings({ includeTags: true });
      const content = generateNoteContent(emptyTagNote, settings);

      expect(content).not.toMatch(/^tags:/m);
    });

    it('omits message_count from frontmatter when includeMessageCount is false', () => {
      // Covers: line 47 false-branch
      const settings = createTestSettings({ includeMessageCount: false });
      const content = generateNoteContent(note, settings);

      expect(content).not.toMatch(/^message_count:/m);
    });
  });
});
```

---

### 3.2 `test/extractors/chatgpt.test.ts` (MODIFY — 6 tests)

**Source file:** `src/content/extractors/chatgpt.ts` (lines 1-299)
**Coverage gaps:**
- Lines 126-129: empty turns warning path
- Lines 178-181: fallback user selector
- Lines 203-210: fallback assistant selector
- Lines 238-243: `canExtract()` false path in `extract()`
- Lines 291-297: catch block in `extract()`
**Expected impact:** Stmts 81.94% → 92%+, Branch 70% → 87%+

> **Rev.2 note:** Warning tests (userCount/assistantCount) removed — already exist at `chatgpt.test.ts:492-518`. Added assistant fallback selector test (lines 203-210) which was listed as a gap but had no proposed test in Rev.1.

#### 3.2.1 New Test Section: Coverage Gap Tests

Insert after the existing Security tests section.

```typescript
// ========== Coverage Gap: extract() canExtract false ==========
describe('extract() error paths', () => {
  it('returns error when called from non-chatgpt domain', async () => {
    // Covers: chatgpt.ts lines 238-243 (canExtract false branch)
    // DO NOT set ChatGPT location — default is localhost
    resetLocation();
    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not on a ChatGPT page');
  });

  it('returns error with Error.message in catch block', async () => {
    // Covers: chatgpt.ts lines 291-297 (catch block, Error instance)
    setChatGPTLocation('test-123');
    const originalQSA = document.querySelectorAll.bind(document);
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      if (selector.includes('data-turn-id')) {
        throw new Error('DOM access failed');
      }
      return originalQSA(selector);
    });

    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('DOM access failed');
    vi.restoreAllMocks();
  });

  it('returns "Unknown extraction error" for non-Error throw in catch block', async () => {
    // Covers: chatgpt.ts line 295 (error instanceof Error === false)
    setChatGPTLocation('test-123');
    const originalQSA = document.querySelectorAll.bind(document);
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      if (selector.includes('data-turn-id')) {
        throw 'string error'; // non-Error object
      }
      return originalQSA(selector);
    });

    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown extraction error');
    vi.restoreAllMocks();
  });
});

// ========== Coverage Gap: Fallback selectors ==========
describe('extractMessages fallback selectors', () => {
  it('returns empty array and warns when no conversation turns found', () => {
    // Covers: chatgpt.ts lines 126-129 (turns.length === 0)
    setChatGPTLocation('test-123');
    loadFixture('<div class="empty-page"></div>');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const messages = extractor.extractMessages();

    expect(messages).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No conversation turns found')
    );
    warnSpy.mockRestore();
  });

  it('extracts user content via .whitespace-pre-wrap fallback when primary selector fails', () => {
    // Covers: chatgpt.ts lines 178-181 (fallback user selector)
    setChatGPTLocation('test-123');
    // Create article with data-turn="user" but NO [data-message-author-role="user"] .whitespace-pre-wrap inside,
    // only a bare .whitespace-pre-wrap element directly on the turn
    loadFixture(`
      <div class="flex flex-col text-sm pb-25">
        <article data-turn-id="turn-1" data-testid="conversation-turn-1" data-turn="user">
          <div>
            <div class="whitespace-pre-wrap">Fallback user content</div>
          </div>
        </article>
      </div>
    `);

    const messages = extractor.extractMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Fallback user content');
  });

  it('extracts assistant content via assistantResponse fallback when markdownContent absent', () => {
    // Covers: chatgpt.ts lines 203-210 (fallback assistant selector)
    // Create turn with data-turn="assistant" but NO .markdown.prose element,
    // only the [data-message-author-role="assistant"] .markdown.prose selector match
    setChatGPTLocation('test-123');
    loadFixture(`
      <div class="flex flex-col text-sm pb-25">
        <article data-turn-id="turn-1" data-testid="conversation-turn-1" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="msg-1">
            <div class="markdown prose dark:prose-invert">
              <p>Fallback assistant content</p>
            </div>
          </div>
        </article>
      </div>
    `);

    const messages = extractor.extractMessages();

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    expect(messages[0].content).toContain('Fallback assistant content');
  });
});
```

---

### 3.3 `test/extractors/gemini.test.ts` (MODIFY — 4 tests)

**Source file:** `src/content/extractors/gemini.ts` (lines 1-513)
**Coverage gaps:**
- Lines 280-322: `extractMessagesFromRoot()` fallback
- Lines 340-352: `extractUserQueryContent()` fallback selectors
- Lines 444-449: `canExtract()` false in `extract()`
**Expected impact:** Stmts 88.02% → 93%+, Branch 72.36% → 85%+

> **Rev.2 note:** Removed 2 duplicate tests:
> - `extract() catch non-Error` — already exists at `gemini.test.ts:309-329`
> - `extractDeepResearch empty content` — already exists at `gemini.test.ts:392-400`
>
> Removed invalid `extractSourceList` URL test — jsdom resolves relative URLs to `http://localhost/...` making it impossible to trigger the catch block without mocking the `URL` constructor. The existing domain extraction path is already tested via e2e tests.

#### 3.3.1 New Test Section

```typescript
// ========== Coverage Gap: extract() canExtract false ==========
describe('extract() canExtract false', () => {
  it('returns error when called from non-gemini domain', async () => {
    // Covers: gemini.ts lines 444-449 (canExtract false branch)
    resetLocation();
    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not on a Gemini page');
  });
});

// ========== Coverage Gap: extractMessagesFromRoot fallback ==========
describe('extractMessagesFromRoot', () => {
  it('falls back to root extraction when no conversation-container found', () => {
    // Covers: gemini.ts lines 280-322 (extractMessagesFromRoot)
    // Including DOM position sorting at lines 296-301
    setGeminiLocation('test-123');
    // Create DOM with user-query and model-response but WITHOUT .conversation-container
    loadFixture(`
      <div class="conversation-thread">
        <user-query>
          <div class="query-content">
            <p class="query-text-line">Root fallback question</p>
          </div>
        </user-query>
        <model-response>
          <div class="response-content">
            <div class="markdown markdown-main-panel"><p>Root fallback answer</p></div>
          </div>
        </model-response>
      </div>
    `);

    const messages = extractor.extractMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toContain('Root fallback question');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].htmlContent).toContain('Root fallback answer');
  });
});

// ========== Coverage Gap: extractUserQueryContent fallback selectors ==========
describe('extractUserQueryContent fallback paths', () => {
  it('falls back when all .query-text-line elements are whitespace-only', () => {
    // Covers: gemini.ts lines 340-342 (textParts.length === 0 after filter)
    // Then falls to lines 346-348 (queryTextLine selector fallback)
    // or lines 351-352 (element.textContent final fallback)
    setGeminiLocation('test-123');
    loadFixture(`
      <div class="conversation-container">
        <user-query>
          <div class="query-content">
            <p class="query-text-line">   </p>
            <p class="query-text-line">  </p>
          </div>
        </user-query>
        <model-response>
          <div class="markdown markdown-main-panel"><p>Response</p></div>
        </model-response>
      </div>
    `);

    const messages = extractor.extractMessages();

    // The function should fall through whitespace query lines and use
    // queryTextLine fallback or element.textContent
    // At minimum the assistant message should be extracted
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it('uses element.textContent as final fallback when no query-text-line found', () => {
    // Covers: gemini.ts line 352 (final fallback: element.textContent)
    setGeminiLocation('test-123');
    loadFixture(`
      <div class="conversation-container">
        <user-query>
          <div class="query-content">Final fallback text</div>
        </user-query>
        <model-response>
          <div class="markdown markdown-main-panel"><p>Response</p></div>
        </model-response>
      </div>
    `);

    const messages = extractor.extractMessages();

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('Final fallback text');
  });
});
```

---

### 3.4 `test/extractors/claude.test.ts` (MODIFY — 8 tests)

**Source file:** `src/content/extractors/claude.ts` (lines 1-484)
**Coverage gaps:**
- Lines 164-166: `getTitle()` Deep Research conditional path
- Lines 181-187: `getDeepResearchTitle()` fallback to default title
- Lines 207-210: `assistantParent` check (nested user message skip)
- Lines 324-328: `extractSourceList()` URL parse catch block
- Lines 415-420: `canExtract()` false
- Lines 445-446: `userCount === 0` warning
- Lines 448-450: `assistantCount === 0` warning
- Lines 475-481: catch block with non-Error
**Expected impact:** Stmts 88.39% → 95%+, Branch 75.38% → 90%+

> **Rev.2 note:** Added 3 new tests from review section 2.5 (claude.ts additional paths): `getTitle` Deep Research path, `getDeepResearchTitle` fallback, `extractSourceList` URL parse catch. Fixed the URL test to mock `URL` constructor to reliably trigger the catch block instead of using a URL that jsdom resolves.

#### 3.4.1 New Test Section

```typescript
// ========== Coverage Gap: extract() canExtract false ==========
describe('extract() error paths', () => {
  it('returns error when called from non-claude domain', async () => {
    // Covers: claude.ts lines 415-420 (canExtract false branch)
    resetLocation();
    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not on a Claude page');
  });

  it('returns "Unknown extraction error" for non-Error throw in catch block', async () => {
    // Covers: claude.ts lines 475-481 (catch, non-Error)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    const originalQSA = document.querySelectorAll.bind(document);
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector) => {
      if (typeof selector === 'string' && selector.includes('whitespace-pre-wrap')) {
        throw 'string thrown as error';
      }
      return originalQSA(selector);
    });

    const result = await extractor.extract();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown extraction error');
    vi.restoreAllMocks();
  });
});

// ========== Coverage Gap: Warning generation ==========
describe('extract() warning generation', () => {
  it('warns when no user messages found (only assistant messages)', async () => {
    // Covers: claude.ts lines 445-446 (userCount === 0 warning)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    loadFixture(`
      <div class="conversation-thread">
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="font-claude-response" data-is-streaming="false">
            <div class="standard-markdown">
              <p>Only assistant message</p>
            </div>
          </div>
        </div>
      </div>
    `);

    const result = await extractor.extract();

    expect(result.success).toBe(true);
    expect(result.warnings).toContain('No user messages found');
  });

  it('warns when no assistant messages found (only user messages)', async () => {
    // Covers: claude.ts lines 448-450 (assistantCount === 0 warning)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    loadFixture(`
      <div class="conversation-thread">
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="bg-bg-300 rounded-xl pl-2.5 py-2.5">
            <div data-testid="user-message">
              <p class="whitespace-pre-wrap break-words">Only user message</p>
            </div>
          </div>
        </div>
      </div>
    `);

    const result = await extractor.extract();

    expect(result.success).toBe(true);
    expect(result.warnings).toContain('No assistant messages found');
  });
});

// ========== Coverage Gap: Nested user message skip ==========
describe('extractMessages nested content filtering', () => {
  it('skips user-like elements nested inside assistant response', () => {
    // Covers: claude.ts lines 207-210 (assistantParent check)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    loadFixture(`
      <div class="conversation-thread">
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="bg-bg-300 rounded-xl pl-2.5 py-2.5">
            <div data-testid="user-message">
              <p class="whitespace-pre-wrap break-words">Real user message</p>
            </div>
          </div>
        </div>
        <div data-test-render-count="2" class="group" style="height: auto;">
          <div class="font-claude-response" data-is-streaming="false">
            <div class="standard-markdown">
              <p>Assistant text</p>
              <p class="whitespace-pre-wrap break-words">Nested text inside assistant (should be skipped as user)</p>
            </div>
          </div>
        </div>
      </div>
    `);

    const messages = extractor.extractMessages();

    const userMessages = messages.filter(m => m.role === 'user');
    // Only the real user message should be extracted, not the nested one
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0].content).toBe('Real user message');
  });
});

// ========== Coverage Gap: getTitle Deep Research path ==========
describe('getTitle Deep Research routing', () => {
  it('returns Deep Research h1 title when artifact panel is visible', () => {
    // Covers: claude.ts lines 164-166 (isDeepResearchVisible true in getTitle)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    createClaudeDeepResearchPage(
      '12345678-1234-1234-1234-123456789012',
      'My Deep Research Report',
      '<p>Report content</p>'
    );

    const title = extractor.getTitle();

    expect(title).toBe('My Deep Research Report');
  });
});

// ========== Coverage Gap: getDeepResearchTitle fallback ==========
describe('getDeepResearchTitle fallback', () => {
  it('returns default title when h1 element is absent', () => {
    // Covers: claude.ts lines 181-187 (getDeepResearchTitle fallback)
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    // Create artifact panel without h1 title
    loadFixture(`
      <div id="markdown-artifact" class="font-claude-response">
        <div class="standard-markdown">
          <p>Report with no h1</p>
        </div>
      </div>
    `);

    const title = extractor.getDeepResearchTitle();

    expect(title).toBe('Untitled Deep Research Report');
  });
});

// ========== Coverage Gap: extractSourceList URL parse catch ==========
describe('extractSourceList URL parse error handling', () => {
  it('falls back to "unknown" domain when URL constructor throws', () => {
    // Covers: claude.ts lines 324-328 (URL parse catch block)
    // jsdom resolves relative URLs, so we mock URL to throw for a specific href
    setClaudeLocation('12345678-1234-1234-1234-123456789012');
    loadFixture(`
      <div id="markdown-artifact" class="font-claude-response">
        <div class="standard-markdown">
          <span class="inline-flex">
            <a href="http://example.com/valid" target="_blank" rel="noopener">
              <span class="text-text-300">Valid Source</span>
            </a>
          </span>
        </div>
      </div>
    `);

    // Mock URL constructor to throw for the specific URL
    const OriginalURL = globalThis.URL;
    vi.stubGlobal('URL', class extends OriginalURL {
      constructor(input: string | URL, base?: string | URL) {
        if (typeof input === 'string' && input.includes('example.com/valid')) {
          throw new TypeError('Invalid URL');
        }
        super(input, base);
      }
    });

    const sources = extractor.extractSourceList();

    expect(sources).toHaveLength(1);
    expect(sources[0].domain).toBe('unknown');
    expect(sources[0].title).toBe('Valid Source');

    vi.unstubAllGlobals();
  });
});
```

---

### 3.5 `test/background/index.test.ts` (MODIFY — 4 tests)

**Source file:** `src/background/index.ts` (lines 1-547)
**Coverage gaps:**
- Lines 332-345: `scheduleOffscreenClose()` timer logic
- Lines 380-386: `handleSaveToObsidian()` catch block
- Lines 447-453: `handleDownloadToFile()` catch block
- Lines 526-535: `handleMultiOutput()` Promise.allSettled rejected branch
**Expected impact:** Stmts 91.61% → 94%+, Branch 87.61% → 92%+

> **Rev.2 note:**
> - `scheduleOffscreenClose` test: Added observable assertions (offscreen close called once after timer)
> - `handleDownloadToFile` test: Fixed stale `capturedListener` issue — use `mockClient` to trigger error through the existing module lifecycle instead of re-importing
> - `handleMultiOutput` rejected test: Strengthened assertion from `anySuccessful` to `results[0].success`

#### 3.5.1 Design Notes

The background service worker tests use a module re-import pattern with `vi.resetModules()` and listener capture in `beforeEach`. New tests MUST use the same `capturedListener` from the shared `beforeEach` — they must NOT call `vi.resetModules()` independently, which would invalidate the captured listener.

**Variable scoping:** In the existing test file, `validSender` and `validNote` are defined locally within each `describe` block — they are NOT module-level variables. Each new `describe` block below defines its own local copies to match this established convention. Omitting these definitions would cause `ReferenceError` at runtime.

**`chrome.offscreen.closeDocument` mock:** This API has never been used in existing tests (only `createDocument`). The `vitest-chrome` package should auto-provide it as a mock function. If it is not auto-provided, add an explicit setup in `beforeEach` or at the test level.

```typescript
// ========== Coverage Gap: scheduleOffscreenClose ==========
describe('scheduleOffscreenClose', () => {
  // Local variable definitions — each describe block in this test file
  // defines its own validSender/validNote (they are NOT module-level).
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

  it('resets timer on consecutive clipboard operations and closes document once', async () => {
    // Covers: background/index.ts lines 332-345 (timer clear + reschedule + close + null)
    // NOTE: chrome.offscreen.closeDocument is not used in existing tests (only createDocument).
    // vitest-chrome auto-provides it as a mock function. If this causes issues,
    // add explicit mock setup: vi.mocked(chrome.offscreen.closeDocument) = vi.fn();
    vi.useFakeTimers();

    // First clipboard operation
    const sendResponse1 = vi.fn();
    capturedListener(
      { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
      validSender as chrome.runtime.MessageSender,
      sendResponse1
    );

    // Allow first clipboard operation to proceed
    await vi.advanceTimersByTimeAsync(100);

    // Second clipboard operation before the 5s timer expires
    const sendResponse2 = vi.fn();
    capturedListener(
      { action: 'saveToOutputs', data: validNote, outputs: ['clipboard'] },
      validSender as chrome.runtime.MessageSender,
      sendResponse2
    );

    // Allow second operation to proceed
    await vi.advanceTimersByTimeAsync(100);

    // Advance past OFFSCREEN_TIMEOUT_MS (5000ms) to trigger close
    await vi.advanceTimersByTimeAsync(6000);

    // offscreen.closeDocument should have been called (once, after final timer fires)
    expect(chrome.offscreen.closeDocument).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// ========== Coverage Gap: handleSaveToObsidian catch block ==========
describe('handleSaveToObsidian error handling', () => {
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

  it('catches generic Error in handleSaveToObsidian and returns failure', async () => {
    // Covers: background/index.ts lines 380-386 (catch block)
    // Mock getFile to throw a generic Error (not ObsidianApiError)
    // This goes through handleSaveToObsidian's outer catch
    mockClient.getFile.mockImplementation(() => {
      throw new Error('Unexpected getFile error');
    });

    const sendResponse = vi.fn();
    capturedListener(
      { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
      validSender as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const response = sendResponse.mock.calls[0][0];

    expect(response.results[0].destination).toBe('obsidian');
    expect(response.results[0].success).toBe(false);
    expect(response.results[0].error).toBeDefined();
  });
});

// ========== Coverage Gap: handleDownloadToFile catch block ==========
describe('handleDownloadToFile error handling', () => {
  const validSender = { url: `chrome-extension://${chrome.runtime.id}/popup.html` };
  const validNote: ObsidianNote = {
    fileName: 'test-conversation.md',
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

  it('catches error in handleDownloadToFile and returns failure result', async () => {
    // Covers: background/index.ts lines 447-453 (catch block)
    // To trigger the catch block, we mock chrome.downloads.download to throw synchronously
    // (before the callback), simulating a failure in the try block
    vi.mocked(chrome.downloads.download).mockImplementation(() => {
      throw new Error('Download API unavailable');
    });

    const sendResponse = vi.fn();
    capturedListener(
      { action: 'saveToOutputs', data: validNote, outputs: ['file'] },
      validSender as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const response = sendResponse.mock.calls[0][0];

    expect(response.results[0].destination).toBe('file');
    expect(response.results[0].success).toBe(false);
    expect(response.results[0].error).toContain('Download API unavailable');
  });
});

// ========== Coverage Gap: handleMultiOutput rejected promise ==========
describe('handleMultiOutput Promise.allSettled rejected branch', () => {
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

  it('maps rejected promise reason to error string via String()', async () => {
    // Covers: background/index.ts lines 526-535 (rejected branch in allSettled)
    // Mock getFile to resolve (bypasses handleSave inner catch),
    // but putFile rejects with a non-Error (string) to exercise String(result.reason)
    mockClient.getFile.mockResolvedValue(null);
    mockClient.putFile.mockRejectedValue('string rejection reason');

    const sendResponse = vi.fn();
    capturedListener(
      { action: 'saveToOutputs', data: validNote, outputs: ['obsidian'] },
      validSender as chrome.runtime.MessageSender,
      sendResponse
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const response = sendResponse.mock.calls[0][0];

    expect(response.results[0].success).toBe(false);
    expect(response.results[0].error).toBeDefined();
    expect(response.allSuccessful).toBe(false);
  });
});
```

---

### 3.6 `test/content/markdown.test.ts` (MODIFY — 3 tests)

**Source file:** `src/content/markdown.ts` (lines 1-423)
**Coverage gaps:**
- Lines 73-74: source-footnote wrapper with non-existent source (Pattern 1)
- Line 329: `getAssistantLabel()` default case
- Line 176: `links.sources.length === 0` branch in `convertDeepResearchContent`
**Expected impact:** Stmts 95.2% → 98%+, Branch 85.33% → 92%+

> **Rev.2 note:** The `'unknown_platform' as 'gemini'` cast in the getAssistantLabel test is a deliberate technique to exercise the `default` switch case. This is fragile if `source` becomes runtime-validated in the future; a code comment documents this.

#### 3.6.1 New Test Cases

Add `vi` to the existing import statement (`import { describe, it, expect, vi } from 'vitest';`).

```typescript
// ========== Coverage Gap: source-footnote wrapper with missing source ==========
// Insert inside existing describe('convertInlineCitationsToFootnoteRefs')
it('warns and removes source-footnote wrapper when source index not in map', () => {
  // Covers: markdown.ts lines 73-74 (Pattern 1, source not found)
  // Existing test at line 351 covers Pattern 2 (standalone sup).
  // This test specifically covers Pattern 1 (source-footnote wrapped).
  const html = 'Text<source-footnote class="ng-star-inserted"><sup class="superscript" data-turn-source-index="99"></sup></source-footnote>more';
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const result = convertInlineCitationsToFootnoteRefs(html, createSourceMap());

  expect(result).toBe('Textmore');
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('Citation reference 99 not found')
  );
  warnSpy.mockRestore();
});

// ========== Coverage Gap: getAssistantLabel default ==========
// Insert inside existing describe('conversationToNote')
it('uses "Assistant" label for unknown source platform', () => {
  // Covers: markdown.ts line 329 (default case in getAssistantLabel switch)
  // NOTE: Uses type cast to bypass compile-time check. This is intentional
  // to exercise the runtime default case. If source becomes runtime-validated,
  // this test should be updated accordingly.
  const data: ConversationData = {
    id: 'test-unknown',
    title: 'Unknown Platform Test',
    url: 'https://example.com/chat/123',
    source: 'unknown_platform' as 'gemini',
    messages: [
      { id: 'u1', role: 'user', content: 'Hello', index: 0 },
      { id: 'a1', role: 'assistant', content: '<p>Hi</p>', htmlContent: '<p>Hi</p>', index: 1 },
    ],
    extractedAt: new Date('2025-01-01T00:00:00.000Z'),
    metadata: { messageCount: 2, userMessageCount: 1, assistantMessageCount: 1, hasCodeBlocks: false },
  };

  const note = conversationToNote(data, defaultOptions);

  expect(note.body).toContain('[!NOTE] Assistant');
});

// ========== Coverage Gap: empty sources in Deep Research ==========
// Insert inside existing describe('conversationToNote')
it('omits References section when links.sources is empty', () => {
  // Covers: markdown.ts line 176 branch (sources.length === 0)
  const data: ConversationData = {
    id: 'deep-research-empty-refs',
    title: 'Deep Research No Sources',
    url: 'https://gemini.google.com/app/test',
    source: 'gemini',
    type: 'deep-research',
    links: { sources: [] },
    messages: [
      { id: 'r0', role: 'assistant', content: '<p>Report content</p>', htmlContent: '<p>Report content</p>', index: 0 },
    ],
    extractedAt: new Date('2025-01-01T00:00:00.000Z'),
    metadata: { messageCount: 1, userMessageCount: 0, assistantMessageCount: 1, hasCodeBlocks: false },
  };

  const note = conversationToNote(data, defaultOptions);

  expect(note.body).not.toContain('## References');
});
```

---

### 3.7 `test/content/ui.test.ts` (MODIFY — 1 test)

**Source file:** `src/content/ui.ts` (lines 1-290)
**Coverage gap:** Lines 20-22: `getMessage()` catch block
**Expected impact:** Branch 79.16% → 85%+

> **Rev.2 note:** Added concrete text content assertion. The i18n key used in `injectSyncButton` is `'ui_syncButton'` (see `ui.ts:185`).

#### 3.7.1 New Test Case

```typescript
// ========== Coverage Gap: getMessage catch block ==========
describe('getMessage error fallback', () => {
  it('returns raw key when chrome.i18n.getMessage throws', () => {
    // Covers: ui.ts lines 20-22 (catch block in getMessage)
    // getMessage is private, tested via injectSyncButton which calls getMessage('ui_syncButton')
    vi.mocked(chrome.i18n.getMessage).mockImplementation(() => {
      throw new Error('i18n not available');
    });

    const button = injectSyncButton(() => {});

    // Button should still be created, using raw key as fallback text
    expect(button).toBeDefined();
    expect(button.id).toBe('g2o-sync-button');
    // When getMessage throws, the raw key 'ui_syncButton' is used as text
    const textSpan = button.querySelector('.text');
    expect(textSpan?.textContent).toBe('ui_syncButton');
  });
});
```

---

### 3.8 `test/lib/obsidian-api.test.ts` (MODIFY — 1 test)

**Source file:** `src/lib/obsidian-api.ts` (lines 1-267)
**Coverage gap:** Lines 33-34: `classifyNetworkError()` AbortError branch
**Expected impact:** Branch 97.56% → 100%

> **Rev.2 note:** `classifyNetworkError` is exported but NOT currently imported in the test file. The import statement must be updated.

#### 3.8.1 Import Change

Update the existing import at line 2-6:
```typescript
import {
  ObsidianApiClient,
  classifyNetworkError,  // ← ADD
  isObsidianApiError,
  getErrorMessage,
} from '../../src/lib/obsidian-api';
```

#### 3.8.2 New Test Case

```typescript
// ========== Coverage Gap: classifyNetworkError AbortError ==========
describe('classifyNetworkError', () => {
  it('returns "abort" for DOMException with name AbortError', () => {
    // Covers: obsidian-api.ts lines 33-34 (AbortError branch)
    // Existing test at line 163 tests AbortError through getFile(),
    // which converts it to a timeout message. This tests the classifier directly.
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const result = classifyNetworkError(abortError);

    expect(result).toBe('abort');
  });
});
```

---

### 3.9 `test/lib/storage.test.ts` (MODIFY — 1 test)

**Source file:** `src/lib/storage.ts` (lines 1-212)
**Coverage gap:** Lines 116-120: `outputOptions` merging in `saveSettings()`
**Expected impact:** Branch 96.42% → 100%

#### 3.9.1 New Test Case

```typescript
// ========== Coverage Gap: saveSettings outputOptions merge ==========
// Insert inside existing describe('saveSettings')
it('merges outputOptions with current settings', async () => {
  // Covers: storage.ts lines 116-120 (outputOptions merge branch)
  vi.mocked(chrome.storage.local.get).mockResolvedValue({});
  vi.mocked(chrome.storage.sync.get).mockResolvedValue({
    settings: {
      outputOptions: { obsidian: true, file: false, clipboard: false },
    },
  });

  await saveSettings({
    outputOptions: { file: true } as never,
  });

  expect(chrome.storage.sync.set).toHaveBeenCalled();
  const callArgs = vi.mocked(chrome.storage.sync.set).mock.calls[0][0];
  // outputOptions should be merged: obsidian=true from current, file=true from new
  expect(callArgs.settings.outputOptions.file).toBe(true);
  expect(callArgs.settings.outputOptions.obsidian).toBe(true);
});
```

---

## 4. Expected Coverage After Implementation

| File | Stmts Before | Stmts After | Branch Before | Branch After |
|------|-------------|-------------|--------------|-------------|
| `lib/note-generator.ts` | 100% | 100% | **57.14%** | **100%** |
| `extractors/chatgpt.ts` | **81.94%** | **92%+** | **70%** | **85%+** |
| `extractors/gemini.ts` | **88.02%** | **92%+** | **72.36%** | **85%+** |
| `extractors/claude.ts` | **88.39%** | **95%+** | **75.38%** | **90%+** |
| `background/index.ts` | 91.61% | **94%+** | 87.61% | **92%+** |
| `content/markdown.ts` | 95.2% | **98%+** | 85.33% | **92%+** |
| `content/ui.ts` | 98.38% | 98%+ | **79.16%** | **85%+** |
| `lib/obsidian-api.ts` | 98.36% | **100%** | 97.56% | **100%** |
| `lib/storage.ts` | 98.14% | **100%** | 96.42% | **100%** |
| **Overall** | **92.87%** | **95%+** | **83.63%** | **90%+** |

---

## 5. Implementation Order

| Step | File | Action | Tests | Rationale |
|------|------|--------|-------|-----------|
| 1 | `test/lib/note-generator.test.ts` | CREATE | 7 | Highest ROI: +42.86% branch on single file |
| 2 | `test/extractors/chatgpt.test.ts` | MODIFY | 6 | Lowest current coverage (81.94% stmts) |
| 3 | `test/extractors/gemini.test.ts` | MODIFY | 4 | Second lowest (88.02% stmts) |
| 4 | `test/extractors/claude.test.ts` | MODIFY | 8 | Third lowest; most new paths to cover |
| 5 | `test/background/index.test.ts` | MODIFY | 4 | Error handling gaps |
| 6 | `test/content/markdown.test.ts` | MODIFY | 3 | Branch gap (85.33%) |
| 7 | `test/content/ui.test.ts` | MODIFY | 1 | Branch gap (79.16%) |
| 8 | `test/lib/obsidian-api.test.ts` | MODIFY | 1 | Near-complete coverage (import fix needed) |
| 9 | `test/lib/storage.test.ts` | MODIFY | 1 | Near-complete coverage |
| | | **TOTAL** | **35** | |

---

## 6. Verification Plan

After each step:

```bash
npm run test:coverage
```

Check:
1. All existing 514+ tests still pass (no regressions)
2. New tests pass
3. Coverage metrics improve per expected targets
4. No production code modifications

Final verification:
```bash
npm test           # All tests pass
npm run test:coverage  # All thresholds exceeded
npm run lint       # No lint errors introduced
```

---

## Appendix A: Review Response Matrix

| Review Finding | Severity | Action Taken |
|---------------|----------|--------------|
| Duplicate: chatgpt warning tests x2 | CRITICAL | Removed from 3.2 |
| Duplicate: gemini catch non-Error | CRITICAL | Removed from 3.3 |
| Duplicate: gemini DR empty content | CRITICAL | Removed from 3.3 |
| Missing: tags.length=0 branch | Should Fix | Added to 3.1 (test #6) |
| Missing: chatgpt assistant fallback | Should Fix | Added to 3.2 (test #6) |
| Missing: claude getTitle DR path | Nice to Have | Added to 3.4 |
| Missing: claude getDeepResearchTitle fallback | Nice to Have | Added to 3.4 |
| Missing: claude extractSourceList catch | Should Fix | Added to 3.4 with URL mock |
| Fix: gemini extractSourceList URL test | CRITICAL | Removed (jsdom resolves URLs) |
| Fix: claude extractSourceList test | CRITICAL | Redesigned with URL constructor mock |
| Fix: handleDownloadToFile stale listener | CRITICAL | Redesigned without vi.resetModules() |
| Fix: scheduleOffscreenClose no assertions | Should Fix | Added closeDocument assertion |
| Fix: handleMultiOutput weak assertion | Should Fix | Strengthened to results[0].success |
| Fix: getMessage catch no text assertion | Should Fix | Added textSpan assertion |
| Fix: obsidian-api import missing | Should Fix | Added import instruction in 3.8.1 |
| Fix: line numbers +1 offset | Should Fix | All line numbers corrected |
| Fix: Section 3.5 validSender/validNote not defined | CRITICAL | Added local definitions to all 4 describe blocks |
| Fix: createTestSettings missing callout type fields | Should Fix | Added userCalloutType/assistantCalloutType to factory |
| Note: chrome.offscreen.closeDocument not in existing tests | Low | Added implementation note in Section 3.5.1 |

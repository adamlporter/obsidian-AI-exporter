# Test Implementation Plan v0.3.1

## Document Information

| Item | Value |
|------|-------|
| Version | 0.3.1 |
| Based On | test-implementation-spec.md v0.3.1-rev2 |
| Created | 2025-01-10 |
| Status | READY FOR EXECUTION |

---

## 1. Overview

### 1.1 Objective

Achieve 100% test coverage for gemini2obsidian Chrome Extension through a phased implementation approach.

### 1.2 Coverage Progression

```
Phase 1 (30%) → Phase 2 (50%) → Phase 3 (70%) → Phase 4 (85%) → Phase 5 (100%)
```

### 1.3 Dependency Graph

```
[Infrastructure Setup]
         ↓
    [Phase 1: Pure Functions]
         ↓
    [Phase 2: DOM Processing]
         ↓
    [Phase 3: Chrome APIs]
         ↓
    [Phase 4: Integration]
         ↓
    [Phase 5: UI + Edge Cases]
```

---

## 2. Pre-Implementation Tasks

### 2.1 Infrastructure Setup

**Priority**: BLOCKING (Must complete before Phase 1)

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| INF-001 | Create Chrome API mock utilities | `test/mocks/chrome.ts` | None | 30m |
| INF-002 | Create Fetch API mock utilities | `test/mocks/fetch.ts` | None | 20m |
| INF-003 | Create DOM fixture helpers | `test/fixtures/dom-helpers.ts` | None | 20m |
| INF-004 | Update vitest.config.ts | `vitest.config.ts` | None | 10m |

**Validation Checkpoint**: `npm run test` passes with existing 44 tests

#### INF-001: Chrome API Mock (`test/mocks/chrome.ts`)

```
Inputs:  test-implementation-spec.md Section 3.1
Outputs: Reusable chrome.storage, chrome.runtime, chrome.i18n mocks
Verify:  Import in test/setup.ts and confirm existing tests pass
```

#### INF-002: Fetch API Mock (`test/mocks/fetch.ts`)

```
Inputs:  test-implementation-spec.md Section 3.2
Outputs: mockFetchSuccess, mockFetchError, mockFetchTimeout utilities
Verify:  Unit test the mock utilities themselves
```

#### INF-003: DOM Fixture Helpers (`test/fixtures/dom-helpers.ts`)

```
Inputs:  test-implementation-spec.md Section 3.3
Outputs: loadFixture, createGeminiConversationDOM, setGeminiLocation
Verify:  Unit test helper functions
```

#### INF-004: Vitest Config Update

```diff
- exclude: ['src/**/*.d.ts', 'src/popup/index.ts'],
+ exclude: ['src/**/*.d.ts', 'src/lib/types.ts', 'src/popup/index.ts'],

- thresholds: { statements: 5, branches: 5, functions: 5, lines: 5 }
+ thresholds: { statements: 30, branches: 30, functions: 30, lines: 30 }
```

---

## 3. Phase 1: Pure Functions (Target: 30%)

### 3.1 Phase Overview

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Tests | 44 | 61 | +17 |
| Statement | 6.79% | 30%+ | +23%+ |

### 3.2 Task Breakdown

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| P1-001 | Implement hash.test.ts | `test/lib/hash.test.ts` | INF-* | 30m |
| P1-002 | Implement sanitize.test.ts | `test/lib/sanitize.test.ts` | INF-* | 45m |
| P1-003 | Update coverage thresholds | `vitest.config.ts` | P1-001, P1-002 | 5m |
| P1-004 | Verify Phase 1 coverage | - | P1-003 | 10m |

#### P1-001: hash.test.ts (7 tests)

```
Test Cases (from verified behavior):
├── returns 00000000 for empty input
├── returns consistent hash (5b9662eb for 'test content')
├── returns different hash for different input
├── handles Unicode characters (09bec111 for 'こんにちは世界')
├── returns 8-character padded hex string (00000061 for 'a')
├── handles very long strings
└── produces deterministic output
```

**Execution Command**:
```bash
npm run test -- test/lib/hash.test.ts --coverage
```

#### P1-002: sanitize.test.ts (10 tests)

```
Test Cases (from verified behavior):
├── preserves safe HTML
│   ├── keeps paragraph tags
│   ├── keeps formatting tags (strong, em)
│   ├── keeps allowed attributes (href, title)
│   └── keeps class attribute
├── removes XSS vectors
│   ├── removes script tags completely → ''
│   ├── removes event handlers → '<div>Content</div>'
│   ├── removes javascript: URLs → '<a>Click</a>'
│   └── removes nested XSS
├── removes CSS injection
│   └── removes style tags completely → ''
└── enforces attribute restrictions
    └── removes data-* attributes
```

**Execution Command**:
```bash
npm run test -- test/lib/sanitize.test.ts --coverage
```

### 3.3 Phase 1 Validation Gate

```bash
# All must pass before proceeding to Phase 2
npm run test                           # All tests pass
npm run test:coverage                  # Coverage ≥ 30% all metrics
npm run lint                           # No lint errors
```

---

## 4. Phase 2: DOM Processing (Target: 50%)

### 4.1 Phase Overview

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Tests | 61 | 101 | +40 |
| Statement | 30% | 50%+ | +20%+ |

### 4.2 Task Breakdown

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| P2-001 | Implement markdown.test.ts | `test/content/markdown.test.ts` | P1-* | 90m |
| P2-002 | Implement base.test.ts | `test/extractors/base.test.ts` | P1-* | 60m |
| P2-003 | Update coverage thresholds to 50% | `vitest.config.ts` | P2-001, P2-002 | 5m |
| P2-004 | Verify Phase 2 coverage | - | P2-003 | 10m |

#### P2-001: markdown.test.ts (25 tests)

```
Test Suites:
├── htmlToMarkdown (12 tests)
│   ├── basic formatting (paragraphs, bold, italic, headings)
│   ├── code blocks (fenced with language, inline)
│   ├── tables (HTML → markdown)
│   └── whitespace handling (br, nbsp)
├── generateFileName (5 tests)
│   ├── creates filename from title and ID
│   ├── preserves Japanese characters
│   ├── removes special characters
│   ├── truncates long titles
│   └── handles empty title with fallback
├── generateContentHash (2 tests)
│   ├── returns consistent hash
│   └── delegates to generateHash
└── conversationToNote (6 tests)
    ├── generates frontmatter
    ├── formats messages as callouts
    ├── converts HTML to markdown
    ├── generates content hash
    ├── formats as blockquote
    └── formats as plain
```

#### P2-002: base.test.ts (15 tests)

```
Test Suites:
├── validate (6 tests)
│   ├── returns invalid for failed extraction
│   ├── returns invalid for null data
│   ├── returns invalid for empty messages
│   ├── warns on very few messages
│   ├── warns on unbalanced message count
│   └── warns on empty content
├── sanitizeText (3 tests)
│   ├── collapses multiple spaces
│   ├── trims whitespace
│   └── handles newlines and tabs
├── queryWithFallback (3 tests)
│   ├── returns first matching element
│   ├── returns null if no match
│   └── searches within parent element
├── queryAllWithFallback (2 tests)
│   ├── returns all matching elements
│   └── returns empty array if no match
└── generateHashValue (1 test)
    └── delegates to hash function
```

### 4.3 Phase 2 Validation Gate

```bash
npm run test                           # All tests pass
npm run test:coverage                  # Coverage ≥ 50% all metrics
npm run lint                           # No lint errors
```

---

## 5. Phase 3: Chrome APIs (Target: 70%)

### 5.1 Phase Overview

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Tests | 101 | 151 | +50 |
| Statement | 50% | 70%+ | +20%+ |

### 5.2 Task Breakdown

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| P3-001 | Implement messaging.test.ts | `test/lib/messaging.test.ts` | P2-*, INF-001 | 30m |
| P3-002 | Implement storage.test.ts | `test/lib/storage.test.ts` | P2-*, INF-001 | 90m |
| P3-003 | Implement obsidian-api.test.ts | `test/lib/obsidian-api.test.ts` | P2-*, INF-002 | 90m |
| P3-004 | Update coverage thresholds to 70% | `vitest.config.ts` | P3-001..003 | 5m |
| P3-005 | Verify Phase 3 coverage | - | P3-004 | 10m |

#### P3-001: messaging.test.ts (5 tests)

```
Test Cases:
├── Success response handling
├── chrome.runtime.lastError handling
├── Undefined error message fallback
├── Async response callback
└── Message sender validation
```

#### P3-002: storage.test.ts (20 tests)

```
Test Suites:
├── getSettings (5 tests)
│   ├── Default settings on empty storage
│   ├── Local + sync merge logic
│   ├── API key from local only
│   └── Preference override behavior
├── saveSettings (5 tests)
│   ├── Splits local/sync storage
│   ├── API key isolation
│   └── Error handling
├── Migration (5 tests)
│   ├── Transaction safety
│   ├── Version detection
│   └── Rollback on failure
└── Last sync operations (5 tests)
    ├── CRUD operations
    └── Timestamp handling
```

#### P3-003: obsidian-api.test.ts (25 tests)

```
Test Suites:
├── Constructor (3 tests)
│   ├── URL building
│   ├── API key handling
│   └── Timeout configuration
├── testConnection (5 tests)
│   ├── Success response
│   ├── Network failure
│   ├── Timeout handling
│   ├── Invalid credentials
│   └── Server error
├── getFile (5 tests)
│   ├── Success with content
│   ├── 404 handling
│   ├── Network error
│   └── Response parsing
├── putFile (7 tests)
│   ├── Create new file
│   ├── Update existing
│   ├── Conflict detection
│   ├── Error handling
│   └── Content validation
└── fileExists (5 tests)
    ├── File exists
    ├── File not found
    └── Error handling
```

### 5.3 Phase 3 Validation Gate

```bash
npm run test                           # All tests pass
npm run test:coverage                  # Coverage ≥ 70% all metrics
npm run lint                           # No lint errors
```

---

## 6. Phase 4: Integration (Target: 85%)

### 6.1 Phase Overview

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Tests | 151 | 231 | +80 |
| Statement | 70% | 85%+ | +15%+ |

### 6.2 Task Breakdown

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| P4-001 | Create Gemini DOM fixtures | `test/fixtures/gemini-*.html` | P3-* | 45m |
| P4-002 | Implement gemini.test.ts | `test/extractors/gemini.test.ts` | P4-001 | 90m |
| P4-003 | Implement background/index.test.ts | `test/background/index.test.ts` | P3-* | 90m |
| P4-004 | Implement ui.test.ts | `test/content/ui.test.ts` | P3-* | 90m |
| P4-005 | Implement content/index.test.ts | `test/content/index.test.ts` | P4-002..004 | 60m |
| P4-006 | Update coverage thresholds to 85% | `vitest.config.ts` | P4-001..005 | 5m |
| P4-007 | Verify Phase 4 coverage | - | P4-006 | 10m |

#### P4-001: Gemini DOM Fixtures

```
Files to create:
├── test/fixtures/gemini-conversation.html
│   └── Multi-turn conversation with code blocks
└── test/fixtures/gemini-minimal.html
    └── Minimal single-turn conversation
```

#### P4-002: gemini.test.ts (25 tests)

```
Test Suites:
├── canExtract (3 tests)
│   ├── Returns true for gemini.google.com
│   ├── Returns false for other hosts
│   └── Handles subdomains
├── getConversationId (4 tests)
│   ├── Extracts from /app/[id]
│   ├── Handles query params
│   ├── Returns null for invalid URL
│   └── Handles edge cases
├── getTitle (4 tests)
│   ├── Extracts from DOM
│   ├── Fallback to first message
│   ├── Fallback to default
│   └── Sanitizes output
├── extractMessages (10 tests)
│   ├── Extracts user messages
│   ├── Extracts assistant messages
│   ├── Preserves order
│   ├── Handles code blocks
│   ├── Handles multi-line queries
│   ├── XSS sanitization
│   └── Edge cases
└── extract (4 tests)
    ├── Full extraction flow
    ├── Error handling
    ├── Metadata generation
    └── Content hash
```

#### P4-003: background/index.test.ts (20 tests)

```
Test Suites:
├── Message handling (10 tests)
│   ├── SAVE_CONVERSATION dispatch
│   ├── TEST_CONNECTION dispatch
│   ├── GET_SETTINGS dispatch
│   ├── Unknown action handling
│   └── Sender validation
└── API integration (10 tests)
    ├── Save success flow
    ├── Save error handling
    ├── Connection test success
    ├── Connection test failure
    └── Settings retrieval
```

#### P4-004: ui.test.ts (20 tests)

```
Test Suites:
├── Style injection (3 tests)
│   ├── Injects styles once
│   ├── Prevents duplicate injection
│   └── Correct CSS content
├── Button injection (5 tests)
│   ├── Creates sync button
│   ├── Correct positioning
│   ├── Event handlers
│   ├── Multiple injection prevention
│   └── Button state updates
├── Toast notifications (8 tests)
│   ├── Success toast
│   ├── Error toast
│   ├── Info toast
│   ├── Auto-dismiss
│   ├── Manual dismiss
│   ├── Multiple toasts
│   └── HTML escaping
└── Loading states (4 tests)
    ├── Show loading
    ├── Hide loading
    └── Interaction blocking
```

#### P4-005: content/index.test.ts (15 tests)

```
Test Suites:
├── Initialization (5 tests)
│   ├── Sets up on load
│   ├── Injects UI
│   ├── Registers handlers
│   └── Error recovery
├── Sync handler (6 tests)
│   ├── Extracts conversation
│   ├── Sends to background
│   ├── Shows success toast
│   ├── Shows error toast
│   └── Throttling
└── Error handling (4 tests)
    ├── Extraction failure
    ├── API failure
    └── Network timeout
```

### 6.3 Phase 4 Validation Gate

```bash
npm run test                           # All tests pass
npm run test:coverage                  # Coverage ≥ 85% all metrics
npm run lint                           # No lint errors
npm run build                          # Build succeeds
```

---

## 7. Phase 5: UI + Edge Cases (Target: 100%)

### 7.1 Phase Overview

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Tests | 231 | 258+ | +27+ |
| Statement | 85% | 100% | +15% |

### 7.2 Task Breakdown

| Task ID | Task | File | Dependencies | Est. |
|---------|------|------|--------------|------|
| P5-001 | Remove popup/index.ts from exclusions | `vitest.config.ts` | P4-* | 5m |
| P5-002 | Implement popup/index.test.ts | `test/popup/index.test.ts` | P5-001 | 120m |
| P5-003 | Add edge case tests to existing files | Various | P5-002 | 60m |
| P5-004 | Update coverage thresholds to 100% | `vitest.config.ts` | P5-003 | 5m |
| P5-005 | Final coverage verification | - | P5-004 | 15m |

#### P5-002: popup/index.test.ts (25 tests)

```
Test Suites:
├── Form initialization (5 tests)
│   ├── Loads settings on open
│   ├── Populates form fields
│   ├── Sets checkbox states
│   ├── Sets select values
│   └── i18n label translation
├── Settings save (8 tests)
│   ├── Collects form values
│   ├── Validates input
│   ├── Sends to storage
│   ├── Shows success message
│   ├── Shows error message
│   └── API key handling
├── Test connection (6 tests)
│   ├── Triggers connection test
│   ├── Shows loading state
│   ├── Success handling
│   ├── Failure handling
│   └── Timeout handling
├── API key toggle (3 tests)
│   ├── Shows/hides password
│   ├── Updates button icon
│   └── Accessibility
└── i18n integration (3 tests)
    ├── Loads messages
    ├── Falls back to keys
    └── Language detection
```

### 7.3 Phase 5 Validation Gate (Final)

```bash
npm run test                           # All tests pass
npm run test:coverage                  # Coverage = 100% all metrics
npm run lint                           # No lint errors
npm run format                         # Code formatted
npm run build                          # Production build succeeds
```

---

## 8. Execution Commands Reference

### 8.1 Development Commands

```bash
# Run all tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm run test -- test/lib/hash.test.ts

# Run tests in watch mode
npm run test -- --watch

# Run tests with verbose output
npm run test -- --reporter=verbose
```

### 8.2 Coverage Commands

```bash
# Generate coverage report
npm run test:coverage

# Open HTML coverage report
open coverage/index.html

# Check coverage thresholds (will fail if below)
npm run test:coverage -- --coverage.thresholds.100
```

### 8.3 CI Commands

```bash
# Full CI validation
npm run lint && npm run test:coverage && npm run build
```

---

## 9. Risk Mitigation

### 9.1 Identified Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| DOM structure changes in Gemini | High | Use fixture-based testing, document selector dependencies |
| Chrome API behavior differences | Medium | Comprehensive mock validation, integration tests |
| Coverage regression | Medium | CI enforcement, threshold gates |
| Test flakiness | Medium | Isolated tests, deterministic mocks |

### 9.2 Rollback Strategy

Each phase updates `vitest.config.ts` thresholds. If a phase fails:

1. Revert threshold change
2. Investigate failing tests
3. Fix issues before re-attempting threshold update

---

## 10. Success Criteria

### 10.1 Phase Completion Checklist

- [ ] **Infrastructure**: All mock utilities created and tested
- [ ] **Phase 1**: 30% coverage achieved, thresholds updated
- [ ] **Phase 2**: 50% coverage achieved, thresholds updated
- [ ] **Phase 3**: 70% coverage achieved, thresholds updated
- [ ] **Phase 4**: 85% coverage achieved, thresholds updated
- [ ] **Phase 5**: 100% coverage achieved, thresholds updated

### 10.2 Final Deliverables

| Deliverable | Location |
|-------------|----------|
| Test files | `test/**/*.test.ts` |
| Mock utilities | `test/mocks/*.ts` |
| DOM fixtures | `test/fixtures/*` |
| Coverage report | `coverage/` |
| Updated config | `vitest.config.ts` |

---

## 11. Appendix: Quick Reference

### 11.1 Verified Hash Values

| Input | Output |
|-------|--------|
| `""` | `00000000` |
| `"a"` | `00000061` |
| `"test content"` | `5b9662eb` |
| `"こんにちは世界"` | `09bec111` |

### 11.2 Verified DOMPurify Outputs

| Input | Output |
|-------|--------|
| `<script>alert(1)</script>` | `` |
| `<div onclick="alert(1)">X</div>` | `<div>X</div>` |
| `<a href="javascript:x">Y</a>` | `<a>Y</a>` |

---

*End of Test Implementation Plan v0.3.1*

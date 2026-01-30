# ADR-001: Code Quality Improvements and Dead Code Removal

| Field | Value |
|-------|-------|
| **Document ID** | ADR-001 |
| **Date** | 2026-01-30 |
| **Status** | Accepted |
| **Branch** | `feature/code-quality-improvements` |
| **Commit** | `7d811b0` |

---

## Context

A comprehensive code quality analysis identified 15 findings across critical, medium, and low severity levels. Key issues included duplicated error handling patterns across extractors, an overly complex `handleSync()` function (117 lines), inconsistent return types, and duplicate utility functions.

The codebase had grown organically across v0.3.0 through v0.6.7, accumulating technical debt in the form of:

- Identical error extraction logic repeated in 6 locations across 4 files
- A local `MAX_TITLE_LENGTH = 100` constant duplicated in `claude.ts` and `chatgpt.ts`, while `gemini.ts` already used the shared `MAX_CONVERSATION_TITLE_LENGTH` from `constants.ts`
- An identical `getMessage()` i18n function defined independently in both `popup/index.ts` and `content/ui.ts`
- Five unused constants in `constants.ts` (never imported anywhere)
- Mixed Japanese/English comments reducing accessibility for international contributors
- `queryAllWithFallback()` returning a union type `NodeListOf<T> | T[]`, complicating consumer code

---

## Decisions

### 1. Centralized Error Message Extraction

**Decision**: Extract a shared `extractErrorMessage()` utility in `base.ts`.

```typescript
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

**Rationale**: Six call sites used variations of `error instanceof Error ? error.message : String(error)` or `'Unknown extraction error'`. Centralizing this eliminates duplication and standardizes behavior. Placed in `base.ts` because it's imported by all extractors and the background service worker.

**Trade-off**: Using `String(error)` instead of a generic fallback like `'Unknown extraction error'` preserves the actual thrown value, which is more useful for debugging. Three test expectations were updated to match this behavior.

### 2. Decompose handleSync() into Focused Functions

**Decision**: Extract `validateOutputConfig()` and `displaySaveResults()` from `handleSync()`.

**Rationale**: The original `handleSync()` mixed configuration validation, extraction orchestration, and result display in a single 117-line function with multiple `setButtonLoading(false); return;` exit patterns. The decomposition:

- `validateOutputConfig()` - returns `string | null` error message, isolating validation logic
- `displaySaveResults()` - handles all three result states (all success, partial, all failed) plus delayed extraction warning display
- `handleSync()` - reduced to orchestration-only (~65 lines), with `finally` block handling loading state

**Trade-off**: Three additional function definitions increase the file slightly, but each function has a single clear responsibility and is independently testable.

### 3. Unified queryAllWithFallback Return Type

**Decision**: Change return type from `NodeListOf<T> | T[]` to `T[]`, using `Array.from()` on successful results.

**Rationale**: The union type forced consumers to handle two different types. Since `NodeListOf` is array-like but not an `Array`, operations like `.map()` required workarounds. Converting to a plain array at the source eliminates this complexity for all callers.

**Trade-off**: One extra `Array.from()` call per successful lookup. This is negligible given selectors return at most a few dozen elements.

### 4. Shared i18n Utility Module

**Decision**: Create `src/lib/i18n.ts` with a shared `getMessage()` function, replacing duplicates in `popup/index.ts` and `content/ui.ts`.

**Rationale**: Both files had identical implementations wrapping `chrome.i18n.getMessage()` with fallback to the key string. A shared module follows the existing `src/lib/` utility pattern.

**Alternatives considered**: Adding to `messaging.ts` was rejected because that module is focused on `chrome.runtime` messaging, not i18n.

### 5. Remove Unused Constants

**Decision**: Remove `UI_BASE_Z_INDEX`, `TOAST_Z_INDEX`, `LOG_PREFIX`, `LOG_PREFIX_BACKGROUND`, and `LOG_PREFIX_POPUP` from `constants.ts`.

**Rationale**: Grep confirmed zero imports across the entire codebase. The z-index values are hardcoded in CSS template literals in `ui.ts`. The log prefix constants were defined but never adopted; all logging uses inline string literals. Keeping dead constants creates false signals about the codebase's organization.

**Note**: The 38 hardcoded log prefix strings (`'[G2O]'`, `'[G2O Background]'`, etc.) remain as-is. Centralizing them would require touching every logging call site with marginal benefit, since the strings are short, stable, and grep-friendly.

### 6. Consolidate Duplicate Title Length Constants

**Decision**: Replace `const MAX_TITLE_LENGTH = 100` in `claude.ts` and `chatgpt.ts` with `MAX_CONVERSATION_TITLE_LENGTH` imported from `constants.ts`.

**Rationale**: `gemini.ts` already used the shared constant. Having the same value defined locally in two other extractors created a maintenance risk where the values could diverge.

### 7. Pre-compute Selector Joins

**Decision**: Add `JOINED_SELECTORS` object in `claude.ts` to pre-compute `inlineCitation.join(', ')` at module level.

**Rationale**: Matches the pattern established in `gemini.ts` (`JOINED_SELECTORS` for `sourceListItem`, `sourceTitle`, `sourceDomain`). While the performance impact is negligible (called once per extraction), consistency across extractors reduces cognitive overhead.

### 8. Translate Comments to English

**Decision**: Translate all Japanese inline comments and JSDoc to English across 15 source files.

**Rationale**: The code is an open-source Chrome extension with English API surfaces and English documentation in `CLAUDE.md`. Mixed-language comments reduce accessibility. User-facing strings remain localized via the i18n system (`_locales/ja/`, `_locales/en/`).

**Files affected**: `background/index.ts`, `content/markdown.ts`, all three extractors, `lib/sanitize.ts`, `lib/types.ts`, `lib/messaging.ts`, `lib/path-utils.ts`, `lib/yaml-utils.ts`, `lib/validation.ts`, `lib/obsidian-api.ts`, `lib/storage.ts`.

### 9. Keep DOMPurify Per-Call Hook Pattern

**Decision**: Retain the per-call `addHook`/`removeHook` pattern in `sanitize.ts` rather than registering at module level.

**Rationale**: Initial attempt to move the hook to module level caused 6 test failures. In the jsdom test environment, module-level hooks persist globally and interfere with other tests that mock DOM APIs. The `try/finally` cleanup pattern is intentional and ensures test isolation.

---

## Consequences

### Positive

- **22 files changed, net -12 lines**: Improved clarity with less code
- **549/549 tests pass**: No regressions
- **Build succeeds**: TypeScript and Vite compilation clean
- **Single error handling pattern**: `extractErrorMessage()` provides consistent behavior
- **Improved testability**: Smaller, focused functions can be tested independently
- **Consistent types**: `T[]` return type eliminates union handling
- **DRY**: Three categories of duplication eliminated (error handling, i18n, constants)

### Risks

- **Test expectations changed**: Three tests now expect the actual thrown string value instead of `'Unknown extraction error'`. This is more accurate but could surprise developers expecting a generic message.
- **New module**: `src/lib/i18n.ts` adds a file, but it follows existing `src/lib/` patterns and replaces two inline definitions.

---

## Files Changed

| File | Changes |
|------|---------|
| `src/content/extractors/base.ts` | Added `extractErrorMessage()`, fixed `queryAllWithFallback` return type |
| `src/content/index.ts` | Extracted `validateOutputConfig()` and `displaySaveResults()` |
| `src/content/markdown.ts` | Added bounds check for empty messages in deep-research path |
| `src/background/index.ts` | Used `extractErrorMessage()`, added debug logging in catch block |
| `src/lib/i18n.ts` | **New** shared i18n utility |
| `src/lib/constants.ts` | Removed 5 unused constants |
| `src/content/extractors/claude.ts` | Used shared constant, pre-computed selectors, used `extractErrorMessage()` |
| `src/content/extractors/chatgpt.ts` | Used shared constant, used `extractErrorMessage()` |
| `src/content/extractors/gemini.ts` | Used `extractErrorMessage()`, translated comments |
| `src/content/ui.ts` | Imported shared `getMessage()` |
| `src/popup/index.ts` | Imported shared `getMessage()` |
| `src/lib/sanitize.ts` | Translated comments (hook pattern preserved) |
| `src/lib/types.ts` | Translated comments |
| `src/lib/messaging.ts` | Translated comments |
| `src/lib/path-utils.ts` | Translated comments |
| `src/lib/yaml-utils.ts` | Translated comments |
| `src/lib/validation.ts` | Translated comments |
| `src/lib/obsidian-api.ts` | Translated comments |
| `src/lib/storage.ts` | Translated comments |
| `test/extractors/gemini.test.ts` | Updated error expectation |
| `test/extractors/claude.test.ts` | Updated error expectation |
| `test/extractors/chatgpt.test.ts` | Updated error expectation |

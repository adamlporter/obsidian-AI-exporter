# REQ: Perplexity Extractor - Requirements Specification

## 1. Background & Goal

The gemini2obsidian Chrome Extension currently supports Gemini, Claude, and ChatGPT. The user wants to add **Perplexity** (`www.perplexity.ai`) as a fourth supported platform.

Perplexity has two content types:
- **Simple Chat**: Multi-turn Q&A conversations (similar to other platforms)
- **Deep Research**: A comprehensive report generated in response to a single query (embedded as part of the chat structure, similar to ChatGPT's approach)

## 2. Scope

This document covers requirements discovery only. Architecture and implementation details are deferred to `/sc:design` and `/sc:implement`.

---

## 3. DOM Structure Analysis (from HTML fixtures)

### 3.1 Perplexity Page Structure

Perplexity uses a **React + Radix UI** component architecture. The conversation is structured as a sequence of **query-response pairs** (turns), where each turn is a nested set of divs rather than article/turn elements.

### 3.2 User Message (Query)

**Key selector path:**
```
div.group/query > div.bg-offset > span.select-text
```

- User queries are wrapped in `<h1>` (first turn) or `<div>` elements with class `group/query`
- The actual text is inside `<span class="select-text">`
- The query bubble has class `bg-offset text-foreground rounded-2xl p-3`
- User queries are right-aligned (wrapped in `flex justify-end`)
- Edit/Copy Query buttons appear alongside (aria-label="Edit Query", "Copy Query")

**Selectors (stability HIGH → LOW):**
1. `span.select-text` inside `div[class*="group/query"]` (HIGH - semantic)
2. `div.bg-offset.rounded-2xl span.select-text` (MEDIUM - style-based)

### 3.3 Assistant Response (Answer)

**Key selector path:**
```
div[id^="markdown-content-"] > div.has-inline-images > div.prose
```

- Each response has a unique `id="markdown-content-{N}"` (0-indexed)
- Content is inside `div.prose.dark\\:prose-invert`
- Contains headings (`<h2>`), paragraphs (`<p>`), tables (`<table>`), etc.
- Inline citations use `<span class="citation inline" data-pplx-citation-url="...">`
- The `data-pplx-citation-url` attribute holds the source URL
- Citation display text is inside nested `<span>` within the citation element
- A `<span class="citation-nbsp">` appears before each citation (separator)

**Selectors (stability HIGH → LOW):**
1. `div[id^="markdown-content-"]` (HIGH - unique ID pattern)
2. `div.prose.dark\\:prose-invert` within answer area (MEDIUM)

### 3.4 Turn Structure

Each Q&A turn follows this nesting pattern:
```
div.flex.flex-col.gap-y-lg          ← Turn container
  ├── div.bg-base                   ← Query block
  │   └── div.group/query
  │       └── div.bg-offset > span.select-text  ← User query text
  └── div.gap-y-lg.flex.flex-col    ← Response block
      └── div[role="tabpanel"]
          └── div[id^="markdown-content-"]       ← Assistant response
              └── div.prose                       ← Markdown content
```

Follow-up turns are nested inside a wrapper with class `min-h-[var(--page-content-height)]` and repeat the same structure.

### 3.5 Citations (Inline)

Perplexity uses the `data-pplx-citation` attribute system:
```html
<span class="citation inline"
      data-pplx-citation=""
      data-pplx-citation-url="https://example.com/article">
  <a href="https://example.com/article">
    <span>example</span>
  </a>
</span>
```

- The `data-pplx-citation-url` attribute contains the source URL
- The `aria-label` on the parent `<span class="inline-flex">` contains the title
- Citations appear inline in text, preceded by `<span class="citation-nbsp">`

### 3.6 Source List

- A button showing "Reviewed N sources" or "N steps completed" appears in the response metadata area
- Individual source favicons are displayed (not directly linkable from this button)
- Full source details are available on the "Links" tab but may not be accessible from the Answer tab DOM

### 3.7 Deep Research Detection

Deep Research responses are distinguished by:
- The presence of `"N steps completed"` text (vs "Reviewed N sources" for normal search)
- More extensive content with structured headings, tables, etc.
- Single query with a comprehensive report response
- **No separate Deep Research panel** (unlike Gemini's `deep-research-immersive-panel` or Claude's `#markdown-artifact`)

Since Deep Research is structurally identical to a normal conversation (just longer), the ChatGPT approach applies: **treat Deep Research as a normal conversation** without special extraction logic.

---

## 4. URL Structure

Pattern: `https://www.perplexity.ai/search/{slug}-{hash}`

Examples:
- `https://www.perplexity.ai/search/perplexitynohtmlgou-zao-wotesu-Y8vT04G0SKap6aQTA8L6hg`
- `https://www.perplexity.ai/search/da-shou-ting-toraba-CG5SwgBvRti46_Hs1jFYAw`
- `https://www.perplexity.ai/search/xian-zai-qnap-ts-433-4g-nas-wo-MPL6rxO2R5C96UJ1M1Uzeg`

**Conversation ID extraction:**
- Path format: `/search/{title-slug}-{base64-like-hash}`
- The hash portion at the end appears to be the unique identifier
- Regex: `/\/search\/(.+)$/i` → full slug, or extract just the trailing hash

**Hostname:** `www.perplexity.ai` (note: includes `www` subdomain)

---

## 5. Functional Requirements

### FR-001: Platform Detection
- Detect Perplexity pages via `window.location.hostname === 'www.perplexity.ai'`
- Note: Must use `www.perplexity.ai`, not `perplexity.ai`

### FR-002: Conversation ID Extraction
- Extract from URL path `/search/{slug}`
- Use the full slug as ID, or extract the trailing hash portion
- Fallback to `perplexity-{timestamp}` if no match

### FR-003: Title Extraction
- Use the first user query text as the title
- Truncate to `MAX_CONVERSATION_TITLE_LENGTH`
- Default: "Untitled Perplexity Conversation"

### FR-004: User Message Extraction
- Extract text from `span.select-text` within query containers
- Preserve multi-line content
- Sanitize whitespace

### FR-005: Assistant Response Extraction
- Extract HTML content from `div[id^="markdown-content-"]` elements
- Sanitize via DOMPurify
- Preserve headings, paragraphs, tables, lists, code blocks

### FR-006: Citation Handling
- Extract inline citations from `span.citation[data-pplx-citation-url]`
- Preserve citation URLs in the HTML for Markdown conversion
- Optionally extract citation sources as `DeepResearchLinks` for frontmatter

### FR-007: Multi-turn Conversation
- Handle multiple Q&A turns in sequence
- Correctly pair user queries with their corresponding responses
- Maintain message order

### FR-008: Deep Research Support
- Treat Deep Research same as normal conversation (ChatGPT pattern)
- No special extraction mode needed
- The conversation type can remain `'conversation'` (no need for `'deep-research'` type)

---

## 6. Non-Functional Requirements

### NFR-001: Security
- Strict hostname comparison (`===`) to prevent subdomain attacks
- Origin validation in background worker: add `'https://www.perplexity.ai'` to `ALLOWED_ORIGINS`
- HTML sanitization via DOMPurify for all assistant content

### NFR-002: Resilience
- Multiple fallback selectors per element (HIGH → LOW stability)
- Graceful degradation when selectors fail
- Warnings for partial extraction

### NFR-003: Consistency
- Follow existing extractor patterns (extend `BaseExtractor`)
- Use same output format (Obsidian callouts with YAML frontmatter)
- Same message structure (`ConversationMessage`)

---

## 7. Integration Points (Checklist)

Based on CLAUDE.md "Adding New Platforms" guide:

1. [ ] `src/lib/types.ts` — `'perplexity'` already exists in source/platform unions
2. [ ] `src/content/extractors/base.ts` — May need updates if platform-specific logic exists
3. [ ] `src/content/extractors/perplexity.ts` — **NEW FILE**: Create extractor class
4. [ ] `src/content/index.ts` — Add routing for `www.perplexity.ai`
5. [ ] `src/content/index.ts` — Update `waitForConversationContainer()` selectors
6. [ ] `src/background/index.ts` — Add `'https://www.perplexity.ai'` to `ALLOWED_ORIGINS`
7. [ ] `src/manifest.json` — Add to `host_permissions`
8. [ ] `src/manifest.json` — Add to `content_scripts.matches`
9. [ ] `test/extractors/perplexity.test.ts` — **NEW FILE**: Unit tests
10. [ ] `test/extractors/e2e/perplexity.e2e.test.ts` — **NEW FILE**: E2E tests
11. [ ] `test/fixtures/html/perplexity/` — Rename from `perplxity` (typo in current directory name)
12. [ ] `test/fixtures/dom-helpers.ts` — Add Perplexity DOM helpers

---

## 8. Design Decisions (Resolved)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | Hostname | `www.perplexity.ai` only | Matches observed URLs. Users always land on `www`. |
| Q2 | Conversation ID | Full slug from `/search/{slug}` | Simple, unique, preserves URL semantics. |
| Q3 | Citations | Preserve in HTML only | Simpler approach (like ChatGPT). Turndown handles link conversion. |
| Q4 | Fixture directory | Rename `perplxity` → `perplexity` | Fix typo for consistency. |
| Q5 | Deep Research | Treat all as `type: 'conversation'` | Structurally identical to normal chat. No special detection needed. |

---

## 9. Acceptance Criteria

- [ ] Extension activates on `www.perplexity.ai` pages
- [ ] Sync button appears on Perplexity conversation pages
- [ ] Simple chat: All user queries and assistant responses extracted correctly
- [ ] Deep Research: Full report content extracted correctly
- [ ] Inline citations preserved in Markdown output
- [ ] YAML frontmatter includes `source: perplexity`
- [ ] Output matches Obsidian callout format of other platforms
- [ ] Unit tests pass for platform detection, URL extraction, message extraction
- [ ] E2E tests pass with provided HTML fixtures
- [ ] No regressions in existing Gemini/Claude/ChatGPT extractors

---

## 10. Next Steps

After requirements approval:
1. **`/sc:design`** — Architecture design for PerplexityExtractor
2. **`/sc:implement`** — Implementation
3. **`/sc:test`** — Test execution and validation

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Extension that extracts Gemini AI conversations and saves them to Obsidian via the Local REST API. Built with CRXJS + Vite + TypeScript.

## ⚠️ Absolute Rules

### 🚫 NEVER (Absolutely Forbidden)

The following are **forbidden under any circumstances**. No exceptions. No context override.

#### Documentation

- **NEVER** create project-related docs under `~/.claude/`
- **NEVER** place design docs in global directories
- **NEVER** create files in `~/.claude/plans/` even in Plan mode

#### Assumptions

- **NEVER** say "should be" or "probably" without verifying server state
- **NEVER** assume current state based on past information
- **NEVER** assert "already done" without verification
- **NEVER** apply "best practices" without validation

#### Implementation

- **NEVER** generate code before plan approval
- **NEVER** expand scope during execution phase
- **NEVER** guess configuration parameters
- **NEVER** try alternatives without error analysis

### ✅ ALWAYS (Mandatory Actions)

The following are **always required**. No shortcuts.

#### Verification

- **ALWAYS** follow: "I'll check" → actually check → report results
- **ALWAYS** say "verification needed" when uncertain

#### Documentation

- **ALWAYS** place project docs under `docs/`
- **ALWAYS** document reasons for config changes in comments
- **ALWAYS** create ADR for significant config changes

#### Implementation Process

- **ALWAYS** output [PLAN] before implementation
- **ALWAYS** wait for explicit approval before execution
- **ALWAYS** follow approved plan strictly
- **ALWAYS** output progress for each step

**ADR Guide:**

- Location: `docs/adr/`
- Naming: `NNN-<topic>.md`

## Commands

```bash
npm run build    # TypeScript check + Vite production build
npm run dev      # Vite dev server with HMR
npm run lint     # ESLint on src/
npm run format   # Prettier formatting
```

Load the extension in Chrome: `chrome://extensions` → Load unpacked → select `dist/` folder

## Architecture

```
Content Script (gemini.google.com)
    ↓ extracts conversation
Background Service Worker
    ↓ sends to Obsidian
Obsidian Local REST API (127.0.0.1:27123)
```

### Key Components

| Path                               | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `src/content/extractors/gemini.ts` | DOM extraction for Gemini conversations           |
| `src/content/extractors/base.ts`   | Abstract extractor with selector fallback helpers |
| `src/content/markdown.ts`          | HTML→Markdown via Turndown with custom rules      |
| `src/lib/obsidian-api.ts`          | REST API client for Obsidian                      |
| `src/lib/types.ts`                 | Shared TypeScript interfaces                      |
| `src/background/index.ts`          | Service worker handling API calls                 |
| `src/popup/`                       | Settings UI                                       |

### Extractor Pattern

Extractors implement `IConversationExtractor` from `src/lib/types.ts`. The `BaseExtractor` provides:

- `queryWithFallback()` - tries multiple CSS selectors in order
- `queryAllWithFallback()` - same for querySelectorAll
- `sanitizeText()` - normalizes whitespace

### DOM Selectors

Gemini uses Angular components. Key selectors in `gemini.ts`:

- `.conversation-container` - each Q&A turn
- `user-query` / `model-response` - Angular component tags
- `.query-text-line` - user message lines (multiple per query)
- `.markdown.markdown-main-panel` - assistant response content

When Gemini's DOM changes, update `SELECTORS` in `gemini.ts` and test with sample HTML in `test/element-sample.html`.

## Output Format

Conversations are saved as Markdown with YAML frontmatter and Obsidian callouts:

```markdown
---
id: gemini_xxx
title: '...'
source: gemini
---

> [!QUESTION] User
> query text

> [!NOTE] Gemini
> response text
```

## Future Platforms

Types support `claude` and `perplexity` sources. Add new extractors by extending `BaseExtractor` and implementing `IConversationExtractor`.

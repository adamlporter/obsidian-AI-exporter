# DES-007: Platform Lint Script and Perplexity Documentation Update

> **Revision History**
> | Rev | Date | Changes |
> |-----|------|---------|
> | 1 | 2026-02-02 | Initial design |

## 1. Overview

### 1.1 Purpose

This document specifies:

1. A lint script (`scripts/lint-platforms.mjs`) that validates platform references across documentation and configuration files against the single source of truth (SSOT)
2. The required edits to 7 files to add Perplexity AI as a documented platform

### 1.2 Problem Statement

When a new platform is added to `src/manifest.json` `content_scripts[0].matches`, there is no automated mechanism to detect that documentation files (`README.md`, `privacy.html`, etc.) are missing the new platform. This has resulted in Perplexity being present in the manifest but absent from 7 other files.

### 1.3 SSOT Definition

**Single Source of Truth**: `src/manifest.json` → `content_scripts[0].matches`

Current value:
```json
[
  "https://gemini.google.com/*",
  "https://claude.ai/*",
  "https://chatgpt.com/*",
  "https://www.perplexity.ai/*"
]
```

The `host_permissions` array also contains `http://127.0.0.1:27123/*`, which is infrastructure (Obsidian Local REST API), not a platform. The lint script explicitly excludes `127.0.0.1` from platform checks.

### 1.4 References

- `src/manifest.json`: Chrome Extension manifest (Manifest V3)
- Node.js `fs` module: https://nodejs.org/api/fs.html
- ESM modules in Node.js: https://nodejs.org/api/esm.html

---

## 2. Design: lint-platforms Script

### 2.1 File Location

`scripts/lint-platforms.mjs`

ESM module (`.mjs`) to match the project's `"type": "module"` in `package.json`. No external dependencies — uses only Node.js built-in modules (`fs`, `path`, `url`).

### 2.2 Host-to-DisplayName Mapping

The script extracts hostnames from `content_scripts[0].matches` patterns by stripping the `https://` prefix and `/*` suffix. It then maps hostnames to display names using the following table:

| Hostname | Display Name | Derivation |
|----------|-------------|------------|
| `gemini.google.com` | `Gemini` | Subdomain first segment, capitalized |
| `claude.ai` | `Claude` | Domain first segment, capitalized |
| `chatgpt.com` | `ChatGPT` | Domain first segment, cased as brand |
| `www.perplexity.ai` | `Perplexity` | Second segment (skip `www`), capitalized |

This mapping is hardcoded in the script because:
- Brand capitalization is not derivable from hostnames (e.g., `ChatGPT`, not `Chatgpt`)
- The number of platforms is small (4) and grows infrequently
- A new platform addition requires updating this map, which the script itself will catch on the next run after `manifest.json` is updated (the script will fail with "unknown hostname" if a match entry has no mapping)

### 2.3 Check Targets

| File | Check Type | What is Checked |
|------|-----------|-----------------|
| `docs/privacy.html` | hostname | Each platform hostname appears in the file body |
| `README.md` | hostname | Each platform hostname appears in the file body |
| `README.ja.md` | hostname | Each platform hostname appears in the file body |
| `CLAUDE.md` | hostname | Each platform hostname appears in the file body |
| `package.json` | display name | `description` field contains each platform display name (case-insensitive) |
| `src/_locales/en/messages.json` | display name | `extDescription.message` contains each platform display name (case-insensitive) |
| `src/_locales/ja/messages.json` | display name | `extDescription.message` contains each platform display name (case-insensitive) |

**Rationale for two check types:**

- **hostname check**: Documentation files like `README.md` and `privacy.html` reference platforms by their URLs (e.g., `gemini.google.com`), so checking for the hostname is appropriate
- **display name check**: `package.json` description and locale messages use human-readable names (e.g., "Gemini, Claude, and ChatGPT"), so checking for the display name is appropriate

### 2.4 Algorithm

```
1. Read src/manifest.json
2. Extract content_scripts[0].matches array
3. For each match pattern:
   a. Strip "https://" prefix and "/*" suffix → hostname
   b. Skip if hostname starts with "127." (infrastructure, not platform)
   c. Look up display name in hardcoded map
   d. If hostname not in map → error: "Unknown platform hostname: {hostname}. Add it to HOST_DISPLAY_NAMES in scripts/lint-platforms.mjs"
4. For each check target:
   a. Read file content
   b. For JSON files (package.json, messages.json): parse and extract specific field
   c. Check that required string (hostname or display name) is present
   d. Collect all missing entries
5. If any missing entries found:
   a. Print each as: "ERROR: {file} is missing platform: {name}"
   b. Exit with code 1
6. If all checks pass:
   a. Print "All platform references are consistent with manifest.json"
   b. Exit with code 0
```

### 2.5 package.json Integration

Current `lint` script:
```json
"lint": "eslint src/"
```

Updated scripts:
```json
"lint": "eslint src/ && node scripts/lint-platforms.mjs",
"lint:platforms": "node scripts/lint-platforms.mjs"
```

This ensures:
- `npm run lint` runs both ESLint and platform checks (CI integration)
- `npm run lint:platforms` is available for standalone use

### 2.6 Error Output Format

```
Platform lint check
===================
Source: src/manifest.json content_scripts[0].matches
Platforms: Gemini (gemini.google.com), Claude (claude.ai), ChatGPT (chatgpt.com), Perplexity (www.perplexity.ai)

ERROR: docs/privacy.html is missing platform hostname: www.perplexity.ai
ERROR: README.md is missing platform hostname: www.perplexity.ai

2 error(s) found. Update the files above to include all platforms.
```

Success output:
```
Platform lint check
===================
Source: src/manifest.json content_scripts[0].matches
Platforms: Gemini (gemini.google.com), Claude (claude.ai), ChatGPT (chatgpt.com), Perplexity (www.perplexity.ai)

All 7 files are consistent with manifest.json. ✓
```

---

## 3. Design: 7-File Perplexity Documentation Update

### 3.1 `docs/privacy.html`

**Change 1: Data Transmission section (after line 53)**

Add:
```html
<li><strong>www.perplexity.ai</strong>: To extract Perplexity conversation content (read-only)</li>
```

**Change 2: Permissions Explained table (after line 77)**

Add:
```html
<tr><td>Host: www.perplexity.ai</td><td>Inject the sync button on Perplexity pages</td></tr>
```

### 3.2 `README.md`

**Change 1: Line 3 — opening description**

```
- Before: Chrome Extension that exports AI conversations from Google Gemini, Claude AI, and ChatGPT to Obsidian via the Local REST API.
+ After:  Chrome Extension that exports AI conversations from Google Gemini, Claude AI, ChatGPT, and Perplexity to Obsidian via the Local REST API.
```

**Change 2: Line 12 — Features list**

```
- Before: - **Multi-platform support**: Export from Google Gemini, Claude AI, and ChatGPT
+ After:  - **Multi-platform support**: Export from Google Gemini, Claude AI, ChatGPT, and Perplexity
```

**Change 3: Lines 87-91 — Add Perplexity usage section (after ChatGPT section)**

Add:
```markdown
### Perplexity

1. Open a conversation on [www.perplexity.ai](https://www.perplexity.ai)
2. Click the purple "Sync" button in the bottom-right corner
3. The conversation will be exported with the same output options as Gemini
```

**Change 4: Line 188 — Architecture diagram**

```
- Before: Content Script (gemini.google.com, claude.ai, chatgpt.com)
+ After:  Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)
```

**Change 5: Lines 200-202 — Key Components table**

Add row:
```markdown
| `src/content/extractors/perplexity.ts` | Perplexity conversation extractor |
```

### 3.3 `README.ja.md`

**Change 1: Line 3 — opening description**

```
- Before: Google Gemini、Claude AI、ChatGPT の会話を Obsidian に保存する Chrome 拡張機能です。
+ After:  Google Gemini、Claude AI、ChatGPT、Perplexity の会話を Obsidian に保存する Chrome 拡張機能です。
```

**Change 2: Line 12 — 機能 list**

```
- Before: - **マルチプラットフォーム対応**: Google Gemini、Claude AI、ChatGPT からエクスポート
+ After:  - **マルチプラットフォーム対応**: Google Gemini、Claude AI、ChatGPT、Perplexity からエクスポート
```

**Change 3: Lines 87-91 — Add Perplexity usage section (after ChatGPT section)**

Add:
```markdown
### Perplexity

1. [www.perplexity.ai](https://www.perplexity.ai) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. Gemini と同じ出力オプションで会話がエクスポートされます
```

**Change 4: Line 188 — Architecture diagram**

```
- Before: Content Script (gemini.google.com, claude.ai, chatgpt.com)
+ After:  Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)
```

**Change 5: Lines 200-202 — Key Components table**

Add row:
```markdown
| `src/content/extractors/perplexity.ts` | Perplexity 会話抽出 |
```

### 3.4 `CLAUDE.md`

**Change 1: Line 7 — Project Overview**

```
- Before: Chrome Extension that extracts AI conversations from Google Gemini and Claude AI and saves them to Obsidian
+ After:  Chrome Extension that extracts AI conversations from Google Gemini, Claude AI, ChatGPT, and Perplexity and saves them to Obsidian
```

**Change 2: Line 76 — Architecture diagram**

```
- Before: Content Script (gemini.google.com, claude.ai)
+ After:  Content Script (gemini.google.com, claude.ai, chatgpt.com, www.perplexity.ai)
```

**Change 3: Lines 140-144 — Supported Platforms section**

Add:
```markdown
- **Perplexity** (`www.perplexity.ai`): Conversations
```

**Change 4: Lines 161-163 — Future Platforms section**

Remove or update this section since Perplexity is now implemented:
```
- Before: Types support `perplexity` source. Add new extractors by extending `BaseExtractor` and implementing `IConversationExtractor`.
+ After:  Add new extractors by extending `BaseExtractor` and implementing `IConversationExtractor`.
```

### 3.5 `package.json`

**Change: Line 4 — description**

```
- Before: "description": "Chrome Extension to export AI conversations from Gemini, Claude, and ChatGPT to Obsidian, file download, or clipboard"
+ After:  "description": "Chrome Extension to export AI conversations from Gemini, Claude, ChatGPT, and Perplexity to Obsidian, file download, or clipboard"
```

### 3.6 `src/_locales/en/messages.json`

**Change: Line 7 — extDescription.message**

```
- Before: "Export AI conversations from Gemini, Claude, and ChatGPT to Obsidian via Local REST API"
+ After:  "Export AI conversations from Gemini, Claude, ChatGPT, and Perplexity to Obsidian via Local REST API"
```

### 3.7 `src/_locales/ja/messages.json`

**Change: Line 6 — extDescription.message**

```
- Before: "Gemini、Claude、ChatGPT の AI 会話を Obsidian へエクスポート（Local REST API 経由）"
+ After:  "Gemini、Claude、ChatGPT、Perplexity の AI 会話を Obsidian へエクスポート（Local REST API 経由）"
```

---

## 4. Verification Plan

### 4.1 lint-platforms Script Verification

1. Run `node scripts/lint-platforms.mjs` **before** updating 7 files → expect errors listing all missing Perplexity references
2. Update all 7 files
3. Run `node scripts/lint-platforms.mjs` **after** updates → expect success
4. Run `npm run lint` → expect both ESLint and platform lint to pass

### 4.2 Documentation Verification

1. Confirm all 7 files contain `perplexity` or `Perplexity` as appropriate
2. Confirm `privacy.html` is valid HTML (no broken tags)
3. Confirm JSON files are valid (`package.json`, both `messages.json`)

---

## 5. Files Modified

| File | Type | Change |
|------|------|--------|
| `scripts/lint-platforms.mjs` | **New** | Platform lint script |
| `package.json` | Modified | Add `lint:platforms` script, update `lint` script, update `description` |
| `docs/privacy.html` | Modified | Add Perplexity to Data Transmission and Permissions |
| `README.md` | Modified | Add Perplexity to description, features, usage, architecture, components |
| `README.ja.md` | Modified | Same as README.md (Japanese) |
| `CLAUDE.md` | Modified | Add Perplexity to overview, architecture, supported platforms |
| `src/_locales/en/messages.json` | Modified | Add Perplexity to extension description |
| `src/_locales/ja/messages.json` | Modified | Add Perplexity to extension description |

**Total: 8 files (1 new, 7 modified)**

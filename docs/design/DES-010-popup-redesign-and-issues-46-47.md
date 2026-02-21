# DES-010: Popup UI Redesign + Issues #46, #47

**Issues**: #46 (vault path template variables), #47 (Gemini title extraction)
**Date**: 2026-02-21
**Status**: Draft

## 1. Overview

3つの変更を1リリースで実施する:

| # | 変更 | Branch | 優先度 |
|---|------|--------|--------|
| A | Issue #47: Gemini タイトル抽出に `document.title` フォールバック追加 | `feature/gemini-title-fallback` | 高（最小スコープ） |
| B | Issue #46: Vault path に `{platform}` テンプレート変数サポート | `feature/vault-path-template` | 高 |
| C | Popup UI リデザイン（トグルスイッチ + Advanced Settings 折りたたみ） | `feature/popup-ui-redesign` | 中 |

---

## 2. Change A: Gemini Title Extraction (Issue #47)

### 2.1 Problem

現在の `GeminiExtractor.getTitle()` は DOM セレクタに依存しているため、DOM 構造の変更に脆い。`document.title` はブラウザが管理する安定した情報源だが、現在は使用されていない。

### 2.2 Current Fallback Chain

```
1. .query-text-line (最初のユーザークエリ)
2. .conversation-title (サイドバー)
3. 'Untitled Gemini Conversation' (ハードコード)
```

### 2.3 New Fallback Chain

```
1. document.title (NEW — サフィックス除去後)
2. .query-text-line (最初のユーザークエリ)
3. .conversation-title (サイドバー)
4. 'Untitled Gemini Conversation' (ハードコード)
```

### 2.4 Implementation

**File**: `src/content/extractors/gemini.ts`

#### 2.4.1 定数追加（SELECTORS と同じスコープ）

```typescript
/**
 * Pattern to strip Gemini-specific suffix from document.title
 * Matches: " - Google Gemini", " | Gemini", " - Gemini", etc.
 */
const GEMINI_TITLE_SUFFIX_PATTERN = /\s*[-|]\s*(?:Google\s+)?Gemini\s*$/i;
```

#### 2.4.2 `getTitle()` (L239-257) 変更

```typescript
getTitle(): string {
  // Priority 1: document.title with Gemini suffix stripped
  const pageTitle = document.title
    ?.replace(GEMINI_TITLE_SUFFIX_PATTERN, '')
    .trim();
  if (pageTitle && pageTitle.toLowerCase() !== 'gemini') {
    return pageTitle.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
  }

  // Priority 2: First user query text (existing, unchanged)
  const firstQueryText = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine);
  if (firstQueryText?.textContent) {
    const title = this.sanitizeText(firstQueryText.textContent);
    return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
  }

  // Priority 3: Sidebar title (existing, unchanged)
  const sidebarTitle = this.queryWithFallback<HTMLElement>(SELECTORS.conversationTitle);
  if (sidebarTitle?.textContent) {
    return this.sanitizeText(sidebarTitle.textContent).substring(
      0,
      MAX_CONVERSATION_TITLE_LENGTH,
    );
  }

  return 'Untitled Gemini Conversation';
}
```

**`GEMINI_TITLE_SUFFIX_PATTERN`**: `/\s*[-|]\s*(?:Google\s+)?Gemini\s*$/i`

| Input | Output |
|-------|--------|
| `"My Chat - Google Gemini"` | `"My Chat"` |
| `"My Chat \| Gemini"` | `"My Chat"` |
| `"Gemini"` | `""` → skip (次のフォールバックへ) |
| `""` | `""` → skip |
| `"My Chat"` (サフィックスなし) | `"My Chat"` |

### 2.5 Test Plan

**File**: `test/extractors/gemini.test.ts` — `getTitle` describe ブロック (L79-118)

追加するテストケース:

| Test | Setup | Expected |
|------|-------|----------|
| `extracts title from document.title with " - Google Gemini" suffix` | `document.title = 'Test Chat - Google Gemini'` | `'Test Chat'` |
| `extracts title from document.title with " \| Gemini" suffix` | `document.title = 'Test Chat \| Gemini'` | `'Test Chat'` |
| `skips document.title when it is just "Gemini"` | `document.title = 'Gemini'`, `.query-text-line` あり | query text が返る |
| `skips empty document.title` | `document.title = ''`, `.query-text-line` あり | query text が返る |
| `document.title takes priority over DOM selectors` | `document.title = 'Page Title - Google Gemini'` + `.query-text-line` | `'Page Title'` |

**注意**: `setGeminiTitle()` ヘルパー (dom-helpers.ts L175) は `document.title` と `.conversation-title` の**両方**を設定する。新テストでは `document.title` を直接設定し、DOM 要素の有無を個別に制御する。

---

## 3. Change B: Vault Path Template Variables (Issue #46)

### 3.1 Problem

デフォルトの vault path `AI/Gemini` は Gemini 固有。マルチプラットフォーム拡張として不適切。ユーザーはプラットフォームごとのフォルダ分類を手動で行う必要がある。

### 3.2 Data Flow Analysis

```
ContentScript                     BackgroundWorker
┌─────────────────────┐          ┌─────────────────────────┐
│ extractor.extract()  │          │ handleMessage()          │
│  → ConversationData  │          │  → getSettings()         │
│    .source = 'gemini' │          │    .vaultPath = 'AI/{platform}' │
│                      │          │                         │
│ conversationToNote() │          │ handleSave(settings, note)│
│  → ObsidianNote      │───msg──→│  note.frontmatter.source │
│    .frontmatter      │          │    = 'gemini'            │
│      .source='gemini'│          │                         │
│                      │          │  resolvePathTemplate()   │
│                      │          │    'AI/{platform}'       │
│                      │          │    → 'AI/gemini'         │
│                      │          │                         │
│                      │          │  fullPath =              │
│                      │          │    'AI/gemini/file.md'   │
└─────────────────────┘          └─────────────────────────┘
```

**Key insight**: `note.frontmatter.source` にはプラットフォーム名が既に格納されている。テンプレート解決は `handleSave()` 内で実行するのが最適。

### 3.3 New Function: `resolvePathTemplate()`

**File**: `src/lib/path-utils.ts` (既存ファイルに追加)

```typescript
/**
 * Resolve template variables in a vault path
 * Supported variables: {platform}
 * Unknown variables are preserved as-is (safe fallback)
 *
 * @example
 * resolvePathTemplate('AI/{platform}', { platform: 'gemini' })
 * // → 'AI/gemini'
 */
export function resolvePathTemplate(
  path: string,
  variables: Record<string, string>,
): string {
  return path.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in variables ? variables[key] : match;
  });
}
```

**Design decisions**:
- 汎用 `Record<string, string>` — 将来の `{date}`, `{type}` 拡張に対応可能
- 未知の `{unknown}` はそのまま保持（エラーにしない）
- 正規表現 `/\{(\w+)\}/g` — `\w+` は `[a-zA-Z0-9_]` に一致

### 3.4 Background Worker Changes

**File**: `src/background/index.ts`

#### 3.4.1 Import 追加

```typescript
import { resolvePathTemplate } from '../lib/path-utils';
```

#### 3.4.2 `handleSave()` (L228)

Before:
```typescript
const fullPath = settings.vaultPath
  ? `${settings.vaultPath}/${note.fileName}`
  : note.fileName;
```

After:
```typescript
const resolvedPath = resolvePathTemplate(settings.vaultPath, {
  platform: note.frontmatter.source,
});
const fullPath = resolvedPath
  ? `${resolvedPath}/${note.fileName}`
  : note.fileName;
```

#### 3.4.3 `handleGetFile()` — 変更不要

`handleGetFile()` は content script から直接 `vaultPath` を渡されるため、テンプレート解決は不要。

### 3.5 Storage Default Change

**File**: `src/lib/storage.ts` (L42)

```typescript
// Before
vaultPath: 'AI/Gemini',

// After
vaultPath: 'AI/{platform}',
```

### 3.6 Popup UI Updates

**File**: `src/popup/index.html`

1. Placeholder 更新 (L72):
```html
<!-- Before -->
placeholder="AI/Gemini"
<!-- After -->
placeholder="AI/{platform}"
```

2. ヒントテキスト追加（Vault Path の `form-group` 内）:
```html
<p class="help" data-i18n="settings_vaultPathHelp">
  Use {platform} to auto-organize by source (gemini, claude, chatgpt, perplexity)
</p>
```

### 3.7 i18n Updates

**`src/_locales/en/messages.json`** — 追加:
```json
"settings_vaultPathHelp": {
  "message": "Use {platform} to auto-organize by source (gemini, claude, chatgpt, perplexity)",
  "description": "Help text explaining template variable for vault path"
},
```

**`src/_locales/ja/messages.json`** — 追加:
```json
"settings_vaultPathHelp": {
  "message": "{platform} でプラットフォームごとにフォルダ分類（gemini, claude, chatgpt, perplexity）"
},
```

`settings_vaultPathPlaceholder` の更新:
```json
// en
"settings_vaultPathPlaceholder": {
  "message": "e.g., AI/{platform}",
  ...
}
// ja
"settings_vaultPathPlaceholder": {
  "message": "例: AI/{platform}"
}
```

### 3.8 Validation — 変更不要

`validateVaultPath()` (`src/lib/validation.ts` L56-71) は `containsPathTraversal()` (`src/lib/path-utils.ts` L12-24) に委譲。`{}` はブロック対象外のため、`{platform}` を含むパスはバリデーションを通過する。

### 3.9 Test Plan

#### `test/lib/path-utils.test.ts` — 新規テスト追加

```typescript
describe('resolvePathTemplate', () => {
  it('resolves {platform} variable', () => {
    expect(resolvePathTemplate('AI/{platform}', { platform: 'gemini' }))
      .toBe('AI/gemini');
  });

  it('resolves multiple variables', () => {
    expect(resolvePathTemplate('{type}/{platform}', {
      platform: 'claude',
      type: 'conversation',
    })).toBe('conversation/claude');
  });

  it('preserves unknown variables', () => {
    expect(resolvePathTemplate('AI/{unknown}', { platform: 'gemini' }))
      .toBe('AI/{unknown}');
  });

  it('returns path unchanged when no variables present', () => {
    expect(resolvePathTemplate('AI/Gemini', { platform: 'gemini' }))
      .toBe('AI/Gemini');
  });

  it('handles empty path', () => {
    expect(resolvePathTemplate('', { platform: 'gemini' }))
      .toBe('');
  });

  it('resolves all four platforms', () => {
    for (const p of ['gemini', 'claude', 'chatgpt', 'perplexity']) {
      expect(resolvePathTemplate('AI/{platform}', { platform: p }))
        .toBe(`AI/${p}`);
    }
  });
});
```

#### `test/background/index.test.ts` — 統合テスト

`handleSave()` で `{platform}` が `note.frontmatter.source` に基づいて解決されることを確認。

---

## 4. Change C: Popup UI Redesign

### 4.1 Overview

| セクション | Before | After |
|-----------|--------|-------|
| OUTPUT DESTINATIONS | チェックボックス + テキスト | 絵文字アイコン + トグルスイッチ |
| EXTRACTION | チェックボックス + テキスト | 絵文字アイコン + トグルスイッチ |
| SETTINGS + MESSAGE FORMAT + FRONTMATTER | 3つの独立セクション（常時表示） | `<details>` で「Advanced Settings」に統合（デフォルト閉じ） |

### 4.2 UI Mockup

#### 4.2.1 Closed State (Default)

```
┌──────────────────────────────────────┐
│ 🔮 Obsidian AI Exporter              │
│ Export AI conversations to Obsidian   │
├──────────────────────────────────────┤
│ OUTPUT DESTINATIONS                   │
│ ┌──────────────────────────────────┐ │
│ │ 📦  Obsidian (API)        [===●]│ │
│ │ 📄  Download File         [●===]│ │
│ │ 📋  Copy to Clipboard     [●===]│ │
│ └──────────────────────────────────┘ │
│                                      │
│ EXTRACTION                           │
│ ┌──────────────────────────────────┐ │
│ │ 🔄  Auto-scroll           [●===]│ │
│ │     Load all messages ...        │ │
│ └──────────────────────────────────┘ │
│                                      │
│ ▶ Advanced Settings                  │
│                                      │
│ [🔌 Test Connection] [💾 Save]       │
│                                      │
└──────────────────────────────────────┘
```

#### 4.2.2 Expanded State

```
│ ▼ Advanced Settings                  │
│ ┌──────────────────────────────────┐ │
│ │ SETTINGS                         │ │
│ │ API Key: [__________] 👁        │ │
│ │   From Obsidian → Settings ...   │ │
│ │ Port: [27123]  Vault: [AI/{...}] │ │
│ │   Use {platform} to auto-org...  │ │
│ │                                  │ │
│ │ MESSAGE FORMAT                   │ │
│ │ Format: [Callout ▼]             │ │
│ │ User: [QUESTION]  Asst: [NOTE]  │ │
│ │                                  │ │
│ │ FRONTMATTER FIELDS              │ │
│ │ ☑ ID    ☑ Title   ☑ Tags        │ │
│ │ ☑ Source ☑ Dates   ☑ Msg Count  │ │
│ └──────────────────────────────────┘ │
```

### 4.3 Toggle Switch Component

**Implementation**: CSS-only のスタイリング + 最小限の JavaScript（ARIA 同期）。既存の `<input type="checkbox">` をカスタムスタイルで覆う。

#### 4.3.1 HTML Structure

```html
<label class="toggle-row">
  <span class="toggle-icon">📦</span>
  <span class="toggle-label" data-i18n="settings_outputObsidian">Obsidian (API)</span>
  <span class="toggle-switch">
    <input type="checkbox" id="outputObsidian" role="switch" aria-checked="true" checked />
    <span class="slider" aria-hidden="true"></span>
  </span>
</label>
```

**Key decisions**:
- `<label>` でラップ → クリック領域がテキストまで拡大
- `<input>` の `id` は変更なし → `popup/index.ts` の `elements` オブジェクト変更不要

#### 4.3.2 Accessibility (W3C APG Switch Pattern)

視覚的にトグルスイッチとして表示するため、スクリーンリーダーに正しいセマンティクスを伝える必要がある（[W3C APG Switch Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/) 準拠）:

- **`role="switch"`**: checkbox ではなくスイッチとして認識させる
- **`aria-checked`**: 状態をスクリーンリーダーに伝達（`checked` 属性と同期が必要）
- **`aria-hidden="true"`** on `.slider`: 装飾要素をアクセシビリティツリーから除外

**JavaScript での `aria-checked` 同期** (`src/popup/index.ts`):

```typescript
/**
 * Sync aria-checked attribute for toggle switches with role="switch"
 */
function setupToggleSwitchAccessibility(): void {
  document.querySelectorAll<HTMLInputElement>('input[role="switch"]').forEach(input => {
    // Set initial state
    input.setAttribute('aria-checked', String(input.checked));
    // Sync on change
    input.addEventListener('change', () => {
      input.setAttribute('aria-checked', String(input.checked));
    });
  });
}
```

`initialize()` 内で `setupEventListeners()` の後に呼び出す。

#### 4.3.2 CSS Design

```css
/* Toggle row layout */
.toggle-row {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s;
  gap: 12px;
}

.toggle-row:hover {
  background: var(--bg-tertiary);
}

.toggle-icon {
  font-size: 18px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border-radius: 6px;
  flex-shrink: 0;
}

.toggle-label {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.toggle-sublabel {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 400;
  margin-top: 2px;
}

/* Toggle switch track */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-switch .slider {
  position: absolute;
  inset: 0;
  background: var(--bg-tertiary);
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.toggle-switch .slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-switch input:checked + .slider {
  background: var(--accent-primary);
}

.toggle-switch input:checked + .slider::before {
  transform: translateX(20px);
}

.toggle-switch input:focus-visible + .slider {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.3);
}
```

**Theme support**: `var(--bg-tertiary)` (OFF) / `var(--accent-primary)` (ON) — ダーク/ライト両対応。

**Accessibility notes**:
- `outline` + `box-shadow` の併用: High Contrast Mode では `box-shadow` が非表示になるため、`outline` を追加してフォーカス表示を保証
- OFF 状態のコントラスト比: 実装後に `var(--bg-tertiary)` と背景色のコントラスト比が 3:1 以上であることを検証する（WCAG 2.1 Level AA, 1.4.11 Non-text Contrast）

### 4.4 Advanced Settings Collapsible

**Implementation**: HTML native `<details>/<summary>`（JavaScript 不要）。

#### 4.4.1 HTML Structure

```html
<details class="advanced-settings">
  <summary>
    <span class="advanced-arrow">▶</span>
    <span data-i18n="settings_advancedSettings">Advanced Settings</span>
  </summary>
  <div class="advanced-content">
    <!-- obsidianSettings section -->
    <!-- messageFormat section -->
    <!-- frontmatter section -->
  </div>
</details>
```

#### 4.4.2 CSS Design

```css
.advanced-settings {
  margin-bottom: 20px;
}

.advanced-settings summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  list-style: none;
  border-bottom: 1px solid var(--border);
}

.advanced-settings summary::-webkit-details-marker {
  display: none;
}

.advanced-arrow {
  font-size: 10px;
  transition: transform 0.2s;
  display: inline-block;
}

.advanced-settings[open] .advanced-arrow {
  transform: rotate(90deg);
}

.advanced-content {
  padding-top: 16px;
}
```

**Default state**: 閉じた状態（`<details>` は `open` 属性なし）。

### 4.5 Full HTML Structure (After)

```html
<main class="settings">
  <!-- OUTPUT DESTINATIONS -->
  <section class="section">
    <h2 data-i18n="settings_outputDestinations">Output Destinations</h2>
    <div class="toggle-list">
      <label class="toggle-row">
        <span class="toggle-icon">📦</span>
        <span class="toggle-label" data-i18n="settings_outputObsidian">Obsidian (API)</span>
        <span class="toggle-switch">
          <input type="checkbox" id="outputObsidian" role="switch" aria-checked="true" checked />
          <span class="slider" aria-hidden="true"></span>
        </span>
      </label>
      <label class="toggle-row">
        <span class="toggle-icon">📄</span>
        <span class="toggle-label" data-i18n="settings_outputFile">Download File</span>
        <span class="toggle-switch">
          <input type="checkbox" id="outputFile" role="switch" aria-checked="false" />
          <span class="slider" aria-hidden="true"></span>
        </span>
      </label>
      <label class="toggle-row">
        <span class="toggle-icon">📋</span>
        <span class="toggle-label" data-i18n="settings_outputClipboard">Copy to Clipboard</span>
        <span class="toggle-switch">
          <input type="checkbox" id="outputClipboard" role="switch" aria-checked="false" />
          <span class="slider" aria-hidden="true"></span>
        </span>
      </label>
    </div>
  </section>

  <!-- EXTRACTION -->
  <section class="section">
    <h2 data-i18n="settings_extraction">Extraction</h2>
    <div class="toggle-list">
      <label class="toggle-row">
        <span class="toggle-icon">🔄</span>
        <span class="toggle-label">
          <span data-i18n="settings_enableAutoScroll">Auto-scroll</span>
          <span class="toggle-sublabel" data-i18n="settings_autoScrollHelp">
            Load all messages in long conversations
          </span>
        </span>
        <span class="toggle-switch">
          <input type="checkbox" id="enableAutoScroll" role="switch" aria-checked="false" />
          <span class="slider" aria-hidden="true"></span>
        </span>
      </label>
    </div>
  </section>

  <!-- ADVANCED SETTINGS (collapsible) -->
  <details class="advanced-settings">
    <summary>
      <span class="advanced-arrow">▶</span>
      <span data-i18n="settings_advancedSettings">Advanced Settings</span>
    </summary>
    <div class="advanced-content">
      <!-- Obsidian API Settings -->
      <section class="section" id="obsidianSettings">
        <h2 data-i18n="settings_title">Settings</h2>
        <!-- ... existing form fields unchanged ... -->
      </section>

      <!-- Message Format -->
      <section class="section">
        <h2 data-i18n="settings_messageFormat">Message Format</h2>
        <!-- ... existing form fields unchanged ... -->
      </section>

      <!-- Frontmatter -->
      <section class="section">
        <h2 data-i18n="settings_frontmatter">Frontmatter Fields</h2>
        <!-- ... existing checkbox grid unchanged ... -->
      </section>
    </div>
  </details>
</main>
```

### 4.6 TypeScript Impact

**`src/popup/index.ts`** — 変更最小限:

- `elements` オブジェクト: checkbox `id` は全て維持 → **変更不要**
- `updateObsidianSettingsVisibility()`: `obsidianSettings` section の `disabled` トグルは引き続き動作
- イベントリスナー: 既存の `change` イベントはトグルスイッチでも動作（`<input type="checkbox">` は同じ）
- `<details>` の展開/折りたたみ: native 動作のため JS 不要
- **追加**: `setupToggleSwitchAccessibility()` — `role="switch"` を持つ全 checkbox の `aria-checked` を `change` イベントで同期（§4.3.2 参照）
- **追加**: `populateForm()` 内で `aria-checked` の初期値同期（設定読み込み時に `checked` 属性が変わるため）

### 4.7 CSS Cleanup

削除する CSS:
- `.output-destinations-grid` (L398-406) → `.toggle-list` に置き換え
- `.output-destinations-grid .checkbox-label` (L404-406) → 不要

残す CSS:
- `.checkbox-grid` — FRONTMATTER FIELDS で引き続き使用
- `.checkbox-label` — FRONTMATTER FIELDS で引き続き使用

### 4.8 i18n Updates

**`src/_locales/en/messages.json`** — 追加:
```json
"settings_advancedSettings": {
  "message": "Advanced Settings",
  "description": "Collapsible section title for advanced settings"
},
"settings_extraction": {
  "message": "Extraction",
  "description": "Section title for extraction settings"
},
"settings_enableAutoScroll": {
  "message": "Auto-scroll",
  "description": "Toggle label for auto-scroll feature"
},
"settings_autoScrollHelp": {
  "message": "Load all messages in long conversations",
  "description": "Help text for auto-scroll toggle"
}
```

**`src/_locales/ja/messages.json`** — 追加:
```json
"settings_advancedSettings": {
  "message": "詳細設定"
},
"settings_extraction": {
  "message": "抽出"
},
"settings_enableAutoScroll": {
  "message": "自動スクロール"
},
"settings_autoScrollHelp": {
  "message": "長い会話ですべてのメッセージを読み込む"
}
```

---

## 5. File Impact Summary

| File | Change A | Change B | Change C |
|------|:--------:|:--------:|:--------:|
| `src/content/extractors/gemini.ts` | **modify** | | |
| `src/lib/path-utils.ts` | | **modify** | |
| `src/lib/storage.ts` | | **modify** | |
| `src/background/index.ts` | | **modify** | |
| `src/popup/index.html` | | **modify** | **modify** |
| `src/popup/styles.css` | | | **modify** |
| `src/popup/index.ts` | | | **modify** (ARIA sync) |
| `src/_locales/en/messages.json` | | **modify** | **modify** |
| `src/_locales/ja/messages.json` | | **modify** | **modify** |
| `test/extractors/gemini.test.ts` | **modify** | | |
| `test/lib/path-utils.test.ts` | | **modify** | |
| `test/background/index.test.ts` | | **modify** | |

---

## 6. Verification

### 6.1 Automated

```bash
npm run build        # TypeScript + Vite build passes
npm run lint         # ESLint: 0 errors, 0 warnings
npm run format       # Prettier: all clean
npx vitest run       # All tests pass
npx vitest --coverage  # Coverage thresholds met (85/75/85/85)
```

### 6.2 Manual (Chrome Extension)

1. `npm run dev` → `chrome://extensions` で dist/ を読み込み
2. Popup を開く:
   - OUTPUT DESTINATIONS がトグルスイッチで表示されること
   - EXTRACTION の Auto-scroll がトグルスイッチで表示されること
   - Advanced Settings が閉じた状態であること
   - Advanced Settings をクリックして展開 → 既存の設定が表示されること
   - Vault Path のプレースホルダーが `AI/{platform}` であること
   - ダークモードでも正常表示されること
3. Gemini で会話を保存:
   - タイトルが `document.title` から取得されること
   - Vault path が `AI/gemini/` に解決されること
4. Claude で会話を保存:
   - Vault path が `AI/claude/` に解決されること

### 6.3 Accessibility Verification

1. **ARIA 属性**: DevTools で `role="switch"` と `aria-checked` がトグル操作で同期されること
2. **スクリーンリーダー**: トグルスイッチが「switch」として読み上げられ、ON/OFF 状態が伝達されること
3. **キーボード操作**: Tab でフォーカス移動 → Space で切り替え → `outline` が表示されること
4. **コントラスト比**: OFF 状態のトグルトラック (`var(--bg-tertiary)`) と背景色 (`var(--bg-secondary)`) のコントラスト比が 3:1 以上（WCAG 2.1 Level AA, 1.4.11）
5. **High Contrast Mode**: Windows High Contrast Mode でフォーカスリング（`outline`）が表示されること

---

## 7. Implementation Order

```
Change A (Issue #47) → Change B (Issue #46) → Change C (UI Redesign)
```

Change A は独立・最小スコープのため最初に実装。Change B は popup の placeholder 変更を含むが、Change C の大規模な HTML 変更前に入れることで merge conflict を回避。Change C は最後に実施し、B の UI ヒントテキストも含める。

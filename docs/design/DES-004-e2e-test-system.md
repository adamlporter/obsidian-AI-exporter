# DES-004: E2Eテストシステム設計仕様書

## 1. 概要

### 1.1 目的

HTML→Markdown変換パイプラインの**回帰テスト**を実現するフィクスチャベースE2Eテストシステムの設計。

### 1.2 スコープ

| 項目 | 内容 |
|------|------|
| テスト対象 | DOM抽出 → Markdown変換パイプライン |
| プラットフォーム | Gemini, Claude, ChatGPT |
| シナリオ数 | 6（各プラットフォーム: chat + deep-research相当） |
| アプローチ | **ハイブリッド（構造的アサーション + スナップショット）** |

### 1.3 参考資料

- [Vitest Snapshot Testing](https://vitest.dev/guide/snapshot) - 公式ドキュメント
- [jsdom GitHub](https://github.com/jsdom/jsdom) - DOM実装仕様

### 1.4 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2025-01-28 | 1.0 | 初版作成 |
| 2025-01-28 | 1.1 | レビュー対応: Chrome API依存分離、Type Guard強化、CI/CD追加 |
| 2025-01-28 | 1.2 | 現行実装との整合性修正: typeフィールド出力を削除（現行動作維持） |

## 2. アーキテクチャ

### 2.1 システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                     E2E Test System                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │   HTML Fixture   │    │  Location Mock   │                  │
│  │  (Real HTML)     │    │ (window.location)│                  │
│  └────────┬─────────┘    └────────┬─────────┘                  │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       ▼                                         │
│           ┌──────────────────────┐                              │
│           │    jsdom Document    │                              │
│           │   (document.body)    │                              │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │     Extractor        │                              │
│           │ (Gemini/Claude/GPT)  │                              │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │  ConversationData    │  ← 構造的アサーション        │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │ conversationToNote() │                              │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │   ObsidianNote       │  ← 構造的アサーション        │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │ generateNoteContent()│  ← src/lib/note-generator.ts │
│           └──────────┬───────────┘                              │
│                      ▼                                          │
│           ┌──────────────────────┐                              │
│           │   Final Markdown     │  ← スナップショット          │
│           └──────────────────────┘                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 ディレクトリ構造

```
src/
└── lib/
    └── note-generator.ts             # [NEW] generateNoteContent分離

test/
├── fixtures/
│   ├── html/                          # [NEW] 実HTMLフィクスチャ
│   │   ├── README.md                  # フィクスチャ管理ガイド
│   │   ├── gemini/
│   │   │   ├── chat-simple.html       # 通常チャット
│   │   │   └── deep-research.html     # Deep Research
│   │   ├── claude/
│   │   │   ├── chat-simple.html       # 通常チャット
│   │   │   └── artifacts.html         # Artifacts
│   │   └── chatgpt/
│   │       ├── chat-simple.html       # 通常チャット
│   │       └── chat-code.html         # コードブロック付き
│   └── dom-helpers.ts                 # [EXISTING] 既存ヘルパー維持
├── extractors/
│   ├── e2e/                           # [NEW] E2Eテストディレクトリ
│   │   ├── helpers.ts                 # E2Eテストヘルパー
│   │   ├── gemini.e2e.test.ts
│   │   ├── claude.e2e.test.ts
│   │   └── chatgpt.e2e.test.ts
│   └── *.test.ts                      # [EXISTING] 既存ユニットテスト維持
└── __snapshots__/                     # [AUTO] Vitest自動生成
    └── extractors/
        └── e2e/
            ├── gemini.e2e.test.ts.snap
            ├── claude.e2e.test.ts.snap
            └── chatgpt.e2e.test.ts.snap
```

## 3. 詳細設計

### 3.1 依存関係の解決（Critical）

#### 3.1.1 問題: Chrome API依存

`src/background/index.ts`はトップレベルで以下を実行している:

```typescript
// Line 25-29
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});
```

`migrateSettings()`は`chrome.storage`を使用するため、このファイルをimportするとテスト環境でChrome APIエラーが発生する。

#### 3.1.2 解決策: 関数の分離

`generateNoteContent`を新規ファイルに抽出する。

**新規ファイル**: `src/lib/note-generator.ts`

```typescript
/**
 * Note Content Generator
 *
 * Generates final markdown content with frontmatter from ObsidianNote.
 * Separated from background/index.ts to avoid Chrome API dependency in tests.
 */

import { escapeYamlValue, escapeYamlListItem } from './yaml-utils';
import type { ObsidianNote, ExtensionSettings } from './types';

/**
 * Generate full note content with frontmatter and body
 * Uses YAML escaping to prevent injection attacks (NEW-04)
 */
export function generateNoteContent(
  note: ObsidianNote,
  settings: ExtensionSettings
): string {
  const { templateOptions } = settings;
  const lines: string[] = [];

  // Generate YAML frontmatter
  lines.push('---');

  if (templateOptions.includeId) {
    lines.push(`id: ${escapeYamlValue(note.frontmatter.id)}`);
  }

  if (templateOptions.includeTitle) {
    lines.push(`title: ${escapeYamlValue(note.frontmatter.title)}`);
  }

  if (templateOptions.includeSource) {
    lines.push(`source: ${escapeYamlValue(note.frontmatter.source)}`);
    lines.push(`url: ${escapeYamlValue(note.frontmatter.url)}`);
  }

  if (templateOptions.includeDates) {
    lines.push(`created: ${escapeYamlValue(note.frontmatter.created)}`);
    lines.push(`modified: ${escapeYamlValue(note.frontmatter.modified)}`);
  }

  if (templateOptions.includeTags && note.frontmatter.tags.length > 0) {
    lines.push('tags:');
    for (const tag of note.frontmatter.tags) {
      lines.push(`  - ${escapeYamlListItem(tag)}`);
    }
  }

  if (templateOptions.includeMessageCount) {
    lines.push(`message_count: ${note.frontmatter.message_count}`);
  }

  lines.push('---');
  lines.push('');

  // Add body
  lines.push(note.body);

  return lines.join('\n');
}
```

**変更対象**: `src/background/index.ts`

```typescript
// Line 8: 追加
import { generateNoteContent } from '../lib/note-generator';

// Line 321-364: 関数定義を削除（note-generator.tsに移動済み）
```

### 3.2 ヘルパーモジュール設計

**ファイル**: `test/extractors/e2e/helpers.ts`

#### 3.2.1 型定義（Type Guard強化版）

```typescript
import type {
  ConversationData,
  ObsidianNote,
  ExtensionSettings,
  NoteFrontmatter,
} from '../../../src/lib/types';

/**
 * E2Eパイプライン実行結果
 */
export interface E2EPipelineResult {
  /** 抽出成功フラグ */
  success: boolean;
  /** 抽出データ（成功時のみ） */
  conversationData: ConversationData | null;
  /** 変換後ノート（成功時のみ） */
  obsidianNote: ObsidianNote | null;
  /** 最終Markdown出力（成功時のみ） */
  finalMarkdown: string | null;
  /** エラーメッセージ（失敗時のみ） */
  error?: string;
}

/**
 * 成功時のE2EPipelineResult（Type Guard用）
 */
export interface E2EPipelineSuccessResult extends E2EPipelineResult {
  success: true;
  conversationData: ConversationData;
  obsidianNote: ObsidianNote;
  finalMarkdown: string;
}

/**
 * メッセージ構造検証オプション
 */
export interface MessageStructureOptions {
  /** 最小メッセージ数 */
  minCount: number;
  /** ユーザーメッセージ必須 (default: true) */
  requireUser?: boolean;
  /** アシスタントメッセージ必須 (default: true) */
  requireAssistant?: boolean;
}

/**
 * Frontmatter検証オプション
 */
export interface FrontmatterValidationOptions {
  /** Deep Research形式かどうか */
  isDeepResearch?: boolean;
}
```

#### 3.2.2 定数定義

```typescript
/**
 * スナップショット安定化用の固定日時
 */
export const FIXED_DATE = '2025-01-01T00:00:00.000Z';

/**
 * E2Eテスト用デフォルト設定
 */
export const DEFAULT_E2E_SETTINGS: ExtensionSettings = {
  obsidianApiKey: 'test-api-key',
  obsidianPort: 27123,
  vaultPath: 'AI Conversations',
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
  },
  outputOptions: {
    obsidian: true,
    file: false,
    clipboard: false,
  },
};
```

#### 3.2.3 フィクスチャパス解決（ESM対応）

```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ESM環境での__dirname取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * フィクスチャベースディレクトリ
 */
const FIXTURE_BASE_PATH = resolve(__dirname, '../../fixtures/html');
```

#### 3.2.4 フィクスチャ読み込み関数

```typescript
import { loadFixture } from '../../fixtures/dom-helpers';

/**
 * HTMLフィクスチャファイルを読み込みDOMにロード
 *
 * @param platform - 'gemini' | 'claude' | 'chatgpt'
 * @param fixtureName - ファイル名（拡張子なし）
 * @returns 読み込んだHTML文字列
 * @throws Error フィクスチャファイルが存在しない場合
 */
export function loadFixtureFile(
  platform: 'gemini' | 'claude' | 'chatgpt',
  fixtureName: string
): string {
  const fixturePath = resolve(FIXTURE_BASE_PATH, platform, `${fixtureName}.html`);

  let html: string;
  try {
    html = readFileSync(fixturePath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Fixture not found: ${fixturePath}\n` +
        `Please capture HTML from ${platform} and save to this path.\n` +
        `See test/fixtures/html/README.md for instructions.`
    );
  }

  loadFixture(html);
  return html;
}
```

#### 3.2.5 ロケーション設定関数

```typescript
import {
  setGeminiLocation,
  setClaudeLocation,
  setChatGPTLocation,
} from '../../fixtures/dom-helpers';

/**
 * プラットフォームに応じたwindow.locationを設定
 */
export function setLocationForPlatform(
  platform: 'gemini' | 'claude' | 'chatgpt',
  conversationId: string
): void {
  switch (platform) {
    case 'gemini':
      setGeminiLocation(conversationId);
      break;
    case 'claude':
      setClaudeLocation(conversationId);
      break;
    case 'chatgpt':
      setChatGPTLocation(conversationId);
      break;
  }
}
```

#### 3.2.6 フルパイプライン実行関数

```typescript
import { GeminiExtractor } from '../../../src/content/extractors/gemini';
import { ClaudeExtractor } from '../../../src/content/extractors/claude';
import { ChatGPTExtractor } from '../../../src/content/extractors/chatgpt';
import { conversationToNote } from '../../../src/content/markdown';
import { generateNoteContent } from '../../../src/lib/note-generator';

/**
 * E2Eパイプライン完全実行
 *
 * 処理フロー:
 * 1. HTMLフィクスチャ読み込み → jsdom
 * 2. window.location設定
 * 3. Extractor実行
 * 4. 日時正規化（スナップショット安定化）
 * 5. conversationToNote変換
 * 6. generateNoteContent最終出力
 */
export async function runE2EPipeline(
  platform: 'gemini' | 'claude' | 'chatgpt',
  fixtureName: string,
  conversationId: string,
  settings: ExtensionSettings = DEFAULT_E2E_SETTINGS
): Promise<E2EPipelineResult> {
  // Step 1-2: フィクスチャ読み込みとロケーション設定
  loadFixtureFile(platform, fixtureName);
  setLocationForPlatform(platform, conversationId);

  // Step 3: Extractor生成・実行
  const extractor = createExtractor(platform);
  const extractionResult = await extractor.extract();

  if (!extractionResult.success || !extractionResult.data) {
    return {
      success: false,
      conversationData: null,
      obsidianNote: null,
      finalMarkdown: null,
      error: extractionResult.error ?? 'Extraction failed',
    };
  }

  // Step 4: 日時正規化（スナップショット安定化）
  extractionResult.data.extractedAt = new Date(FIXED_DATE);

  // Step 5: ObsidianNote変換
  const obsidianNote = conversationToNote(
    extractionResult.data,
    settings.templateOptions
  );

  // Step 5.5: frontmatter日時も正規化
  obsidianNote.frontmatter.created = FIXED_DATE;
  obsidianNote.frontmatter.modified = FIXED_DATE;

  // Step 6: 最終Markdown生成
  const finalMarkdown = generateNoteContent(obsidianNote, settings);

  return {
    success: true,
    conversationData: extractionResult.data,
    obsidianNote,
    finalMarkdown,
  };
}

/**
 * プラットフォームに応じたExtractor生成
 */
function createExtractor(platform: 'gemini' | 'claude' | 'chatgpt') {
  switch (platform) {
    case 'gemini':
      return new GeminiExtractor();
    case 'claude':
      return new ClaudeExtractor();
    case 'chatgpt':
      return new ChatGPTExtractor();
  }
}
```

#### 3.2.7 構造的アサーション関数（Type Guard版）

```typescript
/**
 * 抽出成功を検証（Type Guard）
 *
 * 成功時、resultの型がE2EPipelineSuccessResultに絞り込まれる
 */
export function assertExtractionSuccess(
  result: E2EPipelineResult
): asserts result is E2EPipelineSuccessResult {
  if (!result.success) {
    throw new Error(`Extraction failed: ${result.error}`);
  }
  if (!result.conversationData) {
    throw new Error('ConversationData is null despite success=true');
  }
  if (!result.obsidianNote) {
    throw new Error('ObsidianNote is null despite success=true');
  }
  if (!result.finalMarkdown) {
    throw new Error('Final markdown is null despite success=true');
  }
}

/**
 * ソースプラットフォームを検証
 */
export function assertSourcePlatform(
  data: ConversationData,
  expected: 'gemini' | 'claude' | 'chatgpt'
): void {
  if (data.source !== expected) {
    throw new Error(
      `Source mismatch: expected '${expected}', got '${data.source}'`
    );
  }
}

/**
 * メッセージ構造を検証
 */
export function assertMessageStructure(
  data: ConversationData,
  options: MessageStructureOptions
): void {
  const { minCount, requireUser = true, requireAssistant = true } = options;

  if (data.messages.length < minCount) {
    throw new Error(
      `Insufficient messages: expected >= ${minCount}, got ${data.messages.length}`
    );
  }

  if (requireUser) {
    const hasUser = data.messages.some((m) => m.role === 'user');
    if (!hasUser) {
      throw new Error('No user messages found in conversation');
    }
  }

  if (requireAssistant) {
    const hasAssistant = data.messages.some((m) => m.role === 'assistant');
    if (!hasAssistant) {
      throw new Error('No assistant messages found in conversation');
    }
  }
}

/**
 * Frontmatter必須フィールドを検証
 */
export function assertFrontmatterFields(
  note: ObsidianNote,
  options: FrontmatterValidationOptions = {}
): void {
  const { isDeepResearch = false } = options;

  const required: (keyof NoteFrontmatter)[] = [
    'id',
    'title',
    'source',
    'url',
    'created',
    'modified',
  ];

  for (const field of required) {
    if (!note.frontmatter[field]) {
      throw new Error(`Missing required frontmatter field: ${field}`);
    }
  }

  // Deep Research時はtypeフィールドも必須
  if (isDeepResearch && !note.frontmatter.type) {
    throw new Error(
      'Missing required frontmatter field for deep-research: type'
    );
  }

  if (!note.frontmatter.tags || note.frontmatter.tags.length === 0) {
    throw new Error('Frontmatter tags array is empty');
  }
}

/**
 * Callout形式を検証
 */
export function assertCalloutFormat(
  markdown: string,
  _platform: 'gemini' | 'claude' | 'chatgpt'
): void {
  if (!markdown.includes('> [!QUESTION]')) {
    throw new Error('User callout (> [!QUESTION]) not found in output');
  }

  if (!markdown.includes('> [!NOTE]')) {
    throw new Error('Assistant callout (> [!NOTE]) not found in output');
  }
}

/**
 * Deep Research形式を検証
 */
export function assertDeepResearchFormat(
  data: ConversationData,
  markdown: string
): void {
  if (data.type !== 'deep-research') {
    throw new Error(
      `Expected type 'deep-research', got '${data.type ?? 'undefined'}'`
    );
  }

  // ソースが存在する場合はReferencesセクション必須
  if (data.links?.sources && data.links.sources.length > 0) {
    if (!markdown.includes('# References')) {
      throw new Error(
        'Deep Research with sources missing "# References" section'
      );
    }

    if (!markdown.match(/\[\^1\]:/)) {
      throw new Error('Footnote definition format [^1]: not found');
    }
  }
}
```

### 3.3 テストケース設計

#### 3.3.1 Gemini E2Eテスト

**ファイル**: `test/extractors/e2e/gemini.e2e.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runE2EPipeline,
  assertExtractionSuccess,
  assertSourcePlatform,
  assertMessageStructure,
  assertFrontmatterFields,
  assertCalloutFormat,
  assertDeepResearchFormat,
} from './helpers';
import { clearFixture, resetLocation } from '../../fixtures/dom-helpers';

describe('Gemini E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-gemini-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);

      // Type Guard: result は E2EPipelineSuccessResult に絞り込まれる
      assertExtractionSuccess(result);

      // Non-null assertionなしで使用可能
      assertSourcePlatform(result.conversationData, 'gemini');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'gemini');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });

    it('should have correct message count in metadata', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.obsidianNote.frontmatter.message_count).toBe(
        result.conversationData.messages.length
      );
    });
  });

  describe('Deep Research Report', () => {
    const FIXTURE = 'deep-research';
    const CONVERSATION_ID = 'e2e-gemini-dr-001';

    it('should extract Deep Research with valid structure', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'gemini');
      assertFrontmatterFields(result.obsidianNote, { isDeepResearch: true });
      assertDeepResearchFormat(result.conversationData, result.finalMarkdown);
    });

    it('should generate Deep Research markdown with footnotes', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });

    it('should include all sources in References section', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toContain('# References');

      const sourceCount = result.conversationData.links?.sources.length ?? 0;
      if (sourceCount > 0) {
        const footnoteMatches = result.finalMarkdown.match(/\[\^\d+\]:/g);
        expect(footnoteMatches?.length).toBe(sourceCount);
      }
    });
  });
});
```

#### 3.3.2 Claude E2Eテスト

**ファイル**: `test/extractors/e2e/claude.e2e.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runE2EPipeline,
  assertExtractionSuccess,
  assertSourcePlatform,
  assertMessageStructure,
  assertFrontmatterFields,
  assertCalloutFormat,
  assertDeepResearchFormat,
} from './helpers';
import { clearFixture, resetLocation } from '../../fixtures/dom-helpers';

describe('Claude E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-claude-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'claude');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'claude');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });

  describe('Artifacts / Deep Research', () => {
    const FIXTURE = 'artifacts';
    const CONVERSATION_ID = 'e2e-claude-artifacts-001';

    it('should extract Artifacts with valid structure', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertFrontmatterFields(result.obsidianNote, { isDeepResearch: true });
      assertDeepResearchFormat(result.conversationData, result.finalMarkdown);
    });

    it('should generate Artifacts markdown with citations', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });
});
```

#### 3.3.3 ChatGPT E2Eテスト

**ファイル**: `test/extractors/e2e/chatgpt.e2e.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runE2EPipeline,
  assertExtractionSuccess,
  assertSourcePlatform,
  assertMessageStructure,
  assertFrontmatterFields,
  assertCalloutFormat,
} from './helpers';
import { clearFixture, resetLocation } from '../../fixtures/dom-helpers';

describe('ChatGPT E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-chatgpt-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'chatgpt');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'chatgpt');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });

  describe('Chat with Code Blocks', () => {
    const FIXTURE = 'chat-code';
    const CONVERSATION_ID = 'e2e-chatgpt-code-001';

    it('should preserve code block formatting', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatch(/```\w*\n[\s\S]*?\n```/);
    });

    it('should generate markdown with code blocks', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });
});
```

### 3.4 HTMLフィクスチャ仕様

#### 3.4.1 フィクスチャ管理ドキュメント

**ファイル**: `test/fixtures/html/README.md`

```markdown
# HTMLフィクスチャ管理ガイド

## 概要

このディレクトリには、E2Eテスト用の実HTMLフィクスチャを格納します。
各フィクスチャは対応するAIプラットフォームから手動で取得します。

## フィクスチャ一覧

| プラットフォーム | ファイル | 説明 |
|-----------------|---------|------|
| Gemini | `gemini/chat-simple.html` | 基本的なQ&A会話 |
| Gemini | `gemini/deep-research.html` | Deep Researchレポート（引用付き） |
| Claude | `claude/chat-simple.html` | 基本的な会話 |
| Claude | `claude/artifacts.html` | Artifacts/Deep Research |
| ChatGPT | `chatgpt/chat-simple.html` | 基本的な会話 |
| ChatGPT | `chatgpt/chat-code.html` | コードブロック付き会話 |

## フィクスチャ取得手順

### 1. 対象プラットフォームにアクセス

対応するAIサービスにログインし、テスト用の会話を作成または選択します。

### 2. DevToolsでHTML取得

1. `F12` または `Cmd+Option+I` でDevToolsを開く
2. Elements タブを選択
3. 会話コンテナ要素を選択
   - **Gemini**: `.conversation-thread` または `deep-research-immersive-panel`
   - **Claude**: `.conversation-thread` または `#markdown-artifact`
   - **ChatGPT**: `article[data-testid^="conversation-turn"]` の親要素
4. 右クリック → Copy → Copy outerHTML

### 3. ファイル保存

取得したHTMLを以下のテンプレートで保存:

\```html
<!--
  Fixture: {platform}/{name}.html
  Captured: YYYY-MM-DD
  URL Pattern: https://{domain}/...

  Description: {何をテストするか}
  Messages: {N} user, {M} assistant

  Update Trigger: セレクタ変更またはDOM構造変更時
-->

{取得したHTML}
\```

### 4. プライバシー配慮

- 個人情報や機密情報を含む会話は使用しない
- 必要に応じてテスト用の会話内容に置き換え
- URLやID等の識別子は汎用的な値に変更可

## フィクスチャ更新フロー

\```
CI テスト失敗
    ↓
エラー内容確認
    ↓
┌─────────────────────────┐
│ スナップショット差分?    │
│    ↓                    │
│ 意図的変更? → vitest -u │
│    ↓                    │
│ 非意図的 → 調査必要     │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ 構造的アサーション失敗?  │
│    ↓                    │
│ セレクタ変更の可能性     │
│    ↓                    │
│ HTMLを再取得して検証     │
└─────────────────────────┘
\```

## サイズ制限

- 推奨: 500KB以下/ファイル
- 上限: 1MB/ファイル
- 不要な属性やスタイルは削除可能
```

## 4. スナップショット戦略

### 4.1 Vitest設定

E2Eテスト用にタイムアウトを延長する。

**更新対象**: `vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    // E2Eテスト用にタイムアウト延長
    testTimeout: 30000,
    // 省略...
  },
});
```

### 4.2 スナップショット安定化

日時による不安定性を完全に排除:

```typescript
// helpers.ts内の実装
const FIXED_DATE = '2025-01-01T00:00:00.000Z';

// Step 4: 日時正規化（スナップショット安定化）
extractionResult.data.extractedAt = new Date(FIXED_DATE);

// Step 5.5: frontmatter日時も正規化
obsidianNote.frontmatter.created = FIXED_DATE;
obsidianNote.frontmatter.modified = FIXED_DATE;
```

### 4.3 スナップショット更新コマンド

```bash
# 全スナップショット更新
npx vitest run test/extractors/e2e/ -u

# 特定テスト更新
npx vitest run test/extractors/e2e/gemini.e2e.test.ts -u
```

## 5. CI/CD統合

### 5.1 フィクスチャのバージョン管理

フィクスチャはGitにコミットする（バイナリではないため問題なし）。

**.gitattributes** に追加:

```
test/fixtures/html/**/*.html text
```

### 5.2 GitHub Actions設定例

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run E2E Tests
        run: npm test -- --run test/extractors/e2e/

      - name: Upload snapshots on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: snapshots
          path: test/__snapshots__/
```

### 5.3 フィクスチャ欠落時の動作

フィクスチャが存在しない場合、テストは明確なエラーメッセージで失敗する:

```
Error: Fixture not found: /path/to/test/fixtures/html/gemini/chat-simple.html
Please capture HTML from gemini and save to this path.
See test/fixtures/html/README.md for instructions.
```

## 6. 期待出力形式

### 6.1 通常会話

```markdown
---
id: gemini_e2e-gemini-chat-001
title: 'Test Conversation Title'
source: gemini
url: https://gemini.google.com/app/e2e-gemini-chat-001
created: 2025-01-01T00:00:00.000Z
modified: 2025-01-01T00:00:00.000Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> ユーザーの質問内容

> [!NOTE] Gemini
> アシスタントの回答内容
```

### 6.2 Deep Research

```markdown
---
id: gemini_deep-research-xxx
title: 'Research Report Title'
source: gemini
url: https://gemini.google.com/app/xxx
created: 2025-01-01T00:00:00.000Z
modified: 2025-01-01T00:00:00.000Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# Report Title

Introduction paragraph with citation[^1].

## Section 1

Content with multiple citations[^2][^3].

# References

[^1]: [Source Title 1](https://example.com/1)
[^2]: [Source Title 2](https://example.com/2)
[^3]: [Source Title 3](https://example.com/3)
```

## 7. 実装チェックリスト

### Phase 1: インフラ整備

- [ ] `src/lib/note-generator.ts` 作成（generateNoteContent分離）
- [ ] `src/background/index.ts` からgenerateNoteContentを削除・import追加
- [ ] `test/fixtures/html/` ディレクトリ作成
- [ ] `test/fixtures/html/README.md` 作成
- [ ] `test/extractors/e2e/` ディレクトリ作成
- [ ] `test/extractors/e2e/helpers.ts` 作成
- [ ] `vitest.config.ts` タイムアウト設定追加

### Phase 2: テストファイル作成

- [ ] `test/extractors/e2e/gemini.e2e.test.ts` 作成
- [ ] `test/extractors/e2e/claude.e2e.test.ts` 作成
- [ ] `test/extractors/e2e/chatgpt.e2e.test.ts` 作成

### Phase 3: フィクスチャ取得（ユーザー作業）

- [ ] `gemini/chat-simple.html` 取得
- [ ] `gemini/deep-research.html` 取得
- [ ] `claude/chat-simple.html` 取得
- [ ] `claude/artifacts.html` 取得
- [ ] `chatgpt/chat-simple.html` 取得
- [ ] `chatgpt/chat-code.html` 取得

### Phase 4: スナップショット生成

- [ ] `npx vitest run test/extractors/e2e/ -u` 実行
- [ ] スナップショット内容レビュー
- [ ] 必要に応じて調整

## 8. 変更対象ファイル一覧

| ファイル | アクション | 説明 |
|---------|----------|------|
| `src/lib/note-generator.ts` | **新規作成** | generateNoteContent分離 |
| `src/background/index.ts` | **変更** | import追加、関数削除 |
| `test/extractors/e2e/helpers.ts` | **新規作成** | E2Eヘルパー |
| `test/extractors/e2e/gemini.e2e.test.ts` | **新規作成** | Gemini E2Eテスト |
| `test/extractors/e2e/claude.e2e.test.ts` | **新規作成** | Claude E2Eテスト |
| `test/extractors/e2e/chatgpt.e2e.test.ts` | **新規作成** | ChatGPT E2Eテスト |
| `test/fixtures/html/README.md` | **新規作成** | フィクスチャガイド |
| `vitest.config.ts` | **変更** | タイムアウト追加 |

## 9. 検証手順

### 9.1 テスト実行

```bash
# E2Eテストのみ実行
npm test -- --run test/extractors/e2e/

# 全テスト実行
npm test

# カバレッジ付き
npm run test:coverage
```

### 9.2 期待結果

```
 ✓ test/extractors/e2e/gemini.e2e.test.ts (4 tests)
 ✓ test/extractors/e2e/claude.e2e.test.ts (4 tests)
 ✓ test/extractors/e2e/chatgpt.e2e.test.ts (4 tests)

 Test Files  3 passed (3)
      Tests  12 passed (12)
```

## 10. 参考文献

- [Vitest Snapshot Testing](https://vitest.dev/guide/snapshot) - 公式ドキュメント
- [jsdom](https://github.com/jsdom/jsdom) - DOM実装
- CLAUDE.md - プロジェクトルール

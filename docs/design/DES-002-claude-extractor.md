# DES-002: Claude Extractor 設計書

| 項目 | 内容 |
|------|------|
| **文書ID** | DES-002 |
| **バージョン** | 1.1.0 |
| **作成日** | 2026-01-15 |
| **更新日** | 2026-01-15 |
| **ステータス** | Draft (レビュー反映) |
| **関連計画** | [claude-extractor-implementation.md](../plans/claude-extractor-implementation.md) |

---

## 1. 概要

### 1.1 目的

Claude AI (claude.ai) の会話データを抽出し、Obsidian にエクスポートする機能を追加する。通常チャットと Deep Research (Extended Thinking) の両方に対応する。

### 1.2 スコープ

| 含む | 含まない |
|------|---------|
| Claude 通常チャット抽出 | Claude API 直接連携 |
| Claude Deep Research 抽出 | Claude Projects 対応 |
| インライン引用の Markdown 変換 | Claude Artifacts (コード生成) 対応 |
| 既存 Gemini パターンとの統合 | Perplexity 対応（別設計） |

### 1.3 優先順位

1. **P0**: 通常チャット抽出（User/Assistant メッセージ）
2. **P0**: Deep Research レポート抽出
3. **P1**: インライン引用の脚注変換
4. **P2**: 日付メタデータ抽出

---

## 2. 機能要件

### 2.1 FR-001: プラットフォーム検出

| ID | 要件 |
|----|------|
| FR-001-1 | `hostname === 'claude.ai'` で Claude ページを識別する（厳密比較必須） |
| FR-001-2 | URL パターン `/chat/{uuid}` から会話 ID を抽出する |
| FR-001-3 | Deep Research モードは `#markdown-artifact` 要素の存在で判定する |

### 2.2 FR-002: 通常チャット抽出

| ID | 要件 |
|----|------|
| FR-002-1 | User メッセージを複数フォールバックセレクターから抽出する |
| FR-002-2 | Assistant メッセージを `.font-claude-response` から抽出する |
| FR-002-3 | Markdown コンテンツは `.standard-markdown` から取得する |
| FR-002-4 | メッセージは DOM 順序で正しくインターリーブする |

### 2.3 FR-003: Deep Research 抽出

| ID | 要件 |
|----|------|
| FR-003-1 | レポートタイトルを `h1` 要素から抽出する |
| FR-003-2 | レポート本文を `.standard-markdown` から HTML として抽出する |
| FR-003-3 | インライン引用を検出し、脚注形式に変換する |
| FR-003-4 | 引用元 URL とタイトルを保持する（既存 `DeepResearchSource` 型を使用） |

### 2.4 FR-004: 出力形式

| ID | 要件 |
|----|------|
| FR-004-1 | Gemini と同一の Obsidian callout 形式で出力する |
| FR-004-2 | `source: claude` を YAML frontmatter に設定する |
| FR-004-3 | Deep Research は `type: deep-research` を設定する |

---

## 3. 非機能要件

### 3.1 NFR-001: セキュリティ

| ID | 要件 | 根拠 |
|----|------|------|
| NFR-001-1 | Hostname は厳密比較 (`===`) を使用する | CodeQL js/incomplete-url-substring-sanitization 対策 |
| NFR-001-2 | HTML コンテンツは DOMPurify でサニタイズする | XSS 防止 |
| NFR-001-3 | CSP 設定は既存 Gemini と同等とする | Manifest V3 準拠 |
| NFR-001-4 | 悪意のあるサブドメイン攻撃を防止する | `evil-claude.ai.attacker.com` を拒否 |

### 3.2 NFR-002: 互換性

| ID | 要件 |
|----|------|
| NFR-002-1 | 既存の GeminiExtractor と同じ BaseExtractor を継承する |
| NFR-002-2 | IConversationExtractor インターフェースを完全実装する |
| NFR-002-3 | 既存の Markdown 変換パイプラインを再利用する |
| NFR-002-4 | GeminiExtractor との API 命名を統一する（`extractSourceList` 使用） |

### 3.3 NFR-003: テスタビリティ

| ID | 要件 |
|----|------|
| NFR-003-1 | 85% 以上のステートメントカバレッジを維持する |
| NFR-003-2 | 全フォールバックセレクターをテストする |
| NFR-003-3 | DOM ヘルパーで再現可能なテストフィクスチャを提供する |
| NFR-003-4 | セキュリティテストを必須とする |

---

## 4. システムアーキテクチャ

### 4.1 コンポーネント図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────────────────────────────┐ │
│  │Content Script│     │           Extractors                  │ │
│  │   index.ts   │────▶│  ┌────────────────┐ ┌──────────────┐ │ │
│  └──────────────┘     │  │GeminiExtractor │ │ClaudeExtractor│ │ │
│         │             │  └───────┬────────┘ └───────┬───────┘ │ │
│         │             │          │                   │         │ │
│         │             │          ▼                   ▼         │ │
│         │             │  ┌──────────────────────────────────┐ │ │
│         │             │  │          BaseExtractor           │ │ │
│         │             │  │  - queryWithFallback()           │ │ │
│         │             │  │  - queryAllWithFallback()        │ │ │
│         │             │  │  - sanitizeText()                │ │ │
│         │             │  │  - generateHashValue()           │ │ │
│         │             │  └──────────────────────────────────┘ │ │
│         │             └──────────────────────────────────────┘ │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  markdown.ts │────▶│ obsidian-api │────▶│  Background  │   │
│  │ (Turndown)   │     │    .ts       │     │   Worker     │   │
│  └──────────────┘     └──────────────┘     └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 ルーティングフロー

```
URL アクセス
    │
    ▼
┌─────────────────────────────────┐
│   Content Script (index.ts)     │
│   hostname チェック (=== 厳密比較) │
└─────────────────────────────────┘
    │
    ├── gemini.google.com ──▶ GeminiExtractor
    │
    └── claude.ai ──▶ ClaudeExtractor
                         │
                         ├── #markdown-artifact 存在
                         │       │
                         │       ▼
                         │   extractDeepResearch()
                         │
                         └── 通常ページ
                                 │
                                 ▼
                             extractMessages()
```

---

## 5. 詳細設計

### 5.1 manifest.json 変更詳細

#### 5.1.1 現在の設定

```json
{
  "host_permissions": [
    "https://gemini.google.com/*",
    "http://127.0.0.1:27123/*"
  ],
  "content_scripts": [{
    "matches": ["https://gemini.google.com/*"],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle"
  }]
}
```

#### 5.1.2 変更後の設定

```json
{
  "host_permissions": [
    "https://gemini.google.com/*",
    "https://claude.ai/*",
    "http://127.0.0.1:27123/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://gemini.google.com/*",
      "https://claude.ai/*"
    ],
    "js": ["src/content/index.ts"],
    "run_at": "document_idle"
  }]
}
```

#### 5.1.3 変更理由

| 変更箇所 | 理由 |
|----------|------|
| `host_permissions` に `https://claude.ai/*` 追加 | Content Script が claude.ai でAPI呼び出し可能にする |
| `content_scripts.matches` に `https://claude.ai/*` 追加 | Content Script が claude.ai で自動実行されるようにする |

### 5.2 セレクター定義

#### 5.2.1 セレクター安定性マトリックス

| セレクター | 安定性 | リスク | フォールバック優先度 | 備考 |
|-----------|--------|--------|---------------------|------|
| `.font-claude-response` | 🟢 HIGH | LOW | 1 | セマンティッククラス、安定 |
| `.standard-markdown` | 🟢 HIGH | LOW | 1 | コンテンツ識別用、安定 |
| `#markdown-artifact` | 🟢 HIGH | LOW | 1 | ID ベース、安定 |
| `[data-testid="user-message"]` | 🔴 LOW | HIGH | 3 | テスト属性、本番で削除される可能性 |
| `[data-test-render-count]` | 🔴 LOW | HIGH | 3 | テスト属性、本番で削除される可能性 |
| `.bg-bg-300` | 🟡 MEDIUM | MEDIUM | 2 | Tailwind カスタムカラー |
| `.text-text-500` | 🟡 MEDIUM | MEDIUM | 2 | Tailwind カスタムカラー |
| 構造ベース (`div > div:first-child`) | 🟢 HIGH | LOW | バックアップ | DOM 構造依存 |

#### 5.2.2 通常チャット用セレクター (SELECTORS)

```typescript
const SELECTORS = {
  // 会話コンテナ（各メッセージブロック）
  // 安定性: HIGH → LOW の順にフォールバック（安定したセレクターを優先）
  conversationBlock: [
    '.group[style*="height: auto"]',           // 構造ベース (HIGH)
    '[data-test-render-count]',                // テスト属性 (LOW)
    '.group',                                  // 汎用 (MEDIUM)
  ],

  // User メッセージ
  userMessage: [
    '.whitespace-pre-wrap.break-words',        // コンテンツスタイル (HIGH)
    '[data-testid="user-message"]',            // テスト属性 (LOW)
    '[class*="user-message"]',                 // 部分マッチ (MEDIUM)
    '.bg-bg-300 p',                            // 構造ベース (MEDIUM)
  ],

  // User メッセージラッパー（日付取得用）
  userWrapper: [
    '.rounded-xl.pl-2\\.5.py-2\\.5',           // スタイル属性 (HIGH)
    '.bg-bg-300',                              // Tailwind (MEDIUM)
    '[class*="bg-bg-300"]',                    // 部分マッチ (MEDIUM)
  ],

  // Assistant レスポンス
  assistantResponse: [
    '.font-claude-response',                   // セマンティック (HIGH)
    '[class*="font-claude-response"]',         // 部分マッチ (HIGH)
    '[data-is-streaming]',                     // 機能属性 (MEDIUM)
  ],

  // Markdown コンテンツ
  markdownContent: [
    '.standard-markdown',                      // セマンティック (HIGH)
    '.progressive-markdown',                   // セマンティック (HIGH)
    '[class*="markdown"]',                     // 部分マッチ (MEDIUM)
  ],

  // 日付
  messageDate: [
    'span[data-state="closed"]',               // 機能属性 (MEDIUM)
    '.text-text-500.text-xs',                  // Tailwind (MEDIUM)
    '[class*="text-text-500"]',                // 部分マッチ (LOW)
  ],
};
```

#### 5.2.3 Deep Research 用セレクター (DEEP_RESEARCH_SELECTORS)

```typescript
const DEEP_RESEARCH_SELECTORS = {
  // Artifact コンテナ（存在チェック用）
  artifact: [
    '#markdown-artifact',                      // ID (HIGH)
    '[id*="markdown-artifact"]',               // 部分マッチ (HIGH)
  ],

  // レポートタイトル
  title: [
    '#markdown-artifact h1',                   // 構造 (HIGH)
    '.standard-markdown h1',                   // 構造 (HIGH)
    'h1.text-text-100',                        // Tailwind (MEDIUM)
    'h1',                                      // 汎用 (LOW)
  ],

  // レポート本文
  content: [
    '#markdown-artifact .standard-markdown',   // 構造 (HIGH)
    '.standard-markdown',                      // セマンティック (HIGH)
  ],

  // インライン引用リンク
  inlineCitation: [
    'span.inline-flex a[href^="http"]',        // 構造 (HIGH)
    '.group\\/tag a[href]',                    // クラス (MEDIUM)
    'a[target="_blank"][href^="http"]',        // 属性 (MEDIUM)
  ],
};
```

### 5.3 クラス設計

#### 5.3.1 ClaudeExtractor クラス

```typescript
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude' as const;

  // ========== プラットフォーム検出 ==========

  /**
   * Claude ページかどうかを判定
   * 重要: 厳密比較 (===) を使用（CodeQL 対策）
   */
  canExtract(): boolean;

  /**
   * Deep Research モードかどうかを判定
   * #markdown-artifact 要素の存在で判定
   */
  isDeepResearchVisible(): boolean;

  // ========== ID・タイトル取得 ==========

  /**
   * URL から会話 ID を抽出
   * 形式: /chat/{uuid}
   * @returns UUID または null
   */
  getConversationId(): string | null;

  /**
   * 会話タイトルを取得
   * 優先順位: 最初の User メッセージ > Deep Research h1 > デフォルト
   */
  getTitle(): string;

  /**
   * Deep Research レポートのタイトルを取得
   */
  getDeepResearchTitle(): string;

  // ========== メッセージ抽出 ==========

  /**
   * 全メッセージを抽出
   * User/Assistant を DOM 順序でインターリーブ
   */
  extractMessages(): ConversationMessage[];

  /**
   * User メッセージコンテンツを抽出
   */
  private extractUserContent(element: Element): string;

  /**
   * Assistant レスポンスコンテンツを抽出（HTML）
   */
  private extractAssistantContent(element: Element): string;

  // ========== Deep Research 抽出 ==========

  /**
   * Deep Research レポートを抽出
   */
  extractDeepResearch(): ExtractionResult;

  /**
   * Deep Research 本文を抽出
   */
  extractDeepResearchContent(): string;

  /**
   * ソースリストを抽出（GeminiExtractor との API 統一）
   * @returns ソースリスト（index, url, title, domain）
   */
  extractSourceList(): DeepResearchSource[];

  /**
   * Deep Research リンク情報を抽出（GeminiExtractor との API 統一）
   */
  extractDeepResearchLinks(): DeepResearchLinks;

  // ========== メインエントリポイント ==========

  /**
   * 抽出メイン処理
   * Deep Research / 通常チャットを自動ルーティング
   */
  async extract(): Promise<ExtractionResult>;
}
```

### 5.4 型定義の整合性

#### 5.4.1 既存の DeepResearchSource 型（src/lib/types.ts）

```typescript
export interface DeepResearchSource {
  index: number;   // 0-based 配列インデックス（ソースリスト内の位置）
  url: string;     // ソース URL
  title: string;   // ソースタイトル
  domain: string;  // ドメイン名（例: "kaonavi.jp"）
}
```

**index プロパティの用途:**
- Gemini: `data-turn-source-index` (1-based) との対応に使用
- Claude: インライン引用の出現順序管理に使用（脚注番号生成）

#### 5.4.2 DeepResearchLinks 型

```typescript
export interface DeepResearchLinks {
  sources: DeepResearchSource[];
}
```

### 5.5 メソッド仕様

#### 5.5.1 canExtract()

| 項目 | 内容 |
|------|------|
| **目的** | Claude ページかどうかを判定 |
| **入力** | なし |
| **出力** | `boolean` |
| **ロジック** | `window.location.hostname === 'claude.ai'` (厳密比較必須) |
| **セキュリティ** | サブドメイン攻撃防止のため `===` を使用 |

#### 5.5.2 getConversationId()

| 項目 | 内容 |
|------|------|
| **目的** | URL から会話 ID を抽出 |
| **入力** | なし |
| **出力** | `string \| null` |
| **ロジック** | `/\/chat\/([a-f0-9-]+)/i` でマッチ |
| **URL例** | `https://claude.ai/chat/1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f` |

#### 5.5.3 extractMessages()

| 項目 | 内容 |
|------|------|
| **目的** | 全メッセージを DOM 順序で抽出 |
| **入力** | なし |
| **出力** | `ConversationMessage[]` |
| **ロジック** | 1. 安定性の高いセレクターから順に試行<br>2. User/Assistant を判別して抽出<br>3. DOM 順序でソート |

#### 5.5.4 extractSourceList()

| 項目 | 内容 |
|------|------|
| **目的** | Deep Research のソースリストを抽出（GeminiExtractor との API 統一） |
| **入力** | なし |
| **出力** | `DeepResearchSource[]` |
| **ロジック** | 1. インライン引用リンクを全取得<br>2. URL, タイトル, ドメインを抽出<br>3. 重複を URL ベースで除去<br>4. index は出現順序（0-based） |

### 5.6 エラーハンドリング設計

#### 5.6.1 エラーハンドリングマトリックス

| 状況 | 期待動作 | 戻り値 |
|------|----------|--------|
| DOM 要素なし | 警告ログ出力、空配列返却 | `[]` |
| URL パースエラー | null 返却、フォールバック ID 生成 | `claude-${Date.now()}` |
| 空の会話 | エラー結果返却 | `{ success: false, error: 'No messages found' }` |
| サニタイズエラー | 空文字列返却、警告ログ | `''` |
| セレクター全失敗 | フォールバック抽出試行 | `extractMessagesFromRoot()` |
| Deep Research コンテンツなし | エラー結果返却 | `{ success: false, error: 'Content not found' }` |

#### 5.6.2 エラーハンドリングパターン

```typescript
async extract(): Promise<ExtractionResult> {
  try {
    if (!this.canExtract()) {
      return { success: false, error: 'Not on a Claude page' };
    }

    if (this.isDeepResearchVisible()) {
      return this.extractDeepResearch();
    }

    const messages = this.extractMessages();

    if (messages.length === 0) {
      return {
        success: false,
        error: 'No messages found in conversation',
        warnings: ['Primary selectors may have changed. Check Claude UI for updates.'],
      };
    }

    // ... 正常処理
  } catch (error) {
    console.error('[G2O] Extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown extraction error',
    };
  }
}
```

### 5.7 DOM 構造マッピング

#### 5.7.1 通常チャット

```html
<!-- 会話ブロック -->
<div data-test-render-count="2">
  <!-- User メッセージ -->
  <div class="bg-bg-300 rounded-xl pl-2.5 py-2.5">
    <div data-testid="user-message">
      <p class="whitespace-pre-wrap break-words">ユーザーの質問テキスト</p>
    </div>
    <span class="text-text-500 text-xs" data-state="closed">Dec 6, 2025</span>
  </div>
</div>

<div data-test-render-count="2">
  <!-- Assistant レスポンス -->
  <div class="font-claude-response" data-is-streaming="false">
    <div class="standard-markdown">
      <p>Claude の回答...</p>
    </div>
  </div>
</div>
```

#### 5.7.2 Deep Research

```html
<div id="markdown-artifact" class="font-claude-response">
  <div class="standard-markdown">
    <h1 class="text-text-100">レポートタイトル</h1>
    <p>
      本文テキスト
      <span class="inline-flex">
        <a href="https://example.com" target="_blank">
          <span class="text-text-300">source +2</span>
        </a>
      </span>
    </p>
  </div>
</div>
```

---

## 6. テスト戦略

### 6.1 テストカテゴリ

| カテゴリ | テスト内容 | ファイル |
|----------|-----------|----------|
| プラットフォーム検出 | hostname 判定、URL パターン | `claude.test.ts` |
| セキュリティ | hostname 攻撃パターン、XSS 防止 | `claude.test.ts` |
| ID 抽出 | UUID 抽出、フォールバック | `claude.test.ts` |
| タイトル抽出 | User メッセージ、h1、デフォルト | `claude.test.ts` |
| メッセージ抽出 | User/Assistant、インターリーブ | `claude.test.ts` |
| Deep Research | パネル検出、コンテンツ、引用 | `claude.test.ts` |
| フォールバック | 全セレクターのフォールバック | `claude.test.ts` |
| エラーハンドリング | 各種エラー状況 | `claude.test.ts` |
| エッジケース | 空データ、大量データ | `claude.test.ts` |

### 6.2 DOM ヘルパー追加

```typescript
// test/fixtures/dom-helpers.ts に追加

/**
 * Claude 会話 DOM を生成
 */
export function createClaudeConversationDOM(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): string;

/**
 * Claude Deep Research DOM を生成
 */
export function createClaudeDeepResearchDOM(
  title: string,
  content: string,
  citations?: Array<{ url: string; title: string }>
): string;

/**
 * Claude URL をモック
 */
export function setClaudeLocation(conversationId: string): void;

/**
 * 非 Claude URL をモック（セキュリティテスト用）
 */
export function setNonClaudeLocation(hostname: string, pathname: string): void;

/**
 * インライン引用を生成
 */
export function createClaudeInlineCitation(
  url: string,
  title: string
): string;
```

### 6.3 テストケース一覧 (48 テスト)

#### 6.3.1 プラットフォーム検出 (4 テスト)

- [ ] `canExtract()` returns true for claude.ai
- [ ] `canExtract()` returns false for other hosts
- [ ] `isDeepResearchVisible()` returns true when #markdown-artifact exists
- [ ] `isDeepResearchVisible()` returns false when artifact not present

#### 6.3.2 セキュリティテスト (5 テスト) 🆕

- [ ] rejects malicious subdomains containing claude.ai (`evil-claude.ai.attacker.com`)
- [ ] rejects claude.ai as subdomain (`claude.ai.evil.com`)
- [ ] sanitizes XSS script tags in assistant content
- [ ] sanitizes XSS onerror attributes in content
- [ ] sanitizes javascript: protocol URLs in citations

#### 6.3.3 ID 抽出 (4 テスト)

- [ ] extracts UUID from `/chat/{uuid}` URL
- [ ] returns null for non-chat URLs
- [ ] generates fallback ID when URL parsing fails
- [ ] handles hyphenated UUIDs correctly

#### 6.3.4 タイトル抽出 (4 テスト)

- [ ] extracts title from first user message
- [ ] truncates long titles (>100 chars)
- [ ] uses Deep Research h1 for reports
- [ ] returns default title when no content

#### 6.3.5 メッセージ抽出 (5 テスト)

- [ ] extracts user and assistant messages
- [ ] handles multiple conversation turns
- [ ] maintains correct message order
- [ ] handles empty conversations
- [ ] extracts HTML content for assistant messages

#### 6.3.6 Deep Research (10 テスト) 🆕拡充

- [ ] extracts report title from h1
- [ ] extracts report content
- [ ] extracts inline citations using extractSourceList()
- [ ] handles missing citations gracefully
- [ ] generates deterministic ID from title
- [ ] sets type to 'deep-research'
- [ ] deduplicates citations by URL
- [ ] extracts domain from citation URLs
- [ ] handles 100+ citations performance
- [ ] returns DeepResearchLinks via extractDeepResearchLinks()

#### 6.3.7 フォールバックセレクター (12 テスト) 🆕拡充

- [ ] conversationBlock primary selector (.group[style])
- [ ] conversationBlock secondary selector ([data-test-render-count])
- [ ] conversationBlock tertiary selector (.group)
- [ ] userMessage primary selector (.whitespace-pre-wrap)
- [ ] userMessage secondary selector ([data-testid])
- [ ] userMessage tertiary selector ([class*=user-message])
- [ ] userMessage quaternary selector (.bg-bg-300 p)
- [ ] assistantResponse primary selector (.font-claude-response)
- [ ] assistantResponse secondary selector ([class*=font-claude-response])
- [ ] assistantResponse tertiary selector ([data-is-streaming])
- [ ] markdownContent fallback chain
- [ ] Deep Research title fallback chain

#### 6.3.8 エラーハンドリング (4 テスト) 🆕

- [ ] returns error when DOM elements not found
- [ ] returns error for empty conversation
- [ ] handles sanitization errors gracefully
- [ ] logs warning when fallback selectors used

---

## 7. 実装ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `src/manifest.json` | 変更 | Claude URL パターン追加（5.1 参照） |
| `src/content/index.ts` | 変更 | hostname ルーティング追加 |
| `src/content/extractors/claude.ts` | **新規** | ClaudeExtractor 実装 |
| `test/fixtures/dom-helpers.ts` | 変更 | Claude DOM ヘルパー追加 |
| `test/extractors/claude.test.ts` | **新規** | ClaudeExtractor テスト (48 cases) |

---

## 8. 引用変換アルゴリズム

### 8.1 変換ロジック

```typescript
/**
 * インライン引用を脚注形式に変換
 *
 * 処理フロー:
 * 1. 全インライン引用を抽出
 * 2. URL で重複を除去（Map 使用）
 * 3. 出現順に脚注番号を割り当て（1-based）
 * 4. HTML 内の引用を [^N] に置換
 * 5. 文末に脚注定義を追加
 */
```

### 8.2 重複引用処理

| ケース | 処理 |
|--------|------|
| 同一 URL の複数引用 | 同じ脚注番号を使用 |
| 同一ドメイン異なる URL | 別々の脚注番号 |
| 100+ 件の引用 | Map 使用で O(1) ルックアップ |

### 8.3 パフォーマンス考慮

- 引用 100 件: < 10ms
- 引用 500 件: < 50ms
- Map による O(1) 重複チェック

---

## 付録

### A. Claude HTML サンプルファイル

| ファイル | 内容 |
|----------|------|
| `data/claude-elements-sample.html` | 通常チャット HTML |
| `data/claude-deep-research-sample.html` | Deep Research HTML |

### B. URL パターン

| プラットフォーム | パターン | 例 |
|-----------------|----------|-----|
| Gemini | `/app/{hex-id}` | `/app/abc123def` |
| Claude | `/chat/{uuid}` | `/chat/1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f` |

### C. 出力形式サンプル

```markdown
---
id: claude_1fbb8252-2bec-4ef2-bf1f-88393dd9bb5f
title: '問題解決フレームワーク'
source: claude
extractedAt: '2026-01-15T10:00:00.000Z'
---

> [!QUESTION] User
> 解決策を考えるには、問題を正しく理解して解決可能な課題を抽出することが重要と考えます。

> [!NOTE] Claude
> これは非常に重要なテーマですね。問題・課題・解決の定義と、課題発見の手法についての調査レポートを作成します。
```

### D. Deep Research 引用変換

**入力 HTML:**
```html
<p>問題とは目標と現状のギャップ
<span class="inline-flex">
  <a href="https://kaonavi.jp/dictionary/mondai-kadai/">kaonavi +2</a>
</span>
</p>
```

**出力 Markdown:**
```markdown
問題とは目標と現状のギャップ[^1]

[^1]: [kaonavi](https://kaonavi.jp/dictionary/mondai-kadai/)
```

### E. 日付パース仕様

| 入力形式 | 例 | パース方法 |
|----------|-----|-----------|
| `MMM D, YYYY` | `Dec 6, 2025` | `new Date(text)` |
| タイムゾーン | - | ブラウザローカル（UTC 変換しない） |
| パース失敗時 | - | `undefined` を設定（必須フィールドではない） |

### F. レビュー対応チェックリスト

- [x] manifest.json 変更の具体的記載を追加 (5.1)
- [x] セレクター安定性評価を追加 (5.2.1)
- [x] セキュリティテストケースを追加 (6.3.2)
- [x] エラーハンドリング設計を追加 (5.6)
- [x] 型定義の整合性確認 (5.4)
- [x] GeminiExtractor との命名統一 (extractSourceList) (5.3.1)

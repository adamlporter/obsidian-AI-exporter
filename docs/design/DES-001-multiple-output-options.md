# DES-001: 複数出力オプション機能 設計書

| 項目 | 内容 |
|------|------|
| **文書ID** | DES-001 |
| **バージョン** | 1.0.0 |
| **作成日** | 2026-01-13 |
| **ステータス** | Draft |
| **最終更新** | 2026-01-13 (レビュー反映)

---

## 1. 概要

### 1.1 目的

Gemini会話のエクスポート先を拡張し、Obsidian REST API以外の出力先（ファイルダウンロード、クリップボード）をサポートする。ユーザーは複数の出力先を同時に選択可能とする。

### 1.2 スコープ

| 含む | 含まない |
|------|---------|
| ファイルダウンロード機能 | 他AIプラットフォーム対応 |
| クリップボードコピー機能 | ファイル保存先のカスタマイズ |
| 複数出力の同時実行 | 出力形式の変更（Markdown以外） |
| 設定UIの拡張 | |

### 1.3 優先順位

1. ファイルダウンロード（Downloads API）
2. クリップボードコピー（Clipboard API）
3. 複数出力の同時選択

---

## 2. 機能要件

### 2.1 FR-001: ファイルダウンロード

| ID | 要件 |
|----|------|
| FR-001-1 | ユーザーがMarkdownファイルをダウンロードフォルダに保存できる |
| FR-001-2 | ファイル名は `conversationToNote()` で生成された `ObsidianNote.fileName` を使用し、拡張子 `.md` を付加する（詳細は付録B参照） |
| FR-001-3 | ファイル名の衝突時は Chrome Downloads API の `conflictAction: 'uniquify'` により自動的にユニーク化される |

### 2.2 FR-002: クリップボードコピー

| ID | 要件 |
|----|------|
| FR-002-1 | ユーザーがMarkdownコンテンツをクリップボードにコピーできる |
| FR-002-2 | コピー完了時にフィードバック通知が表示される |

### 2.3 FR-003: 複数出力選択

| ID | 要件 |
|----|------|
| FR-003-1 | 設定画面で複数の出力先を同時に有効化できる |
| FR-003-2 | 少なくとも1つの出力先が選択されていない場合はエラー表示 |
| FR-003-3 | Obsidian出力が無効の場合、API設定は不要 |

---

## 3. 非機能要件

### 3.1 NFR-001: 互換性

| ID | 要件 | 根拠 |
|----|------|------|
| NFR-001-1 | Chrome 88以降をサポート | manifest.jsonの既存設定 |
| NFR-001-2 | Manifest V3準拠 | 現行アーキテクチャ |

### 3.2 NFR-002: パフォーマンス

| ID | 要件 |
|----|------|
| NFR-002-1 | 複数出力は並列実行し、1つの失敗が他をブロックしない |
| NFR-002-2 | 出力処理は5秒以内に完了する（詳細は付録C.4 パフォーマンステスト参照） |

### 3.3 NFR-003: セキュリティ

| ID | 要件 |
|----|------|
| NFR-003-1 | 最小権限の原則に従い、必要なパーミッションのみ要求 |
| NFR-003-2 | ファイルパスはDownloadsディレクトリ相対パスのみ許可 |

---

## 4. システムアーキテクチャ

### 4.1 コンポーネント図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │   Popup UI   │     │Content Script│     │  Background  │   │
│  │  (Settings)  │     │ (Extraction) │     │   Service    │   │
│  └──────┬───────┘     └──────┬───────┘     │   Worker     │   │
│         │                    │              └──────┬───────┘   │
│         │ saveSettings       │ saveToOutputs       │           │
│         ▼                    ▼                     │           │
│  ┌──────────────────────────────────────────┐     │           │
│  │           chrome.storage API             │     │           │
│  └──────────────────────────────────────────┘     │           │
│                                                    │           │
│         ┌──────────────────────────────────────────┤           │
│         │                                          │           │
│         ▼                                          ▼           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │   Obsidian   │  │   Downloads  │  │  Offscreen Document  │ │
│  │   Handler    │  │   Handler    │  │  (Clipboard Access)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
└─────────┼──────────────────┼────────────────────┼─────────────┘
          │                  │                    │
          ▼                  ▼                    ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │   Obsidian   │  │  Downloads   │  │  System      │
   │   REST API   │  │   Folder     │  │  Clipboard   │
   └──────────────┘  └──────────────┘  └──────────────┘
```

### 4.2 データフロー

```
1. Content Script: GeminiExtractor.extract()
                   ↓
2. Content Script: conversationToNote() → ObsidianNote
                   ↓
3. Content Script: sendMessage({ action: 'saveToOutputs', data, outputs })
                   ↓
4. Background SW:  handleMultiOutput()
                   ↓ Promise.allSettled()
   ├── handleSaveToObsidian() → Obsidian REST API
   ├── handleDownloadToFile() → chrome.downloads.download()
   └── handleCopyToClipboard() → Offscreen Document → navigator.clipboard
                   ↓
5. Content Script: MultiOutputResponse を受信
                   ↓
6. Content Script: showToast() でフィードバック表示
```

---

## 5. API設計

### 5.1 Chrome Extension APIs

#### 5.1.1 chrome.downloads API

**公式ドキュメント**: https://developer.chrome.com/docs/extensions/reference/api/downloads

**必要パーミッション**:
```json
{
  "permissions": ["downloads"]
}
```

**使用メソッド**:
```typescript
chrome.downloads.download(options: DownloadOptions): Promise<number>
```

**DownloadOptions仕様** (公式ドキュメントより):

| プロパティ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `url` | string | Yes | ダウンロードするURL |
| `filename` | string | No | Downloadsディレクトリからの相対パス |
| `saveAs` | boolean | No | ファイル選択ダイアログを表示するか |
| `conflictAction` | enum | No | `"uniquify"` \| `"overwrite"` \| `"prompt"` |

**制約事項** (公式ドキュメントより):
- `filename`: 絶対パス、空パス、`..` を含むパスは禁止
- エラーは `runtime.lastError` 経由で取得
- エラーメッセージの文字列は後方互換性保証なし

#### 5.1.2 chrome.offscreen API

**公式ドキュメント**: https://developer.chrome.com/docs/extensions/reference/api/offscreen

**必要パーミッション**:
```json
{
  "permissions": ["offscreen"]
}
```

**使用メソッド**:
```typescript
chrome.offscreen.createDocument(parameters: CreateParameters): Promise<void>
chrome.offscreen.closeDocument(): Promise<void>
```

**CreateParameters仕様** (公式ドキュメントより):

| プロパティ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `url` | string | Yes | 拡張機能にバンドルされたHTMLファイルの相対URL |
| `reasons` | Reason[] | Yes | ドキュメントが必要な理由の配列 |
| `justification` | string | Yes | 開発者が提供する必要性の説明 |

**Reason enum** (クリップボード関連):
```typescript
chrome.offscreen.Reason.CLIPBOARD  // "CLIPBOARD"
```

**制約事項** (公式ドキュメントより):
- 拡張機能ごとに1つのoffscreen documentのみ
- offscreen documentからは `chrome.runtime` APIのみ使用可能
- フォーカス不可、`opener` プロパティは常に `null`

#### 5.1.3 chrome.storage API

**公式ドキュメント**: https://developer.chrome.com/docs/extensions/reference/api/storage

**使用領域**:

| 領域 | 用途 | 制限 |
|------|------|------|
| `chrome.storage.local` | センシティブデータ (API Key) | 10MB |
| `chrome.storage.sync` | 設定データ (outputOptions含む) | 100KB |

### 5.2 内部メッセージAPI

#### 5.2.1 ExtensionMessage 型の拡張

```typescript
// src/lib/types.ts の ExtensionMessage を拡張

/**
 * Message types for chrome.runtime communication
 */
export type ExtensionMessage =
  | { action: 'saveToObsidian'; data: ObsidianNote }
  | { action: 'saveToOutputs'; data: ObsidianNote; outputs: OutputDestination[] }  // 新規追加
  | { action: 'getExistingFile'; fileName: string; vaultPath: string }
  | { action: 'getSettings' }
  | { action: 'testConnection' };
```

#### 5.2.2 SaveToOutputs メッセージ

**Request**:
```typescript
interface SaveToOutputsMessage {
  action: 'saveToOutputs';
  data: ObsidianNote;
  outputs: OutputDestination[];
}

type OutputDestination = 'obsidian' | 'file' | 'clipboard';
```

**Response**:
```typescript
interface MultiOutputResponse {
  results: OutputResult[];
  allSuccessful: boolean;
  anySuccessful: boolean;
}

interface OutputResult {
  destination: OutputDestination;
  success: boolean;
  error?: string;
}
```

---

## 6. データモデル

### 6.1 型定義

```typescript
// src/lib/types.ts に追加

/**
 * 出力先の識別子
 */
export type OutputDestination = 'obsidian' | 'file' | 'clipboard';

/**
 * 出力オプション設定
 * 各出力先の有効/無効を管理
 */
export interface OutputOptions {
  /** Obsidian REST API経由での保存 */
  obsidian: boolean;
  /** ダウンロードフォルダへのファイル保存 */
  file: boolean;
  /** システムクリップボードへのコピー */
  clipboard: boolean;
}

/**
 * 個別出力の実行結果
 */
export interface OutputResult {
  destination: OutputDestination;
  success: boolean;
  error?: string;
}

/**
 * 複数出力の集約結果
 */
export interface MultiOutputResponse {
  results: OutputResult[];
  /** すべての出力が成功したか */
  allSuccessful: boolean;
  /** 少なくとも1つの出力が成功したか */
  anySuccessful: boolean;
}

/**
 * 出力設定のバリデーション結果
 * 注意: 既存の ValidationResult (src/lib/types.ts:196) とは別の用途
 * - 既存: 抽出結果の品質検証 (isValid, warnings, errors)
 * - 本型: 出力設定の妥当性検証 (isValid, errors のみ)
 */
export interface OutputValidationResult {
  isValid: boolean;  // 既存ValidationResultとの整合性を保持
  errors: string[];
}
```

### 6.2 設定スキーマ拡張

```typescript
// src/lib/types.ts の既存インターフェースを拡張

/**
 * 同期設定（sync storage用）への追加
 * 非機密データはデバイス間同期可能
 */
export interface SyncSettings {
  // 既存フィールド
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;

  // 新規追加
  outputOptions: OutputOptions;
}

/**
 * Extension settings stored in chrome.storage
 * Combined interface merging SecureSettings and SyncSettings
 *
 * 注意: SyncSettings に outputOptions が追加されるため、
 * ExtensionSettings は自動的に outputOptions を継承する
 */
export interface ExtensionSettings extends SecureSettings, SyncSettings {
  // 既存フィールド（変更なし）
  openaiApiKey?: string;
  enableAutoTags?: boolean;
}
```

### 6.3 デフォルト値

```typescript
const DEFAULT_OUTPUT_OPTIONS: OutputOptions = {
  obsidian: true,   // 後方互換性のためデフォルトtrue
  file: false,
  clipboard: false
};
```

---

## 7. UI設計

### 7.1 Popup設定画面

#### 7.1.1 レイアウト

```
┌─────────────────────────────────────────┐
│  Gemini to Obsidian                     │
├─────────────────────────────────────────┤
│                                         │
│  ═══ Output Destinations ═══            │
│                                         │
│  Select where to save conversations:    │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ [x] Obsidian (API)              │   │
│  │ [ ] Download File               │   │
│  │ [ ] Copy to Clipboard           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ═══ Obsidian API Settings ═══          │
│  (Obsidian選択時のみ有効)               │
│                                         │
│  API Key: [••••••••••••••••]           │
│  Port:    [27123           ]           │
│  Path:    [AI/Gemini       ]           │
│                                         │
│  ═══ Template Options ═══               │
│  ...                                    │
│                                         │
│  [ Test Connection ]  [ Save Settings ] │
│                                         │
└─────────────────────────────────────────┘
```

#### 7.1.2 インタラクション

| アクション | 挙動 |
|-----------|------|
| Obsidianチェックボックス OFF | API設定セクションをdisabled化（グレーアウト）+ ツールチップで理由表示 |
| Obsidianチェックボックス ON | API設定セクションを有効化 |
| 全チェックボックス OFF で保存 | エラー「出力先を1つ以上選択してください」 |
| Obsidian ON + API Key空で保存 | エラー「API Keyは必須です」 |

### 7.2 HTML構造

```html
<!-- 出力先セクション -->
<section class="settings-section">
  <h2 data-i18n="settings_outputDestinations">Output Destinations</h2>
  <p class="help" data-i18n="settings_outputHelp">
    Select where to save conversations
  </p>
  <div class="checkbox-grid">
    <label class="checkbox-label">
      <input type="checkbox" id="outputObsidian" />
      <span data-i18n="settings_outputObsidian">Obsidian (API)</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" id="outputFile" />
      <span data-i18n="settings_outputFile">Download File</span>
    </label>
    <label class="checkbox-label">
      <input type="checkbox" id="outputClipboard" />
      <span data-i18n="settings_outputClipboard">Copy to Clipboard</span>
    </label>
  </div>
</section>
```

### 7.3 CSS拡張

```css
/* 既存の.checkbox-gridを使用 */

/* disabled状態のセクション */
.settings-section.disabled {
  opacity: 0.5;
  pointer-events: none;
  position: relative;
}

.settings-section.disabled input,
.settings-section.disabled select {
  background-color: var(--bg-secondary);
  cursor: not-allowed;
}

/* ツールチップ表示 */
.settings-section.disabled::after {
  content: attr(data-disabled-reason);
  position: absolute;
  top: 0;
  right: 0;
  background: var(--bg-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}
```

---

## 8. エラーハンドリング

### 8.1 エラー分類

| カテゴリ | エラー | 対処 |
|---------|--------|------|
| バリデーション | 出力先未選択 | 保存前に警告表示 |
| バリデーション | Obsidian選択時にAPI Key空 | 保存前に警告表示 |
| 実行時 | Obsidian API接続失敗 | 他の出力は続行、部分成功通知 |
| 実行時 | ダウンロード失敗 | 他の出力は続行、部分成功通知 |
| 実行時 | クリップボードアクセス拒否 | 他の出力は続行、部分成功通知 |

### 8.2 ユーザーフィードバック

| 状態 | トースト種別 | メッセージ例 |
|------|------------|-------------|
| 全成功 | success (緑) | 「すべての出力先に保存しました」 |
| 部分成功 | warning (黄) | 「一部保存完了: Obsidian ✓, File ✗」 |
| 全失敗 | error (赤) | 「保存に失敗しました」 |

### 8.3 エラーハンドリングコード

```typescript
/**
 * 出力先に応じたハンドラを実行
 */
async function executeOutput(
  dest: OutputDestination,
  note: ObsidianNote,
  settings: ExtensionSettings
): Promise<OutputResult> {
  switch (dest) {
    case 'obsidian':
      return handleSaveToObsidian(note, settings);
    case 'file':
      return handleDownloadToFile(note, settings);
    case 'clipboard':
      return handleCopyToClipboard(note, settings);
  }
}

/**
 * 複数出力を並列実行し、結果を集約
 */
async function handleMultiOutput(
  note: ObsidianNote,
  outputs: OutputDestination[],
  settings: ExtensionSettings
): Promise<MultiOutputResponse> {
  const handlers = outputs.map(dest => executeOutput(dest, note, settings));

  // Promise.allSettled: 1つの失敗が他をブロックしない
  const settled = await Promise.allSettled(handlers);

  const results: OutputResult[] = settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        destination: outputs[index],
        success: false,
        error: String(result.reason)
      };
    }
  });

  return {
    results,
    allSuccessful: results.every(r => r.success),
    anySuccessful: results.some(r => r.success)
  };
}
```

---

## 9. セキュリティ考慮事項

### 9.1 パーミッション最小化

**必要パーミッション**:
```json
{
  "permissions": [
    "storage",        // 既存: 設定保存
    "activeTab",      // 既存: アクティブタブアクセス
    "downloads",      // 新規: ファイルダウンロード
    "offscreen"       // 新規: クリップボードアクセス用
  ]
}
```

**注意**: `clipboardWrite` パーミッションは Service Worker では直接使用不可。代わりに `offscreen` パーミッションで offscreen document 経由でアクセスする。

### 9.2 ファイルパス検証

```typescript
function sanitizeFilename(filename: string): string {
  // 危険な文字を除去
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')  // ファイルシステム予約文字
    .replace(/\.\./g, '_')           // パストラバーサル防止
    .substring(0, 200);              // 長さ制限
}
```

### 9.3 データ検証

- Markdown コンテンツは既存の `generateNoteContent()` でサニタイズ済み
- YAML frontmatter のエスケープは既存の `escapeYamlString()` を使用

---

## 10. 制約事項

### 10.1 技術的制約

| 制約 | 詳細 | 根拠 |
|------|------|------|
| Chrome 88以上 | Manifest V3必須 | manifest.json既存設定 |
| Service Worker制限 | navigator.clipboard 直接使用不可 | [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/reference/api/offscreen) |
| Offscreen Document | 拡張機能あたり1つのみ | 公式ドキュメント |
| Downloads API | 相対パスのみ | 公式ドキュメント |

### 10.2 既知の制限

| 項目 | 制限内容 |
|------|---------|
| ファイル保存先 | Downloadsフォルダ固定（カスタマイズ不可） |
| ファイル形式 | Markdownのみ（他形式非対応） |
| 同時実行 | 並列実行のため実行順序は保証されない |

---

## 11. マイグレーション

### 11.1 既存設定の互換性

```typescript
// src/lib/storage.ts

async function migrateSettings(): Promise<void> {
  const existingSettings = await getSettings();

  // outputOptionsが未定義の場合、デフォルト値を追加
  if (!existingSettings.outputOptions) {
    const migratedSettings: ExtensionSettings = {
      ...existingSettings,
      outputOptions: {
        obsidian: true,  // 既存ユーザーのためObsidianをデフォルトで有効
        file: false,
        clipboard: false
      }
    };
    await saveSettings(migratedSettings);
  }
}
```

### 11.2 マイグレーションタイミング

- Service Worker起動時に `migrateSettings()` を実行
- 既存の設定マイグレーション処理と統合

---

## 12. 修正対象ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/manifest.json` | 修正 | `downloads`, `offscreen` パーミッション追加（注: offscreen.htmlはweb_accessible_resourcesへの登録不要。offscreen APIが自動的にアクセス） |
| `src/lib/types.ts` | 修正 | OutputDestination, OutputOptions等の型追加 |
| `src/lib/storage.ts` | 修正 | outputOptionsデフォルト値、マイグレーション |
| `src/lib/validation.ts` | 修正 | validateSettingsForOutputs関数追加 |
| `src/background/index.ts` | 修正 | 出力ハンドラ、マルチ出力コーディネータ追加 |
| `src/content/index.ts` | 修正 | 新メッセージ形式での保存呼び出し |
| `src/popup/index.html` | 修正 | 出力先チェックボックスUI追加 |
| `src/popup/index.ts` | 修正 | 出力オプションの読み書き、動的バリデーション |
| `src/popup/styles.css` | 修正 | disabled状態のスタイル追加 |
| `src/_locales/en/messages.json` | 修正 | 英語メッセージ追加 |
| `src/_locales/ja/messages.json` | 修正 | 日本語メッセージ追加 |
| `src/offscreen.html` | **新規** | クリップボードアクセス用offscreen document |
| `src/offscreen.ts` | **新規** | offscreen documentのスクリプト |

---

## 13. i18n メッセージ定義

### 13.1 英語 (`src/_locales/en/messages.json`)

```json
{
  "settings_outputDestinations": {
    "message": "Output Destinations"
  },
  "settings_outputHelp": {
    "message": "Select where to save conversations"
  },
  "settings_outputObsidian": {
    "message": "Obsidian (API)"
  },
  "settings_outputFile": {
    "message": "Download File"
  },
  "settings_outputClipboard": {
    "message": "Copy to Clipboard"
  },
  "success_allOutputs": {
    "message": "Saved to all destinations"
  },
  "success_partialOutputs": {
    "message": "Partially saved: $DETAILS$",
    "placeholders": {
      "details": {
        "content": "$1"
      }
    }
  },
  "error_noOutputSelected": {
    "message": "Please select at least one output destination"
  },
  "error_allOutputsFailed": {
    "message": "Failed to save"
  },
  "tooltip_obsidianDisabled": {
    "message": "Enable Obsidian output to configure"
  }
}
```

### 13.2 日本語 (`src/_locales/ja/messages.json`)

```json
{
  "settings_outputDestinations": {
    "message": "出力先"
  },
  "settings_outputHelp": {
    "message": "会話の保存先を選択"
  },
  "settings_outputObsidian": {
    "message": "Obsidian (API)"
  },
  "settings_outputFile": {
    "message": "ファイルをダウンロード"
  },
  "settings_outputClipboard": {
    "message": "クリップボードにコピー"
  },
  "success_allOutputs": {
    "message": "すべての出力先に保存しました"
  },
  "success_partialOutputs": {
    "message": "一部保存完了: $DETAILS$",
    "placeholders": {
      "details": {
        "content": "$1"
      }
    }
  },
  "error_noOutputSelected": {
    "message": "出力先を1つ以上選択してください"
  },
  "error_allOutputsFailed": {
    "message": "保存に失敗しました"
  },
  "tooltip_obsidianDisabled": {
    "message": "Obsidian出力を有効にすると設定できます"
  }
}
```

---

## 14. 参考資料

### 14.1 公式ドキュメント

| API | URL |
|-----|-----|
| chrome.downloads | https://developer.chrome.com/docs/extensions/reference/api/downloads |
| chrome.offscreen | https://developer.chrome.com/docs/extensions/reference/api/offscreen |
| chrome.storage | https://developer.chrome.com/docs/extensions/reference/api/storage |
| chrome.runtime | https://developer.chrome.com/docs/extensions/reference/api/runtime |

### 14.2 関連ADR

- (該当ADRがあれば記載)

---

## 付録A: Offscreen Document 実装詳細

### A.1 offscreen.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <script src="offscreen.js"></script>
</body>
</html>
```

### A.2 offscreen.ts

```typescript
// クリップボード書き込みリクエストを処理
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'clipboardWrite' && message.target === 'offscreen') {
    handleClipboardWrite(message.content)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: String(error) }));
    return true; // 非同期レスポンスを示す
  }
});

async function handleClipboardWrite(content: string): Promise<void> {
  await navigator.clipboard.writeText(content);
}
```

### A.3 Background Service Worker からの呼び出し

```typescript
/** Offscreen document のタイムアウト (ミリ秒) */
const OFFSCREEN_TIMEOUT_MS = 5000;

/** Offscreen document 自動クローズ用タイマー */
let offscreenCloseTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Offscreen document 経由でクリップボードに書き込む
 *
 * ライフサイクル管理:
 * - 既存の offscreen document があれば再利用
 * - 操作完了後、5秒間の非活動で自動クローズ（効率重視）
 * - 連続操作時はタイマーリセットで再利用
 */
async function copyToClipboardViaOffscreen(content: string): Promise<void> {
  // 既存のoffscreen documentをチェック
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Copy markdown content to clipboard'
    });
  }

  const response = await chrome.runtime.sendMessage({
    action: 'clipboardWrite',
    target: 'offscreen',
    content
  });

  if (!response.success) {
    throw new Error(response.error || 'Clipboard write failed');
  }

  // 自動クローズタイマーをリセット
  scheduleOffscreenClose();
}

/**
 * Offscreen document の自動クローズをスケジュール
 * 連続操作時はタイマーリセットで効率的に再利用
 */
function scheduleOffscreenClose(): void {
  if (offscreenCloseTimer) {
    clearTimeout(offscreenCloseTimer);
  }

  offscreenCloseTimer = setTimeout(async () => {
    try {
      await chrome.offscreen.closeDocument();
    } catch {
      // Already closed or doesn't exist - ignore
    }
    offscreenCloseTimer = null;
  }, OFFSCREEN_TIMEOUT_MS);
}
```

---

## 付録B: ファイル名生成仕様

### B.1 ファイル名の取得元

ファイル名は既存の `conversationToNote()` で生成された `ObsidianNote.fileName` を使用する。

```typescript
// src/content/markdown.ts の既存実装を利用
const note: ObsidianNote = conversationToNote(data, templateOptions);
const filename = `${note.fileName}.md`;  // 拡張子 .md を付加
```

### B.2 ファイル名サニタイズ

`conversationToNote()` 内で既に sanitize 処理が行われているため、
Downloads API 用の追加サニタイズは最小限とする。

```typescript
/**
 * Downloads API 用の追加ファイル名検証
 * 公式ドキュメントの制約に準拠:
 * - 絶対パス禁止
 * - 空パス禁止
 * - '..' (back-reference) 禁止
 */
function validateDownloadFilename(filename: string): string {
  // 既存の sanitizeFilename() 出力を前提とした追加検証
  if (!filename || filename.includes('..') || filename.startsWith('/')) {
    throw new Error('Invalid filename for download');
  }
  return filename;
}
```

---

## 付録C: テスト計画

### C.1 ユニットテスト

| テスト対象 | テストケース |
|-----------|-------------|
| `sanitizeFilename()` | 危険文字の除去、パストラバーサル防止、長さ制限 |
| `validateDownloadFilename()` | 絶対パス拒否、空文字拒否、'..'拒否 |
| `getEnabledOutputs()` | 各組み合わせで正しい配列を返す |
| `validateSettingsForOutputs()` | Obsidian選択時のAPI Key/Port検証 |

### C.2 統合テスト

| テスト対象 | テストケース |
|-----------|-------------|
| `handleDownloadToFile()` | 正常ダウンロード、エラー時のレスポンス |
| `handleCopyToClipboard()` | 正常コピー、offscreen document 作成/再利用 |
| `handleMultiOutput()` | 全成功、部分成功、全失敗の各シナリオ |

### C.3 E2Eテスト

| シナリオ | 検証内容 |
|---------|---------|
| 単一出力 | Obsidian/File/Clipboard 各単独動作 |
| 複数出力 | 2つ以上の同時選択で並列実行 |
| エラー回復 | 1つ失敗時に他が継続することを確認 |
| 設定永続化 | outputOptions が chrome.storage.sync に保存される |

### C.4 パフォーマンステスト

| シナリオ | 基準 |
|---------|------|
| 小規模会話 (10メッセージ) | 2秒以内に完了 |
| 中規模会話 (50メッセージ) | 3秒以内に完了 |
| 大規模会話 (100+メッセージ) | 5秒以内に完了 |

---

## 付録D: エラーメッセージ i18n マッピング

### D.1 システムエラーのローカライズ

runtime.lastError や例外メッセージは直接表示せず、
既知のパターンについてはローカライズメッセージにマッピングする。

```typescript
/**
 * システムエラーをローカライズメッセージにマッピング
 */
function localizeOutputError(
  destination: OutputDestination,
  error: string
): string {
  // 既知のエラーパターン
  const errorPatterns: Record<string, string> = {
    'Download canceled': getMessage('error_downloadCanceled'),
    'Network error': getMessage('error_networkError'),
    'Permission denied': getMessage('error_permissionDenied'),
    'Clipboard write failed': getMessage('error_clipboardFailed'),
  };

  for (const [pattern, message] of Object.entries(errorPatterns)) {
    if (error.includes(pattern)) {
      return message;
    }
  }

  // 未知のエラーは汎用メッセージ + 出力先名
  return getMessage('error_outputFailed', [
    getMessage(`output_${destination}`)
  ]);
}
```

### D.2 追加 i18n メッセージ

#### 英語 (`src/_locales/en/messages.json`)

```json
{
  "error_downloadCanceled": {
    "message": "Download was canceled"
  },
  "error_networkError": {
    "message": "Network error occurred"
  },
  "error_permissionDenied": {
    "message": "Permission denied"
  },
  "error_clipboardFailed": {
    "message": "Failed to copy to clipboard"
  },
  "error_outputFailed": {
    "message": "Failed to save to $OUTPUT$",
    "placeholders": {
      "output": { "content": "$1" }
    }
  },
  "output_obsidian": { "message": "Obsidian" },
  "output_file": { "message": "file" },
  "output_clipboard": { "message": "clipboard" }
}
```

#### 日本語 (`src/_locales/ja/messages.json`)

```json
{
  "error_downloadCanceled": {
    "message": "ダウンロードがキャンセルされました"
  },
  "error_networkError": {
    "message": "ネットワークエラーが発生しました"
  },
  "error_permissionDenied": {
    "message": "アクセス権限がありません"
  },
  "error_clipboardFailed": {
    "message": "クリップボードへのコピーに失敗しました"
  },
  "error_outputFailed": {
    "message": "$OUTPUT$への保存に失敗しました",
    "placeholders": {
      "output": { "content": "$1" }
    }
  },
  "output_obsidian": { "message": "Obsidian" },
  "output_file": { "message": "ファイル" },
  "output_clipboard": { "message": "クリップボード" }
}
```

---

**文書終了**

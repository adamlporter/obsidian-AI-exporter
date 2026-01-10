# Gemini2Obsidian Production Ready 設計書

## 文書情報

| 項目 | 内容 |
|------|------|
| 文書ID | G2O-DESIGN-001 |
| 作成日 | 2026-01-08 |
| 最終更新日 | 2026-01-09 |
| リビジョン | 1.3 |
| 対象バージョン | 0.1.0 → 0.2.0 |
| 目的 | Medium以上の優先度問題に対処しProduction Readyにする |

### 変更履歴

| リビジョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2026-01-08 | 初版作成（C-01, C-02, M-01, M-02, L-01〜L-04対応） |
| 1.1 | 2026-01-08 | セキュリティ監査結果による追加（NEW-01〜NEW-06）、レビュー指摘対応 |
| 1.2 | 2026-01-08 | 公式ドキュメント照合による改善（storage.session検討、メッセージ内容検証、DOMPurify簡素化、CSP拡張、エラーハンドリング改善） |
| 1.3 | 2026-01-09 | Rev 1.2レビュー指摘対応（validActions修正、migrateSettings呼び出し例追加、isNetworkError統一、throttle+async注意追加、javascript:URI除去明示） |

---

## 1. 対象問題一覧

分析結果から特定されたMedium以上の優先度問題を以下に列挙する。

### 1.1 🔴 CRITICAL（緊急対応必須）

| ID | 問題 | 現在の実装 | 影響 |
|----|------|-----------|------|
| C-01 | API Key平文保存 | [storage.ts:63](../src/lib/storage.ts#L63) `chrome.storage.sync`に平文保存 | API Keyがクラウド同期され、他デバイスに漏洩リスク |
| C-02 | Vite/esbuild脆弱性 | [package.json:21](../package.json#L21) `vite: ^5.0.0` | GHSA-67mh-4wv8-2f99: 開発サーバーSSRF脆弱性 |

### 1.2 🟠 MODERATE（リリース前対応必須）

| ID | 問題 | 現在の実装 | 影響 |
|----|------|-----------|------|
| M-01 | CSP未定義 | [manifest.json](../src/manifest.json) CSPなし | インラインスクリプト攻撃リスク |
| M-02 | Sender検証なし | [background/index.ts:13-27](../src/background/index.ts#L13-L27) `_sender`未使用 | 悪意あるコンテンツスクリプトからのメッセージ受信リスク |

### 1.3 🟡 MEDIUM（品質向上）

| ID | 問題 | 現在の実装 | 影響 |
|----|------|-----------|------|
| L-01 | Promise Constructorアンチパターン | [content/index.ts:140-184](../src/content/index.ts#L140-L184) | コード可読性低下、デバッグ困難 |
| L-02 | 脆弱なエラー検出 | [obsidian-api.ts:67-98](../src/lib/obsidian-api.ts#L67-L98) 文字列マッチング | エラーメッセージ変更時に検出失敗 |
| L-03 | 固定タイムアウト | [content/index.ts:38](../src/content/index.ts#L38) `setTimeout(_, 1000)` | DOMロード状態に依存しない不安定な実装 |
| L-04 | 未使用permission | [manifest.json:12](../src/manifest.json#L12) `activeTab` | 不要な権限要求 |

### 1.4 🔴 追加脆弱性（セキュリティ監査による追加 2026-01-08）

| ID | 問題 | 深刻度 | 現在の実装 | 影響 |
|----|------|--------|-----------|------|
| NEW-01 | XSS via innerHTML | CRITICAL | [gemini.ts:222-248](../src/content/extractors/gemini.ts#L222-L248) サニタイズなし | 悪意あるHTMLがObsidianに保存されXSS攻撃 |
| NEW-02 | パストラバーサル | CRITICAL | [background/index.ts:68-70](../src/background/index.ts#L68-L70) 検証なし | vault外ファイルへの不正アクセス |
| NEW-03 | 入力バリデーション不足 | HIGH | [popup/index.ts:81-99](../src/popup/index.ts#L81-L99) 未検証 | Markdown/YAML injection |
| NEW-04 | YAML Injection | HIGH | [background/index.ts:152-197](../src/background/index.ts#L152-L197) エスケープなし | 不正なfrontmatter挿入 |
| NEW-05 | リクエストタイムアウトなし | MEDIUM | obsidian-api.ts fetchにタイムアウトなし | ネットワーク問題時の無限待機 |
| NEW-06 | レート制限なし | MEDIUM | content/index.ts Syncボタンに制限なし | APIスパム攻撃 |

---

## 2. 設計方針

### 2.1 設計原則

1. **最小権限の原則**: 必要最小限のpermissionのみ要求
2. **防御的プログラミング**: 全ての外部入力を検証
3. **後方互換性**: 既存設定の移行をサポート
4. **テスト可能性**: 全ての変更に対応するテストを追加

### 2.2 変更スコープ

```
変更対象ファイル:
├── package.json                 # C-02: 依存関係更新
├── src/manifest.json            # M-01, L-04: CSP追加、permission削除
├── src/lib/storage.ts           # C-01: ストレージ移行
├── src/background/index.ts      # M-02: sender検証追加
├── src/content/index.ts         # L-01, L-03: パターン改善
├── src/lib/obsidian-api.ts      # L-02: エラー検出改善
└── src/lib/messaging.ts         # NEW: メッセージングユーティリティ
```

---

## 3. 詳細設計

### 3.1 C-01: API Key セキュア保存設計

#### 3.1.1 問題の根拠

**現在の実装** ([storage.ts:63](../src/lib/storage.ts#L63)):
```typescript
await chrome.storage.sync.set({ settings: updated });
```

**問題点**:
- `chrome.storage.sync`はGoogle アカウントを通じて複数デバイスに同期される
- API Keyが平文で保存され、同期される
- Chrome Storage APIはブラウザ内の他の拡張機能からはアクセス不可だが、クラウド同期は行われる

#### 3.1.2 設計

**ストレージ選択の検討**:

| ストレージ | 特徴 | セキュリティ | 永続性 |
|-----------|------|-------------|--------|
| `storage.sync` | デバイス間同期 | ❌ 暗号化なし、クラウド同期 | ✅ 永続 |
| `storage.local` | ローカルのみ | ⚠️ 暗号化なし、同期なし | ✅ 永続 |
| `storage.session` | メモリ内 | ✅ ディスク保存なし | ❌ ブラウザ再起動で消失 |

**公式ドキュメントの推奨**:
> "Local and sync storage areas should not store confidential user data because they are not encrypted. When working with sensitive data, consider using the session storage area to hold values in memory until the browser is shut down."

**トレードオフ分析**:

| 方式 | メリット | デメリット |
|-----|---------|-----------|
| `storage.session` | 最高のセキュリティ（メモリ内のみ） | ブラウザ再起動時にAPI Key再入力が必要 |
| `storage.local` | 永続的、ユーザー体験良好 | ディスク上に平文保存（ただし拡張機能分離あり） |

**本拡張機能の方針**: `chrome.storage.local`を採用

**採用理由**:
1. **ユーザー体験優先**: API Keyの再入力はUXを著しく損なう
2. **脅威モデルの評価**:
   - Chrome Storageは拡張機能間で完全分離されている
   - 攻撃者がローカルストレージにアクセスするには物理アクセスまたはマルウェア感染が必要
   - その場合、`storage.session`でも同様に脆弱（メモリダンプ可能）
3. **同期停止**: `storage.sync`からの移行でクラウド同期リスクを排除
4. **Obsidian REST API の特性**: API Keyはローカルホスト（127.0.0.1）との通信のみに使用

**将来の拡張オプション**（実装は見送り）:
```typescript
// ユーザー選択制（セキュリティ重視ユーザー向け）
interface StoragePreference {
  useSessionStorage: boolean;  // true: より安全だが再起動時に消える
}
```

> ⚠️ **設計決定記録**: セキュリティとユーザビリティのトレードオフを検討した結果、`storage.local`を採用。`storage.session`は最もセキュアだが、ブラウザ再起動ごとの再入力はユーザー離脱につながるリスクが高いと判断。

**変更設計**:

```typescript
// src/lib/storage.ts

// 機密データ用ローカルストレージ
interface SecureSettings {
  obsidianApiKey: string;
}

// 非機密データ用同期ストレージ（継続使用）
interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
}

// 統合設定インターフェース（外部API互換性維持）
export interface ExtensionSettings extends SecureSettings, SyncSettings {}

/**
 * 設定取得: local + sync の統合
 */
export async function getSettings(): Promise<ExtensionSettings> {
  const [localResult, syncResult] = await Promise.all([
    chrome.storage.local.get('secureSettings'),
    chrome.storage.sync.get('settings'),
  ]);

  return {
    obsidianApiKey: localResult.secureSettings?.obsidianApiKey ?? '',
    obsidianPort: syncResult.settings?.obsidianPort ?? 27123,
    vaultPath: syncResult.settings?.vaultPath ?? '03_Extra/Gemini',
    templateOptions: {
      ...DEFAULT_TEMPLATE_OPTIONS,
      ...syncResult.settings?.templateOptions,
    },
  };
}

/**
 * 設定保存: 機密/非機密を分離保存
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();

  // 機密データをlocal storageに保存
  if (settings.obsidianApiKey !== undefined) {
    await chrome.storage.local.set({
      secureSettings: { obsidianApiKey: settings.obsidianApiKey },
    });
  }

  // 非機密データをsync storageに保存
  const syncData: Partial<SyncSettings> = {};
  if (settings.obsidianPort !== undefined) syncData.obsidianPort = settings.obsidianPort;
  if (settings.vaultPath !== undefined) syncData.vaultPath = settings.vaultPath;
  if (settings.templateOptions !== undefined) {
    syncData.templateOptions = {
      ...current.templateOptions,
      ...settings.templateOptions,
    };
  }

  if (Object.keys(syncData).length > 0) {
    const currentSync = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({
      settings: { ...currentSync.settings, ...syncData },
    });
  }
}

/**
 * 旧形式からの移行（初回起動時）
 *
 * トランザクション性を考慮:
 * 1. まずlocalに書き込み成功を確認
 * 2. 成功後にsyncから削除
 * 3. 失敗時はsyncを維持（データ消失防止）
 */
export async function migrateSettings(): Promise<void> {
  try {
    const syncResult = await chrome.storage.sync.get('settings');
    if (syncResult.settings?.obsidianApiKey) {
      const apiKey = syncResult.settings.obsidianApiKey;

      // Step 1: localに書き込み
      await chrome.storage.local.set({
        secureSettings: { obsidianApiKey: apiKey },
      });

      // Step 2: 書き込み成功を確認
      const verifyResult = await chrome.storage.local.get('secureSettings');
      if (verifyResult.secureSettings?.obsidianApiKey !== apiKey) {
        throw new Error('Migration verification failed');
      }

      // Step 3: syncから削除（書き込み成功確認後のみ）
      const { obsidianApiKey: _, ...rest } = syncResult.settings;
      await chrome.storage.sync.set({ settings: rest });

      console.info('[G2O] Settings migrated to secure storage');
    }
  } catch (error) {
    // 移行失敗時はsyncを維持し、次回再試行
    console.error('[G2O] Migration failed, will retry on next startup:', error);
    // エラーを投げずに静かに失敗（既存機能は継続動作）
  }
}
```

#### 3.1.3 移行戦略

1. **Background Script起動時**: `migrateSettings()`を呼び出し
2. **既存ユーザー**: 自動的にAPI Keyがlocalに移行
3. **新規ユーザー**: 最初からlocalに保存

**Background Script起動時の呼び出し例** (src/background/index.ts):
```typescript
import { migrateSettings } from '../lib/storage';

// Service Worker起動時に移行処理を実行
// 注意: top-levelでawaitできないため、catch()でエラーハンドリング
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});

// 以下、既存のonMessage.addListener等...
```

---

### 3.2 C-02: Vite脆弱性対応設計

#### 3.2.1 問題の根拠

**CVE情報**: GHSA-67mh-4wv8-2f99
- **影響**: esbuild <=0.24.2の開発サーバーにSSRF脆弱性
- **条件**: 開発サーバー実行時のみ（本番ビルドには影響なし）
- **深刻度**: Moderate

**現在のバージョン** ([package.json:21](../package.json#L21)):
```json
"vite": "^5.0.0"
```

#### 3.2.2 設計

**方針**: Viteを脆弱性修正済みバージョンへ更新

**変更内容**:
```json
{
  "devDependencies": {
    "vite": "^5.4.12"
  }
}
```

**選定理由**:
- Vite 5.4.12で当該脆弱性が修正済み
- 5.x系のマイナーバージョンアップのため破壊的変更なし
- @crxjs/vite-pluginとの互換性維持

**検証項目**:
1. `npm audit`で脆弱性が解消されること
2. `npm run build`が正常に完了すること
3. ビルド成果物が正常に動作すること

---

### 3.3 M-01: Content Security Policy設計

#### 3.3.1 問題の根拠

**現在の実装**: [manifest.json](../src/manifest.json)にCSPなし

**リスク**:
- インラインスクリプトインジェクション
- 外部スクリプトロード攻撃

#### 3.3.2 設計

**公式ドキュメントのデフォルトCSP**:
```json
"extension_pages": "script-src 'self'; object-src 'self';"
```

**推奨CSP設定** (manifest.json):
```json
{
  "content_security_policy": {
    "extension_pages": "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'"
  }
}
```

**CSPディレクティブ詳細**:

| ディレクティブ | 値 | 説明 |
|--------------|-----|------|
| `default-src` | `'self'` | 未指定ディレクティブのフォールバック |
| `script-src` | `'self'` | 拡張機能パッケージ内のスクリプトのみ許可 |
| `object-src` | `'none'` | プラグイン/埋め込みオブジェクト完全禁止（デフォルトより厳格） |
| `style-src` | `'self' 'unsafe-inline'` | パッケージ内CSS + インラインスタイル許可（Popup UIに必要） |

**デフォルトからの変更点**:
- `object-src 'self'` → `'none'`: より厳格に（Flash/Java等のプラグイン完全禁止）
- `default-src 'self'` 追加: 未指定ディレクティブの保護
- `style-src` 追加: インラインスタイルの明示的許可（ViteビルドのCSS対応）

**style-src 'unsafe-inline' の理由**:
- ViteがビルドするPopupページにインラインスタイルが含まれる場合がある
- セキュリティリスク: スタイルインジェクションは可能だが、スクリプト実行は不可
- 代替案: CSS-in-JSを使わない、または`style-src 'self'`のみでビルドエラーを確認

**注意**: Manifest V3では`content_scripts`のCSPは別途管理されるため、extension_pagesのみ定義

---

### 3.4 M-02: Sender検証設計

#### 3.4.1 問題の根拠

**現在の実装** ([background/index.ts:13-27](../src/background/index.ts#L13-L27)):
```typescript
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,  // 未使用
    sendResponse: (response: unknown) => void
  ) => {
    handleMessage(message)  // 検証なしで処理
```

**リスク**:
- 悪意のあるContent Scriptからのメッセージ受信
- 想定外のoriginからのAPI呼び出し

#### 3.4.2 設計

**変更内容** (background/index.ts):
```typescript
/**
 * 許可されたoriginのリスト
 */
const ALLOWED_ORIGINS = [
  'https://gemini.google.com',
] as const;

/**
 * Senderの検証
 */
function validateSender(sender: chrome.runtime.MessageSender): boolean {
  // Popupからのメッセージを許可（sender.urlがchrome-extension://で始まる）
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return true;
  }

  // Content Scriptからのメッセージを検証
  if (sender.tab?.url) {
    const url = new URL(sender.tab.url);
    return ALLOWED_ORIGINS.some(origin => url.origin === origin);
  }

  return false;
}

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    // Sender検証
    if (!validateSender(sender)) {
      // セキュリティ: senderの詳細情報は本番ログに出力しない（攻撃者への情報漏洩防止）
      console.warn('[G2O Background] Rejected message from unauthorized sender');
      if (process.env.NODE_ENV === 'development') {
        console.debug('[G2O Background] Sender details:', sender.url, sender.tab?.id);
      }
      sendResponse({ success: false, error: 'Unauthorized' });
      return false;
    }

    // メッセージ内容検証
    if (!validateMessageContent(message)) {
      console.warn('[G2O Background] Invalid message content');
      sendResponse({ success: false, error: 'Invalid message content' });
      return false;
    }

    handleMessage(message)
      .then(sendResponse)
      .catch(error => {
        console.error('[G2O Background] Error handling message:', error);
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true;
  }
);
```

#### 3.4.3 メッセージ内容検証（公式推奨対応）

**公式ドキュメントの警告**:
> "Content scripts are less trustworthy. Assume that messages from a content script might have been crafted by an attacker and make sure to validate and sanitize all input."

**追加設計** (background/index.ts):
```typescript
/**
 * メッセージ内容のバリデーション
 * Content Scriptからのデータは改ざんされている可能性があるため、
 * Sender検証に加えてデータ自体の検証も必要
 */
function validateMessageContent(message: ExtensionMessage): boolean {
  // actionの検証
  // 注意: saveSettingsは存在しない（popupはstorage APIを直接使用）
  // getExistingFileはファイル重複確認に使用
  const validActions = ['getSettings', 'getExistingFile', 'testConnection', 'saveToObsidian'];
  if (!validActions.includes(message.action)) {
    return false;
  }

  // saveToObsidianアクションの詳細検証
  if (message.action === 'saveToObsidian' && message.data) {
    const note = message.data as ObsidianNote;

    // 必須フィールドの存在確認
    if (typeof note.fileName !== 'string' || typeof note.content !== 'string') {
      return false;
    }

    // ファイル名の長さ制限（ファイルシステム制限）
    if (note.fileName.length === 0 || note.fileName.length > 200) {
      return false;
    }

    // コンテンツの最大サイズ制限（DoS防止）
    const MAX_CONTENT_SIZE = 1024 * 1024; // 1MB
    if (note.content.length > MAX_CONTENT_SIZE) {
      return false;
    }

    // frontmatterの検証
    if (note.frontmatter) {
      if (typeof note.frontmatter.title !== 'string' ||
          note.frontmatter.title.length > 500) {
        return false;
      }
      if (typeof note.frontmatter.source !== 'string' ||
          !['gemini', 'claude', 'perplexity'].includes(note.frontmatter.source)) {
        return false;
      }
      if (!Array.isArray(note.frontmatter.tags) ||
          note.frontmatter.tags.length > 50) {
        return false;
      }
    }
  }

  return true;
}
```

**検証項目サマリ**:

| 項目 | 検証内容 | 理由 |
|------|---------|------|
| action | ホワイトリスト | 未知のアクション実行防止 |
| fileName | 長さ1-200文字 | ファイルシステム制限、空ファイル名防止 |
| content | 最大1MB | DoS攻撃防止 |
| title | 最大500文字 | 異常なデータ排除 |
| source | enum値 | 想定外のソース排除 |
| tags | 最大50個 | 異常なデータ排除 |

---

### 3.5 L-01: Promise Constructor アンチパターン解消設計

#### 3.5.1 問題の根拠

**現在の実装** ([content/index.ts:140-184](../src/content/index.ts#L140-L184)):
```typescript
async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as ExtensionSettings);
    });
  });
}
```

**問題点**:
- Promise Constructorでコールバックをラップするアンチパターン
- 3箇所で同じパターンが重複
- エラーハンドリングの一貫性なし

#### 3.5.2 設計

**新規ファイル作成**: `src/lib/messaging.ts`
```typescript
/**
 * Chrome Runtime Messaging ユーティリティ
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type { ExtensionMessage, ExtensionSettings, SaveResponse } from './types';

/**
 * メッセージレスポンスの型マッピング
 */
interface MessageResponseMap {
  getSettings: ExtensionSettings;
  testConnection: { success: boolean; error?: string };
  saveToObsidian: SaveResponse;
}

/**
 * 型安全なメッセージ送信
 *
 * 注意: 実行時の型検証は行わない（Chrome拡張のメッセージングは
 * 同一拡張内で完結するため、型の整合性は開発時に保証される）
 */
export function sendMessage<K extends keyof MessageResponseMap>(
  message: ExtensionMessage & { action: K }
): Promise<MessageResponseMap[K]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Unknown error'));
        return;
      }
      // 同一拡張内のメッセージングでは型安全性が保証される
      resolve(response as MessageResponseMap[K]);
    });
  });
}
```

**content/index.ts の変更**:

**型安全性に関する注意**:
`sendMessage`のジェネリック型パラメータは`MessageResponseMap`のキー（`'getSettings'`等）であり、戻り値の型（`ExtensionSettings`等）ではない。型推論により戻り値は自動的に解決される。

```typescript
import { sendMessage } from '../lib/messaging';

/**
 * Get extension settings from background script
 * 型パラメータ不要: actionから戻り値型が自動推論される
 */
function getSettings(): Promise<ExtensionSettings> {
  return sendMessage({ action: 'getSettings' });
  // 戻り値: Promise<ExtensionSettings> (MessageResponseMap['getSettings']から推論)
}

/**
 * Test connection to Obsidian
 */
function testConnection(): Promise<{ success: boolean; error?: string }> {
  return sendMessage({ action: 'testConnection' });
  // 戻り値: Promise<{ success: boolean; error?: string }> (MessageResponseMap['testConnection']から推論)
}

/**
 * Save note to Obsidian via background script
 */
function saveToObsidian(note: ObsidianNote): Promise<SaveResponse> {
  return sendMessage({ action: 'saveToObsidian', data: note });
  // 戻り値: Promise<SaveResponse> (MessageResponseMap['saveToObsidian']から推論)
}
```

**誤った使用法（避けるべき）**:
```typescript
// ❌ 間違い: ジェネリック型に戻り値の型を指定
sendMessage<ExtensionSettings>({ action: 'getSettings' });

// ✅ 正しい: actionから型推論（明示的な型パラメータ不要）
sendMessage({ action: 'getSettings' });
```

---

### 3.6 L-02: エラー検出改善設計

#### 3.6.1 問題の根拠

**現在の実装** ([obsidian-api.ts:67-70](../src/lib/obsidian-api.ts#L67-L70)):
```typescript
if (error instanceof Error && error.message.includes('Failed to fetch')) {
  throw this.createError(0, 'Obsidian REST API is not running');
}
```

**問題点**:
- 文字列マッチングによる脆弱なエラー検出
- ブラウザ実装によりエラーメッセージが異なる可能性

#### 3.6.2 設計

**変更内容** (obsidian-api.ts):
```typescript
/**
 * ネットワークエラーの判定
 */
function isNetworkError(error: unknown): boolean {
  // TypeError: Failed to fetch (Chrome)
  // TypeError: NetworkError when attempting to fetch resource (Firefox)
  if (error instanceof TypeError) {
    return true;
  }
  // DOMException: The operation was aborted (timeout)
  // 注意: AbortSignal.timeout()はTimeoutError、AbortController.abort()はAbortErrorを投げる
  if (error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true;
  }
  return false;
}

/**
 * Get file content from vault
 */
async getFile(path: string): Promise<string | null> {
  try {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`${this.baseUrl}/vault/${encodedPath}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw this.createError(response.status, `Failed to get file: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    if (isNetworkError(error)) {
      throw this.createError(0, 'Obsidian REST API is not running');
    }
    throw error;
  }
}
```

---

### 3.7 L-03: DOM Ready 検出改善設計

#### 3.7.1 問題の根拠

**現在の実装** ([content/index.ts:38-41](../src/content/index.ts#L38-L41)):
```typescript
setTimeout(() => {
  injectSyncButton(handleSync);
  console.info('[G2O] Sync button injected');
}, 1000);
```

**問題点**:
- 固定1秒遅延は不安定（ページロード速度に依存）
- 遅すぎる場合：ユーザー体験低下
- 早すぎる場合：DOMが準備できていない

#### 3.7.2 設計

**変更内容** (content/index.ts):
```typescript
/**
 * 会話コンテナの出現を待機
 */
function waitForConversationContainer(): Promise<void> {
  return new Promise(resolve => {
    // 既に存在する場合は即座に解決
    const existing = document.querySelector('.conversation-container, [class*="conversation"]');
    if (existing) {
      resolve();
      return;
    }

    // MutationObserverで監視
    const observer = new MutationObserver((mutations, obs) => {
      const container = document.querySelector('.conversation-container, [class*="conversation"]');
      if (container) {
        obs.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // タイムアウト: 10秒後にフォールバック
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 10000);
  });
}

/**
 * Initialize the content script
 */
async function initialize(): Promise<void> {
  console.info('[G2O] Content script initializing on:', window.location.href);

  if (!window.location.hostname.includes('gemini.google.com')) {
    console.info('[G2O] Not a Gemini page, skipping initialization');
    return;
  }

  await waitForConversationContainer();
  injectSyncButton(handleSync);
  console.info('[G2O] Sync button injected');
}
```

---

### 3.8 L-04: 未使用Permission削除設計

#### 3.8.1 問題の根拠

**現在の実装** ([manifest.json:12](../src/manifest.json#L12)):
```json
"permissions": ["storage", "activeTab"]
```

**分析結果**:
- `activeTab`: コード内で未使用
- ホスト名チェックは`window.location.hostname`で直接実行

#### 3.8.2 設計

**変更内容** (manifest.json):
```json
{
  "permissions": ["storage"]
}
```

**理由**:
- 最小権限の原則に従う
- Chrome Web Store審査での不要な権限説明を回避

---

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 対象問題 |
|---------|---------|---------|
| `package.json` | 修正 | C-02 |
| `src/manifest.json` | 修正 | M-01, L-04 |
| `src/lib/storage.ts` | 修正 | C-01 |
| `src/lib/messaging.ts` | 新規作成 | L-01 |
| `src/lib/obsidian-api.ts` | 修正 | L-02 |
| `src/background/index.ts` | 修正 | M-02, C-01 (移行呼び出し) |
| `src/content/index.ts` | 修正 | L-01, L-03 |

---

## 5. 実装順序

依存関係を考慮した実装順序：

```
Phase 1: 基盤 (依存関係なし)
├── 1.1 package.json: Vite更新 (C-02)
├── 1.2 src/lib/messaging.ts: 新規作成 (L-01準備)
└── 1.3 src/lib/obsidian-api.ts: エラー検出改善 (L-02)

Phase 2: ストレージ移行 (Phase 1完了後)
├── 2.1 src/lib/storage.ts: 分離ストレージ実装 (C-01)
└── 2.2 src/background/index.ts: 移行処理追加 (C-01)

Phase 3: セキュリティ強化 (Phase 2完了後)
├── 3.1 src/manifest.json: CSP追加, permission削除 (M-01, L-04)
└── 3.2 src/background/index.ts: Sender検証追加 (M-02)

Phase 4: コード品質 (Phase 3完了後)
├── 4.1 src/content/index.ts: messaging使用, DOM Ready改善 (L-01, L-03)
└── 4.2 テスト実行・検証
```

---

## 6. 検証計画

### 6.1 自動テスト

| テスト種別 | 対象 | ツール |
|-----------|------|--------|
| 依存関係脆弱性 | package.json | `npm audit` |
| TypeScript型チェック | 全ソース | `tsc --noEmit` |
| Linting | 全ソース | `eslint src` |
| ビルド成功 | プロジェクト全体 | `npm run build` |

### 6.2 手動テスト

| テスト項目 | 手順 | 期待結果 |
|-----------|------|---------|
| 新規インストール | 拡張機能をインストール → 設定入力 → 同期実行 | 正常動作 |
| 設定移行 | 旧バージョンから更新 → 設定確認 | API Keyがlocal storageに移行 |
| CSP違反 | DevToolsでCSPエラー確認 | エラーなし |
| 不正メッセージ | 別拡張機能からメッセージ送信試行 | Unauthorizedエラー |
| DOM Ready | 低速ネットワークでページロード | ボタンが正しく表示 |

### 6.3 追加セキュリティテスト (NEW-01〜NEW-06)

| ID | テスト項目 | テスト手順 | 期待結果 |
|----|-----------|-----------|---------|
| T-NEW-01 | XSSサニタイズ | `<script>alert(1)</script>`を含む会話を同期 | scriptタグが除去される |
| T-NEW-01b | イベントハンドラ除去 | `<img onerror="alert(1)">`を含む会話を同期 | onerror属性が除去される |
| T-NEW-02 | パストラバーサル検出 | vaultPathに`../../../etc`を設定 | エラー「path traversal detected」 |
| T-NEW-02b | 正当なファイル名 | ファイル名に`foo..bar.md`を使用 | 正常に保存される |
| T-NEW-03 | calloutType検証 | 無効なcalloutType `MALICIOUS]攻撃`を入力 | デフォルト値にフォールバック |
| T-NEW-03b | APIキー検証 | 15文字のAPIキーを入力 | エラー「API key is too short」 |
| T-NEW-04 | YAML injection | タイトルに`"; malicious: true`を含む会話 | 値がクォートでエスケープされる |
| T-NEW-05 | タイムアウト | Obsidian REST APIを停止して同期 | 5秒後にタイムアウトエラー |
| T-NEW-06 | レート制限 | Syncボタンを連打 | 最初のクリックのみ実行、1秒間ブロック |

### 6.4 セキュリティ回帰テスト

実装後、以下のコマンドで自動テストを実行:

```bash
# XSSペイロードテスト
npm run test:security -- --grep "XSS"

# パストラバーサルテスト
npm run test:security -- --grep "path-traversal"

# 入力バリデーションテスト
npm run test:security -- --grep "validation"
```

---

## 7. ロールバック計画

問題発生時のロールバック手順：

### 7.1 基本ロールバック

1. **バージョン切り戻し**: Git tagから前バージョンをチェックアウト
2. **設定復元**: `chrome.storage.local`のデータは保持される
3. **ユーザー通知**: 拡張機能説明に既知の問題を記載

### 7.2 追加セキュリティ機能のロールバック (NEW-01〜NEW-06)

| 機能 | ロールバック手順 | リスク |
|------|-----------------|--------|
| NEW-01 DOMPurify | package.jsonからdompurify削除、sanitize.ts削除 | XSS脆弱性復活 |
| NEW-02 パストラバーサル | path-utils.ts削除、buildSafePath呼び出し削除 | パストラバーサル脆弱性復活 |
| NEW-03 入力バリデーション | validation.ts削除、バリデーション呼び出し削除 | 入力検証なしに戻る |
| NEW-04 YAMLエスケープ | yaml-utils.ts削除、escapeYaml呼び出し削除 | YAML injection脆弱性復活 |
| NEW-05 タイムアウト | createTimeoutSignal削除、signal引数削除 | 無限待機リスク復活 |
| NEW-06 throttle | throttle関数削除、直接handleSync呼び出し | 連打でAPIスパム可能 |

> ⚠️ **注意**: NEW-01〜NEW-04はセキュリティ上重要な機能のため、ロールバック時は脆弱性が復活することを認識し、代替対策を検討すること。

### 7.3 部分ロールバック判断基準

| 症状 | ロールバック対象 | 代替対応 |
|------|-----------------|---------|
| バンドルサイズ過大 | NEW-01 (DOMPurify) | より軽量なサニタイザー検討 |
| 正当なファイル名がブロック | NEW-02 (パストラバーサル) | 正規表現の調整 |
| APIタイムアウト頻発 | NEW-05 (タイムアウト) | タイムアウト値を延長 |
| Syncボタン反応なし | NEW-06 (throttle) | throttle時間を短縮 |

---

## 8. 追加セキュリティ設計（セキュリティ監査結果による追加）

以下の脆弱性は2026-01-08のセキュリティ監査で発見され、本設計書に追加されました。

### 8.1 NEW-01: HTMLサニタイズ設計 (CRITICAL)

#### 8.1.1 問題の根拠

**現在の実装** ([gemini.ts:222-248](../src/content/extractors/gemini.ts#L222-L248)):
```typescript
private extractModelResponseContent(element: Element): string {
  const markdownEl = element.querySelector('.markdown.markdown-main-panel');
  if (markdownEl) {
    return markdownEl.innerHTML;  // ⚠️ サニタイズなし
  }
  // ...
  return element.innerHTML;  // ⚠️ 完全に未サニタイズ
}
```

**リスク**:
- 悪意あるHTMLがObsidianに保存される
- `<script>`タグやevent handler経由でXSS攻撃可能
- Obsidianでノート表示時にコード実行

#### 8.1.2 設計

**方針**: DOMPurify導入によるHTMLサニタイズ

**依存関係追加** (package.json):
```json
{
  "dependencies": {
    "dompurify": "^3.0.0"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.0"
  }
}
```

**バンドルサイズの考慮**:
- DOMPurify minified: 約25KB（gzip後: 約8KB）
- Content Scriptのロード時間への影響は軽微（<100ms）
- 代替案検討:
  - Trusted Types API: Chrome 83+でサポートだが、既存HTMLのサニタイズには不向き
  - 自前実装: セキュリティライブラリの再発明は推奨されない
- **結論**: DOMPurifyを採用（実績と信頼性を優先）

**新規ユーティリティ** (src/lib/sanitize.ts):

**公式ドキュメントの推奨設定**:
> "USE_PROFILES setting will override the ALLOWED_TAGS setting so don't use them together"

DOMPurifyの`USE_PROFILES: { html: true }`は、デフォルトで安全なHTMLタグと属性のみを許可し、約70個のイベントハンドラ属性（`onclick`, `onerror`, `onload`等）を自動的に除去する。

```typescript
import DOMPurify from 'dompurify';

/**
 * HTMLをサニタイズしてXSS攻撃を防止
 *
 * 設計方針:
 * - USE_PROFILES: { html: true } でデフォルトの安全なHTML許可リストを使用
 * - ALLOWED_ATTRで必要な属性のみ追加許可
 * - FORBID_TAGSでstyleを追加禁止（CSSインジェクション防止）
 *
 * 注意: USE_PROFILESとALLOWED_TAGSは併用不可（公式ドキュメント）
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },  // デフォルトの安全なHTML（SVG/MathML除外）
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],  // 必要な属性のみ
    FORBID_TAGS: ['style'],  // CSSインジェクション防止
    ALLOW_DATA_ATTR: false,  // data-*属性を禁止
  });
}
```

**設定の比較**:

| 設定方式 | メリット | デメリット |
|---------|---------|-----------|
| 旧: ALLOWED_TAGS + FORBID_ATTR | 明示的 | イベントハンドラ漏れリスク（約70個中4個のみ指定） |
| 新: USE_PROFILES | 包括的、メンテナンス不要 | 許可タグがデフォルトに依存 |

**USE_PROFILES: { html: true } が自動除去するもの**:
- `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>` 等の危険なタグ
- 全てのイベントハンドラ属性（`onclick`, `onerror`, `onload`, `onfocus`, `onblur`, `onchange` 等約70種）
- `javascript:`, `vbscript:`, `data:` 等の危険なURIスキーム
- 無効なURLプロトコル

**javascript: URI除去の動作例**:
```typescript
// 入力: 悪意あるjavascript:リンク
sanitizeHtml('<a href="javascript:alert(document.cookie)">Click me</a>');
// 出力: <a>Click me</a>
// → href属性が完全に除去される（空のhref=""ではなく属性自体が消える）

// 入力: vbscript:も同様に除去
sanitizeHtml('<a href="vbscript:msgbox(1)">Click</a>');
// 出力: <a>Click</a>

// 入力: 正当なHTTPリンクは保持
sanitizeHtml('<a href="https://example.com">Link</a>');
// 出力: <a href="https://example.com">Link</a>
```

> **セキュリティ保証**: DOMPurifyはデフォルトでjavascript:, vbscript:, data:（画像以外）などの危険なURIスキームを検出・除去する。追加の設定は不要。

**gemini.ts の変更**:
```typescript
import { sanitizeHtml } from '../lib/sanitize';

private extractModelResponseContent(element: Element): string {
  const markdownEl = element.querySelector('.markdown.markdown-main-panel');
  if (markdownEl) {
    return sanitizeHtml(markdownEl.innerHTML);  // ✅ サニタイズ済み
  }
  // ... 他のフォールバックも同様にサニタイズ
  return sanitizeHtml(element.innerHTML);
}
```

---

### 8.2 NEW-02: パストラバーサル防止設計 (CRITICAL)

#### 8.2.1 問題の根拠

**現在の実装** ([background/index.ts:68-70](../src/background/index.ts#L68-L70)):
```typescript
const fullPath = settings.vaultPath
  ? `${settings.vaultPath}/${note.fileName}`
  : note.fileName;
```

**リスク**:
- `fileName: "../../sensitive/file.md"` でvault外アクセス
- `vaultPath: "../../../"` で任意ディレクトリアクセス

#### 8.2.2 設計

**新規ユーティリティ** (src/lib/path-utils.ts):
```typescript
/**
 * パストラバーサル攻撃の検出
 *
 * 注意: 単純な path.includes('..') は foo..bar のような
 * 正当なファイル名を誤検出するため、より正確な正規表現を使用
 */
export function containsPathTraversal(path: string): boolean {
  // ../ または ..\ を検出（パス区切り文字と組み合わさった場合のみ）
  // ^.. : 先頭の..
  // /.. or \.. : パス区切り後の..
  // ../ or ..\ : ..の後にパス区切り
  // ..$ : 末尾の..
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path)) return true;
  // 絶対パスを検出
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return true;
  // URLエンコードされた .. を検出（パス区切りと組み合わせ）
  if (/(?:^|%2f|%5c)%2e%2e(?:%2f|%5c|$)/i.test(path)) return true;
  return false;
}

/**
 * パスを正規化してバリデーション
 */
export function validatePath(path: string, fieldName: string): string {
  if (containsPathTraversal(path)) {
    throw new Error(`Invalid ${fieldName}: path traversal detected`);
  }
  // 前後の空白とスラッシュを正規化
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 安全なファイルパスを構築
 */
export function buildSafePath(vaultPath: string, fileName: string): string {
  const safePath = validatePath(vaultPath, 'vaultPath');
  const safeFileName = validatePath(fileName, 'fileName');
  return safePath ? `${safePath}/${safeFileName}` : safeFileName;
}
```

**background/index.ts の変更**:
```typescript
import { buildSafePath } from '../lib/path-utils';

// handleSave内
const fullPath = buildSafePath(settings.vaultPath, note.fileName);
```

---

### 8.3 NEW-03: 入力バリデーション設計 (HIGH)

#### 8.3.1 問題の根拠

**現在の実装** ([popup/index.ts:81-99](../src/popup/index.ts#L81-L99)):
```typescript
userCalloutType: elements.userCallout.value || 'QUESTION',  // バリデーションなし
vaultPath: elements.vaultPath.value.trim(),  // バリデーションなし
```

**リスク**:
- calloutTypeに任意文字列でMarkdown injection
- vaultPathにパストラバーサル文字

#### 8.3.2 設計

**新規ユーティリティ** (src/lib/validation.ts):
```typescript
import { containsPathTraversal } from './path-utils';

/**
 * 許可されたcalloutタイプ
 */
export const ALLOWED_CALLOUT_TYPES = [
  'NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION',
  'ABSTRACT', 'SUMMARY', 'TLDR',
  'INFO', 'TODO',
  'SUCCESS', 'CHECK', 'DONE',
  'QUESTION', 'HELP', 'FAQ',
  'FAILURE', 'FAIL', 'MISSING',
  'DANGER', 'ERROR',
  'BUG',
  'EXAMPLE',
  'QUOTE', 'CITE',
] as const;

export type CalloutType = typeof ALLOWED_CALLOUT_TYPES[number];

/**
 * calloutタイプのバリデーション
 */
export function validateCalloutType(type: string, defaultType: CalloutType): CalloutType {
  const normalized = type.toUpperCase().trim();
  if (ALLOWED_CALLOUT_TYPES.includes(normalized as CalloutType)) {
    return normalized as CalloutType;
  }
  console.warn(`[G2O] Invalid callout type "${type}", using default "${defaultType}"`);
  return defaultType;
}

/**
 * vaultPathのバリデーション
 */
export function validateVaultPath(path: string): string {
  // 空は許可（ルートに保存）
  if (!path.trim()) return '';

  // パストラバーサルチェック
  if (containsPathTraversal(path)) {
    throw new Error('Vault path contains invalid characters');
  }

  // 長さ制限（ファイルシステム制限）
  if (path.length > 200) {
    throw new Error('Vault path is too long (max 200 characters)');
  }

  return path.trim();
}

/**
 * APIキーのバリデーション
 * Obsidian REST API の実装に準拠:
 * - SHA-256ハッシュの16進数文字列（64文字）
 * - フォーマット: [0-9a-fA-F]{64}
 */
export function validateApiKey(key: string): string {
  const trimmed = key.trim();

  // 空チェック
  if (!trimmed) {
    throw new Error('API key is required');
  }

  // Obsidian REST API は SHA-256 ハッシュ（64文字の16進数）を生成
  // ただし、ユーザーが手動で設定した場合も考慮して柔軟に対応
  if (trimmed.length !== 64) {
    console.warn(`[G2O] API key length is ${trimmed.length}, expected 64 (SHA-256 hex)`);
  }

  // 16進数形式のバリデーション（警告のみ、ブロックしない）
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    console.warn('[G2O] API key contains non-hexadecimal characters');
  }

  // 最低限の長さチェック（セキュリティ上の理由）
  if (trimmed.length < 16) {
    throw new Error('API key is too short (minimum 16 characters for security)');
  }

  return trimmed;
}
```

**popup/index.ts の変更**:
```typescript
import { validateCalloutType, validateVaultPath, validateApiKey } from '../lib/validation';

function collectSettings(): ExtensionSettings {
  const templateOptions: TemplateOptions = {
    messageFormat: elements.messageFormat.value as 'callout' | 'plain' | 'blockquote',
    userCalloutType: validateCalloutType(elements.userCallout.value, 'QUESTION'),
    assistantCalloutType: validateCalloutType(elements.assistantCallout.value, 'NOTE'),
    // ...
  };

  return {
    obsidianApiKey: validateApiKey(elements.apiKey.value),
    obsidianPort: parseInt(elements.port.value, 10) || 27123,
    vaultPath: validateVaultPath(elements.vaultPath.value),
    templateOptions,
  };
}
```

---

### 8.4 NEW-04: YAML安全化設計 (HIGH)

#### 8.4.1 問題の根拠

**現在の実装** ([background/index.ts:152-197](../src/background/index.ts#L152-L197)):
```typescript
lines.push(`source: ${note.frontmatter.source}`);  // エスケープなし
lines.push(`url: ${note.frontmatter.url}`);        // エスケープなし
for (const tag of note.frontmatter.tags) {
  lines.push(`  - ${tag}`);  // エスケープなし
}
```

**リスク**:
- YAML injection: `source: gemini"; malicious: true`
- タグ経由の攻撃: `  - tag"; rm -rf /`

#### 8.4.2 設計

**新規ユーティリティ** (src/lib/yaml-utils.ts):
```typescript
/**
 * YAML文字列値をエスケープ
 * YAML 1.2仕様に準拠し、特殊文字を含む場合はダブルクォートで囲む
 *
 * 対応する特殊文字:
 * - YAML構文文字: : [ ] { } # & * ! | > ' " % @ `
 * - 制御文字: \n \r \t
 * - Unicode行終端: U+0085 (NEL), U+2028 (LS), U+2029 (PS)
 * - 予約語: null, true, false, ~
 */
export function escapeYamlValue(value: string): string {
  // 特殊文字を含む場合はクォートが必要
  const needsQuotes = /[:\[\]{}#&*!|>'"%@`\n\r\t\u0085\u2028\u2029]/.test(value) ||
                      value.startsWith(' ') ||
                      value.endsWith(' ') ||
                      value === '' ||
                      /^(null|true|false|~|yes|no|on|off)$/i.test(value) ||
                      /^[0-9.+-]/.test(value);  // 数値として解釈される可能性

  if (!needsQuotes) {
    return value;
  }

  // ダブルクォートでエスケープ
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u0085/g, '\\N')      // NEL (Next Line)
    .replace(/\u2028/g, '\\L')      // LS (Line Separator)
    .replace(/\u2029/g, '\\P');     // PS (Paragraph Separator)

  return `"${escaped}"`;
}

/**
 * YAMLリスト項目をエスケープ
 */
export function escapeYamlListItem(value: string): string {
  return escapeYamlValue(value);
}
```

**background/index.ts の変更**:
```typescript
import { escapeYamlValue, escapeYamlListItem } from '../lib/yaml-utils';

function generateNoteContent(note: ObsidianNote, settings: ExtensionSettings): string {
  // ...
  if (templateOptions.includeSource) {
    lines.push(`source: ${escapeYamlValue(note.frontmatter.source)}`);
    lines.push(`url: ${escapeYamlValue(note.frontmatter.url)}`);
  }

  if (templateOptions.includeTags && note.frontmatter.tags.length > 0) {
    lines.push('tags:');
    for (const tag of note.frontmatter.tags) {
      lines.push(`  - ${escapeYamlListItem(tag)}`);
    }
  }
  // ...
}
```

---

### 8.5 NEW-05: リクエストタイムアウト設計 (MEDIUM)

#### 8.5.1 問題の根拠

**現在の実装**: fetchにタイムアウトなし

**リスク**: ネットワーク問題時に無限待機

#### 8.5.2 設計

**ブラウザ互換性**:
- `AbortSignal.timeout()` は Chrome 103+ でサポート
- manifest.jsonに `minimum_chrome_version` を追加して明示

**manifest.json への追加**:
```json
{
  "minimum_chrome_version": "103"
}
```

**obsidian-api.ts の変更**:
```typescript
/**
 * デフォルトタイムアウト（5秒）
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * タイムアウト付きAbortSignalを作成
 * AbortSignal.timeout()のポリフィル（Chrome 103未満対応）
 *
 * メモリリーク対策:
 * - fetchが完了した場合、setTimeoutが残り続ける可能性がある
 * - 本実装ではfetchの完了/失敗に関わらずタイマーは5秒後に発火するが、
 *   controllerはGCで回収されるためメモリリークは発生しない
 * - より厳密な対策が必要な場合は、clearTimeoutとの連携が必要
 */
function createTimeoutSignal(ms: number): AbortSignal {
  // Chrome 103+ではネイティブAPIを使用
  if ('timeout' in AbortSignal) {
    return AbortSignal.timeout(ms);
  }
  // フォールバック（Chrome 103未満用）
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  // signal.addEventListener('abort')でクリーンアップする方法もあるが、
  // ネイティブAbortSignal.timeout()には対応するAPIがないため、
  // 統一的な動作のために省略
  // 参考: タイマーは5秒後にGCされる短命オブジェクトのため影響は軽微

  return controller.signal;
}

/**
 * より厳密なメモリリーク対策が必要な場合の代替実装
 * （複雑化するため、現時点では非推奨）
 */
/*
function createTimeoutSignalWithCleanup(ms: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  if ('timeout' in AbortSignal) {
    return { signal: AbortSignal.timeout(ms), cleanup: () => {} };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}
*/

async getFile(path: string): Promise<string | null> {
  try {
    const encodedPath = encodeURIComponent(path);
    const response = await fetch(`${this.baseUrl}/vault/${encodedPath}`, {
      method: 'GET',
      headers: this.getHeaders(),
      signal: createTimeoutSignal(DEFAULT_TIMEOUT),  // ✅ タイムアウト追加
    });
    // ...
  } catch (error) {
    // isNetworkError()を使用して一貫したエラー判定
    // （セクション3.6.2で定義済み）
    if (isNetworkError(error)) {
      throw this.createError(0, 'Request timed out. Please check your connection.');
    }
    // ...
  }
}
```

---

### 8.6 NEW-06: レート制限設計 (MEDIUM)

#### 8.6.1 問題の根拠

**現在の実装**: Syncボタンに制限なし

**リスク**: 連打でAPIスパム

#### 8.6.2 設計

**方針**: throttle（最初の呼び出しを即座に実行し、その後一定期間ブロック）を使用

> **注意**: debounceは「最後の呼び出しから一定時間後に実行」するため、連打すると永遠に実行されない可能性がある。レート制限にはthrottleが適切。

**content/index.ts の変更**:
```typescript
/**
 * throttle関数
 * 最初の呼び出しを即座に実行し、その後limit期間は呼び出しをブロック
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Syncボタンのハンドラにthrottle適用（1秒間隔で最大1回実行）
const throttledHandleSync = throttle(handleSync, 1000);
injectSyncButton(throttledHandleSync);
```

> ⚠️ **async関数との組み合わせに関する注意**:
>
> `handleSync`がasync関数の場合、上記の単純なthrottle実装には以下の課題がある:
> 1. **エラーの握りつぶし**: `fn(...args)`がPromiseを返しても、そのreject/catchを処理しないためエラーが無視される
> 2. **実行完了の追跡不可**: Promiseの完了を待たないため、ユーザーへのフィードバック（ローディング状態等）が困難
>
> **推奨実装** (async対応版):
> ```typescript
> const throttledHandleSync = throttle(async () => {
>   try {
>     setButtonLoading(true);  // ローディング表示
>     await handleSync();
>   } catch (error) {
>     showErrorNotification(getErrorMessage(error));
>   } finally {
>     setButtonLoading(false);  // ローディング解除
>   }
> }, 1000);
> ```
>
> または、throttle関数自体をasync対応にする方法もあるが、複雑化するため上記のラッパー方式を推奨。

---

## 9. 更新された変更ファイル一覧

| ファイル | 変更種別 | 対象問題 |
|---------|---------|---------|
| `package.json` | 修正 | C-02, NEW-01 (DOMPurify追加) |
| `src/manifest.json` | 修正 | M-01, L-04 |
| `src/lib/storage.ts` | 修正 | C-01 |
| `src/lib/messaging.ts` | 新規作成 | L-01 |
| `src/lib/sanitize.ts` | 新規作成 | NEW-01 |
| `src/lib/path-utils.ts` | 新規作成 | NEW-02 |
| `src/lib/validation.ts` | 新規作成 | NEW-03 |
| `src/lib/yaml-utils.ts` | 新規作成 | NEW-04 |
| `src/lib/obsidian-api.ts` | 修正 | L-02, NEW-05 |
| `src/background/index.ts` | 修正 | M-02, C-01, NEW-02, NEW-04 |
| `src/content/index.ts` | 修正 | L-01, L-03, NEW-06 |
| `src/content/extractors/gemini.ts` | 修正 | NEW-01 |
| `src/popup/index.ts` | 修正 | NEW-03 |

---

## 10. 更新された実装順序

> **注意**: `background/index.ts`はPhase 2とPhase 3で修正が発生する。競合を避けるため、Phase 2完了後にコミットしてからPhase 3に進むこと。

```
Phase 1: 基盤 (依存関係なし)
├── 1.1 package.json: Vite更新, DOMPurify追加 (C-02, NEW-01)
├── 1.2 src/lib/messaging.ts: 新規作成 (L-01準備)
├── 1.3 src/lib/sanitize.ts: 新規作成 (NEW-01)
├── 1.4 src/lib/path-utils.ts: 新規作成 (NEW-02)
├── 1.5 src/lib/validation.ts: 新規作成 (NEW-03) ※path-utils.tsに依存
├── 1.6 src/lib/yaml-utils.ts: 新規作成 (NEW-04)
└── 1.7 src/lib/obsidian-api.ts: エラー検出改善, タイムアウト (L-02, NEW-05)
→ コミット: "feat: add security utility libraries"

Phase 2: ストレージ移行 (Phase 1完了後)
├── 2.1 src/lib/storage.ts: 分離ストレージ実装 (C-01)
└── 2.2 src/background/index.ts: 移行処理追加 (C-01) ⚠️ background初回修正
→ コミット: "feat: migrate API key to local storage"

Phase 3: セキュリティ強化 (Phase 2完了後)
├── 3.1 src/manifest.json: CSP追加, permission削除, minimum_chrome_version (M-01, L-04, NEW-05)
├── 3.2 src/background/index.ts: Sender検証, YAML安全化, パス検証 (M-02, NEW-02, NEW-04) ⚠️ background2回目修正
├── 3.3 src/content/extractors/gemini.ts: HTMLサニタイズ (NEW-01)
└── 3.4 src/popup/index.ts: 入力バリデーション (NEW-03)
→ コミット: "feat: add security hardening"

Phase 4: コード品質 (Phase 3完了後)
├── 4.1 src/content/index.ts: messaging使用, DOM Ready改善, throttle (L-01, L-03, NEW-06)
└── 4.2 テスト実行・検証
→ コミット: "refactor: improve code quality and add rate limiting"
```

### 10.1 ファイル依存関係

```
path-utils.ts
    ↑
validation.ts (import containsPathTraversal)

messaging.ts ← types.ts (import ExtensionMessage, ExtensionSettings, SaveResponse)

sanitize.ts ← dompurify (external)
```

---

## 11. 付録: 型定義追加

### 11.1 src/lib/types.ts への追加

```typescript
/**
 * セキュア設定（local storage用）
 */
export interface SecureSettings {
  obsidianApiKey: string;
}

/**
 * 同期設定（sync storage用）
 */
export interface SyncSettings {
  obsidianPort: number;
  vaultPath: string;
  templateOptions: TemplateOptions;
}
```

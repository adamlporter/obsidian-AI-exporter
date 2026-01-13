# 設定画面UI改善 設計書

## 1. 概要

| 項目 | 内容 |
|------|------|
| プロジェクト | gemini2obsidian |
| 対象 | Chrome拡張機能ポップアップ設定画面 |
| 変更種別 | UI/UX改善 + バグ修正 |

### 1.1 要件一覧

| ID | 要件 | 優先度 |
|----|------|--------|
| REQ-01 | システムテーマ（dark/light）に連動した配色 | 高 |
| REQ-02 | API Key表示/非表示トグルと説明文の被り解消 | 高 |
| REQ-03 | ヘッダーアイコンをPNG画像に変更 | 中 |
| REQ-04 | Test ConnectionでAPI Key認証を検証 | 高 |

---

## 2. 現状分析

### 2.1 ファイル構成

```
src/popup/
├── index.html      # ポップアップHTML
├── styles.css      # スタイルシート
└── index.ts        # イベントハンドラ

src/lib/
└── obsidian-api.ts # Obsidian REST APIクライアント

src/background/
└── index.ts        # Service Worker

public/icons/
├── icon16.png
├── icon24.png
├── icon32.png
├── icon48.png      # ← ヘッダーで使用予定
├── icon72.png
├── icon96.png
└── icon128.png
```

### 2.2 現在の問題点

#### 問題1: ダークテーマ固定
```css
/* 現在の styles.css */
:root {
  --bg-primary: #1a1a2e;    /* 濃い青 - ダーク固定 */
  --bg-secondary: #16213e;
  --text-primary: #e8e8e8;  /* 明るい文字 */
}
```

#### 問題2: トグルボタンと説明文の被り
- `setupApiKeyToggle()` が動的にトグルボタンを追加
- `position: absolute` で配置
- `.help` テキストとの位置関係が不明確

#### 問題3: 絵文字アイコン使用
```html
<span class="logo">📥</span>  <!-- 絵文字 -->
```

#### 問題4: 認証不要エンドポイントでテスト
```typescript
// 現在の testConnection()
const response = await fetch(`${this.baseUrl}/`, {  // "/" は認証不要
  method: 'GET',
  headers: this.getHeaders(),
});
return response.ok;  // 間違ったAPI Keyでも true になる
```

---

## 3. 設計

### 3.1 REQ-01: システムテーマ対応

#### 3.1.1 CSS変数の再構成

**ファイル**: `src/popup/styles.css`

```css
/* ライトテーマ（デフォルト） */
:root {
  /* 背景色 */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #e9ecef;

  /* テキスト色 */
  --text-primary: #212529;
  --text-secondary: #6c757d;

  /* アクセント色 */
  --accent-primary: #7c3aed;
  --accent-secondary: #5b21b6;

  /* ステータス色 */
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;

  /* ボーダー・シャドウ */
  --border: rgba(0, 0, 0, 0.1);
  --shadow: rgba(0, 0, 0, 0.1);
}

/* ダークテーマ */
@media (prefers-color-scheme: dark) {
  :root {
    /* 背景色 */
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --bg-tertiary: #0f3460;

    /* テキスト色 */
    --text-primary: #e8e8e8;
    --text-secondary: #a0a0a0;

    /* アクセント色（維持） */
    --accent-primary: #7c3aed;
    --accent-secondary: #5b21b6;

    /* ステータス色（維持） */
    --success: #10b981;
    --error: #ef4444;
    --warning: #f59e0b;

    /* ボーダー・シャドウ */
    --border: rgba(255, 255, 255, 0.1);
    --shadow: rgba(0, 0, 0, 0.3);
  }
}
```

#### 3.1.2 ヘッダーグラデーション調整

```css
/* ライトモード用 */
.header {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
}
```

---

### 3.2 REQ-02: API Key説明文の配置修正

#### 3.2.1 HTML構造変更

**ファイル**: `src/popup/index.html`

```html
<!-- 変更前 -->
<div class="form-group">
  <label for="apiKey">Obsidian API Key</label>
  <input type="password" id="apiKey" ... />
  <p class="help">From Obsidian → Settings → Local REST API</p>
</div>

<!-- 変更後 -->
<div class="form-group">
  <label for="apiKey" data-i18n="settings_apiKey">Obsidian API Key</label>
  <div class="api-key-wrapper">
    <input type="password" id="apiKey" ... />
    <!-- トグルボタンはJSで追加 -->
  </div>
  <p class="help" data-i18n="settings_apiKeyHelp">From Obsidian → Settings → Local REST API</p>
</div>
```

#### 3.2.2 CSS調整

**ファイル**: `src/popup/styles.css`

```css
/* API Key入力コンテナ */
.api-key-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.api-key-wrapper input {
  flex: 1;
  padding-right: 40px;  /* トグルボタン用スペース */
}

.api-key-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 16px;
  color: var(--text-secondary);
  transition: color 0.2s;
}

.api-key-toggle:hover {
  color: var(--text-primary);
}

/* 説明文は入力欄の下に明確に配置 */
.form-group .help {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}
```

#### 3.2.3 TypeScript修正

**ファイル**: `src/popup/index.ts`

```typescript
function setupApiKeyToggle(): void {
  const apiKeyInput = elements.apiKey;

  // 親の.form-groupではなく、.api-key-wrapperを探す
  const wrapper = apiKeyInput.closest('.api-key-wrapper');
  if (!wrapper) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'api-key-toggle';
  toggleBtn.textContent = '👁️';
  toggleBtn.title = getMessage('settings_showApiKey');

  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '🙈';
      toggleBtn.title = getMessage('settings_hideApiKey');
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁️';
      toggleBtn.title = getMessage('settings_showApiKey');
    }
  });

  wrapper.appendChild(toggleBtn);
}
```

---

### 3.3 REQ-03: ヘッダーアイコン変更

#### 3.3.1 パス考慮事項

CRXJSは`public/icons/`を`dist/icons/`にコピーする。
`manifest.json`では`"icons/icon16.png"`のように相対パス指定。
ポップアップHTMLからも同様に**相対パス**`icons/icon24.png`で参照する。

#### 3.3.2 サイズ考慮事項

現在のCSS: `.logo { font-size: 24px; }`
→ 24x24pxの`icon24.png`を使用するのが妥当。

#### 3.3.3 HTML変更

**ファイル**: `src/popup/index.html`

```html
<!-- 変更前 -->
<h1>
  <span class="logo">📥</span>
  <span data-i18n="extName">Obsidian AI Exporter</span>
</h1>

<!-- 変更後 -->
<h1>
  <img src="icons/icon24.png" alt="" class="logo" width="24" height="24" />
  <span data-i18n="extName">Obsidian AI Exporter</span>
</h1>
```

#### 3.3.4 CSS変更

**ファイル**: `src/popup/styles.css`

```css
/* 変更前 */
.header .logo {
  font-size: 24px;
}

/* 変更後 */
.header .logo {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
```

---

### 3.4 REQ-04: Test Connection API Key検証

#### 3.4.1 API戻り値型定義

**ファイル**: `src/lib/obsidian-api.ts`

```typescript
/**
 * Connection test result
 */
export interface ConnectionTestResult {
  /** サーバーに到達できたか */
  reachable: boolean;
  /** API Keyが正しいか（認証成功） */
  authenticated: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
}
```

#### 3.4.2 testConnection メソッド修正

**ファイル**: `src/lib/obsidian-api.ts`

```typescript
/**
 * Test API connection with authentication verification
 *
 * Uses /vault/ endpoint which requires authentication.
 * This ensures the API key is validated, not just server reachability.
 */
async testConnection(): Promise<ConnectionTestResult> {
  try {
    const response = await fetch(`${this.baseUrl}/vault/`, {
      method: 'GET',
      headers: this.getHeaders(),
      signal: createTimeoutSignal(DEFAULT_API_TIMEOUT),
    });

    // 認証エラー
    if (response.status === 401 || response.status === 403) {
      return {
        reachable: true,
        authenticated: false,
        error: 'Invalid API key',
      };
    }

    // その他のエラー
    if (!response.ok) {
      return {
        reachable: true,
        authenticated: false,
        error: `Server error: ${response.status}`,
      };
    }

    // 成功
    return {
      reachable: true,
      authenticated: true,
    };
  } catch (error) {
    // ネットワークエラー
    const errorType = classifyNetworkError(error);
    return {
      reachable: false,
      authenticated: false,
      error: errorType === 'timeout'
        ? 'Connection timed out'
        : 'Cannot reach Obsidian. Is it running?',
    };
  }
}
```

#### 3.4.3 handleTestConnection 修正

**ファイル**: `src/background/index.ts`

```typescript
/**
 * Test connection to Obsidian REST API
 */
async function handleTestConnection(
  settings: ExtensionSettings
): Promise<{ success: boolean; error?: string }> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);
  const result = await client.testConnection();

  if (!result.reachable) {
    return {
      success: false,
      error: result.error || 'Cannot reach Obsidian. Is it running?'
    };
  }

  if (!result.authenticated) {
    return {
      success: false,
      error: result.error || 'Invalid API key. Please check your settings.'
    };
  }

  return { success: true };
}
```

---

## 4. 変更ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|----------|----------|----------|
| `src/popup/styles.css` | 修正 | テーマ対応CSS変数、api-key-wrapper、logo |
| `src/popup/index.html` | 修正 | api-key-wrapper追加、imgタグに変更 |
| `src/popup/index.ts` | 修正 | setupApiKeyToggle()のコンテナ参照 |
| `src/lib/obsidian-api.ts` | 修正 | testConnection()の認証検証追加、戻り値型変更 |
| `src/background/index.ts` | 修正 | handleTestConnection()のレスポンス処理 |
| `test/lib/obsidian-api.test.ts` | 修正 | testConnection()の戻り値型変更に対応 |
| `test/background/index.test.ts` | 修正 | mockClient.testConnection の戻り値変更に対応 |

---

## 5. テスト計画

### 5.1 テーマ切替テスト

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | macOS設定で「外観」をライトに | ポップアップ背景が白(#ffffff) |
| 2 | macOS設定で「外観」をダークに | ポップアップ背景が濃い青(#1a1a2e) |
| 3 | Windows設定でライト/ダーク切替 | 同様に連動 |

### 5.2 API Key UI テスト

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | ポップアップを開く | 説明文がAPI Key入力欄の下に表示 |
| 2 | 👁️ボタンをクリック | パスワード表示、アイコンが🙈に変化 |
| 3 | 🙈ボタンをクリック | パスワード非表示、アイコンが👁️に戻る |

### 5.3 アイコン表示テスト

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | ポップアップを開く | 左上にPNGアイコン(24x24)が表示 |

### 5.4 接続テスト

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | 正しいAPI Keyで「Test Connection」 | 「Connection successful」 |
| 2 | 間違ったAPI Keyで「Test Connection」 | 「Invalid API key...」エラー |
| 3 | Obsidian未起動で「Test Connection」 | 「Cannot reach Obsidian...」エラー |

---

## 6. テストコードへの影響

### 6.1 test/lib/obsidian-api.test.ts

**変更理由**: `testConnection()`の戻り値が`boolean`から`ConnectionTestResult`に変更

```typescript
// 変更前
it('returns true when connection succeeds', async () => {
  mockFetch.mockResolvedValue({ ok: true });
  const result = await client.testConnection();
  expect(result).toBe(true);
});

// 変更後
it('returns success when connection and auth succeed', async () => {
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
  const result = await client.testConnection();
  expect(result).toEqual({ reachable: true, authenticated: true });
});

it('returns auth failure for 401 status', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 401 });
  const result = await client.testConnection();
  expect(result).toEqual({
    reachable: true,
    authenticated: false,
    error: 'Invalid API key',
  });
});
```

### 6.2 test/background/index.test.ts

**変更理由**: `mockClient.testConnection`の戻り値型変更

```typescript
// 変更前
mockClient.testConnection.mockResolvedValue(true);
// ...
mockClient.testConnection.mockResolvedValue(false);

// 変更後
mockClient.testConnection.mockResolvedValue({ reachable: true, authenticated: true });
// ...
mockClient.testConnection.mockResolvedValue({ reachable: true, authenticated: false, error: 'Invalid API key' });
mockClient.testConnection.mockResolvedValue({ reachable: false, authenticated: false, error: 'Cannot reach Obsidian. Is it running?' });
```

---

## 7. 実装順序

```
1. src/lib/obsidian-api.ts         ← API Key検証（機能修正 + 型追加）
2. test/lib/obsidian-api.test.ts   ← テスト修正
3. src/background/index.ts         ← レスポンス処理
4. test/background/index.test.ts   ← テスト修正
5. src/popup/styles.css            ← テーマ対応 + レイアウト
6. src/popup/index.html            ← HTML構造変更
7. src/popup/index.ts              ← トグル参照修正
```

---

## 8. 実装ワークフロー

### 8.1 公式ドキュメント参照

| 技術 | ソース | 確認内容 |
|------|--------|----------|
| CSS prefers-color-scheme | [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) | `@media (prefers-color-scheme: dark) {}` で条件分岐 |
| Chrome Extension Popup | [developer.chrome.com](https://developer.chrome.com/docs/extensions/develop/ui/add-popup) | 相対パス `icons/icon24.png` で参照 |
| Vitest Mock | [vitest.dev](https://vitest.dev/api/mock.html) | `mockResolvedValue()` で戻り値型変更可 |
| Obsidian REST API | [GitHub](https://coddingtonbear.github.io/obsidian-local-rest-api/) | `/vault/` は Bearer認証必須 |

### 8.2 依存関係グラフ

```
ConnectionTestResult (型定義)
    ↓
testConnection() (実装変更)
    ↓
test/lib/obsidian-api.test.ts (テスト修正)
    ↓
handleTestConnection() (呼び出し元修正)
    ↓
test/background/index.test.ts (テスト修正)

[独立ブランチ - 並列実行可能]
styles.css → index.html → index.ts
```

### 8.3 実装ステップ

#### Step 1: API型定義と実装
**ファイル**: `src/lib/obsidian-api.ts`
**変更内容**:
1. `ConnectionTestResult` インターフェース追加 (export)
2. `testConnection()` メソッドの戻り値型を `ConnectionTestResult` に変更
3. エンドポイントを `/` → `/vault/` に変更
4. 401/403ステータスの検出ロジック追加

**検証**:
```bash
npm run build  # TypeScriptコンパイルエラーなし（この時点ではテスト失敗OK）
```

#### Step 2: APIテスト修正
**ファイル**: `test/lib/obsidian-api.test.ts`
**変更内容**:
1. `testConnection` テストの期待値を `boolean` → `ConnectionTestResult` に
2. URL検証を `http://127.0.0.1:27123/` → `http://127.0.0.1:27123/vault/` に
3. 401/403シナリオのテストケース追加

**検証**:
```bash
npm run test:unit -- test/lib/obsidian-api.test.ts
```

#### Step 3: Background処理修正
**ファイル**: `src/background/index.ts`
**変更内容**:
1. `handleTestConnection()` で `ConnectionTestResult` を解釈
2. `reachable` / `authenticated` に基づくレスポンス生成

**検証**:
```bash
npm run build  # コンパイルエラーなし
```

#### Step 4: Backgroundテスト修正
**ファイル**: `test/background/index.test.ts`
**変更内容**:
1. `mockClient.testConnection` の戻り値を `ConnectionTestResult` 形式に
2. 認証成功/失敗/到達不可の3パターンテスト

**検証**:
```bash
npm run test:unit -- test/background/index.test.ts
npm run test:unit  # 全テスト通過
```

#### Step 5: CSSテーマ対応
**ファイル**: `src/popup/styles.css`
**変更内容**:
1. `:root` をライトテーマ値に変更
2. `@media (prefers-color-scheme: dark)` ブロック追加
3. `.api-key-wrapper` クラス追加
4. `.header .logo` を `width: 24px; height: 24px;` に変更

**検証**:
```bash
npm run build  # ビルド成功
```

#### Step 6: HTML構造変更
**ファイル**: `src/popup/index.html`
**変更内容**:
1. API Key入力を `<div class="api-key-wrapper">` でラップ
2. ヘッダーロゴを `<img src="icons/icon24.png" ...>` に変更

**検証**:
```bash
npm run build  # ビルド成功
```

#### Step 7: TypeScript参照修正
**ファイル**: `src/popup/index.ts`
**変更内容**:
1. `setupApiKeyToggle()` の参照先を `.api-key-wrapper` に変更

**検証**:
```bash
npm run build  # ビルド成功
npm run test:unit  # 全テスト通過
```

### 8.4 最終検証

```bash
# 1. 全テスト実行
npm run test:unit

# 2. ビルド
npm run build

# 3. 手動検証
# - Chrome拡張をロード (chrome://extensions)
# - ポップアップを開いてUI確認
# - システムテーマ切替でダーク/ライト確認
# - 正しいAPI Keyで接続テスト → 成功
# - 間違ったAPI Keyで接続テスト → エラー
```

---

## 9. 承認

このワークフローで実装を進めてよろしいでしょうか？

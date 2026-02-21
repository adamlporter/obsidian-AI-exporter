# Requirements Specification: Popup Redesign & Issues #46, #47

## Overview

3つの変更を1つのリリースとして実施する:

1. **Issue #46**: Vault path テンプレート変数 `{platform}` サポート
2. **Issue #47**: Gemini タイトル抽出に `document.title` フォールバック追加
3. **Popup UI リデザイン**: トグルスイッチ化 + Advanced Settings 折りたたみ

---

## 1. Issue #46: Vault Path テンプレート変数

### 機能要件

- F-46-1: `{platform}` テンプレート変数を vault path で使用可能にする
  - 解決タイミング: `handleSave()` 時（保存直前）
  - 解決値: `note.frontmatter.source` の値（`gemini`, `claude`, `chatgpt`, `perplexity`）
- F-46-2: デフォルト vault path を `AI/Gemini` → `AI/{platform}` に変更
- F-46-3: Popup UI の placeholder を `AI/{platform}` に更新
- F-46-4: テンプレート変数のヒントテキストを設定画面に表示
  - 例: `Use {platform} to auto-organize by platform`

### 設計方針

- 将来の拡張性を考慮し、テンプレート変数解決を汎用関数として実装する
  - `resolvePathTemplate(path: string, vars: Record<string, string>): string`
  - 今回は `{platform}` のみだが、将来 `{date}`, `{type}` にも対応可能な構造にする
- 既存ユーザーの設定はそのまま保持（マイグレーション不要）
- `{platform}` が含まれない場合は従来通りの動作

### 影響ファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/storage.ts` | `DEFAULT_SYNC_SETTINGS.vaultPath` を `AI/{platform}` に変更 |
| `src/background/index.ts` L228 | `settings.vaultPath` 内の `{platform}` を解決 |
| `src/popup/index.html` | placeholder 更新 + ヒントテキスト追加 |
| 新規テスト | テンプレート変数解決のテスト |

### 受け入れ基準

- [x] `AI/{platform}` 設定で Gemini から保存 → `AI/gemini/` に保存される
- [x] `AI/{platform}` 設定で Claude から保存 → `AI/claude/` に保存される
- [x] `{platform}` を含まない path はそのまま動作する
- [x] 変数名が不正な場合（`{unknown}`）は変換せずそのまま残す

---

## 2. Issue #47: Gemini タイトル抽出の改善

### 機能要件

- F-47-1: `getTitle()` の優先順位を変更
  1. **`document.title`** から ` - Google Gemini` / ` | Gemini` サフィックスを除去（新規）
  2. 最初のユーザークエリテキスト（既存）
  3. サイドバー `.conversation-title`（既存）
  4. `'Untitled Gemini Conversation'`（既存）

### 設計方針

- `document.title` のサフィックス除去パターン:
  - ` - Google Gemini` (現在の形式)
  - ` | Gemini` (Issue #47 で言及)
  - 正規表現: `/\s*[-|]\s*(?:Google\s+)?Gemini\s*$/i`
- 空文字列や `Gemini` のみの場合はスキップして次のフォールバックへ

### 影響ファイル

| ファイル | 変更内容 |
|---|---|
| `src/content/extractors/gemini.ts` L239-257 | `getTitle()` メソッドの修正 |
| テスト | `document.title` からのタイトル抽出テスト |

### 受け入れ基準

- [x] `document.title` が `"Test Chat - Google Gemini"` → タイトル `"Test Chat"`
- [x] `document.title` が `"Test Chat | Gemini"` → タイトル `"Test Chat"`
- [x] `document.title` が空 or `"Gemini"` のみ → 次のフォールバックへ
- [x] 既存のフォールバックロジックは変更なし

---

## 3. Popup UI リデザイン

### 3a. OUTPUT DESTINATIONS: トグルスイッチ化

#### 機能要件

- F-UI-1: チェックボックスをトグルスイッチ（iOS/Android スタイル）に変更
- F-UI-2: 各項目の左にアイコン（絵文字）を配置
  - 📦 Obsidian (API)
  - 📄 Download File
  - 📋 Copy to Clipboard
- F-UI-3: トグルスイッチのアニメーション（CSS transition）

#### UIモック

```
OUTPUT DESTINATIONS
───────────────────────────────────
📦  Obsidian (API)           [===●]  ON
📄  Download File            [●===]  OFF
📋  Copy to Clipboard        [●===]  OFF
```

### 3b. EXTRACTION: トグルスイッチ化

#### 機能要件

- F-UI-4: Auto-scroll チェックボックスをトグルスイッチに変更
- F-UI-5: アイコン追加

#### UIモック

```
EXTRACTION
───────────────────────────────────
🔄  Auto-scroll              [●===]  OFF
    (load all messages)
```

### 3c. Advanced Settings: 折りたたみ

#### 機能要件

- F-UI-6: SETTINGS / MESSAGE FORMAT / FRONTMATTER OPTIONS を「Advanced Settings」にグループ化
- F-UI-7: `<details>/<summary>` または JS による折りたたみ UI
- F-UI-8: デフォルトは**閉じた状態**
- F-UI-9: 展開/折りたたみアニメーション（高さの CSS transition）
- F-UI-10: 折りたたみ状態は保持しない（常にデフォルト=閉じた状態で開始）

#### UIモック（閉じた状態）

```
▶ Advanced Settings
```

#### UIモック（開いた状態）

```
▼ Advanced Settings
┌─────────────────────────────────┐
│ API Key: [__________] 👁        │
│                                 │
│ Port: [27123]  Vault: [AI/...]  │
│   hint: Use {platform} to ...   │
│                                 │
│ MESSAGE FORMAT                  │
│ Format: [Callout ▼]             │
│ User: [QUESTION] Asst: [NOTE]   │
│                                 │
│ FRONTMATTER FIELDS              │
│ ☑ID ☑Title ☑Tags ☑Source        │
│ ☑Dates ☑Message Count           │
└─────────────────────────────────┘
```

### CSS 実装方針

- トグルスイッチ: `<input type="checkbox">` をカスタムスタイルで実装（アクセシビリティ維持）
- CSS-only トグルスイッチ（JavaScript 不要）
- カラー: ON = `var(--accent-primary)` / OFF = `var(--bg-tertiary)`
- ダーク/ライトテーマ両対応（既存の CSS 変数を活用）
- 折りたたみ: HTML `<details>/<summary>` を使用（JS 不要、アクセシビリティ良好）

### 影響ファイル

| ファイル | 変更内容 |
|---|---|
| `src/popup/index.html` | HTML 構造変更（トグルスイッチ、details/summary） |
| `src/popup/styles.css` | トグルスイッチ CSS、折りたたみアニメーション |
| `src/popup/index.ts` | 変更最小限（checkbox の ID/構造は維持） |

---

## 非機能要件

- NF-1: 既存のテストが全てパスすること
- NF-2: ESLint / Prettier / TypeScript エラーが 0 であること
- NF-3: ダークモード / ライトモードの両方で正常に表示されること
- NF-4: Chrome Extension popup の幅 380px 内に収まること
- NF-5: アクセシビリティ: トグルスイッチは `role="switch"` + `aria-checked` を使用

---

## スコープ外

- テンプレート変数 `{date}`, `{type}` の実装（将来対応）
- 既存ユーザーの vaultPath 設定マイグレーション
- i18n の新規翻訳キー追加（既存キーの更新のみ）

---

## 実装順序（推奨）

1. Issue #47 (Gemini タイトル改善) — 最小スコープ、独立
2. Issue #46 (テンプレート変数) — ストレージ + バックグラウンド変更
3. Popup UI リデザイン — HTML/CSS 中心、他の変更を含むUIに反映

---

## 未解決の質問

なし（全て回答済み）

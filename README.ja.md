# Obsidian AI Exporter

Google Gemini の AI 会話を Obsidian に保存する Chrome 拡張機能です。Local REST API を使用してローカル環境で動作します。

[English version](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue)](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

## 機能

- **ワンクリック保存**: Gemini ページに表示される「Sync」ボタンで即座に保存
- **Deep Research 対応**: Gemini Deep Research レポートを構造を維持したまま保存
- **追記モード**: 既存ノートには新しいメッセージのみを追加
- **Obsidian コールアウト**: `[!QUESTION]` と `[!NOTE]` による見やすいフォーマット
- **YAML フロントマター**: タイトル、ソース、URL、日時、タグなどのメタデータを自動生成
- **カスタマイズ可能**: 保存先パス、テンプレート、フロントマターの設定が可能
- **多言語対応**: 英語・日本語 UI をサポート

## 必要なもの

- Google Chrome 88 以降（または Chromium ベースのブラウザ）
- [Obsidian](https://obsidian.md/)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグイン

## インストール

### Chrome ウェブストアから

> **注意**: 現在審査中です。承認後にリンクが有効になります。

[Chrome ウェブストアからインストール](https://chromewebstore.google.com/detail/obsidian-ai-exporter/edemgeigfbodiehkjhjflleipabgbdeh)

### ソースから

1. リポジトリをクローン:
   ```bash
   git clone https://github.com/sho7650/obsidian-AI-exporter.git
   cd obsidian-AI-exporter
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. 拡張機能をビルド:
   ```bash
   npm run build
   ```

4. Chrome に読み込み:
   - `chrome://extensions` を開く
   - 「デベロッパーモード」を有効にする
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist/` フォルダを選択

### Obsidian の設定

1. Obsidian に [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグインをインストール
2. プラグインを有効化し、API キーをコピー
3. Chrome で拡張機能のアイコンをクリックして以下を入力:
   - **API Key**: Local REST API の API キー
   - **Port**: デフォルトは `27123`
   - **Vault Path**: 保存先のフォルダパス（例: `AI/Gemini`）

## 使い方

1. [gemini.google.com](https://gemini.google.com) で会話を開く
2. 右下に表示される紫色の「Sync」ボタンをクリック
3. 会話が Obsidian の指定フォルダに保存されます

### Deep Research の保存

Gemini で Deep Research レポートを表示している場合:
1. Deep Research パネルを開く（展開表示）
2. 「Sync」ボタンをクリック
3. レポート全体が見出し構造を維持したまま保存されます

## 出力フォーマット

### 会話形式

会話は YAML フロントマター付きの Markdown ファイルとして保存されます:

```markdown
---
id: gemini_abc123
title: "認証の実装方法"
source: gemini
url: https://gemini.google.com/app/abc123
created: 2025-01-10T12:00:00Z
modified: 2025-01-10T12:30:00Z
tags:
  - ai-conversation
  - gemini
message_count: 4
---

> [!QUESTION] User
> JWT 認証の実装方法を教えてください

> [!NOTE] Gemini
> JWT 認証を実装するには...
```

### Deep Research 形式

Deep Research レポートは `type` フィールドが追加され、元の構造が維持されます:

```markdown
---
id: gemini_deep-research-a1b2c3d4
title: "〇〇に関する包括的分析"
source: gemini
type: deep-research
url: https://gemini.google.com/app/xxx
created: 2025-01-11T10:00:00Z
modified: 2025-01-11T10:00:00Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# レポートタイトル

## 1. はじめに

元の見出し構造を維持したレポート内容...

## 2. 分析

詳細な分析セクション...
```

## 開発

```bash
# HMR 対応の開発サーバー
npm run dev

# プロダクションビルド
npm run build

# リント
npm run lint

# フォーマット
npm run format

# テスト実行
npm test

# カバレッジ付きテスト
npm run test:coverage
```

## アーキテクチャ

```
Content Script (gemini.google.com)
    ↓ 会話 / Deep Research を抽出
Background Service Worker
    ↓ Obsidian に送信
Obsidian Local REST API (127.0.0.1:27123)
```

### 主要コンポーネント

| コンポーネント | 説明 |
|---------------|------|
| `src/content/` | DOM 抽出と UI 用のコンテンツスクリプト |
| `src/content/extractors/gemini.ts` | Gemini 会話 & Deep Research 抽出 |
| `src/background/` | API 通信用のサービスワーカー |
| `src/popup/` | 設定 UI |
| `src/lib/` | 共有ユーティリティと型定義 |

## セキュリティ

- **安全なストレージ**: API キーは `chrome.storage.local` に保存（クラウド同期なし）
- **入力検証**: メッセージ内容とファイル名を検証
- **パストラバーサル対策**: ディレクトリトラバーサル攻撃からの保護
- **送信元検証**: 信頼されたオリジンからのメッセージのみ受け入れ
- **CSP**: 拡張機能ページに Content Security Policy を設定
- **YAML エスケープ**: フロントマター値を適切にエスケープ

## プライバシー

この拡張機能は:
- 外部サーバーへのデータ収集・送信を**行いません**
- ローカルの Obsidian インスタンス (127.0.0.1) とのみ通信
- API キーはブラウザにローカル保存（クラウド同期なし）

詳細は[プライバシーポリシー](https://sho7650.github.io/obsidian-AI-exporter/privacy.html)をご覧ください。

## ライセンス

MIT

## コントリビュート

コントリビューションを歓迎します！開発ガイドラインについては [CLAUDE.md](CLAUDE.md) をご覧ください。

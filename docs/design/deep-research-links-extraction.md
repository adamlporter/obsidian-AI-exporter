# Deep Research リンク抽出機能 設計書

## 1. 概要

### 1.1 目的
Deep Research レポートに含まれるインライン引用を**インラインリンク形式**（`[タイトル](URL)`）に変換し、Obsidian に保存する。

### 1.2 スコープ
- インライン引用（`<sup data-turn-source-index>`）の検出
- ドキュメント末尾のソースリスト抽出（URL・タイトル）
- 引用のインラインリンク変換（`<sup>` → `[タイトル](URL)`）
- URL・タイトルのセキュリティサニタイズ

### 1.3 スコープ外
- 脚注形式（`[^N]`）での出力（**不採用**：インラインリンク形式を採用）
- References セクションの出力（**不要**：インラインリンクで完結）
- サムネイル画像の取得・保存
- ソースの信頼性評価
- リンク先コンテンツのプリフェッチ
- 元レポートとの番号一致（**不要**：ユーザー要件）

---

## 2. HTML 構造分析

### 2.1 インライン引用構造

```html
<!-- 文中の引用マーカー -->
<source-footnote _nghost-ng-c55987025="" class="ng-star-inserted">
  <sup _ngcontent-ng-c55987025="" 
       class="superscript" 
       data-turn-source-index="1">
    <!-- 実際の番号は CSS で表示 -->
  </sup>
</source-footnote>
```

**セレクタ**:
- `source-footnote` - 引用要素
- `sup.superscript[data-turn-source-index]` - 引用番号

**属性**:
- `data-turn-source-index`: **1ベース**のソースインデックス番号
  - 検証日: 2025-01-12
  - 検証方法: カルーセル展開時のURL比較
  - 検証結果: `data-turn-source-index="1"` → ソースリスト[0]のURLと一致
  - 変換式: `sourceListIndex = data-turn-source-index - 1`
  - 注意: 0は存在しない（1から開始）

### 2.2 ソースカルーセル構造（インライン展開）

```html
<sources-carousel-inline _nghost-ng-c3078843332="">
  <sources-carousel id="sources" _nghost-ng-c389433453="">
    <div class="carousel-content">
      <div data-test-id="sources-carousel-source" class="sources-carousel-source">
        <!-- ソースカード（動的ローディング） -->
      </div>
    </div>
  </sources-carousel>
</sources-carousel-inline>
```

**注意**: カルーセル内のソース詳細は動的にロードされるため、直接のリンク取得は困難。

### 2.3 ドキュメント末尾のソースリスト構造

```html
<deep-research-source-lists _nghost-ng-c3369699991="">
  <collapsible-button data-test-id="used-sources-button">
    <span class="gds-title-m">レポートに使用されているソース</span>
  </collapsible-button>
  
  <!-- ソースリスト本体 -->
  <div id="used-sources-list">
    <!-- 各ソースアイテム -->
    <a data-test-id="browse-web-item-link" 
       href="https://example.com/article"
       target="_blank" rel="noopener">
      <span data-test-id="title" class="sub-title">Article Title</span>
      <span data-test-id="domain-name" class="display-name">example.com</span>
    </a>
  </div>
</deep-research-source-lists>
```

### 2.4 Browse チップ構造（代替ソース）

```html
<a data-test-id="browse-chip-link" 
   class="browse-chip" 
   href="https://www.help.cbp.gov/s/article/Article-1282"
   target="_blank" rel="noopener noreferrer">
  <span data-test-id="title" class="sub-title">ESTA - How do I pay...</span>
  <span data-test-id="domain-name" class="display-name">help.cbp.gov</span>
</a>
```

---

## 3. 設計

### 3.1 セレクタ定義

```typescript
// src/content/extractors/gemini.ts に追加

const DEEP_RESEARCH_LINK_SELECTORS = {
  // インライン引用
  inlineCitation: [
    'source-footnote sup.superscript[data-turn-source-index]',
    'sup.superscript[data-turn-source-index]',
  ],
  
  // ソースリストコンテナ
  sourceListContainer: [
    'deep-research-source-lists',
    '#used-sources-list',
  ],
  
  // ソースリスト内のリンク
  sourceListItem: [
    'a[data-test-id="browse-web-item-link"]',
    'a[data-test-id="browse-chip-link"]',
  ],
  
  // ソースタイトル
  sourceTitle: [
    '[data-test-id="title"]',
    '.sub-title',
  ],
  
  // ソースドメイン
  sourceDomain: [
    '[data-test-id="domain-name"]',
    '.display-name',
  ],
};
```

### 3.2 型定義

```typescript
// src/lib/types.ts に追加

/**
 * Deep Research のソース情報
 */
export interface DeepResearchSource {
  /** ソースリスト内の0ベースインデックス（DOM順） */
  index: number;
  /** ソースURL */
  url: string;
  /** ソースタイトル */
  title: string;
  /** ドメイン名 */
  domain: string;
}

/**
 * Deep Research リンク抽出結果
 * 
 * 設計方針: ソースリストのみを保持し、インライン引用は
 * HTML→Markdown変換時に data-turn-source-index から直接処理する
 */
export interface DeepResearchLinks {
  /** ソース一覧（ソースリストのDOM順、0ベースインデックス） */
  sources: DeepResearchSource[];
}

// ConversationData の拡張
export interface ConversationData {
  // ... 既存フィールド

  /** Deep Research のリンク情報（optional） */
  links?: DeepResearchLinks;
}
```

**設計決定**:
- `InlineCitation` 型は**不要**
- インライン引用はHTML変換時に `data-turn-source-index` 属性から直接処理
- ソースリストは `Map<number, DeepResearchSource>` として `data-turn-source-index` → ソース情報をマッピング

### 3.3 抽出ロジック

```typescript
// src/content/extractors/gemini.ts に追加

/**
 * ソースリストを抽出し、data-turn-source-index でアクセス可能な Map を構築
 * 
 * 重要: data-turn-source-index は 1ベース
 * ソースリストの DOM 順（0ベース）との対応:
 *   data-turn-source-index="N" → sourceList[N-1]
 */
extractSourceList(): DeepResearchSource[] {
  const sources: DeepResearchSource[] = [];
  
  // ソースリスト内のリンクを取得
  const sourceLinks = document.querySelectorAll(
    DEEP_RESEARCH_LINK_SELECTORS.sourceListItem.join(',')
  );
  
  sourceLinks.forEach((link, index) => {
    const anchor = link as HTMLAnchorElement;
    const url = anchor.href;
    
    // タイトルを取得
    const titleEl = anchor.querySelector(
      DEEP_RESEARCH_LINK_SELECTORS.sourceTitle.join(',')
    );
    const title = titleEl?.textContent?.trim() || 'Unknown Title';
    
    // ドメインを取得（URLパース失敗に備えてtry-catch）
    const domainEl = anchor.querySelector(
      DEEP_RESEARCH_LINK_SELECTORS.sourceDomain.join(',')
    );
    let domain = domainEl?.textContent?.trim() || '';
    if (!domain) {
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = 'unknown';
      }
    }
    
    sources.push({
      index,  // 0ベースの配列インデックス
      url,
      title: this.sanitizeText(title),
      domain,
    });
  });
  
  return sources;
}

/**
 * ソースリストから data-turn-source-index でアクセス可能な Map を構築
 * 
 * @param sources extractSourceList() の結果
 * @returns Map<data-turn-source-index, DeepResearchSource>
 * 
 * 使用例:
 *   const map = buildSourceMap(sources);
 *   const source = map.get(5); // data-turn-source-index="5" に対応するソース
 */
buildSourceMap(sources: DeepResearchSource[]): Map<number, DeepResearchSource> {
  const map = new Map<number, DeepResearchSource>();
  
  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index は 1ベース
    // arrayIndex=0 → data-turn-source-index=1
    const turnSourceIndex = arrayIndex + 1;
    map.set(turnSourceIndex, source);
  });
  
  return map;
}

/**
 * Deep Research リンク情報を抽出
 */
extractDeepResearchLinks(): DeepResearchLinks {
  const sources = this.extractSourceList();
  
  return {
    sources,
  };
}
```

**注記**: `extractInlineCitations()` は不要。インライン引用の処理は Markdown 変換時に行う。

### 3.4 Markdown 変換（インラインリンク方式）

```typescript
// src/content/markdown.ts に追加

/**
 * URLをサニタイズ（危険なスキームを除去）
 */
function sanitizeUrl(url: string): string {
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];
  const lowerUrl = url.toLowerCase().trim();
  
  for (const scheme of dangerousSchemes) {
    if (lowerUrl.startsWith(scheme)) {
      return ''; // 危険なURLは空文字を返す
    }
  }
  
  return url;
}

/**
 * Markdownリンクテキスト用のエスケープ
 */
function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

/**
 * Markdownリンク用のURLエスケープ
 */
function escapeMarkdownLinkUrl(url: string): string {
  return url.replace(/\(/g, '%28').replace(/\)/g, '%29');
}

/**
 * インライン引用をインラインリンク形式に変換
 * 
 * 変換前: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * 変換後: [タイトル](URL)
 * 
 * 重要: data-turn-source-index は 1ベース
 *       sourceMap.get(N) で対応するソースを取得
 * 
 * @param html 変換対象のHTML
 * @param sourceMap buildSourceMap() で構築した Map
 */
function convertInlineCitationsToLinks(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  // パターン1: source-footnote でラップされている場合
  let result = html.replace(
    /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi,
    (match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        const safeTitle = escapeMarkdownLinkText(source.title);
        const safeUrl = escapeMarkdownLinkUrl(sanitizeUrl(source.url));
        if (safeUrl) {
          return `[${safeTitle}](${safeUrl})`;
        }
        return safeTitle; // URLが無効な場合はタイトルのみ
      }
      return ''; // ソースが見つからない場合は削除
    }
  );
  
  // パターン2: sup要素が直接存在する場合（フォールバック）
  result = result.replace(
    /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi,
    (match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        const safeTitle = escapeMarkdownLinkText(source.title);
        const safeUrl = escapeMarkdownLinkUrl(sanitizeUrl(source.url));
        if (safeUrl) {
          return `[${safeTitle}](${safeUrl})`;
        }
        return safeTitle;
      }
      return '';
    }
  );
  
  return result;
}

/**
 * sources-carousel-inline 要素を除去
 */
function removeSourcesCarousel(html: string): string {
  return html.replace(
    /<sources-carousel-inline[\s\S]*?<\/sources-carousel-inline>/gi,
    ''
  );
}

/**
 * Deep Research コンテンツを変換（インラインリンク方式）
 * 
 * @param html 変換対象のHTML
 * @param links extractDeepResearchLinks() の結果
 */
function convertDeepResearchContent(
  html: string,
  links?: DeepResearchLinks
): string {
  let processed = html;
  
  // 1. ソースマップを構築
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    links.sources.forEach((source, arrayIndex) => {
      // data-turn-source-index は 1ベース
      const turnSourceIndex = arrayIndex + 1;
      sourceMap.set(turnSourceIndex, source);
    });
  }
  
  // 2. インライン引用をインラインリンクに変換
  processed = convertInlineCitationsToLinks(processed, sourceMap);
  
  // 3. sources-carousel を除去
  processed = removeSourcesCarousel(processed);
  
  // 4. HTML → Markdown 変換
  const markdown = htmlToMarkdown(processed);
  
  // References セクションは生成しない（インラインリンクで完結）
  
  return markdown;
}
```

**設計ポイント**:
- 脚注形式（`[^N]`）は不採用 → インラインリンク（`[タイトル](URL)`）を直接挿入
- `generateFootnoteDefinitions()` と `generateReferencesSection()` は**不要**
- ソースが見つからない場合は空文字（引用マーカーを削除）

---

## 4. 出力フォーマット

### 4.1 期待される出力例（インラインリンク方式）

```markdown
---
id: gemini_deep-research-a1b2c3d4
title: ハワイ旅行準備と現地注意点レポート
source: gemini
type: deep-research
url: https://gemini.google.com/app/xxx
created: 2025-01-11T10:00:00.000Z
modified: 2025-01-11T10:00:00.000Z
tags:
  - ai-research
  - deep-research
  - gemini
message_count: 1
---

# 2026年3月ハワイ渡航に関する調査報告書

## 1. 入国手続き

### 1.1 ESTA申請

2026年現在、ESTA費用は**$40**に改定されている[ESTA - How do I pay for my application?](https://www.help.cbp.gov/s/article/Article-1282)。申請は出発の72時間前までに完了することが推奨される[CBP's Electronic System for Travel Authorization](https://uk.usembassy.gov/cbps-electronic-system-for-travel-authorization-esta/)。

## 2. 交通

スカイライン運賃は**$3.00**である[Honolulu Skyline Rail 2025](https://livinginhawaii.com/honolulu-skyline-rail/)。大型スーツケースは持ち込み不可[Rail Operations](https://www.honolulu.gov/dts/rail-operations)。
```

### 4.2 フォーマット特徴

| 項目 | 説明 |
|------|------|
| インライン引用 | `[タイトル](URL)` 形式のインラインリンク |
| 脚注定義 | **なし**（インラインリンクで完結） |
| References セクション | **なし**（インラインリンクで完結） |
| セキュリティ | URL/タイトルは `sanitizeUrl()` と `escapeMarkdownLinkText()` で処理 |

### 4.3 変換前後の比較

| 変換前（HTML） | 変換後（Markdown） |
|---------------|-------------------|
| `テキスト<source-footnote><sup data-turn-source-index="1">...</sup></source-footnote>` | `テキスト[タイトル](URL)` |
| `<sources-carousel-inline>...</sources-carousel-inline>` | （削除） |

---

## 5. 実装計画

### 5.1 Phase 1: 型定義と基本構造

1. `src/lib/types.ts` に `DeepResearchSource`, `InlineCitation`, `DeepResearchLinks` を追加
2. `ConversationData` に `links` フィールドを追加

### 5.2 Phase 2: 抽出ロジック

1. `DEEP_RESEARCH_LINK_SELECTORS` を追加
2. `extractSourceList()` を実装
3. `buildSourceMap()` を実装
4. `extractDeepResearchLinks()` を実装
5. `extractDeepResearch()` を更新してリンク情報を含める

### 5.3 Phase 3: Markdown 変換

1. `sanitizeUrl()` を実装
2. `escapeMarkdownLinkText()` / `escapeMarkdownLinkUrl()` を実装
3. `convertInlineCitationsToLinks()` を実装
4. `removeSourcesCarousel()` を実装
5. `convertDeepResearchContent()` を実装
6. `conversationToNote()` を更新

### 5.4 Phase 4: テスト

1. 引用抽出のユニットテスト
2. ソースリスト抽出のユニットテスト
3. Markdown 変換のユニットテスト
4. 統合テスト（サンプル HTML 使用）

---

## 6. 注意事項

### 6.1 DOM の動的性

- `sources-carousel` 内のソースカードは動的にロードされる（遅延読み込み）
- 折りたたみ状態ではカルーセル内URLは空
- **解決策**: ドキュメント末尾の `deep-research-source-lists` からURLを取得
- インライン引用は `data-turn-source-index` 属性から番号を取得（常に存在）

### 6.2 インデックスのオフセット

- `data-turn-source-index` は **1ベース** のインデックス
  - 検証日: 2025-01-12
  - 検証方法: カルーセル展開時のURL比較
- ソースリストの配列は **0ベース**
- **変換式**: `sourceListIndex = data-turn-source-index - 1`
- 例: `data-turn-source-index="1"` → `sources[0]`

### 6.3 重複ソースの扱い

- 同一ソースが複数の文で引用される場合がある
- 各引用位置に同じインラインリンクを挿入（重複OK）
- 脚注方式と異なり、重複管理は不要

### 6.4 欠損データの処理

| 状況 | 処理 |
|------|------|
| ソースリストに存在しない `data-turn-source-index` | 引用マーカーを削除（空文字） |
| URL が無効（危険スキーム） | タイトルのみテキスト出力 |
| タイトルが空 | "Unknown Title" を使用 |
| ドメイン取得失敗 | "unknown" を使用 |

### 6.5 セキュリティ考慮事項

#### URLサニタイズ
- `javascript:`, `data:`, `vbscript:` スキームは除去
- 無効なURLは空文字を返す
- `sanitizeUrl()` で検証してからMarkdownに出力

#### Markdownエスケープ
- タイトル内の `[` `]` → `\[` `\]` にエスケープ
- URL内の `(` `)` → `%28` `%29` にエスケープ
- XSS防止のため、外部データは必ずエスケープ

#### 検証順序
```
URL取得 → sanitizeUrl() → escapeMarkdownLinkUrl() → Markdown出力
タイトル取得 → escapeMarkdownLinkText() → Markdown出力
```

### 6.6 インラインリンク方式の利点

| 観点 | 脚注方式 | インラインリンク方式 |
|------|---------|-------------------|
| 実装複雑度 | 高（脚注定義管理必要） | 低（直接置換） |
| 出力の可読性 | 本文がシンプル | リンク情報が即座に分かる |
| Obsidian互換性 | 脚注プラグイン依存 | 標準Markdown |
| 重複管理 | 必要 | 不要 |
| ユーザー要件 | ❌ | ✅（採用） |

---

## 7. テスト計画

### 7.1 ユニットテスト

| テスト項目 | 説明 |
|-----------|------|
| `extractSourceList()` | URL、タイトル、ドメインの抽出 |
| `buildSourceMap()` | 1ベースインデックスへのマッピング |
| `convertInlineCitationsToLinks()` | HTML → `[タイトル](URL)` 変換 |
| `sanitizeUrl()` | 危険スキームの除去 |
| `escapeMarkdownLinkText()` | `[]` のエスケープ |
| `escapeMarkdownLinkUrl()` | `()` のエンコード |

### 7.2 エッジケース

| シナリオ | 期待結果 |
|---------|---------|
| 引用なし | 本文のみ（インラインリンクなし） |
| ソースリストなし | 本文のみ、警告ログ |
| ソースリストに存在しない `data-turn-source-index` | 引用マーカー削除（空文字） |
| 重複引用（同じインデックス複数回） | 各位置に同じリンクを挿入 |
| 無効なURL（`javascript:`） | タイトルのみテキスト出力 |
| 日本語タイトル | 正しくエスケープ |
| タイトルに `[]` 含む | `\[\]` にエスケープ |
| URLに `()` 含む | `%28%29` にエンコード |
| URL解析失敗 | domain を 'unknown' にフォールバック |
| `data-turn-source-index="1"` | `sources[0]` に対応（1ベース確認） |

---

## 8. 影響範囲

### 8.1 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/types.ts` | `DeepResearchSource`, `DeepResearchLinks` 追加 |
| `src/content/extractors/gemini.ts` | `extractSourceList()`, `buildSourceMap()`, `extractDeepResearchLinks()` 追加 |
| `src/content/markdown.ts` | `convertInlineCitationsToLinks()`, `convertDeepResearchContent()` 追加 |
| `test/extractors/gemini.test.ts` | リンク抽出テスト追加 |
| `test/markdown.test.ts` | インラインリンク変換テスト追加 |

### 8.2 後方互換性

- `ConversationData.links` は optional
- 既存のレポート抽出機能に影響なし
- リンク情報がない場合は従来通りの出力

---

## 9. 承認

| 項目 | 状態 |
|------|------|
| 設計レビュー | 待機中 |
| 実装承認 | 待機中 |

---

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-01-11 | 初版作成 |
| 1.1 | 2025-01-11 | レビュー指摘対応: Set→配列、URLバリデーション、セキュリティ対応 |
| 2.0 | 2025-01-12 | 大幅改訂: 脚注形式からインラインリンク形式に変更、`data-turn-source-index` を1ベースに修正（検証済み）、`InlineCitation`型削除、Referencesセクション削除 |

---

*作成日: 2025-01-11*
*更新日: 2025-01-12*
*バージョン: 2.0*
*前提: deep-research-extraction.md v1.1*

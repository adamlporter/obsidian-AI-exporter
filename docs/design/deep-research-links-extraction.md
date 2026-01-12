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

### 3.4 Markdown 変換（`<a>` タグ経由方式）

**重要な設計決定**: Markdown を直接生成せず、`<a>` タグを生成して Turndown に変換を委ねる。

**理由**: Turndown は HTML を Markdown に変換するライブラリであり、入力に Markdown 構文が含まれていると二重エスケープが発生する。詳細は [二重エスケープ問題 調査レポート](../investigation/double-escape-issue.md) を参照。

### 3.4.1 旧仕様（インラインリンク方式）【廃止】

以下の実装は二重エスケープ問題を引き起こすため廃止。現在は 3.4.2 の `<a>` タグ方式を採用。

#### 廃止された仕様（参考）

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

**旧仕様の問題点**:
- Markdown を直接生成すると、Turndown が `[` `]` を再エスケープする
- 結果: `\[Title\](URL)` という不正な出力

### 3.4.2 現行仕様（`<a>` タグ経由方式）【採用】

```typescript
// src/content/markdown.ts

/**
 * URLをサニタイズ（危険なスキームを除去）
 */
export function sanitizeUrl(url: string): string {
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
 * HTML特殊文字をエスケープ
 * 
 * <a> タグ内に挿入する前に呼び出す
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * インライン引用を <a> タグに変換（Turndown 処理用）
 * 
 * 変換前: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * 変換後: <a href="URL">Title</a>
 * 
 * 設計: Markdown を直接生成せず、<a> タグを生成して
 *       Turndown に [Title](URL) への変換を委ねる。
 *       これにより二重エスケープ問題を回避。
 * 
 * 重要: data-turn-source-index は 1ベース
 */
export function convertInlineCitationsToLinks(
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
        const safeUrl = sanitizeUrl(source.url);
        if (safeUrl) {
          // ✅ <a> タグを生成 → Turndown が [Title](URL) に変換
          return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;
        }
        return escapeHtml(source.title); // URLが無効な場合はタイトルのみ
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
        const safeUrl = sanitizeUrl(source.url);
        if (safeUrl) {
          return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;
        }
        return escapeHtml(source.title);
      }
      return '';
    }
  );
  
  return result;
}

/**
 * sources-carousel-inline 要素を除去
 */
export function removeSourcesCarousel(html: string): string {
  return html.replace(
    /<sources-carousel-inline[\s\S]*?<\/sources-carousel-inline>/gi,
    ''
  );
}

/**
 * Deep Research コンテンツを変換
 */
export function convertDeepResearchContent(
  html: string,
  links?: DeepResearchLinks
): string {
  let processed = html;
  
  // 1. ソースマップを構築（1ベースインデックス）
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    links.sources.forEach((source, arrayIndex) => {
      // data-turn-source-index は 1ベース
      const turnSourceIndex = arrayIndex + 1;
      sourceMap.set(turnSourceIndex, source);
    });
  }
  
  // 2. インライン引用を <a> タグに変換
  processed = convertInlineCitationsToLinks(processed, sourceMap);
  
  // 3. sources-carousel を除去
  processed = removeSourcesCarousel(processed);
  
  // 4. HTML → Markdown 変換（Turndown が <a> → [Title](URL) に変換）
  const markdown = htmlToMarkdown(processed);
  
  return markdown;
}
```

**設計ポイント**:
- Markdown を直接生成せず、`<a>` タグを生成
- Turndown が `<a href="URL">Title</a>` → `[Title](URL)` に変換
- エスケープ処理は Turndown に委譲（二重エスケープ問題を回避）
- 削除した関数: `escapeMarkdownLinkText()`, `escapeMarkdownLinkUrl()`

### 3.4.3 処理フロー比較

| 方式 | 処理フロー | 結果 |
|------|-----------|------|
| 旧（Markdown直接） | `<sup>` → `[Title](URL)` → Turndown | `\[Title\](URL)` ❌ |
| 新（`<a>`タグ経由） | `<sup>` → `<a href="URL">Title</a>` → Turndown | `[Title](URL)` ✅ |

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
| セキュリティ | DOMPurify でサニタイズ、`sanitizeUrl()` と `escapeHtml()` で処理 |
| エスケープ方式 | `<a>` タグ経由で Turndown に委譲（二重エスケープ回避） |

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

1. `sanitizeUrl()` を実装 ✅
2. `escapeHtml()` を実装（`<a>` タグ方式用） ✅
3. `convertInlineCitationsToLinks()` を実装（`<a>` タグ生成） ✅
4. `removeSourcesCarousel()` を実装 ✅
5. `convertDeepResearchContent()` を実装 ✅
6. `conversationToNote()` を更新 ✅

**廃止した関数**:
- `escapeMarkdownLinkText()` - 不要（Turndown に委譲）
- `escapeMarkdownLinkUrl()` - 不要（Turndown に委譲）

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

#### URLサニタイズ（`sanitizeUrl()`）
- `javascript:`, `data:`, `vbscript:` スキームは除去
- 無効なURLは空文字を返す
- `sanitizeUrl()` で検証してから `<a>` タグに出力

#### HTMLエスケープ（`escapeHtml()`）【現行方式】
`<a>` タグ方式では HTML エスケープを使用:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`

**廃止**: `escapeMarkdownLinkText()` / `escapeMarkdownLinkUrl()` は不要（Turndown が処理）

#### 検証順序【現行方式】
```
URL取得 → sanitizeUrl() → escapeHtml() → <a href="..."> に挿入
タイトル取得 → escapeHtml() → <a>...</a> に挿入
<a> タグ → Turndown → [Title](URL) 変換
```

#### HTMLサニタイズ（DOMPurify）

抽出した HTML は `sanitizeHtml()` でサニタイズしてから処理する。

```typescript
// src/lib/sanitize.ts

/**
 * DOMPurify 設定:
 * - USE_PROFILES: { html: true } でデフォルトの安全なHTML許可リスト
 * - data-turn-source-index を明示的に許可（hook 使用）
 * - 他の data-* 属性はブロック
 */
export function sanitizeHtml(html: string): string {
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    // data-turn-source-index のみ許可
    if (data.attrName === 'data-turn-source-index') {
      data.forceKeepAttr = true;
    }
    // 他の data-* 属性はブロック
    else if (data.attrName.startsWith('data-')) {
      data.keepAttr = false;
    }
  });

  const result = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style'],
  });

  DOMPurify.removeHook('uponSanitizeAttribute');
  return result;
}
```

**重要**: `data-turn-source-index` 属性は `convertInlineCitationsToLinks()` で使用するため、サニタイズ時に保持する必要がある。

#### セキュリティ対策の層

| 層 | 対策 | 目的 |
|----|------|------|
| 1 | DOMPurify サニタイズ | XSS 攻撃防止、`data-turn-source-index` 保持 |
| 2 | `sanitizeUrl()` | 危険な URL スキーム除去 |
| 3 | `escapeHtml()` | HTML インジェクション防止 |
| 4 | Turndown 変換 | Markdown への安全な変換 |

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

| テスト項目 | 説明 | 実装状態 |
|-----------|------|---------|
| `extractSourceList()` | URL、タイトル、ドメインの抽出 | ✅ 実装済み |
| `buildSourceMap()` | 1ベースインデックスへのマッピング | ✅ 実装済み |
| `convertInlineCitationsToLinks()` | `<sup>` → `<a>` タグ変換 | ✅ 実装済み |
| `sanitizeUrl()` | 危険スキームの除去 | ✅ 実装済み |
| `escapeHtml()` | HTML特殊文字のエスケープ | ✅ 実装済み |
| `sanitizeHtml()` | DOMPurify による XSS 防止 | ✅ 実装済み |

**廃止されたテスト項目**:
- `escapeMarkdownLinkText()` - Turndown に委譲
- `escapeMarkdownLinkUrl()` - Turndown に委譲

### 7.2 エッジケース

| シナリオ | 期待結果 | 実装状態 |
|---------|---------|---------|
| 引用なし | 本文のみ（インラインリンクなし） | ✅ |
| ソースリストなし | 本文のみ | ✅ |
| ソースリストに存在しない `data-turn-source-index` | 引用マーカー削除（空文字） | ✅ |
| 重複引用（同じインデックス複数回） | 各位置に同じリンクを挿入 | ✅ |
| 無効なURL（`javascript:`） | タイトルのみテキスト出力 | ✅ |
| 日本語タイトル | 正しく HTML エスケープ | ✅ |
| タイトルに `<script>` 含む | `&lt;script&gt;` にエスケープ | ✅ |
| URLに `()` 含む | Turndown が適切にエンコード | ✅ |
| URL解析失敗 | domain を 'unknown' にフォールバック | ✅ |
| `data-turn-source-index="1"` | `sources[0]` に対応（1ベース確認） | ✅ |
| `data-turn-source-index` 属性保持 | DOMPurify サニタイズ後も属性残存 | ✅ |

---

## 8. 影響範囲

### 8.1 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/types.ts` | `DeepResearchSource`, `DeepResearchLinks` 追加 |
| `src/lib/sanitize.ts` | `sanitizeHtml()` に DOMPurify hook 追加（`data-turn-source-index` 保持） |
| `src/content/extractors/gemini.ts` | `extractSourceList()`, `extractDeepResearchLinks()` 追加 |
| `src/content/markdown.ts` | `convertInlineCitationsToLinks()`（`<a>` タグ生成）、`escapeHtml()`、`convertDeepResearchContent()` 追加 |
| `test/lib/sanitize.test.ts` | `data-turn-source-index` 保持テスト追加 |
| `test/content/markdown.test.ts` | インラインリンク変換テスト追加 |

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
| 2.1 | 2025-01-12 | `<a>` タグ経由方式に変更（二重エスケープ問題解決）、DOMPurify hook による `data-turn-source-index` 保持仕様追加、`escapeMarkdownLink*()` 廃止、`escapeHtml()` 追加 |

---

## 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [Deep Research 抽出機能 設計書](./deep-research-extraction.md) | Deep Research コンテンツの基本抽出仕様 |
| [インライン引用の折りたたみ状態に関する調査レポート](../investigation/inline-citation-collapsed-state.md) | `data-turn-source-index` 属性の机上検証結果 |
| [Markdown 二重エスケープ問題 調査レポート](../investigation/double-escape-issue.md) | `<a>` タグ方式採用の経緯と技術的詳細 |

---

*作成日: 2025-01-11*
*更新日: 2025-01-12*
*バージョン: 2.1*
*前提: deep-research-extraction.md v1.1*

# Deep Research リンク抽出機能 設計書

## 1. 概要

### 1.1 目的
Deep Research レポートに含まれるインライン引用を **Obsidian ネイティブ脚注形式**（`[^N]`）に変換し、References セクションと共に Obsidian に保存する。

### 1.2 スコープ
- インライン引用（`<sup data-turn-source-index>`）の検出
- ドキュメント末尾のソースリスト抽出（URL・タイトル）
- 引用の脚注形式変換（`<sup>` → `[^N]`）
- References セクションの生成（全ソース、脚注定義形式）
- URL・タイトルのセキュリティサニタイズ

### 1.3 スコープ外
- ~~インラインリンク形式（`[タイトル](URL)`）での出力~~（**v2.1 で廃止**）
- サムネイル画像の取得・保存
- ソースの信頼性評価
- リンク先コンテンツのプリフェッチ

### 1.4 要件（ブレインストーミング結果）

| 項目 | 決定内容 |
|------|---------|
| 文中引用形式 | `[^N]`（Obsidian ネイティブ脚注） |
| 脚注番号 | `data-turn-source-index` の値をそのまま使用（非連続可） |
| 重複引用 | 同一番号を再利用（References に1回のみ記載） |
| References 見出し | `# References` |
| References 配置 | ドキュメント最後尾 |
| 未参照ソース | References に含める（全ソース記載） |

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
  - 注意: 非連続の可能性あり（1, 2, 3, 5, 10, 11...）

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

### 3.4 Markdown 変換（Obsidian ネイティブ脚注形式）

**重要な設計決定**:
- v2.1 までの `<a>` タグ方式から **Obsidian ネイティブ脚注形式** に変更
- 文中: `[^N]` → Obsidian が自動的に脚注定義にジャンプ
- 文末: `[^N]: [タイトル](URL)` → 脚注定義（リンク付き）

**Obsidian 脚注構文（公式ドキュメントより）**:
- 参照: [Obsidian Help - Basic formatting syntax](https://help.obsidian.md/syntax)
- 参照: [GitHub - obsidian-help/Footnote.md](https://github.com/obsidianmd/obsidian-help/blob/master/Sandbox/Formatting/Footnote.md)

```markdown
文中の脚注参照[^1]と別の参照[^bignote]

[^1]: 脚注の内容

[^bignote]: 複数段落の脚注
    インデントで継続
```

### 3.4.1 旧仕様（インラインリンク方式）【v2.1 で廃止】

v2.1 までの `<a>` タグ経由方式は廃止。詳細は変更履歴を参照。

### 3.4.2 現行仕様（Obsidian ネイティブ脚注形式）【v3.0 採用】

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
 * インライン引用をプレースホルダー span に変換
 *
 * 変換前: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * 変換後: <span data-footnote-ref="N">REF</span>
 *
 * 注: 最終的な [^N] への変換は Turndown カスタムルールで行う
 *     span 内に "REF" を含めるのは Turndown が空要素をフィルタするため
 *
 * 重要: data-turn-source-index は 1ベース、非連続の可能性あり
 */
export function convertInlineCitationsToFootnoteRefs(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  // パターン1: source-footnote でラップされている場合
  let result = html.replace(
    /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi,
    (_match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        // プレースホルダーを挿入（Turndown カスタムルールで変換）
        return `<span data-footnote-ref="${index}">REF</span>`;
      }
      return ''; // ソースが見つからない場合は削除
    }
  );

  // パターン2: sup要素が直接存在する場合（フォールバック）
  result = result.replace(
    /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi,
    (_match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        return `<span data-footnote-ref="${index}">REF</span>`;
      }
      return '';
    }
  );

  return result;
}

// Turndown カスタムルール: プレースホルダー span を [^N] に変換
// (turndown.addRule で登録)
turndown.addRule('footnoteRef', {
  filter: node => {
    return node.nodeName === 'SPAN' && node.hasAttribute('data-footnote-ref');
  },
  replacement: (_content, node) => {
    const index = node.getAttribute('data-footnote-ref');
    return `[^${index}]`;
  },
});

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
 * References セクションを生成（Obsidian 脚注定義形式）
 *
 * 出力形式:
 * # References
 *
 * [^1]: [タイトル1](URL1)
 * [^2]: [タイトル2](URL2)
 * ...
 *
 * @param sources 全ソースリスト
 * @returns References セクションの Markdown 文字列
 */
export function generateReferencesSection(
  sources: DeepResearchSource[]
): string {
  if (sources.length === 0) {
    return '';
  }

  const lines: string[] = ['', '# References', ''];

  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index は 1ベース
    const footnoteIndex = arrayIndex + 1;
    const safeUrl = sanitizeUrl(source.url);

    if (safeUrl) {
      // [^N]: [タイトル](URL)
      lines.push(`[^${footnoteIndex}]: [${source.title}](${safeUrl})`);
    } else {
      // URLが無効な場合はタイトルのみ
      lines.push(`[^${footnoteIndex}]: ${source.title}`);
    }
  });

  return lines.join('\n');
}

/**
 * Deep Research コンテンツを変換（Obsidian ネイティブ脚注形式）
 *
 * @param html 変換対象のHTML
 * @param links extractDeepResearchLinks() の結果
 */
export function convertDeepResearchContent(
  html: string,
  links?: DeepResearchLinks
): string {
  let processed = html;

  // 1. ソースマップを構築（1ベースインデックス）
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    sourceMap = buildSourceMap(links.sources);
  }

  // 2. インライン引用をプレースホルダーに変換
  processed = convertInlineCitationsToFootnoteRefs(processed, sourceMap);

  // 3. sources-carousel を除去
  processed = removeSourcesCarousel(processed);

  // 4. HTML → Markdown 変換（Turndown カスタムルールで span → [^N]）
  const markdown = htmlToMarkdown(processed);

  // 5. References セクションを追加
  if (links && links.sources.length > 0) {
    return markdown + generateReferencesSection(links.sources);
  }

  return markdown;
}
```

### 3.4.3 処理フロー

```
HTML 入力
    ↓
1. ソースマップ構築（data-turn-source-index → ソース情報）
    ↓
2. <sup data-turn-source-index="N"> → <span data-footnote-ref="N">REF</span>
   （Turndown が空要素をフィルタするため、ダミーコンテンツ "REF" を挿入）
    ↓
3. sources-carousel 除去
    ↓
4. Turndown（HTML → Markdown）
   + カスタムルール: <span data-footnote-ref="N">REF</span> → [^N]
    ↓
5. References セクション追加
    ↓
Markdown 出力
```

### 3.4.4 処理フロー比較（バージョン間）

| バージョン | 文中形式 | 文末形式 | Obsidian 動作 |
|-----------|---------|---------|--------------|
| v2.1（廃止） | `[タイトル](URL)` | なし | クリックで外部URLへ遷移 |
| v3.0（現行） | `[^N]` | `[^N]: [タイトル](URL)` | クリックで脚注定義へジャンプ → そこからURLへ遷移可能 |

---

## 4. 出力フォーマット

### 4.1 期待される出力例（Obsidian ネイティブ脚注形式）

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

2026年現在、ESTA費用は**$40**に改定されている[^1]。申請は出発の72時間前までに完了することが推奨される[^2]。

## 2. 交通

スカイライン運賃は**$3.00**である[^3]。大型スーツケースは持ち込み不可[^4]。

# References

[^1]: [ESTA - How do I pay for my application?](https://www.help.cbp.gov/s/article/Article-1282)
[^2]: [CBP's Electronic System for Travel Authorization](https://uk.usembassy.gov/cbps-electronic-system-for-travel-authorization-esta/)
[^3]: [Honolulu Skyline Rail 2025](https://livinginhawaii.com/honolulu-skyline-rail/)
[^4]: [Rail Operations](https://www.honolulu.gov/dts/rail-operations)
```

### 4.2 フォーマット特徴

| 項目 | 説明 |
|------|------|
| 文中引用 | `[^N]` 形式（Obsidian ネイティブ脚注） |
| 脚注番号 | `data-turn-source-index` の値をそのまま使用（非連続可） |
| References セクション | `# References` 見出し + 脚注定義リスト |
| 脚注定義 | `[^N]: [タイトル](URL)` 形式 |
| セキュリティ | DOMPurify でサニタイズ、`sanitizeUrl()` で処理 |
| Obsidian 動作 | `[^N]` クリックで脚注定義へジャンプ |

### 4.3 変換前後の比較

| 変換前（HTML） | 変換後（Markdown） |
|---------------|-------------------|
| `テキスト<source-footnote><sup data-turn-source-index="1">...</sup></source-footnote>` | `テキスト[^1]` |
| `<sources-carousel-inline>...</sources-carousel-inline>` | （削除） |
| （なし） | `# References` + 脚注定義リスト |

---

## 5. 実装計画

### 5.1 Phase 1: 型定義と基本構造
**状態**: ✅ 完了（v2.1）

1. `src/lib/types.ts` に `DeepResearchSource`, `DeepResearchLinks` を追加
2. `ConversationData` に `links` フィールドを追加

### 5.2 Phase 2: 抽出ロジック
**状態**: ✅ 完了（v2.1）

1. `DEEP_RESEARCH_LINK_SELECTORS` を追加
2. `extractSourceList()` を実装
3. `buildSourceMap()` を実装
4. `extractDeepResearchLinks()` を実装
5. `extractDeepResearch()` を更新してリンク情報を含める

### 5.3 Phase 3: Markdown 変換（v3.0 変更）
**状態**: 🔄 要更新

| 関数 | v2.1 状態 | v3.0 変更 |
|------|----------|----------|
| `sanitizeUrl()` | ✅ 実装済み | 変更なし |
| `escapeHtml()` | ✅ 実装済み | 変更なし |
| `convertInlineCitationsToLinks()` | ✅ 実装済み | → `convertInlineCitationsToFootnoteRefs()` に名称・実装変更 |
| `removeSourcesCarousel()` | ✅ 実装済み | 変更なし |
| `convertDeepResearchContent()` | ✅ 実装済み | 脚注形式対応に更新 |
| `replacePlaceholdersWithFootnoteRefs()` | - | 🆕 新規追加 |
| `generateReferencesSection()` | - | 🆕 新規追加 |

### 5.4 Phase 4: テスト（v3.0 変更）
**状態**: 🔄 要更新

1. 脚注参照変換のユニットテスト（新規）
2. References セクション生成のユニットテスト（新規）
3. 重複引用のテスト（同一番号再利用）
4. 非連続番号のテスト
5. 統合テスト（サンプル HTML 使用）

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
- **非連続の可能性**: 番号が飛ぶ場合あり（1, 2, 3, 5, 10, 11...）

### 6.3 重複ソースの扱い（v3.0 変更）

- 同一ソースが複数の文で引用される場合がある
- **v3.0**: 同一の `[^N]` を使用（References に1回のみ記載）
- 重複管理は Obsidian の脚注機能が自動処理

### 6.4 欠損データの処理

| 状況 | 処理 |
|------|------|
| ソースリストに存在しない `data-turn-source-index` | 引用マーカーを削除（空文字） |
| URL が無効（危険スキーム） | 脚注定義でタイトルのみ出力 |
| タイトルが空 | "Unknown Title" を使用 |
| ドメイン取得失敗 | "unknown" を使用 |

### 6.5 セキュリティ考慮事項

#### URLサニタイズ（`sanitizeUrl()`）
- `javascript:`, `data:`, `vbscript:` スキームは除去
- 無効なURLは空文字を返す
- `sanitizeUrl()` で検証してから脚注定義に出力

#### HTMLエスケープ（`escapeHtml()`）
`<span>` タグ生成時に使用:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`

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

**重要**: `data-turn-source-index` 属性は `convertInlineCitationsToFootnoteRefs()` で使用するため、サニタイズ時に保持する必要がある。

#### セキュリティ対策の層

| 層 | 対策 | 目的 |
|----|------|------|
| 1 | DOMPurify サニタイズ | XSS 攻撃防止、`data-turn-source-index` 保持 |
| 2 | `sanitizeUrl()` | 危険な URL スキーム除去 |
| 3 | Turndown 変換 | Markdown への安全な変換 |

### 6.6 脚注形式の利点（v3.0）

| 観点 | インラインリンク方式（v2.1） | 脚注形式（v3.0） |
|------|---------------------------|-----------------|
| 本文の可読性 | 低（URLが長い場合） | 高（`[^N]` のみ） |
| References セクション | なし | あり（全ソース一覧） |
| Obsidian 互換性 | 標準 Markdown | Obsidian ネイティブ脚注 |
| クリック動作 | 外部URLへ直接遷移 | 脚注定義へジャンプ → URLへ遷移 |
| 重複管理 | 不要 | Obsidian が自動処理 |
| ユーザー要件 | ❌（v2.1 で採用） | ✅（v3.0 で採用） |

---

## 7. テスト計画

### 7.1 ユニットテスト

| テスト項目 | 説明 | 実装状態 |
|-----------|------|---------|
| `extractSourceList()` | URL、タイトル、ドメインの抽出 | ✅ 実装済み |
| `buildSourceMap()` | 1ベースインデックスへのマッピング | ✅ 実装済み |
| `convertInlineCitationsToFootnoteRefs()` | `<sup>` → `<span data-footnote-ref>` 変換 | 🔄 要更新 |
| `replacePlaceholdersWithFootnoteRefs()` | プレースホルダー → `[^N]` 変換 | 🆕 新規 |
| `generateReferencesSection()` | References セクション生成 | 🆕 新規 |
| `sanitizeUrl()` | 危険スキームの除去 | ✅ 実装済み |
| `sanitizeHtml()` | DOMPurify による XSS 防止 | ✅ 実装済み |

### 7.2 エッジケース

| シナリオ | 期待結果 | 実装状態 |
|---------|---------|---------|
| 引用なし | 本文のみ（脚注なし、References なし） | 🔄 要更新 |
| ソースリストなし | 本文のみ | 🔄 要更新 |
| ソースリストに存在しない `data-turn-source-index` | 引用マーカー削除（空文字） | ✅ |
| 重複引用（同じインデックス複数回） | 同一 `[^N]` を使用、References に1回のみ | 🆕 新規 |
| 非連続番号（1, 2, 5, 10...） | 番号をそのまま使用 | 🆕 新規 |
| 無効なURL（`javascript:`） | 脚注定義でタイトルのみ出力 | 🔄 要更新 |
| 日本語タイトル | 正しく出力 | ✅ |
| タイトルに `<script>` 含む | エスケープして出力 | ✅ |
| URLに `()` 含む | Markdown リンク内で正しくエスケープ | 🔄 要確認 |
| `data-turn-source-index` 属性保持 | DOMPurify サニタイズ後も属性残存 | ✅ |

---

## 8. 影響範囲

### 8.1 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/types.ts` | `DeepResearchSource`, `DeepResearchLinks`（変更なし） |
| `src/lib/sanitize.ts` | `sanitizeHtml()`（変更なし） |
| `src/content/extractors/gemini.ts` | `extractSourceList()`, `extractDeepResearchLinks()`（変更なし） |
| `src/content/markdown.ts` | `convertInlineCitationsToFootnoteRefs()`, `replacePlaceholdersWithFootnoteRefs()`, `generateReferencesSection()`, `convertDeepResearchContent()` 更新 |
| `test/content/markdown.test.ts` | 脚注形式変換テスト追加・更新 |

### 8.2 後方互換性

- `ConversationData.links` は optional（変更なし）
- 既存のレポート抽出機能に影響なし
- **破壊的変更**: 出力形式がインラインリンク → 脚注形式に変更

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
| 3.0 | 2025-01-12 | **Obsidian ネイティブ脚注形式に変更**: `[^N]` 参照 + `# References` セクション追加、`data-turn-source-index` の非連続番号をそのまま使用、重複引用は同一番号再利用、未参照ソースも References に含める |

---

## 関連ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [Deep Research 抽出機能 設計書](./deep-research-extraction.md) | Deep Research コンテンツの基本抽出仕様 |
| [インライン引用の折りたたみ状態に関する調査レポート](../investigation/inline-citation-collapsed-state.md) | `data-turn-source-index` 属性の机上検証結果 |
| [Markdown 二重エスケープ問題 調査レポート](../investigation/double-escape-issue.md) | `<a>` タグ方式採用の経緯と技術的詳細 |
| [Obsidian Help - Basic formatting syntax](https://help.obsidian.md/syntax) | Obsidian 脚注構文の公式ドキュメント |
| [GitHub - obsidian-help/Footnote.md](https://github.com/obsidianmd/obsidian-help/blob/master/Sandbox/Formatting/Footnote.md) | Obsidian 脚注サンプル |

---

*作成日: 2025-01-11*
*更新日: 2025-01-12*
*バージョン: 3.0*
*前提: deep-research-extraction.md v1.1*

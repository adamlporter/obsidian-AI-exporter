# Deep Research リンク v3.0 実装ワークフロー

## 概要

設計書 v3.0 に基づき、インラインリンク形式から **Obsidian ネイティブ脚注形式** への変更を実装する。

---

## 現状分析

### 変更対象ファイル

| ファイル | 現在の状態 | 変更内容 |
|----------|-----------|---------|
| [src/content/markdown.ts](../../src/content/markdown.ts) | v2.1（インラインリンク方式） | 脚注形式に全面改修 |
| [test/content/markdown.test.ts](../../test/content/markdown.test.ts) | v2.1 テスト | 脚注形式テストに更新 |

### 変更不要ファイル

- `src/lib/types.ts` - 型定義は既存のまま使用可能
- `src/lib/sanitize.ts` - サニタイズロジックは変更なし
- `src/content/extractors/gemini.ts` - 抽出ロジックは変更なし

---

## 実装ステップ

### Phase 1: 新関数の追加

#### Step 1.1: `convertInlineCitationsToFootnoteRefs()` の実装

**場所**: `src/content/markdown.ts`

**変更内容**:
- 既存の `convertInlineCitationsToLinks()` を `convertInlineCitationsToFootnoteRefs()` にリネーム
- `<a>` タグ生成を `<span data-footnote-ref="N">` に変更

```typescript
// 変更前
return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;

// 変更後
return `<span data-footnote-ref="${index}"></span>`;
```

#### Step 1.2: `replacePlaceholdersWithFootnoteRefs()` の追加

**場所**: `src/content/markdown.ts`

**新規関数**:
```typescript
export function replacePlaceholdersWithFootnoteRefs(markdown: string): string {
  return markdown.replace(
    /<span data-footnote-ref="(\d+)"><\/span>/gi,
    (match, index) => `[^${index}]`
  );
}
```

#### Step 1.3: `generateReferencesSection()` の追加

**場所**: `src/content/markdown.ts`

**新規関数**:
```typescript
export function generateReferencesSection(
  sources: DeepResearchSource[]
): string {
  if (sources.length === 0) {
    return '';
  }

  const lines: string[] = ['', '# References', ''];

  sources.forEach((source, arrayIndex) => {
    const footnoteIndex = arrayIndex + 1;
    const safeUrl = sanitizeUrl(source.url);

    if (safeUrl) {
      lines.push(`[^${footnoteIndex}]: [${source.title}](${safeUrl})`);
    } else {
      lines.push(`[^${footnoteIndex}]: ${source.title}`);
    }
  });

  return lines.join('\n');
}
```

### Phase 2: メイン関数の更新

#### Step 2.1: `convertDeepResearchContent()` の更新

**場所**: `src/content/markdown.ts`

**変更内容**:
```typescript
export function convertDeepResearchContent(html: string, links?: DeepResearchLinks): string {
  let processed = html;

  // 1. Build source map (1-based index)
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    sourceMap = buildSourceMap(links.sources);
  }

  // 2. Convert inline citations to placeholder spans (NEW)
  processed = convertInlineCitationsToFootnoteRefs(processed, sourceMap);

  // 3. Remove sources carousel
  processed = removeSourcesCarousel(processed);

  // 4. Convert HTML to Markdown
  let markdown = htmlToMarkdown(processed);

  // 5. Replace placeholders with footnote refs (NEW)
  markdown = replacePlaceholdersWithFootnoteRefs(markdown);

  // 6. Add References section (NEW)
  if (links && links.sources.length > 0) {
    markdown += generateReferencesSection(links.sources);
  }

  return markdown;
}
```

### Phase 3: テストの更新

#### Step 3.1: 既存テストの更新

**場所**: `test/content/markdown.test.ts`

**変更内容**:
1. `convertInlineCitationsToLinks` → `convertInlineCitationsToFootnoteRefs` にリネーム
2. 期待結果を `<a>` タグから `<span data-footnote-ref>` に変更
3. `convertDeepResearchContent` の期待結果を脚注形式に変更

#### Step 3.2: 新規テストの追加

**新規テストケース**:

```typescript
describe('replacePlaceholdersWithFootnoteRefs', () => {
  it('replaces single placeholder', () => {
    const input = 'Text<span data-footnote-ref="1"></span>more';
    expect(replacePlaceholdersWithFootnoteRefs(input)).toBe('Text[^1]more');
  });

  it('replaces multiple placeholders', () => {
    const input = 'A<span data-footnote-ref="1"></span>B<span data-footnote-ref="2"></span>';
    expect(replacePlaceholdersWithFootnoteRefs(input)).toBe('A[^1]B[^2]');
  });

  it('handles non-sequential indices', () => {
    const input = '<span data-footnote-ref="5"></span><span data-footnote-ref="10"></span>';
    expect(replacePlaceholdersWithFootnoteRefs(input)).toBe('[^5][^10]');
  });

  it('preserves content without placeholders', () => {
    expect(replacePlaceholdersWithFootnoteRefs('plain text')).toBe('plain text');
  });
});

describe('generateReferencesSection', () => {
  it('generates empty string for empty sources', () => {
    expect(generateReferencesSection([])).toBe('');
  });

  it('generates References section with footnote definitions', () => {
    const sources = [
      { index: 0, url: 'https://a.com', title: 'Article A', domain: 'a.com' },
      { index: 1, url: 'https://b.com', title: 'Article B', domain: 'b.com' },
    ];
    const result = generateReferencesSection(sources);

    expect(result).toContain('# References');
    expect(result).toContain('[^1]: [Article A](https://a.com)');
    expect(result).toContain('[^2]: [Article B](https://b.com)');
  });

  it('handles invalid URLs by showing title only', () => {
    const sources = [
      { index: 0, url: 'javascript:alert(1)', title: 'Bad', domain: 'bad.com' },
    ];
    const result = generateReferencesSection(sources);

    expect(result).toContain('[^1]: Bad');
    expect(result).not.toContain('javascript:');
  });

  it('uses 1-based index for footnote numbers', () => {
    const sources = [
      { index: 0, url: 'https://first.com', title: 'First', domain: 'first.com' },
    ];
    const result = generateReferencesSection(sources);

    expect(result).toContain('[^1]:'); // Not [^0]
  });
});
```

#### Step 3.3: 統合テストの更新

```typescript
describe('convertDeepResearchContent with footnotes', () => {
  it('converts citations to footnotes with References section', () => {
    const html = '<p>Text<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const result = convertDeepResearchContent(html, links);

    expect(result).toContain('[^1]');
    expect(result).toContain('# References');
    expect(result).toContain('[^1]: [Source](https://example.com)');
  });

  it('handles duplicate citations with same footnote number', () => {
    const html = '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const result = convertDeepResearchContent(html, links);

    // Both citations should use [^1]
    expect((result.match(/\[\^1\]/g) || []).length).toBe(3); // 2 in text + 1 in definition
    expect(result).toContain('# References');
  });

  it('works without links (no References section)', () => {
    const html = '<p>Simple content</p>';
    const result = convertDeepResearchContent(html, undefined);

    expect(result).toContain('Simple content');
    expect(result).not.toContain('# References');
  });
});
```

### Phase 4: 検証

#### Step 4.1: ユニットテスト実行

```bash
npm run test:unit -- test/content/markdown.test.ts
```

#### Step 4.2: TypeScript 型チェック

```bash
npm run build
```

#### Step 4.3: Lint チェック

```bash
npm run lint
```

---

## 依存関係グラフ

```
Phase 1 (並列可能)
├── Step 1.1: convertInlineCitationsToFootnoteRefs()
├── Step 1.2: replacePlaceholdersWithFootnoteRefs()
└── Step 1.3: generateReferencesSection()
       ↓
Phase 2 (Phase 1 完了後)
└── Step 2.1: convertDeepResearchContent() 更新
       ↓
Phase 3 (Phase 2 完了後)
├── Step 3.1: 既存テスト更新
├── Step 3.2: 新規テスト追加
└── Step 3.3: 統合テスト更新
       ↓
Phase 4 (Phase 3 完了後)
├── Step 4.1: ユニットテスト実行
├── Step 4.2: TypeScript 型チェック
└── Step 4.3: Lint チェック
```

---

## リスク評価

| リスク | 影響 | 対策 |
|--------|------|------|
| Turndown が `<span>` を削除する可能性 | 脚注参照が消失 | 正規表現で Turndown 出力を後処理 |
| 非連続番号の扱い | 脚注番号がずれる | `data-turn-source-index` の値をそのまま使用 |
| 既存テストの破壊的変更 | CI 失敗 | 全テストケースを更新 |

---

## 期待される出力

### 変更前（v2.1）
```markdown
テキスト[Article Title](https://example.com)テキスト
```

### 変更後（v3.0）
```markdown
テキスト[^1]テキスト

# References

[^1]: [Article Title](https://example.com)
```

---

## 承認チェックリスト

- [ ] 設計書 v3.0 レビュー完了
- [ ] 実装ワークフロー承認
- [ ] 実装開始許可

---

*作成日: 2025-01-12*
*設計書バージョン: v3.0*

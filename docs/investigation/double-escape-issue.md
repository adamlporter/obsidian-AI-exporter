# Markdown 二重エスケープ問題 調査レポート

## 調査日

2025-01-12

## 問題概要

Deep Research のインライン引用を Markdown リンクに変換した際、括弧がエスケープされて出力された。

### 症状

**期待される出力:**
```markdown
テキスト[ESTA - How do I pay for my application?](https://www.help.cbp.gov/s/article/Article-1282)
```

**実際の出力:**
```markdown
テキスト\[ESTA - How do I pay for my application?\](https://www.help.cbp.gov/s/article/Article-1282?language=en\_US)
```

---

## 原因分析

### 処理フロー（修正前）

```
1. convertInlineCitationsToLinks()
   - <sup data-turn-source-index="N"> を検出
   - [タイトル](URL) 形式の Markdown を直接生成
   - escapeMarkdownLinkText() で [] をエスケープ → \[\]

2. htmlToMarkdown() (Turndown)
   - HTML を Markdown に変換
   - 既にエスケープされた \[\] を再度エスケープ
   - 結果: \\[\\] （二重エスケープ）
```

### 根本原因

**Turndown の変換対象に Markdown 文字列を混在させたこと**

Turndown は HTML を Markdown に変換するライブラリであり、入力 HTML 内に Markdown 構文が含まれている場合、それをリテラルテキストとして扱う（= エスケープする）。

```typescript
// 修正前のコード（問題あり）
function convertInlineCitationsToLinks(html, sourceMap) {
  return html.replace(
    /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi,
    (match, indexStr) => {
      const source = sourceMap.get(index);
      // ❌ Markdown を直接生成 → Turndown で二重エスケープ
      return `[${escapeMarkdownLinkText(source.title)}](${escapeMarkdownLinkUrl(source.url)})`;
    }
  );
}
```

---

## 解決策

### アプローチ: HTML `<a>` タグ経由で変換

**設計方針:**
1. インライン引用を `<a href="URL">Title</a>` タグに変換
2. Turndown に `<a>` タグの Markdown 変換を委ねる
3. 二重エスケープを回避

### 処理フロー（修正後）

```
1. convertInlineCitationsToLinks()
   - <sup data-turn-source-index="N"> を検出
   - <a href="URL">Title</a> 形式の HTML を生成
   - escapeHtml() で HTML 特殊文字をエスケープ

2. htmlToMarkdown() (Turndown)
   - <a> タグを [Title](URL) に変換
   - 正しいエスケープ処理を適用
   - 結果: クリーンな Markdown リンク
```

---

## 実装詳細

### 修正後のコード

```typescript
// src/content/markdown.ts

/**
 * Escape HTML special characters for safe insertion into HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert inline citations to anchor tags for Turndown processing
 *
 * Before: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * After: <a href="URL">Title</a>
 *
 * Design: Instead of generating Markdown directly, we convert to <a> tags
 * and let Turndown handle the Markdown conversion. This avoids double-escaping
 * issues where our Markdown escapes get re-escaped by Turndown.
 */
export function convertInlineCitationsToLinks(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  // Pattern 1: source-footnote wrapped
  let result = html.replace(
    /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi,
    (match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        const safeUrl = sanitizeUrl(source.url);
        if (safeUrl) {
          // ✅ <a> タグを生成 → Turndown が Markdown に変換
          return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;
        }
        return escapeHtml(source.title); // URL invalid: title only
      }
      return ''; // Source not found: remove marker
    }
  );

  // Pattern 2: standalone sup element (fallback)
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
```

### 削除した関数

以下の関数は不要になったため削除:

- `escapeMarkdownLinkText()` - `[]` のエスケープ
- `escapeMarkdownLinkUrl()` - `()` のパーセントエンコード

**理由:** Turndown が `<a>` タグを Markdown に変換する際、適切なエスケープを自動で行うため。

---

## エスケープ処理の比較

### 修正前（Markdown 直接生成）

| 処理段階 | 入力 | 出力 |
|----------|------|------|
| convertInlineCitationsToLinks | `<sup data-turn-source-index="1">` | `[Title](URL)` |
| escapeMarkdownLinkText | `Title` | `Title`（変更なし） |
| escapeMarkdownLinkUrl | `URL` | `URL`（変更なし） |
| htmlToMarkdown (Turndown) | `[Title](URL)` | `\[Title\](URL)` ❌ |

### 修正後（`<a>` タグ経由）

| 処理段階 | 入力 | 出力 |
|----------|------|------|
| convertInlineCitationsToLinks | `<sup data-turn-source-index="1">` | `<a href="URL">Title</a>` |
| escapeHtml | `Title`, `URL` | HTML エスケープ済み |
| htmlToMarkdown (Turndown) | `<a href="URL">Title</a>` | `[Title](URL)` ✅ |

---

## セキュリティ考慮事項

### HTML エスケープ（`escapeHtml()`）

`<a>` タグに挿入する前に、以下の文字をエスケープ:

| 文字 | エスケープ後 | 目的 |
|------|-------------|------|
| `&` | `&amp;` | アンパサンド |
| `<` | `&lt;` | タグ開始 |
| `>` | `&gt;` | タグ終了 |
| `"` | `&quot;` | 属性値区切り |

### URL サニタイズ（`sanitizeUrl()`）

危険なスキームをブロック:

- `javascript:`
- `data:`
- `vbscript:`

無効な URL は空文字を返し、タイトルのみ出力。

---

## テスト結果

### 修正前

```
 FAIL  test/content/markdown.test.ts
 ✕ converts citations to inline links
   Expected: "[Source](https://example.com)"
   Received: "\\[Source\\](https://example.com)"
```

### 修正後

```
 PASS  test/content/markdown.test.ts
 ✓ converts citations to inline links
 ✓ handles multiple sources with 1-based index mapping
 ✓ converts Deep Research with links to note with inline links

 Test Files  15 passed (15)
      Tests  366 passed (366)
```

---

## 影響範囲

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/content/markdown.ts` | `convertInlineCitationsToLinks()` を `<a>` タグ方式に変更、`escapeHtml()` 追加、`escapeMarkdownLink*()` 削除 |
| `test/content/markdown.test.ts` | テスト期待値を `<a>` タグ → クリーン Markdown に更新 |

### 後方互換性

- 出力フォーマットは変更なし（クリーンな Markdown リンク）
- API の変更なし
- 既存の Deep Research 抽出には影響なし

---

## 教訓

### Turndown 使用時の注意点

1. **Turndown の入力は純粋な HTML であるべき**
   - Markdown 構文を HTML に混在させない
   - Markdown を出力したい場合は、対応する HTML タグを使用

2. **エスケープは Turndown に任せる**
   - `<a>` タグ → `[Title](URL)`
   - `<strong>` タグ → `**Text**`
   - 手動エスケープは不要

3. **HTML への挿入時は HTML エスケープを使用**
   - Markdown エスケープではなく HTML エンティティ（`&lt;`, `&amp;` など）

---

## 関連ドキュメント

- [Deep Research リンク抽出機能 設計書](../design/deep-research-links-extraction.md)
- [インライン引用の折りたたみ状態に関する調査レポート](./inline-citation-collapsed-state.md)

---

*作成日: 2025-01-12*
*調査者: Claude*

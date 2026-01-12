# インライン引用の折りたたみ状態に関する調査レポート

## 調査目的

Deep Research レポートにおいて、インラインリンク（カルーセル）が展開されていない状態でも、引用番号（`data-turn-source-index`）を取得できるかどうかを調査する。

---

## 調査対象ファイル

| ファイル | 状態 | サイズ |
|----------|------|--------|
| `data/gemini-deep-research-collapsed.html` | 折りたたみ状態 | 小 |
| `data/gemini-deep-research-expanded.html` | 展開状態 | 大 |

---

## DOM 構造比較

### 折りたたみ状態（collapsed）

```html
<source-footnote class="ng-star-inserted">
  <sup class="superscript" data-turn-source-index="5">
    <!---->
  </sup>
</source-footnote>
```

**特徴**:
- `data-turn-source-index="5"` は**存在する** ✅
- `<sup>` 内のテキストは**空**（コメントノードのみ）
- `class="superscript"` に `visible` クラスが**ない**

### 展開状態（expanded）

```html
<source-footnote class="ng-star-inserted">
  <sup class="superscript visible" data-turn-source-index="5">
     1 
    <!---->
  </sup>
</source-footnote>
```

**特徴**:
- `data-turn-source-index="5"` は**存在する** ✅
- `<sup>` 内に表示番号 ` 1 ` が**存在する**
- `class="superscript visible"` に `visible` クラスが**ある**

---

## sources-carousel の比較

### 折りたたみ状態

```html
<sources-carousel style="display: flex; visibility: hidden;">
  <div class="container hide">
    <div class="sources-carousel-source hide">
      <!---->  <!-- 空 -->
    </div>
  </div>
</sources-carousel>
```

**特徴**:
- `visibility: hidden` で非表示
- `class="hide"` が付与
- カルーセル内のソースカードは**空**（遅延ロード未実行）

### 展開状態

```html
<sources-carousel style="display: flex; visibility: visible;">
  <div class="container">
    <div class="sources-carousel-source">
      <card-renderer>
        <url-source-card>
          <a href="https://www.nasa.gov/...">
            <span class="source-card-title">SEH 2.0 Fundamentals...</span>
          </a>
        </url-source-card>
      </card-renderer>
    </div>
  </div>
</sources-carousel>
```

**特徴**:
- `visibility: visible` で表示
- `class="hide"` が**ない**
- ソースカードが**動的にロードされている**

---

## 結論

### 折りたたみ状態でも取得可能なデータ

| データ | 取得可否 | セレクタ |
|--------|----------|----------|
| 引用インデックス番号 | ✅ 可能 | `sup[data-turn-source-index]` |
| 引用の文書内位置 | ✅ 可能 | 親要素から特定可能 |

### 折りたたみ状態では取得不可能なデータ

| データ | 取得可否 | 理由 |
|--------|----------|------|
| インラインカルーセル内のURL | ❌ 不可 | 遅延ロードで空 |
| インラインカルーセル内のタイトル | ❌ 不可 | 遅延ロードで空 |
| 表示番号（`1`, `2` など） | ❌ 不可 | 展開時のみ表示 |

---

## 設計への影響

### 現在の設計書の前提

設計書 v1.1 では以下の2箇所からデータを取得する方針：

1. **インライン引用**: `data-turn-source-index` から引用番号を取得
2. **ドキュメント末尾のソースリスト**: URL/タイトル/ドメインを取得

### 調査結果との整合性

| 設計方針 | 調査結果 | 判定 |
|----------|----------|------|
| `data-turn-source-index` から番号取得 | 折りたたみ状態でも取得可能 | ✅ 問題なし |
| ソースリストからURL取得 | ドキュメント末尾のリストは常に存在 | ✅ 問題なし |

---

## 重要な発見

### インデックス番号の不一致

折りたたみ状態のサンプルでは：
- `data-turn-source-index="5"` （0ベースのソースインデックス）

展開状態のサンプルでは：
- `data-turn-source-index="5"` + 表示番号 ` 1 `

**観察**: 
- `data-turn-source-index` は**0ベースのソースインデックス**
- 表示番号（` 1 `）は**文書内での出現順序**（異なる番号体系）

### ソースリストとの対応

`gemini-elements-sample.html` の調査結果：
- インライン引用で使用されている `data-turn-source-index`: 約30種類（非連続）
- ドキュメント末尾のソースリスト項目数: 116件

**観察**:
- ソースリストには全ソースが含まれる
- インライン引用は一部のソースのみを参照
- インデックスは連続していない（1, 2, 3, 5, 10, 11, 13, 15...）

---

## 結論サマリー

**質問**: 折りたたみ状態でもインラインリンクの存在を判断できるか？

**回答**: **はい、可能です。**

理由：
1. `data-turn-source-index` 属性は折りたたみ状態でも DOM に存在する
2. この属性値を使って、ドキュメント末尾のソースリストとマッピングできる
3. インラインカルーセル内のデータは不要（ソースリストで代替可能）

---

## 推奨事項

1. **現在の設計書の方針を維持**: インライン引用は `data-turn-source-index` から取得、URL情報はソースリストから取得
2. **カルーセル内データは無視**: 遅延ロードの問題を回避
3. **インデックスマッピングの検証**: ソースリストのインデックスが `data-turn-source-index` と一致するか要確認

---

## 追加調査が必要な項目

- [x] ソースリスト内の各項目に対応するインデックス番号の特定方法
- [x] `data-turn-source-index` とソースリストの順序の対応関係
- [x] 現在の実装の分析とインデックスマッピング問題の解決策

---

## 追加調査結果（2025-01-12）

### 現在の実装分析

#### extractSourceList() の実装

```typescript
// src/content/extractors/gemini.ts:164-199
extractSourceList(): DeepResearchSource[] {
  const sources: DeepResearchSource[] = [];
  const selector = DEEP_RESEARCH_LINK_SELECTORS.sourceListItem.join(',');
  const sourceLinks = document.querySelectorAll(selector);

  sourceLinks.forEach((link, index) => {  // ← 問題箇所: forEach の index を使用
    // ...
    sources.push({
      index,  // ← 連続する 0, 1, 2, 3... を割り当て
      url,
      title: this.sanitizeText(title),
      domain,
    });
  });
  return sources;
}
```

**問題点**:
- `forEach` のコールバックで取得する `index` は配列の連続インデックス（0, 1, 2, 3...）
- しかし `data-turn-source-index` の値は非連続（1, 2, 3, 5, 10, 11, 13...）
- このミスマッチにより、インライン引用とソースリストの正確なマッピングができない

#### DEEP_RESEARCH_LINK_SELECTORS

```typescript
// src/content/extractors/gemini.ts:74-91
DEEP_RESEARCH_LINK_SELECTORS = {
  inlineCitation: [
    'source-footnote sup.superscript[data-turn-source-index]',
    'sup.superscript[data-turn-source-index]',
  ],
  sourceListContainer: ['deep-research-source-lists', '#used-sources-list'],
  sourceListItem: [
    'a[data-test-id="browse-web-item-link"]',
    'a[data-test-id="browse-chip-link"]',
  ],
  // ...
};
```

---

### インデックスマッピング問題の詳細分析

#### サンプルデータの調査結果

| データソース | 値の特徴 |
|-------------|----------|
| `data-turn-source-index` | 非連続（1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 15...） |
| `forEach` の `index` | 連続（0, 1, 2, 3, 4, 5...） |
| 表示脚注番号 | 連続（1, 2, 3...、出現順） |

#### gemini-elements-sample.html の具体的データ

インライン引用で使用されている `data-turn-source-index` 値（出現頻度順）：
```
1(3回), 2(2回), 3(2回), 5(2回), 6(1回), 7(3回), 8(1回), 9(2回),
10(1回), 11(1回), 13(2回), 15(2回), 16(1回), 18(1回), 19(1回),
20(2回), 21(2回), 22(2回), 24(3回), 25(2回), 26(1回), 27(1回),
28(1回), 29(3回), 32(1回), 33(1回), 34(1回), 36(1回), 38(1回),
39(2回), 41(2回), 43(1回), 45(2回), 47(1回)
```

**欠番**: 0, 4, 12, 14, 17, 23, 30, 31, 35, 37, 40, 42, 44, 46

---

### 解決策の分析

#### 方法A: ソースリスト要素から直接インデックスを取得（推奨）

**前提**: ソースリストの各項目がDOMに `data-turn-source-index` 相当の属性を持っている場合

**調査結果**:
- `a[data-test-id="browse-web-item-link"]` には `data-turn-source-index` 属性は**存在しない**
- ソースリスト要素のDOMは純粋なリンクリストで、インデックス属性を持たない

**結論**: この方法は**使用不可**

#### 方法B: 出現順序ベースのマッピング

**アプローチ**:
1. インライン引用から `data-turn-source-index` の**ユニークな値**を出現順に収集
2. ソースリストも出現順に収集
3. 両者を出現順でマッピング

**仮説**: ソースリストの順序 = `data-turn-source-index` の出現順序（昇順）

**検証が必要な点**:
- ソースリストが `data-turn-source-index` の昇順で並んでいるか
- それとも文書内での初出順序か

**リスク**: 順序の仮定が間違っている場合、全マッピングがズレる

#### 方法C: インラインカルーセル展開による直接取得

**アプローチ**:
1. 各インライン引用のカルーセルをプログラムで展開（click イベント発火）
2. 展開後のカルーセル内からURLを直接取得
3. `data-turn-source-index` とURLを直接紐付け

**メリット**:
- 確実なマッピング
- インデックスの順序に依存しない

**デメリット**:
- DOM操作が重い（全引用を展開する必要）
- 遅延ロードの完了を待つ必要がある
- ユーザー体験への影響（UIが変化する）

#### 方法D: 両方のデータソースから独立して番号付け（現在の設計書方針）

**アプローチ**:
1. インライン引用: `data-turn-source-index` を脚注番号として使用
2. ソースリスト: 全URLを独立してReferencesセクションに出力
3. マッピングは諦め、両者を別々に扱う

**メリット**:
- 実装がシンプル
- マッピング失敗のリスクがない

**デメリット**:
- 脚注とReferencesの番号が一致しない可能性
- ユーザーにとって分かりにくい

---

### ✅ 解決済み: インデックスマッピング問題（2025-01-12）

#### 検証結果

ユーザーによるカルーセル展開検証により、マッピング規則が判明：

```
data-turn-source-index は 1ベース
ソースリストの配列は 0ベース
変換式: sourceListIndex = data-turn-source-index - 1
```

**検証手順**:
1. `data-turn-source-index="1"` のカルーセルをクリック
2. 展開されたURLを取得:
   - `https://www.nasa.gov/reference/2-0-fundamentals-of-systems-engineering/`
   - `https://nodis3.gsfc.nasa.gov/displayAll.cfm?...`
3. ソースリスト[0], [1] のURLと比較 → **一致**

#### 採用方針

**インラインリンク方式**を採用（脚注形式は不採用）

```
変換前: テキスト<sup data-turn-source-index="N">...</sup>
変換後: テキスト[タイトル](URL)
```

**理由**:
- ユーザー要件: 「ナンバリングが元のレポートとマッチすることは重要ではありません」
- シンプルな出力形式が望ましい
- Referencesセクション不要

#### 設計書への反映

`docs/design/deep-research-links-extraction.md` v2.0 に反映済み:
- `data-turn-source-index` を1ベースに修正
- `InlineCitation` 型削除
- `convertInlineCitationsToLinks()` を新規追加
- `generateFootnoteDefinitions()`, `generateReferencesSection()` 削除

---

*更新日: 2025-01-12*
*調査者: Claude*

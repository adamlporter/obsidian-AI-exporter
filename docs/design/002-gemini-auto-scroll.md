# DES-002: Gemini Auto-Scroll Design Specification

| Field | Value |
|-------|-------|
| **Document ID** | DES-002 |
| **Date** | 2026-02-20 |
| **Status** | Final |
| **Issue** | [#49](https://github.com/sho7650/obsidian-AI-exporter/issues/49) |
| **ADR** | [ADR-002](../adr/002-gemini-auto-scroll.md) |

---

## 1. Purpose

Gemini の長い会話で、遅延読み込み（backward infinite scroll）により DOM に存在しないメッセージが抽出されない問題を解決する。

**現状**: `extractMessages()` は DOM に存在する `.conversation-container` のみを読む。長い会話では最新のメッセージしか DOM にないため、サイレントに不完全な抽出となる。

**目標**: 抽出前に自動スクロールで全メッセージを DOM にロードし、完全な会話を取得する。

---

## 2. Scope

### In Scope

- `GeminiExtractor` への自動スクロール機構の追加
- タイムアウト時の部分抽出と警告表示
- ユニットテスト

### Out of Scope

- 他プラットフォーム (Claude / ChatGPT / Perplexity) のスクロール対応
- Gemini API 直接呼び出しによるメッセージ取得
- Settings UI でのスクロール設定
- `BaseExtractor` / `IConversationExtractor` インターフェースの変更

---

## 3. Background: Gemini DOM Structure

### 3.1 Scroll Container Hierarchy

```
<div id="chat-history" class="chat-history-scroll-container">   ← scrollable
  <infinite-scroller class="chat-history">                      ← Angular component
    <div class="conversation-container">                        ← turn 1 (oldest)
      <user-query>...</user-query>
      <model-response>...</model-response>
    </div>
    <div class="conversation-container">                        ← turn 2
      ...
    </div>
    ...
    <div class="conversation-container">                        ← turn N (newest)
      ...
    </div>
  </infinite-scroller>
</div>
```

### 3.2 Lazy Loading Behavior

| 特性 | 値 |
|------|-----|
| 方式 | Append-only lazy loading |
| トリガー | `#chat-history` の `scrollTop` が上端に近づいた時 |
| ロード単位 | サーバーから会話ターン (`.conversation-container`) のバッチ |
| ノード削除 | **なし** (true virtual scroll ではない) |
| API | `/_/BardChatUi/data/batchexecute` / GRPC `hNvQHb` (READ_CHAT) |

**重要**: 一度 DOM にロードされたノードは消えない。全メッセージがロードされれば、既存の `extractMessages()` がそのまま動作する。

---

## 4. Interface Specification

### 4.1 ScrollResult (module-private)

```typescript
/**
 * Result of the auto-scroll process
 * Internal to gemini.ts — not exported
 */
interface ScrollResult {
  /** Whether all messages loaded before timeout */
  fullyLoaded: boolean;
  /** Number of .conversation-container elements found after scrolling */
  elementCount: number;
  /** Total scroll-poll iterations performed */
  scrollIterations: number;
  /** Whether scrolling was unnecessary (already at top or no container) */
  skipped: boolean;
}
```

### 4.2 Constants

File: `src/lib/constants.ts`

```typescript
// ============================================================
// Auto-Scroll Configuration (Gemini)
// ============================================================

/** Interval between scroll-to-top attempts (milliseconds) */
export const SCROLL_POLL_INTERVAL = 1000;

/** Maximum time to wait for all messages to load (milliseconds) */
export const SCROLL_TIMEOUT = 30000;

/** Number of consecutive unchanged element counts to consider loading complete */
export const SCROLL_STABILITY_THRESHOLD = 3;
```

### 4.3 Selectors

File: `src/content/extractors/gemini.ts` — existing `SELECTORS` object に追加

```typescript
const SELECTORS = {
  // ... existing entries ...

  // Scroll container for lazy-load detection
  scrollContainer: [
    '#chat-history',
    '.chat-history-scroll-container',
    'infinite-scroller',
  ],
};
```

---

## 5. Method Specification

### 5.1 `ensureAllMessagesLoaded()`

| Item | Value |
|------|-------|
| Visibility | `private` |
| Signature | `async ensureAllMessagesLoaded(): Promise<ScrollResult>` |
| Location | `GeminiExtractor` class, `gemini.ts` |

#### Preconditions

- `canExtract()` returns `true`
- Deep Research panel is NOT visible (caller checks this before calling)

#### Algorithm

```
function ensureAllMessagesLoaded():
    container = queryWithFallback(SELECTORS.scrollContainer)

    if container is null:
        log "[G2O] No scroll container found, skipping auto-scroll"
        return { fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true }

    if container.scrollTop === 0:
        count = countConversationElements()
        log "[G2O] Conversation already at top, no scroll needed"
        return { fullyLoaded: true, elementCount: count, scrollIterations: 0, skipped: true }

    log "[G2O] Partial load detected, auto-scrolling to load all messages"

    previousCount = 0
    stableCount = 0
    iterations = 0
    startTime = Date.now()

    while (Date.now() - startTime < SCROLL_TIMEOUT):
        container.scrollTo({ top: 0 })
        await delay(SCROLL_POLL_INTERVAL)

        currentCount = countConversationElements()
        iterations++

        if currentCount === previousCount:
            stableCount++
            if stableCount >= SCROLL_STABILITY_THRESHOLD:
                log "[G2O] DOM stabilized after {iterations} iterations with {currentCount} elements"
                return { fullyLoaded: true, elementCount: currentCount, scrollIterations: iterations, skipped: false }
        else:
            log debug "[G2O] Element count changed: {previousCount} -> {currentCount}"
            stableCount = 0
            previousCount = currentCount

    finalCount = countConversationElements()
    log warn "[G2O] Auto-scroll timed out after {SCROLL_TIMEOUT}ms with {finalCount} elements"
    return { fullyLoaded: false, elementCount: finalCount, scrollIterations: iterations, skipped: false }
```

#### Postconditions

- `fullyLoaded === true`: 全メッセージが DOM に存在する
- `fullyLoaded === false`: タイムアウト。DOM にある分だけ存在する
- `skipped === true`: スクロール不要だった (短い会話 or コンテナなし)

### 5.2 `countConversationElements()`

| Item | Value |
|------|-------|
| Visibility | `private` |
| Signature | `countConversationElements(): number` |

```typescript
private countConversationElements(): number {
  return document.querySelectorAll(
    SELECTORS.conversationTurn.join(',')
  ).length;
}
```

**Note**: `SELECTORS.conversationTurn` を comma-join して使う。`queryAllWithFallback` は優先順位付きだが、ここでは「合計数」が欲しいので全セレクタを結合する。

### 5.3 `delay()`

| Item | Value |
|------|-------|
| Visibility | `private` |
| Signature | `delay(ms: number): Promise<void>` |

```typescript
private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## 6. Sequence Diagram

### 6.1 Normal Flow (Long Conversation)

```
User          Content Script         GeminiExtractor        DOM / Gemini Server
 |                |                       |                        |
 |--click Sync--->|                       |                        |
 |                |---extract()---------->|                        |
 |                |                       |--canExtract()          |
 |                |                       |--isDeepResearchVisible()|
 |                |                       |                        |
 |                |                       |--ensureAllMessagesLoaded()
 |                |                       |   |                    |
 |                |                       |   |--queryWithFallback(scrollContainer)
 |                |                       |   |   return #chat-history
 |                |                       |   |                    |
 |                |                       |   |--check scrollTop   |
 |                |                       |   |   scrollTop = 1500 (> 0)
 |                |                       |   |                    |
 |                |                       |   |===[scroll loop]====|
 |                |                       |   |                    |
 |                |                       |   |--scrollTo({top:0})--->  (triggers fetch)
 |                |                       |   |--delay(1000ms)     |
 |                |                       |   |                    |<--server responds
 |                |                       |   |                    |   DOM += N turns
 |                |                       |   |--countElements()   |
 |                |                       |   |   count: 5→12 (changed, reset stable)
 |                |                       |   |                    |
 |                |                       |   |--scrollTo({top:0})--->
 |                |                       |   |--delay(1000ms)     |
 |                |                       |   |--countElements()   |
 |                |                       |   |   count: 12→20 (changed)
 |                |                       |   |                    |
 |                |                       |   |--scrollTo({top:0})--->
 |                |                       |   |--delay(1000ms)     |
 |                |                       |   |--countElements()   |
 |                |                       |   |   count: 20→20 (stable 1/3)
 |                |                       |   |                    |
 |                |                       |   |  ... 2 more stable polls ...
 |                |                       |   |   count: 20→20 (stable 3/3)
 |                |                       |   |                    |
 |                |                       |   |===[loop end]=======|
 |                |                       |   return { fullyLoaded: true, elementCount: 20 }
 |                |                       |                        |
 |                |                       |--extractMessages()     |
 |                |                       |   (reads all 20 turns from DOM)
 |                |                       |                        |
 |                |                       |--buildConversationResult()
 |                |<---ExtractionResult---|                        |
 |                |   (40 messages, no warnings)                   |
 |<--toast--------|                       |                        |
```

### 6.2 Timeout Flow

```
GeminiExtractor
 |
 |--ensureAllMessagesLoaded()
 |   |
 |   |===[scroll loop]==========
 |   |  scrollTo → delay → count
 |   |  (elements keep growing each iteration)
 |   |  ...
 |   |  Date.now() - startTime >= 30000ms
 |   |==============================
 |   return { fullyLoaded: false, elementCount: 85 }
 |
 |--extractMessages()
 |   (reads 85 turns available in DOM)
 |
 |--buildConversationResult()
 |   result.warnings = ['No user messages found']  (example)
 |
 |--append timeout warning
 |   result.warnings.push('Auto-scroll timed out after 30s. ...')
 |
 return ExtractionResult
   { success: true, warnings: ['No user messages found', 'Auto-scroll timed out...'] }
```

### 6.3 Skip Flow (Short Conversation)

```
GeminiExtractor
 |
 |--ensureAllMessagesLoaded()
 |   |--queryWithFallback(scrollContainer) → #chat-history
 |   |--scrollTop === 0
 |   return { skipped: true }       ← no delay, no scroll
 |
 |--extractMessages()               ← immediate, same as current behavior
 |--buildConversationResult()
 return ExtractionResult
```

---

## 7. State Transition

```
                  ┌─────────────────────┐
                  │       INIT          │
                  │ (extract() called)  │
                  └──────────┬──────────┘
                             │
                    canExtract()?
                    ┌────no──┴──yes────┐
                    ▼                  ▼
               Return error    Deep Research?
                              ┌──yes──┴──no──┐
                              ▼              ▼
                     extractDeepResearch   ┌────────────────┐
                                          │ DETECT_SCROLL  │
                                          │ find container │
                                          └───────┬────────┘
                                                  │
                                    ┌─no container─┼─has container─┐
                                    ▼              │               ▼
                               SKIP (a)      scrollTop === 0?  scrollTop > 0
                                              ▼                    ▼
                                          SKIP (b)          ┌──────────┐
                                                            │ SCROLLING│◄────────┐
                                                            │scrollTo(0)│         │
                                                            │delay(1s) │         │
                                                            │count()   │         │
                                                            └────┬─────┘         │
                                                                 │               │
                                                     count changed?              │
                                                    ┌──yes──┴──no──┐             │
                                                    │              ▼             │
                                                    │       stable++            │
                                                    │    stable >= 3?           │
                                                    │   ┌──no──┴──yes──┐        │
                                                    │   │              ▼        │
                                                    │   │          COMPLETE     │
                                                    │   │     fullyLoaded=true  │
                                                    ▼   ▼                       │
                                              timed out?                        │
                                             ┌─yes─┴──no──┐                    │
                                             ▼             └────────────────────┘
                                          TIMEOUT
                                     fullyLoaded=false
                                     + warning appended


                SKIP / COMPLETE / TIMEOUT
                         │
                         ▼
                  ┌──────────────┐
                  │   EXTRACT    │
                  │extractMessages│
                  │buildResult   │
                  └──────────────┘
```

---

## 8. Error Handling

| Condition | Handling | User Impact |
|-----------|----------|-------------|
| Scroll container not found | Skip scroll, proceed with extraction | 現在と同じ動作 (部分抽出の可能性) |
| `scrollTop === 0` | Skip scroll | 遅延なしで抽出 |
| Scroll timed out (30s) | 現在の DOM で抽出 + warning | Toast で警告表示 |
| `scrollTo()` が例外を投げる | `extract()` の既存 try-catch でキャッチ | エラートースト |
| ネットワーク障害で新メッセージがロードされない | 要素数が増えず安定化判定で完了 | 部分抽出 (warning なし — スクロール自体は成功) |
| Gemini のスクロールバグ (途中停止) | 毎回 `scrollTo({top:0})` を再送 | バグが持続する場合はタイムアウトへ |

### Warning メッセージフォーマット

```
Auto-scroll timed out after 30s. Some earlier messages may be missing ({N} turns loaded).
```

`{N}` = タイムアウト時の `.conversation-container` 数。

### Warning の伝播パス

```
ensureAllMessagesLoaded()
  → fullyLoaded: false を返す
    → extract() が result.warnings に追加
      → content/index.ts handleSync() が displaySaveResults() を呼ぶ
        → displaySaveResults() が showWarningToast() を呼ぶ
```

既存の `ExtractionResult.warnings?: string[]` と `displaySaveResults()` をそのまま利用。新規 UI コンポーネントは不要。

---

## 9. extract() Modified Flow

### Before (現行)

```typescript
async extract(): Promise<ExtractionResult> {
  try {
    if (!this.canExtract()) { return error; }
    if (this.isDeepResearchVisible()) { return this.extractDeepResearch(); }

    const messages = this.extractMessages();                      // ← DOM にあるものだけ
    const conversationId = this.getConversationId() || `gemini-${Date.now()}`;
    const title = this.getTitle();
    return this.buildConversationResult(messages, conversationId, title, 'gemini');
  } catch (error) { ... }
}
```

### After (変更後)

```typescript
async extract(): Promise<ExtractionResult> {
  try {
    if (!this.canExtract()) { return error; }
    if (this.isDeepResearchVisible()) { return this.extractDeepResearch(); }

    const scrollResult = await this.ensureAllMessagesLoaded();    // ← NEW

    const messages = this.extractMessages();
    const conversationId = this.getConversationId() || `gemini-${Date.now()}`;
    const title = this.getTitle();
    const result = this.buildConversationResult(messages, conversationId, title, 'gemini');

    // Append timeout warning                                     // ← NEW
    if (!scrollResult.fullyLoaded && !scrollResult.skipped) {
      const warning =
        `Auto-scroll timed out after ${SCROLL_TIMEOUT / 1000}s. ` +
        `Some earlier messages may be missing (${scrollResult.elementCount} turns loaded).`;
      if (result.warnings) {
        result.warnings.push(warning);
      } else {
        result.warnings = [warning];
      }
    }

    return result;
  } catch (error) { ... }
}
```

**変更点**:
1. `ensureAllMessagesLoaded()` の呼び出しを追加 (1行)
2. `buildConversationResult()` の戻り値を変数に受ける
3. タイムアウト時の warning 追加ロジック (7行)

`buildConversationResult()` のシグネチャは変更しない。

---

## 10. Files Modified

| File | Change | Lines (est.) |
|------|--------|-------------|
| `src/lib/constants.ts` | 定数 3 件追加 | +10 |
| `src/content/extractors/gemini.ts` | `ScrollResult`, 3 private methods, `extract()` 修正 | +70 |
| `test/fixtures/dom-helpers.ts` | テストヘルパー 2 件追加 | +30 |
| `test/extractors/gemini.test.ts` | テストケース 7 件追加 | +150 |
| `docs/adr/002-gemini-auto-scroll.md` | ADR (決定記録) | rewrite |
| `docs/design/002-gemini-auto-scroll.md` | 本文書 | new |

### Unchanged

- `src/content/extractors/base.ts`
- `src/lib/types.ts`
- `src/content/index.ts`
- 他の extractor (claude, chatgpt, perplexity)

---

## 11. Test Specification

### 11.1 Test Environment

- vitest + jsdom
- jsdom は `scrollTop` / `scrollTo` を実装しない → `Object.defineProperty` でモック
- 非同期ループのテストは `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` を使用

### 11.2 Test Helpers (新規)

File: `test/fixtures/dom-helpers.ts`

#### `createGeminiScrollableDOM(conversationHTML: string): string`

```typescript
/**
 * Wrap conversation HTML in Gemini's scroll container structure
 */
export function createGeminiScrollableDOM(conversationHTML: string): string {
  return `
    <div id="chat-history" class="chat-history-scroll-container">
      <infinite-scroller class="chat-history">
        ${conversationHTML}
      </infinite-scroller>
    </div>
  `;
}
```

#### `mockScrollContainer(scrollTop: number, onScrollTo?: () => void): void`

```typescript
/**
 * Mock scrollTop and scrollTo on #chat-history for jsdom tests
 * Must be called AFTER loadFixture()
 *
 * @param scrollTop - Initial scrollTop value (> 0 simulates partial load)
 * @param onScrollTo - Callback fired on scrollTo (use to inject new DOM elements)
 */
export function mockScrollContainer(
  scrollTop: number,
  onScrollTo?: () => void
): void {
  const container = document.getElementById('chat-history');
  if (!container) return;

  let currentScrollTop = scrollTop;

  Object.defineProperty(container, 'scrollTop', {
    get: () => currentScrollTop,
    set: (value: number) => { currentScrollTop = value; },
    configurable: true,
  });

  container.scrollTo = (options?: ScrollToOptions) => {
    currentScrollTop = options?.top ?? 0;
    if (onScrollTo) onScrollTo();
  };
}
```

### 11.3 Test Cases

| # | Name | Scenario | Assert |
|---|------|----------|--------|
| 1 | skip: scrollTop === 0 | Short conversation, scrollTop is 0 | No delay added. `extract()` returns same result as current. `scrollIterations === 0` |
| 2 | skip: no scroll container | DOM has no `#chat-history` | Extraction proceeds. `skipped === true` |
| 3 | stabilization | scrollTop=1000, `onScrollTo` adds 3 turns first 2 calls, then stops | `fullyLoaded === true`, all messages in result |
| 4 | timeout | scrollTop=1000, `onScrollTo` adds 1 turn every call (never stabilizes) | `fullyLoaded === false`, result has timeout warning string |
| 5 | Deep Research bypass | Deep Research panel + scrollTop > 0 | `extractDeepResearch()` called, no scroll |
| 6 | full integration | scrollTop=500, 2 initial turns, `onScrollTo` adds 3 more turns | `result.data.messages.length === 10` (5 turns x 2) |
| 7 | warning merge | Timeout + `buildConversationResult` generates its own warning | `result.warnings.length >= 2` |

### 11.4 Timer Strategy

```typescript
describe('ensureAllMessagesLoaded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stabilization', async () => {
    // setup DOM with mockScrollContainer(...)
    const extractPromise = extractor.extract();

    // Advance through scroll iterations
    await vi.advanceTimersByTimeAsync(SCROLL_POLL_INTERVAL * 5);

    const result = await extractPromise;
    expect(result.success).toBe(true);
    // ...
  });
});
```

---

## 12. Performance Impact

| Scenario | 現行 | 変更後 |
|----------|------|--------|
| 短い会話 (scrollTop === 0) | ~0ms | ~0ms (scrollTop チェックのみ) |
| 20 ターンの会話 | ~0ms (部分抽出) | ~5s (5 iterations × 1s) |
| 100 ターンの会話 | ~0ms (部分抽出) | ~10-15s |
| 500+ ターンの会話 | ~0ms (部分抽出) | 30s (timeout) + 部分抽出 |

**短い会話への影響はゼロ。** `scrollTop === 0` のチェックは同期的で、コストは DOM 要素1個の property 読み取りのみ。

# Chrome Web Store 公開準備レビューレポート

## Document Info

| Item | Value |
|------|-------|
| Review Target | [DESIGN-v0.3.0-store-release.md](../plans/DESIGN-v0.3.0-store-release.md) |
| Review Date | 2025-01-10 |
| Reviewer | Claude Code |
| Status | Completed |

---

## 1. Executive Summary

Design Doc を Chrome Web Store 公式ガイドラインと照合した結果、**概ね良好**ですが、以下の重要な追記が必要です：

| 優先度 | 項目数 | 説明 |
|--------|--------|------|
| 🔴 CRITICAL | 4項目 | 提出前に必須修正 |
| 🟡 IMPORTANT | 4項目 | 修正推奨 |
| 🟢 MINOR | 3項目 | 余裕があれば対応 |
| ✅ PASS | 11項目 | 対応不要（公式準拠） |

**主な問題点**: Dashboard 入力項目（Permission Justifications、Single Purpose、Data Usage Certifications）とスクリーンショット要件が未記載。

---

## 2. 🔴 CRITICAL（提出前に必須修正）

### 2.1 スクリーンショットが未記載

| 項目 | 公式要件 | Design Doc |
|------|----------|------------|
| サイズ | **1280x800px** 以上 | ❌ 記載なし |
| 枚数 | 最低1枚、最大5枚 | ❌ 記載なし |

**Impact**: スクリーンショットがないと提出不可。

**Action Required**: 
- Phase 5 に「Screenshots」セクションを追加
- 推奨: 3-5枚のスクリーンショットを準備
  1. Gemini ページ上の Sync ボタン
  2. 設定ポップアップ画面
  3. Obsidian に保存された結果
  4. Toast 通知の表示
  5. 日本語表示（オプション）

---

### 2.2 Single Purpose Description が未記載

**公式要件**: 拡張機能の単一目的を明確に説明する文章が必須。

**推奨テキスト**:
```
Export Gemini AI conversations to local Obsidian vault via Local REST API
```

**日本語版**:
```
Gemini AI の会話を Local REST API 経由でローカル Obsidian vault にエクスポート
```

---

### 2.3 Permission Justifications が未記載

**公式要件**: 各パーミッションの正当性説明が Dashboard Privacy タブで必須。

**追加すべき内容**:

| Permission | Justification |
|------------|---------------|
| `storage` | Store user settings locally. API key is stored in local storage (not synced) for security. User preferences are synced across Chrome browsers. |
| `activeTab` | Read the current Gemini conversation page to extract conversation content when user clicks the sync button. |
| `gemini.google.com/*` | Inject content script to display the floating sync button and extract conversation data from Gemini AI pages. |
| `127.0.0.1:27123/*` | Communicate with user's local Obsidian REST API to save extracted conversations. No external server communication. |

---

### 2.4 Data Usage Certifications が未記載

**公式要件**: Dashboard Privacy タブで Data Collection Disclosure と Certifications の選択が必須。

**Data Collection Disclosure（チェックすべき項目）**:

| Category | Selection | Reason |
|----------|-----------|--------|
| Personally identifiable information | ❌ No | - |
| Health information | ❌ No | - |
| Financial and payment information | ❌ No | - |
| Authentication information | ❌ No | API Key は Obsidian 用であり個人認証情報ではない |
| Personal communications | ✅ Yes | AI 会話内容を処理するため |
| Location | ❌ No | - |
| Web history | ❌ No | - |
| User activity | ❌ No | - |
| Website content | ✅ Yes | Gemini ページから会話を抽出するため |

**Certifications（すべてチェック）**:

- [x] I do not sell or transfer user data to third parties, outside of approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

---

## 3. 🟡 IMPORTANT（修正推奨）

### 3.1 `minimum_chrome_version` が未記載

**推奨**: manifest.json に以下を追加

```json
{
  "minimum_chrome_version": "88"
}
```

**理由**: 
- Manifest V3 は Chrome 88 以降でサポート
- 非対応ブラウザへのインストールを防止
- ユーザー体験の向上

---

### 3.2 Remote Code Declaration が未記載

**公式要件**: Dashboard Privacy タブで「Does your extension execute remote code?」への回答が必須。

**回答**: **No**

**理由**:
- MV3 ではリモートコードの実行が禁止されている
- すべてのコードは拡張機能パッケージ内にバンドルされている
- 外部サーバーからのスクリプト読み込みなし

---

### 3.3 Privacy Policy の追記推奨

現在の `docs/privacy.html` に以下を追加することを推奨：

```html
<h2>Remote Code</h2>
<p>This extension does not execute remotely hosted code. All functionality 
is contained within the extension package.</p>

<h2>Children's Privacy</h2>
<p>This extension is not directed at children under 13. We do not knowingly 
collect personal information from children under 13. If you are a parent or 
guardian and believe your child has provided us with personal information, 
please contact us.</p>
```

---

### 3.4 Developer Account セットアップ手順が未記載

**追加すべき内容**:

```markdown
### Developer Account Setup

1. **Registration**
   - URL: https://chrome.google.com/webstore/devconsole
   - One-time fee: $5 USD
   - Google Account required

2. **Requirements**
   - 2-step verification: Required
   - Developer Agreement: Must accept

3. **Verification**
   - Email verification required
   - May take up to 24 hours for account activation
```

---

## 4. 🟢 MINOR（改善推奨）

### 4.1 Promotional Images が未記載

| 画像タイプ | サイズ | 必須 | 用途 |
|-----------|--------|------|------|
| Small Promo Tile | 440x280px | 任意 | ストア検索結果での表示 |
| Marquee Promo Tile | 1400x560px | 任意 | ストアトップページでの特集 |

**推奨**: Small Promo Tile (440x280px) の作成。ストアでの視認性向上に寄与。

---

### 4.2 Review Timeline が未記載

**追加すべき情報**:

| ケース | 予想期間 |
|--------|----------|
| 標準レビュー | 24時間以内 |
| 90% の提出 | 3日以内 |
| 延長レビュー対象 | 最大数週間 |

**延長レビューのトリガー**:
- 新規デベロッパー
- サードパーティサイトへの host_permissions
- 大幅なコード変更
- 危険なパーミッションの使用

**注意**: 3週間以上レビューが続く場合は [One Stop Support](https://support.google.com/chrome_webstore/contact/one_stop_support) に連絡。

---

### 4.3 Unlisted Publishing の詳細が不足

**追加すべき内容**:

```markdown
### Unlisted Publishing

1. Distribution タブで "Unlisted" を選択
2. 特徴:
   - 直接URLでのみインストール可能
   - Chrome Web Store 検索には表示されない
   - ストアページは存在する（URLを知っている人のみアクセス可能）
3. テスト完了後に "Public" に変更可能
4. 用途: 限定的なベータテスト、社内配布
```

---

## 5. ✅ 公式準拠確認（問題なし）

以下の項目は Chrome Web Store 公式要件に準拠しています：

| チェック項目 | 結果 | 備考 |
|-------------|------|------|
| Manifest V3 使用 | ✅ Pass | `manifest_version: 3` |
| 最小限のパーミッション | ✅ Pass | `storage`, `activeTab` のみ |
| ローカル通信のみ | ✅ Pass | `127.0.0.1:27123` へのみ通信 |
| リモートコード不使用 | ✅ Pass | MV3 準拠 |
| 単一目的 | ✅ Pass | AI会話のエクスポートのみ |
| 欺瞞的インストール手法なし | ✅ Pass | 正直な説明 |
| スパム/反復コンテンツなし | ✅ Pass | オリジナル機能 |
| コード難読化なし | ✅ Pass | Vite ビルドだが読解可能 |
| i18n 構造 | ✅ Pass | Chrome 仕様準拠 |
| Privacy Policy 内容 | ✅ Pass | 基本要件充足 |
| アイコン (128x128) | ✅ Pass | `public/icons/icon128.png` 存在確認済み |

---

## 6. 推奨: 新規セクションの追加

Design Doc に以下のセクションを追加することを推奨します：

### Section 10: Chrome Web Store Submission Guide

```markdown
## 10. Chrome Web Store Submission Guide

### 10.1 Required Assets

| Asset | Size | Status | Notes |
|-------|------|--------|-------|
| Store Icon | 128x128px | ✅ Ready | public/icons/icon128.png |
| Screenshot 1 | 1280x800px | ⬜ TODO | Sync button on Gemini page |
| Screenshot 2 | 1280x800px | ⬜ TODO | Settings popup |
| Screenshot 3 | 1280x800px | ⬜ TODO | Saved result in Obsidian |
| Small Promo | 440x280px | ⬜ Optional | Store visibility |

### 10.2 Dashboard Privacy Tab Input

#### Single Purpose Description
```
Export Gemini AI conversations to local Obsidian vault via Local REST API
```

#### Permission Justifications

| Permission | Justification |
|------------|---------------|
| storage | Store user settings locally. API key in local storage for security. |
| activeTab | Read current Gemini page to extract conversation when user clicks sync. |
| gemini.google.com/* | Inject sync button and extract conversation from Gemini pages. |
| 127.0.0.1:27123/* | Send content to user's local Obsidian REST API. No external servers. |

#### Remote Code Declaration
**No** - All code is bundled within the extension package.

#### Data Usage Certifications

**Collected Data:**
- Personal communications: Yes (AI conversation content)
- Website content: Yes (Gemini page extraction)
- All others: No

**Certifications:**
- No sale/transfer to third parties: ✓
- No unrelated purpose use: ✓
- No creditworthiness use: ✓

### 10.3 Pre-Submission Checklist

- [ ] Developer account setup complete ($5 fee, 2-step verification)
- [ ] Privacy policy live at GitHub Pages URL
- [ ] All screenshots prepared (1280x800px, 1-5 images)
- [ ] Store icon verified (128x128px)
- [ ] Production build tested locally (`npm run build`)
- [ ] All tests passing (`npm test`)
- [ ] Permission justifications drafted
- [ ] Single purpose description drafted
- [ ] Data usage certifications prepared
- [ ] Remote code declaration: "No"

### 10.4 Expected Review Timeline

| Scenario | Expected Duration |
|----------|-------------------|
| Standard review | Within 24 hours |
| 90% of submissions | Within 3 days |
| Extended review (new developer) | Up to 1-2 weeks |
| If exceeds 3 weeks | Contact support |

### 10.5 Post-Submission

1. Monitor email for review status updates
2. If rejected, review violation details carefully
3. Fix issues and resubmit
4. Appeal via One Stop Support if needed
```

---

## 7. Action Items Summary

### Immediate Actions (Before Submission)

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | Add screenshots section to Design Doc | 🔴 Critical | Low |
| 2 | Prepare 3-5 screenshots (1280x800px) | 🔴 Critical | Medium |
| 3 | Document Single Purpose description | 🔴 Critical | Low |
| 4 | Document Permission Justifications | 🔴 Critical | Low |
| 5 | Document Data Usage Certifications | 🔴 Critical | Low |
| 6 | Add `minimum_chrome_version` to manifest | 🟡 Important | Low |
| 7 | Document Remote Code declaration | 🟡 Important | Low |
| 8 | Update Privacy Policy (remote code, children) | 🟡 Important | Low |
| 9 | Document Developer Account setup | 🟡 Important | Low |

### Optional Improvements

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 10 | Create Small Promo Tile (440x280px) | 🟢 Minor | Medium |
| 11 | Document Review Timeline | 🟢 Minor | Low |
| 12 | Document Unlisted Publishing process | 🟢 Minor | Low |

---

## 8. References

### Official Documentation

- [Chrome Web Store Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Prepare to Publish](https://developer.chrome.com/docs/webstore/prepare)
- [Review Process](https://developer.chrome.com/docs/webstore/review-process)
- [Dashboard Listing Tab](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Dashboard Privacy Tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Manifest V3 Requirements](https://developer.chrome.com/docs/extensions/reference/manifest)

### Asset Specifications

| Asset | Dimensions | Format |
|-------|------------|--------|
| Store Icon | 128x128px | PNG |
| Screenshots | 1280x800px min | PNG/JPEG |
| Small Promo Tile | 440x280px | PNG/JPEG |
| Marquee Promo Tile | 1400x560px | PNG/JPEG |

---

## 9. Conclusion

Design Doc v0.3.0 は Chrome Web Store 公開に向けた良好な基盤を持っていますが、**Dashboard 入力項目の事前準備**が不足しています。

上記の CRITICAL 項目を追記することで、スムーズな提出とレビュー通過が期待できます。特に Permission Justifications は、レビュー時間短縮に直結するため、明確で簡潔な説明を準備することを強く推奨します。

/**
 * HTMLサニタイズユーティリティ
 * DOMPurifyを使用してXSS攻撃を防止
 */

import DOMPurify from 'dompurify';

/**
 * HTMLをサニタイズしてXSS攻撃を防止
 *
 * 設計方針:
 * - USE_PROFILES: { html: true } でデフォルトの安全なHTML許可リストを使用
 * - ADD_ATTRで data-turn-source-index を追加許可（USE_PROFILESと併用可能）
 * - FORBID_ATTRでその他のdata-*属性を禁止
 * - FORBID_TAGSでstyleを追加禁止（CSSインジェクション防止）
 *
 * 注意: USE_PROFILESとALLOWED_TAGSは併用不可（公式ドキュメント）
 * 注意: USE_PROFILESとALLOWED_ATTRも併用すると上書きされる
 *       → ADD_ATTRを使用して既存の許可リストに追加する
 *
 * USE_PROFILES: { html: true } が自動除去するもの:
 * - <script>, <style>, <iframe>, <object>, <embed> 等の危険なタグ
 * - 全てのイベントハンドラ属性（onclick, onerror, onload等約70種）
 * - javascript:, vbscript:, data: 等の危険なURIスキーム
 *
 * data-turn-source-index について:
 * - Deep Research のインライン引用で使用される属性
 * - この属性はソースリストへのインデックス（1ベース）を保持
 * - convertInlineCitationsToLinks() で使用するため許可が必要
 */
export function sanitizeHtml(html: string): string {
  // uponSanitizeAttribute hook to selectively allow data-turn-source-index
  // while blocking other data-* attributes
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    // Allow data-turn-source-index attribute
    if (data.attrName === 'data-turn-source-index') {
      data.forceKeepAttr = true;
    }
    // Block other data-* attributes
    else if (data.attrName.startsWith('data-')) {
      data.keepAttr = false;
    }
  });

  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true }, // デフォルトの安全なHTML（SVG/MathML除外）
      FORBID_TAGS: ['style'], // CSSインジェクション防止
    });
  } finally {
    // Remove the hook after use to avoid affecting other sanitization calls
    // Using try/finally ensures hook cleanup even if sanitize() throws
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}

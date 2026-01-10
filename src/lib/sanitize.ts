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
 * - ALLOWED_ATTRで必要な属性のみ追加許可
 * - FORBID_TAGSでstyleを追加禁止（CSSインジェクション防止）
 *
 * 注意: USE_PROFILESとALLOWED_TAGSは併用不可（公式ドキュメント）
 *
 * USE_PROFILES: { html: true } が自動除去するもの:
 * - <script>, <style>, <iframe>, <object>, <embed> 等の危険なタグ
 * - 全てのイベントハンドラ属性（onclick, onerror, onload等約70種）
 * - javascript:, vbscript:, data: 等の危険なURIスキーム
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }, // デフォルトの安全なHTML（SVG/MathML除外）
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'], // 必要な属性のみ
    FORBID_TAGS: ['style'], // CSSインジェクション防止
    ALLOW_DATA_ATTR: false, // data-*属性を禁止
  });
}

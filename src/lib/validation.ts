/**
 * 入力バリデーションユーティリティ
 * ユーザー入力の検証とサニタイズ
 */

import { containsPathTraversal } from './path-utils';

/**
 * 許可されたcalloutタイプ
 */
export const ALLOWED_CALLOUT_TYPES = [
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
  'ABSTRACT',
  'SUMMARY',
  'TLDR',
  'INFO',
  'TODO',
  'SUCCESS',
  'CHECK',
  'DONE',
  'QUESTION',
  'HELP',
  'FAQ',
  'FAILURE',
  'FAIL',
  'MISSING',
  'DANGER',
  'ERROR',
  'BUG',
  'EXAMPLE',
  'QUOTE',
  'CITE',
] as const;

export type CalloutType = (typeof ALLOWED_CALLOUT_TYPES)[number];

/**
 * calloutタイプのバリデーション
 */
export function validateCalloutType(type: string, defaultType: CalloutType): CalloutType {
  const normalized = type.toUpperCase().trim();
  if (ALLOWED_CALLOUT_TYPES.includes(normalized as CalloutType)) {
    return normalized as CalloutType;
  }
  console.warn(`[G2O] Invalid callout type "${type}", using default "${defaultType}"`);
  return defaultType;
}

/**
 * vaultPathのバリデーション
 */
export function validateVaultPath(path: string): string {
  // 空は許可（ルートに保存）
  if (!path.trim()) return '';

  // パストラバーサルチェック
  if (containsPathTraversal(path)) {
    throw new Error('Vault path contains invalid characters');
  }

  // 長さ制限（ファイルシステム制限）
  if (path.length > 200) {
    throw new Error('Vault path is too long (max 200 characters)');
  }

  return path.trim();
}

/**
 * APIキーのバリデーション
 * Obsidian REST API の実装に準拠:
 * - SHA-256ハッシュの16進数文字列（64文字）
 * - フォーマット: [0-9a-fA-F]{64}
 */
export function validateApiKey(key: string): string {
  const trimmed = key.trim();

  // 空チェック
  if (!trimmed) {
    throw new Error('API key is required');
  }

  // Obsidian REST API は SHA-256 ハッシュ（64文字の16進数）を生成
  // ただし、ユーザーが手動で設定した場合も考慮して柔軟に対応
  if (trimmed.length !== 64) {
    console.warn(`[G2O] API key length is ${trimmed.length}, expected 64 (SHA-256 hex)`);
  }

  // 16進数形式のバリデーション（警告のみ、ブロックしない）
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    console.warn('[G2O] API key contains non-hexadecimal characters');
  }

  // 最低限の長さチェック（セキュリティ上の理由）
  if (trimmed.length < 16) {
    throw new Error('API key is too short (minimum 16 characters for security)');
  }

  return trimmed;
}

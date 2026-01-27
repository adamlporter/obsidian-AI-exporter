/**
 * Chrome Runtime Messaging ユーティリティ
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type {
  ExtensionMessage,
  ExtensionSettings,
  SaveResponse,
  MultiOutputResponse,
} from './types';

/**
 * メッセージレスポンスの型マッピング
 */
interface MessageResponseMap {
  getSettings: ExtensionSettings;
  testConnection: { success: boolean; error?: string };
  saveToObsidian: SaveResponse;
  saveToOutputs: MultiOutputResponse;
  getExistingFile: string | null;
}

/**
 * 型安全なメッセージ送信
 *
 * 注意: 実行時の型検証は行わない（Chrome拡張のメッセージングは
 * 同一拡張内で完結するため、型の整合性は開発時に保証される）
 *
 * Design Decision: Runtime validation is intentionally omitted here because:
 * 1. Messages originate from and are handled within the same extension
 * 2. The background service worker (src/background/index.ts) performs
 *    comprehensive validation via validateMessageContent() before processing
 * 3. Adding redundant validation would impact performance without security benefit
 *
 * The type assertion below is safe under these controlled conditions.
 */
export function sendMessage<K extends keyof MessageResponseMap>(
  message: ExtensionMessage & { action: K }
): Promise<MessageResponseMap[K]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Unknown error'));
        return;
      }
      // Type assertion is safe: background validates all messages before responding
      // See: src/background/index.ts validateMessageContent()
      resolve(response as MessageResponseMap[K]);
    });
  });
}

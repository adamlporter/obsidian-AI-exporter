/**
 * Chrome Runtime Messaging utility
 * Promise-based wrapper for chrome.runtime.sendMessage
 */

import type {
  ExtensionMessage,
  ExtensionSettings,
  SaveResponse,
  MultiOutputResponse,
} from './types';

/**
 * Message response type mapping
 */
interface MessageResponseMap {
  getSettings: ExtensionSettings;
  testConnection: { success: boolean; error?: string };
  saveToObsidian: SaveResponse;
  saveToOutputs: MultiOutputResponse;
  getExistingFile: string | null;
}

/**
 * Type-safe message sending
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

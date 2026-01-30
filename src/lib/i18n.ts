/**
 * Chrome i18n utility
 * Provides localized message retrieval with fallback
 */

/**
 * Get localized message with fallback
 *
 * Returns the translated string from chrome.i18n.getMessage(),
 * falling back to the key itself if translation is unavailable
 * or if the chrome.i18n API is not accessible.
 */
export function getMessage(key: string, substitutions?: string | string[]): string {
  try {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  } catch {
    return key;
  }
}

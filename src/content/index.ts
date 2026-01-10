/**
 * Content Script Entry Point
 * Initializes on Gemini pages and handles sync operations
 */

import { GeminiExtractor } from './extractors/gemini';
import { conversationToNote } from './markdown';
import {
  injectSyncButton,
  setButtonLoading,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showToast,
} from './ui';
import { sendMessage } from '../lib/messaging';
import type { ExtensionSettings, SaveResponse, ObsidianNote } from '../lib/types';

/**
 * Throttle function (NEW-06)
 * Executes immediately on first call, then blocks for `limit` ms
 */
function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Wait for conversation container to appear (L-03)
 * Uses MutationObserver instead of fixed timeout
 */
function waitForConversationContainer(): Promise<void> {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = document.querySelector(
      '.conversation-container, [class*="conversation"]'
    );
    if (existing) {
      resolve();
      return;
    }

    // Use MutationObserver to watch for container
    const observer = new MutationObserver((_mutations, obs) => {
      const container = document.querySelector(
        '.conversation-container, [class*="conversation"]'
      );
      if (container) {
        obs.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Fallback timeout: 10 seconds
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, 10000);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/**
 * Initialize the content script
 */
async function initialize(): Promise<void> {
  console.info('[G2O] Content script initializing on:', window.location.href);

  // Only run on Gemini conversation pages
  if (!window.location.hostname.includes('gemini.google.com')) {
    console.info('[G2O] Not a Gemini page, skipping initialization');
    return;
  }

  // Wait for conversation container (L-03)
  await waitForConversationContainer();

  // Apply throttle to sync handler (NEW-06)
  const throttledHandleSync = throttle(handleSync, 1000);
  injectSyncButton(throttledHandleSync);
  console.info('[G2O] Sync button injected');
}

/**
 * Handle sync button click
 */
async function handleSync(): Promise<void> {
  console.info('[G2O] Sync initiated');
  setButtonLoading(true);

  try {
    // Get settings first (L-01: use type-safe messaging)
    const settings = await getSettings();

    if (!settings.obsidianApiKey) {
      showErrorToast(
        'Please configure your Obsidian API key in the extension settings'
      );
      setButtonLoading(false);
      return;
    }

    // Test connection first
    const connectionTest = await testConnection();
    if (!connectionTest.success) {
      showErrorToast(connectionTest.error || 'Cannot connect to Obsidian');
      setButtonLoading(false);
      return;
    }

    // Extract conversation
    const extractor = new GeminiExtractor();

    if (!extractor.canExtract()) {
      showErrorToast('Not on a valid Gemini conversation page');
      setButtonLoading(false);
      return;
    }

    showToast('Extracting conversation...', 'info', 2000);
    const result = await extractor.extract();

    // Validate extraction
    const validation = extractor.validate(result);

    if (!validation.isValid) {
      const errorMsg = validation.errors.join(', ') || 'Extraction failed';
      showErrorToast(errorMsg);
      setButtonLoading(false);
      return;
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warning) => {
        console.warn('[G2O] Warning:', warning);
      });
    }

    if (!result.data) {
      showErrorToast('No conversation data extracted');
      setButtonLoading(false);
      return;
    }

    // Convert to Obsidian note
    const note = conversationToNote(result.data, settings.templateOptions);

    console.info('[G2O] Generated note:', {
      fileName: note.fileName,
      messageCount: result.data.messages.length,
    });

    // Save to Obsidian
    showToast('Saving to Obsidian...', 'info', 2000);
    const saveResult = await saveToObsidian(note);

    if (saveResult.success) {
      showSuccessToast(note.fileName, saveResult.isNewFile ?? true);

      // Show warnings from extraction if any
      if (result.warnings && result.warnings.length > 0) {
        setTimeout(() => {
          showWarningToast(result.warnings!.join('. '));
        }, 2000);
      }
    } else {
      showErrorToast(saveResult.error || 'Failed to save to Obsidian');
    }
  } catch (error) {
    console.error('[G2O] Sync error:', error);
    showErrorToast(
      error instanceof Error ? error.message : 'An unexpected error occurred'
    );
  } finally {
    setButtonLoading(false);
  }
}

/**
 * Get extension settings from background script (L-01)
 * Uses type-safe messaging utility
 */
function getSettings(): Promise<ExtensionSettings> {
  return sendMessage({ action: 'getSettings' });
}

/**
 * Test connection to Obsidian (L-01)
 * Uses type-safe messaging utility
 */
function testConnection(): Promise<{ success: boolean; error?: string }> {
  return sendMessage({ action: 'testConnection' });
}

/**
 * Save note to Obsidian via background script (L-01)
 * Uses type-safe messaging utility
 */
function saveToObsidian(note: ObsidianNote): Promise<SaveResponse> {
  return sendMessage({ action: 'saveToObsidian', data: note });
}

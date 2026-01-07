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
import type { ExtensionSettings, SaveResponse, ObsidianNote } from '../lib/types';

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

/**
 * Initialize the content script
 */
function initialize(): void {
  console.info('[G2O] Content script initializing on:', window.location.href);

  // Only run on Gemini conversation pages
  if (!window.location.hostname.includes('gemini.google.com')) {
    console.info('[G2O] Not a Gemini page, skipping initialization');
    return;
  }

  // Wait a bit for the page to fully load dynamic content
  setTimeout(() => {
    injectSyncButton(handleSync);
    console.info('[G2O] Sync button injected');
  }, 1000);
}

/**
 * Handle sync button click
 */
async function handleSync(): Promise<void> {
  console.info('[G2O] Sync initiated');
  setButtonLoading(true);

  try {
    // Get settings first
    const settings = await getSettings();

    if (!settings.obsidianApiKey) {
      showErrorToast('Please configure your Obsidian API key in the extension settings');
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
      validation.warnings.forEach(warning => {
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
    showErrorToast(error instanceof Error ? error.message : 'An unexpected error occurred');
  } finally {
    setButtonLoading(false);
  }
}

/**
 * Get extension settings from background script
 */
async function getSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as ExtensionSettings);
    });
  });
}

/**
 * Test connection to Obsidian
 */
async function testConnection(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'testConnection' }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as { success: boolean; error?: string });
    });
  });
}

/**
 * Save note to Obsidian via background script
 */
async function saveToObsidian(note: ObsidianNote): Promise<SaveResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'saveToObsidian',
        data: note,
      },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response as SaveResponse);
      }
    );
  });
}

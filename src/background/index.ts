/**
 * Background Service Worker
 * Handles HTTP communication with Obsidian REST API
 */

import { ObsidianApiClient, getErrorMessage, isObsidianApiError } from '../lib/obsidian-api';
import { getSettings, migrateSettings } from '../lib/storage';
import { escapeYamlValue, escapeYamlListItem } from '../lib/yaml-utils';
import { MAX_CONTENT_SIZE } from '../lib/constants';
import type { ExtensionMessage, ObsidianNote, SaveResponse, ExtensionSettings } from '../lib/types';

// Run settings migration on service worker startup (C-01)
// Note: top-level await not available in service workers, use .catch() for error handling
migrateSettings().catch(error => {
  console.error('[G2O Background] Settings migration failed:', error);
});

/**
 * Allowed origins for content script messages (M-02)
 */
const ALLOWED_ORIGINS = ['https://gemini.google.com'] as const;

/**
 * Validate message sender (M-02)
 *
 * Security: Only accept messages from:
 * - Popup (same extension)
 * - Content scripts from allowed origins
 */
function validateSender(sender: chrome.runtime.MessageSender): boolean {
  // Allow messages from popup (same extension)
  if (sender.url?.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    return true;
  }

  // Validate content script origin
  if (sender.tab?.url) {
    try {
      const url = new URL(sender.tab.url);
      return ALLOWED_ORIGINS.some(origin => url.origin === origin);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Validate message content (M-02)
 *
 * Security: Content scripts are less trustworthy.
 * Validate and sanitize all input per Chrome extension best practices.
 */
function validateMessageContent(message: ExtensionMessage): boolean {
  // Validate action against whitelist
  const validActions = ['getSettings', 'getExistingFile', 'testConnection', 'saveToObsidian'];
  if (!validActions.includes(message.action)) {
    return false;
  }

  // Detailed validation for saveToObsidian action
  if (message.action === 'saveToObsidian' && message.data) {
    const note = message.data;

    // Required field validation
    if (typeof note.fileName !== 'string' || typeof note.body !== 'string') {
      return false;
    }

    // File name length limits (filesystem constraints)
    if (note.fileName.length === 0 || note.fileName.length > 200) {
      return false;
    }

    // Content size limit (DoS prevention)
    if (note.body.length > MAX_CONTENT_SIZE) {
      return false;
    }

    // Frontmatter validation
    if (note.frontmatter) {
      if (typeof note.frontmatter.title !== 'string' || note.frontmatter.title.length > 500) {
        return false;
      }
      if (
        typeof note.frontmatter.source !== 'string' ||
        !['gemini', 'claude', 'perplexity'].includes(note.frontmatter.source)
      ) {
        return false;
      }
      if (!Array.isArray(note.frontmatter.tags) || note.frontmatter.tags.length > 50) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Handle incoming messages from content script and popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
    // Sender validation (M-02)
    if (!validateSender(sender)) {
      console.warn('[G2O Background] Rejected message from unauthorized sender');
      sendResponse({ success: false, error: 'Unauthorized' });
      return false;
    }

    // Message content validation (M-02)
    if (!validateMessageContent(message)) {
      console.warn('[G2O Background] Invalid message content');
      sendResponse({ success: false, error: 'Invalid message content' });
      return false;
    }

    handleMessage(message)
      .then(sendResponse)
      .catch(error => {
        console.error('[G2O Background] Error handling message:', error);
        sendResponse({ success: false, error: getErrorMessage(error) });
      });
    return true; // Indicates async response
  }
);

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const settings = await getSettings();

  switch (message.action) {
    case 'saveToObsidian':
      return handleSave(settings, message.data);

    case 'getExistingFile':
      return handleGetFile(settings, message.fileName, message.vaultPath);

    case 'testConnection':
      return handleTestConnection(settings);

    case 'getSettings':
      return settings;

    default:
      return { success: false, error: 'Unknown action' };
  }
}

/**
 * Save note to Obsidian vault
 */
async function handleSave(settings: ExtensionSettings, note: ObsidianNote): Promise<SaveResponse> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured. Please check settings.' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    // Construct full path
    const fullPath = settings.vaultPath ? `${settings.vaultPath}/${note.fileName}` : note.fileName;

    // Check if file exists for append mode detection
    const existingContent = await client.getFile(fullPath);
    const isNewFile = existingContent === null;

    // Generate note content
    const content = generateNoteContent(note, settings);

    // Save to Obsidian
    await client.putFile(fullPath, content);

    return {
      success: true,
      isNewFile,
    };
  } catch (error) {
    console.error('[G2O Background] Save failed:', error);
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Get existing file content from Obsidian
 */
async function handleGetFile(
  settings: ExtensionSettings,
  fileName: string,
  vaultPath?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    const path = vaultPath ? `${vaultPath}/${fileName}` : fileName;
    const content = await client.getFile(path);

    if (content === null) {
      return { success: true, content: undefined };
    }

    return { success: true, content };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Test connection to Obsidian REST API
 */
async function handleTestConnection(
  settings: ExtensionSettings
): Promise<{ success: boolean; error?: string }> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    const connected = await client.testConnection();
    if (connected) {
      return { success: true };
    }
    return { success: false, error: 'Connection failed. Check if Obsidian is running.' };
  } catch (error) {
    if (isObsidianApiError(error)) {
      return { success: false, error: error.message };
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Generate full note content with frontmatter and body
 * Uses YAML escaping to prevent injection attacks (NEW-04)
 */
function generateNoteContent(note: ObsidianNote, settings: ExtensionSettings): string {
  const { templateOptions } = settings;
  const lines: string[] = [];

  // Generate YAML frontmatter
  lines.push('---');

  if (templateOptions.includeId) {
    lines.push(`id: ${escapeYamlValue(note.frontmatter.id)}`);
  }

  if (templateOptions.includeTitle) {
    lines.push(`title: ${escapeYamlValue(note.frontmatter.title)}`);
  }

  if (templateOptions.includeSource) {
    lines.push(`source: ${escapeYamlValue(note.frontmatter.source)}`);
    lines.push(`url: ${escapeYamlValue(note.frontmatter.url)}`);
  }

  if (templateOptions.includeDates) {
    lines.push(`created: ${escapeYamlValue(note.frontmatter.created)}`);
    lines.push(`modified: ${escapeYamlValue(note.frontmatter.modified)}`);
  }

  if (templateOptions.includeTags && note.frontmatter.tags.length > 0) {
    lines.push('tags:');
    for (const tag of note.frontmatter.tags) {
      lines.push(`  - ${escapeYamlListItem(tag)}`);
    }
  }

  if (templateOptions.includeMessageCount) {
    lines.push(`message_count: ${note.frontmatter.message_count}`);
  }

  lines.push('---');
  lines.push('');

  // Add body
  lines.push(note.body);

  return lines.join('\n');
}

// Log when service worker starts
console.info('[G2O Background] Service worker started');

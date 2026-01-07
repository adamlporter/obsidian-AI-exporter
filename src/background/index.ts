/**
 * Background Service Worker
 * Handles HTTP communication with Obsidian REST API
 */

import { ObsidianApiClient, getErrorMessage, isObsidianApiError } from '../lib/obsidian-api';
import { getSettings } from '../lib/storage';
import type { ExtensionMessage, ObsidianNote, SaveResponse, ExtensionSettings } from '../lib/types';

/**
 * Handle incoming messages from content script and popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void
  ) => {
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
async function handleSave(
  settings: ExtensionSettings,
  note: ObsidianNote
): Promise<SaveResponse> {
  if (!settings.obsidianApiKey) {
    return { success: false, error: 'API key not configured. Please check settings.' };
  }

  const client = new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);

  try {
    // Construct full path
    const fullPath = settings.vaultPath
      ? `${settings.vaultPath}/${note.fileName}`
      : note.fileName;

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
 */
function generateNoteContent(note: ObsidianNote, settings: ExtensionSettings): string {
  const { templateOptions } = settings;
  const lines: string[] = [];

  // Generate YAML frontmatter
  lines.push('---');

  if (templateOptions.includeId) {
    lines.push(`id: ${note.frontmatter.id}`);
  }

  if (templateOptions.includeTitle) {
    // Escape quotes in title
    const escapedTitle = note.frontmatter.title.replace(/"/g, '\\"');
    lines.push(`title: "${escapedTitle}"`);
  }

  if (templateOptions.includeSource) {
    lines.push(`source: ${note.frontmatter.source}`);
    lines.push(`url: ${note.frontmatter.url}`);
  }

  if (templateOptions.includeDates) {
    lines.push(`created: ${note.frontmatter.created}`);
    lines.push(`modified: ${note.frontmatter.modified}`);
  }

  if (templateOptions.includeTags && note.frontmatter.tags.length > 0) {
    lines.push('tags:');
    for (const tag of note.frontmatter.tags) {
      lines.push(`  - ${tag}`);
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

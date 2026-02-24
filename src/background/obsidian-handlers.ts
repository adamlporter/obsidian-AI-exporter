/**
 * Obsidian API handlers for background service worker
 *
 * Handles save, get, and connection test operations
 */

import { ObsidianApiClient } from '../lib/obsidian-api';
import { getErrorMessage } from '../lib/error-utils';
import { generateNoteContent } from '../lib/note-generator';
import { resolvePathTemplate } from '../lib/path-utils';
import type { ExtensionSettings, ObsidianNote, SaveResponse } from '../lib/types';

/**
 * Create an ObsidianApiClient if API key is configured.
 * Returns the client or an error object.
 */
export function createObsidianClient(
  settings: ExtensionSettings
): ObsidianApiClient | { error: string } {
  if (!settings.obsidianApiKey) {
    return { error: 'API key not configured' };
  }
  return new ObsidianApiClient(settings.obsidianPort, settings.obsidianApiKey);
}

/**
 * Type guard for client creation error
 */
export function isClientError(
  client: ObsidianApiClient | { error: string }
): client is { error: string } {
  return 'error' in client;
}

/**
 * Save note to Obsidian vault
 */
export async function handleSave(
  settings: ExtensionSettings,
  note: ObsidianNote
): Promise<SaveResponse> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) {
    return { success: false, error: client.error };
  }

  try {
    // Resolve template variables (e.g., {platform} → gemini) and construct full path
    const resolvedPath = resolvePathTemplate(settings.vaultPath, {
      platform: note.frontmatter.source,
    });
    const fullPath = resolvedPath ? `${resolvedPath}/${note.fileName}` : note.fileName;

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
export async function handleGetFile(
  settings: ExtensionSettings,
  fileName: string,
  vaultPath?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) {
    return { success: false, error: client.error };
  }

  try {
    const path = vaultPath ? `${vaultPath}/${fileName}` : fileName;
    const content = await client.getFile(path);

    if (content === null) {
      return { success: true, content: undefined };
    }

    return { success: true, content };
  } catch (error) {
    console.error('[G2O Background] Get file failed:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

/**
 * Test connection to Obsidian REST API
 */
export async function handleTestConnection(
  settings: ExtensionSettings
): Promise<{ success: boolean; error?: string }> {
  const client = createObsidianClient(settings);
  if (isClientError(client)) {
    return { success: false, error: client.error };
  }
  const result = await client.testConnection();

  if (!result.reachable) {
    return {
      success: false,
      error: result.error ?? 'Cannot reach Obsidian. Is it running?',
    };
  }

  if (!result.authenticated) {
    return {
      success: false,
      error: result.error ?? 'Invalid API key. Please check your settings.',
    };
  }

  return { success: true };
}

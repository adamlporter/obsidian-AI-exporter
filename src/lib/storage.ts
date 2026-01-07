/**
 * Chrome storage wrapper for extension settings
 */

import type { ExtensionSettings, TemplateOptions } from './types';

const DEFAULT_TEMPLATE_OPTIONS: TemplateOptions = {
  includeId: true,
  includeTitle: true,
  includeTags: true,
  includeSource: true,
  includeDates: true,
  includeMessageCount: true,
  messageFormat: 'callout',
  userCalloutType: 'QUESTION',
  assistantCalloutType: 'NOTE',
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  obsidianApiKey: '',
  obsidianPort: 27123,
  vaultPath: '03_Extra/Gemini',
  templateOptions: DEFAULT_TEMPLATE_OPTIONS,
};

/**
 * Get extension settings from chrome.storage.sync
 */
export async function getSettings(): Promise<ExtensionSettings> {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      return {
        ...DEFAULT_SETTINGS,
        ...result.settings,
        templateOptions: {
          ...DEFAULT_TEMPLATE_OPTIONS,
          ...result.settings.templateOptions,
        },
      };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[G2O] Failed to get settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save extension settings to chrome.storage.sync
 */
export async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  try {
    const current = await getSettings();
    const updated: ExtensionSettings = {
      ...current,
      ...settings,
      templateOptions: {
        ...current.templateOptions,
        ...(settings.templateOptions || {}),
      },
    };
    await chrome.storage.sync.set({ settings: updated });
  } catch (error) {
    console.error('[G2O] Failed to save settings:', error);
    throw error;
  }
}

/**
 * Get last sync info for a conversation
 */
export interface SyncInfo {
  timestamp: number;
  messageCount: number;
  contentHash: string;
}

export async function getLastSync(conversationId: string): Promise<SyncInfo | null> {
  try {
    const result = await chrome.storage.local.get('lastSync');
    const lastSync = result.lastSync || {};
    return lastSync[conversationId] || null;
  } catch (error) {
    console.error('[G2O] Failed to get last sync:', error);
    return null;
  }
}

/**
 * Save last sync info for a conversation
 */
export async function saveLastSync(conversationId: string, info: SyncInfo): Promise<void> {
  try {
    const result = await chrome.storage.local.get('lastSync');
    const lastSync = result.lastSync || {};
    lastSync[conversationId] = info;
    await chrome.storage.local.set({ lastSync });
  } catch (error) {
    console.error('[G2O] Failed to save last sync:', error);
    throw error;
  }
}

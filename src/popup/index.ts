/**
 * Popup Settings Script
 * Manages extension settings UI
 */

import { getSettings, saveSettings } from '../lib/storage';
import type { ExtensionSettings, TemplateOptions } from '../lib/types';
import { validateCalloutType, validateVaultPath, validateApiKey } from '../lib/validation';
import { DEFAULT_OBSIDIAN_PORT, MIN_PORT, MAX_PORT } from '../lib/constants';

/**
 * Get localized message with fallback
 */
function getMessage(key: string, substitutions?: string | string[]): string {
  try {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  } catch {
    return key;
  }
}

/**
 * Initialize i18n for all elements with data-i18n attributes
 */
function initializeI18n(): void {
  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (key) {
      const message = getMessage(key);
      if (message && message !== key) {
        element.textContent = message;
      }
    }
  });

  // Translate placeholders with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (key && element instanceof HTMLInputElement) {
      const message = getMessage(key);
      if (message && message !== key) {
        element.placeholder = message;
      }
    }
  });

  // Update document title
  const titleElement = document.querySelector('title');
  if (titleElement) {
    const key = titleElement.getAttribute('data-i18n');
    if (key) {
      const message = getMessage(key);
      if (message && message !== key) {
        document.title = message;
      }
    }
  }
}

// DOM Elements
const elements = {
  apiKey: document.getElementById('apiKey') as HTMLInputElement,
  port: document.getElementById('port') as HTMLInputElement,
  vaultPath: document.getElementById('vaultPath') as HTMLInputElement,
  messageFormat: document.getElementById('messageFormat') as HTMLSelectElement,
  userCallout: document.getElementById('userCallout') as HTMLInputElement,
  assistantCallout: document.getElementById('assistantCallout') as HTMLInputElement,
  includeId: document.getElementById('includeId') as HTMLInputElement,
  includeTitle: document.getElementById('includeTitle') as HTMLInputElement,
  includeTags: document.getElementById('includeTags') as HTMLInputElement,
  includeSource: document.getElementById('includeSource') as HTMLInputElement,
  includeDates: document.getElementById('includeDates') as HTMLInputElement,
  includeMessageCount: document.getElementById('includeMessageCount') as HTMLInputElement,
  testBtn: document.getElementById('testBtn') as HTMLButtonElement,
  saveBtn: document.getElementById('saveBtn') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLDivElement,
};

/**
 * Initialize popup
 */
async function initialize(): Promise<void> {
  try {
    initializeI18n();
    const settings = await getSettings();
    populateForm(settings);
    setupEventListeners();
  } catch (error) {
    showStatus(getMessage('toast_error_connectionFailed'), 'error');
    console.error('[G2O Popup] Init error:', error);
  }
}

/**
 * Populate form with current settings
 */
function populateForm(settings: ExtensionSettings): void {
  elements.apiKey.value = settings.obsidianApiKey || '';
  elements.port.value = String(settings.obsidianPort || DEFAULT_OBSIDIAN_PORT);
  elements.vaultPath.value = settings.vaultPath || '';

  const { templateOptions } = settings;
  elements.messageFormat.value = templateOptions.messageFormat || 'callout';
  elements.userCallout.value = templateOptions.userCalloutType || 'QUESTION';
  elements.assistantCallout.value = templateOptions.assistantCalloutType || 'NOTE';

  elements.includeId.checked = templateOptions.includeId ?? true;
  elements.includeTitle.checked = templateOptions.includeTitle ?? true;
  elements.includeTags.checked = templateOptions.includeTags ?? true;
  elements.includeSource.checked = templateOptions.includeSource ?? true;
  elements.includeDates.checked = templateOptions.includeDates ?? true;
  elements.includeMessageCount.checked = templateOptions.includeMessageCount ?? true;
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  elements.saveBtn.addEventListener('click', handleSave);
  elements.testBtn.addEventListener('click', handleTest);

  // Enable/disable callout inputs based on message format
  elements.messageFormat.addEventListener('change', () => {
    const isCallout = elements.messageFormat.value === 'callout';
    elements.userCallout.disabled = !isCallout;
    elements.assistantCallout.disabled = !isCallout;
  });

  // Setup API key visibility toggle
  setupApiKeyToggle();
}

/**
 * Setup API key visibility toggle button
 */
function setupApiKeyToggle(): void {
  const apiKeyInput = elements.apiKey;
  const container = apiKeyInput.parentElement;
  if (!container) return;

  // Wrap input in container for positioning
  container.classList.add('api-key-container');

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'api-key-toggle';
  toggleBtn.textContent = '👁️';
  toggleBtn.title = getMessage('settings_showApiKey');

  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = '🙈';
      toggleBtn.title = getMessage('settings_hideApiKey');
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = '👁️';
      toggleBtn.title = getMessage('settings_showApiKey');
    }
  });

  container.appendChild(toggleBtn);
}

/**
 * Collect settings from form
 */
function collectSettings(): ExtensionSettings {
  const templateOptions: TemplateOptions = {
    messageFormat: elements.messageFormat.value as 'callout' | 'plain' | 'blockquote',
    userCalloutType: elements.userCallout.value || 'QUESTION',
    assistantCalloutType: elements.assistantCallout.value || 'NOTE',
    includeId: elements.includeId.checked,
    includeTitle: elements.includeTitle.checked,
    includeTags: elements.includeTags.checked,
    includeSource: elements.includeSource.checked,
    includeDates: elements.includeDates.checked,
    includeMessageCount: elements.includeMessageCount.checked,
  };

  return {
    obsidianApiKey: elements.apiKey.value.trim(),
    obsidianPort: parseInt(elements.port.value, 10) || DEFAULT_OBSIDIAN_PORT,
    vaultPath: elements.vaultPath.value.trim(),
    templateOptions,
  };
}

/**
 * Handle save button click
 * Input validation using security utilities (NEW-03)
 */
async function handleSave(): Promise<void> {
  elements.saveBtn.disabled = true;
  clearStatus();

  try {
    const settings = collectSettings();

    // Validate API key (NEW-03)
    try {
      settings.obsidianApiKey = validateApiKey(settings.obsidianApiKey);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Invalid API key', 'error');
      elements.saveBtn.disabled = false;
      return;
    }

    // Validate port
    if (settings.obsidianPort < MIN_PORT || settings.obsidianPort > MAX_PORT) {
      showStatus(getMessage('error_invalidPort'), 'error');
      elements.saveBtn.disabled = false;
      return;
    }

    // Validate vault path (NEW-03)
    try {
      settings.vaultPath = validateVaultPath(settings.vaultPath);
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Invalid vault path', 'error');
      elements.saveBtn.disabled = false;
      return;
    }

    // Validate callout types (NEW-03)
    settings.templateOptions.userCalloutType = validateCalloutType(
      settings.templateOptions.userCalloutType,
      'QUESTION'
    );
    settings.templateOptions.assistantCalloutType = validateCalloutType(
      settings.templateOptions.assistantCalloutType,
      'NOTE'
    );

    await saveSettings(settings);
    showStatus(getMessage('status_settingsSaved'), 'success');
  } catch (error) {
    showStatus(getMessage('toast_error_saveFailed', 'Unknown error'), 'error');
    console.error('[G2O Popup] Save error:', error);
  } finally {
    elements.saveBtn.disabled = false;
  }
}

/**
 * Handle test connection button click
 */
async function handleTest(): Promise<void> {
  elements.testBtn.disabled = true;
  clearStatus();
  showStatus(getMessage('status_testing'), 'info');

  try {
    // First save current settings
    const settings = collectSettings();

    if (!settings.obsidianApiKey) {
      showStatus(getMessage('toast_error_noApiKey'), 'warning');
      elements.testBtn.disabled = false;
      return;
    }

    // Temporarily save settings for the test
    await saveSettings(settings);

    // Send test connection message to background script
    const response = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'testConnection' }, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result as { success: boolean; error?: string });
      });
    });

    if (response.success) {
      showStatus(getMessage('status_connectionSuccess'), 'success');
    } else {
      showStatus(response.error || getMessage('toast_error_connectionFailed'), 'error');
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : getMessage('toast_error_connectionFailed');
    showStatus(message, 'error');
    console.error('[G2O Popup] Test error:', error);
  } finally {
    elements.testBtn.disabled = false;
  }
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
  elements.status.textContent = message;
  elements.status.className = `status ${type}`;
}

/**
 * Clear status message
 */
function clearStatus(): void {
  elements.status.textContent = '';
  elements.status.className = 'status';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

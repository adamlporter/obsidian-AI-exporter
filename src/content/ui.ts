/**
 * UI components for content script
 * Floating button, toast notifications, loading states
 */

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

// CSS styles for UI components
const STYLES = `
  #g2o-sync-button {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
    transition: all 0.2s ease;
  }

  #g2o-sync-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(124, 58, 237, 0.5);
  }

  #g2o-sync-button:active {
    transform: translateY(0);
  }

  #g2o-sync-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }

  #g2o-sync-button .icon {
    font-size: 16px;
  }

  #g2o-sync-button .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: g2o-spin 0.8s linear infinite;
  }

  @keyframes g2o-spin {
    to { transform: rotate(360deg); }
  }

  .g2o-toast {
    position: fixed;
    bottom: 80px;
    right: 20px;
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    border-radius: 12px;
    font-size: 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    animation: g2o-slideIn 0.3s ease;
    max-width: 400px;
  }

  @keyframes g2o-slideIn {
    from {
      opacity: 0;
      transform: translateX(100px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .g2o-toast.success {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .g2o-toast.error {
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    color: white;
  }

  .g2o-toast.warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
  }

  .g2o-toast.info {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
  }

  .g2o-toast .icon {
    font-size: 18px;
    flex-shrink: 0;
  }

  .g2o-toast .message {
    flex: 1;
    line-height: 1.4;
  }

  .g2o-toast .close {
    background: none;
    border: none;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    margin-left: 8px;
  }

  .g2o-toast .close:hover {
    opacity: 1;
  }
`;

let styleInjected = false;

/**
 * Inject CSS styles into the page
 */
function injectStyles(): void {
  if (styleInjected) return;

  const style = document.createElement('style');
  style.id = 'g2o-styles';
  style.textContent = STYLES;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * Create and inject the sync button
 */
export function injectSyncButton(onClick: () => void): HTMLButtonElement {
  injectStyles();

  // Remove existing button if present
  const existing = document.getElementById('g2o-sync-button');
  if (existing) {
    existing.remove();
  }

  const button = document.createElement('button');
  button.id = 'g2o-sync-button';
  button.innerHTML = `
    <span class="icon">📥</span>
    <span class="text">${getMessage('ui_syncButton')}</span>
  `;

  button.addEventListener('click', onClick);
  document.body.appendChild(button);

  return button;
}

/**
 * Set button loading state
 */
export function setButtonLoading(loading: boolean): void {
  const button = document.getElementById('g2o-sync-button') as HTMLButtonElement | null;
  if (!button) return;

  button.disabled = loading;

  const icon = button.querySelector('.icon');
  const text = button.querySelector('.text');

  if (loading) {
    if (icon) icon.outerHTML = '<div class="spinner"></div>';
    if (text) text.textContent = getMessage('ui_syncing');
  } else {
    const spinner = button.querySelector('.spinner');
    if (spinner) spinner.outerHTML = '<span class="icon">📥</span>';
    if (text) text.textContent = getMessage('ui_syncButton');
  }
}

type ToastType = 'success' | 'error' | 'warning' | 'info';

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Show a toast notification
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  duration: number = 4000
): void {
  injectStyles();

  // Remove any existing toasts
  document.querySelectorAll('.g2o-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = `g2o-toast ${type}`;
  toast.innerHTML = `
    <span class="icon">${TOAST_ICONS[type]}</span>
    <span class="message">${escapeHtml(message)}</span>
    <button class="close" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector('.close');
  closeBtn?.addEventListener('click', () => toast.remove());

  document.body.appendChild(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => {
      toast.style.animation = 'g2o-slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show success toast with file info
 */
export function showSuccessToast(fileName: string, isNewFile: boolean): void {
  const messageKey = isNewFile ? 'toast_success_created' : 'toast_success_updated';
  showToast(getMessage(messageKey, fileName), 'success', 5000);
}

/**
 * Show error toast with details
 */
export function showErrorToast(error: string): void {
  showToast(error, 'error', 6000);
}

/**
 * Show warning toast
 */
export function showWarningToast(message: string): void {
  showToast(message, 'warning', 5000);
}

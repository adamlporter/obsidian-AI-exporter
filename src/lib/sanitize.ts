/**
 * HTML sanitization utility
 * Uses DOMPurify to prevent XSS attacks
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML to prevent XSS attacks
 *
 * Design:
 * - USE_PROFILES: { html: true } uses the default safe HTML allow-list
 *   (auto-removes <script>, <style>, <iframe>, <object>, <embed>, all
 *   event handler attributes (~70 kinds), and dangerous URI schemes)
 * - Cannot combine USE_PROFILES with ALLOWED_TAGS (per DOMPurify docs)
 * - Cannot combine USE_PROFILES with ALLOWED_ATTR (overrides it);
 *   use ADD_ATTR to extend the allow-list instead
 * - FORBID_TAGS adds <style> to the deny-list (CSS injection prevention)
 *
 * The uponSanitizeAttribute hook selectively allows:
 * - data-turn-source-index (Deep Research inline citations, 1-based index into source list)
 * - data-math (Gemini KaTeX math expressions, contains LaTeX source for $$/$$ rendering)
 * while blocking all other data-* attributes.
 *
 * Note: The hook is added/removed per call to avoid cross-contamination
 * with other DOMPurify consumers in the same environment.
 */
export function sanitizeHtml(html: string): string {
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'data-turn-source-index' || data.attrName === 'data-math') {
      data.forceKeepAttr = true;
    } else if (data.attrName.startsWith('data-')) {
      data.keepAttr = false;
    }
  });

  try {
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style'],
    });
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute');
  }
}

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../src/lib/sanitize';

describe('sanitizeHtml', () => {
  describe('preserves safe HTML', () => {
    it('keeps paragraph tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('<p>Hello</p>');
    });

    it('keeps formatting tags', () => {
      expect(sanitizeHtml('<strong>Bold</strong>')).toBe('<strong>Bold</strong>');
      expect(sanitizeHtml('<em>Italic</em>')).toBe('<em>Italic</em>');
    });

    it('keeps allowed attributes', () => {
      const html = '<a href="https://example.com" title="Link">Click</a>';
      expect(sanitizeHtml(html)).toBe(
        '<a href="https://example.com" title="Link">Click</a>'
      );
    });

    it('keeps class attribute', () => {
      expect(sanitizeHtml('<div class="container">Content</div>')).toBe(
        '<div class="container">Content</div>'
      );
    });

    it('keeps nested safe elements', () => {
      expect(sanitizeHtml('<p><strong>Bold</strong> text</p>')).toBe(
        '<p><strong>Bold</strong> text</p>'
      );
    });
  });

  describe('removes XSS vectors', () => {
    it('removes script tags completely', () => {
      expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
    });

    it('removes event handlers', () => {
      expect(sanitizeHtml('<div onclick="alert(1)">Content</div>')).toBe(
        '<div>Content</div>'
      );
    });

    it('removes javascript: URLs', () => {
      expect(sanitizeHtml('<a href="javascript:alert(1)">Click</a>')).toBe(
        '<a>Click</a>'
      );
    });

    it('removes nested XSS', () => {
      expect(sanitizeHtml('<div><script>alert(1)</script>Safe</div>')).toBe(
        '<div>Safe</div>'
      );
    });

    it('removes onerror handlers', () => {
      expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).not.toContain(
        'onerror'
      );
    });
  });

  describe('removes CSS injection', () => {
    it('removes style tags completely', () => {
      expect(sanitizeHtml('<style>body{display:none}</style>')).toBe('');
    });
  });

  describe('enforces attribute restrictions', () => {
    it('removes data-* attributes', () => {
      expect(sanitizeHtml('<div data-id="secret">Content</div>')).toBe(
        '<div>Content</div>'
      );
    });

    it('keeps id attributes (allowed by DOMPurify profile)', () => {
      // Note: USE_PROFILES: { html: true } allows id attribute by default
      // ALLOWED_ATTR adds to the profile, doesn't restrict it
      expect(sanitizeHtml('<div id="test">Content</div>')).toBe(
        '<div id="test">Content</div>'
      );
    });
  });

  describe('handles edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('handles plain text without tags', () => {
      expect(sanitizeHtml('Just plain text')).toBe('Just plain text');
    });

    it('handles whitespace-only input', () => {
      expect(sanitizeHtml('   ')).toBe('   ');
    });
  });
});

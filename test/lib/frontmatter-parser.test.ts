import { describe, it, expect } from 'vitest';
import { parseFrontmatter, updateFrontmatter } from '../../src/lib/frontmatter-parser';

describe('frontmatter-parser', () => {
  // ========== parseFrontmatter ==========

  describe('parseFrontmatter', () => {
    it('parses basic frontmatter with key-value pairs', () => {
      const content = '---\nid: gemini_abc\ntitle: My Chat\n---\nBody text';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe('gemini_abc');
      expect(result!.fields.title).toBe('My Chat');
      expect(result!.body).toBe('Body text');
    });

    it('parses frontmatter with tags list', () => {
      const content = '---\ntags:\n  - ai-conversation\n  - gemini\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.tags).toEqual(['ai-conversation', 'gemini']);
    });

    it('parses quoted values', () => {
      const content = '---\ntitle: "My: Special Title"\nid: \'quoted_id\'\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.title).toBe('My: Special Title');
      expect(result!.fields.id).toBe('quoted_id');
    });

    it('returns null for content without frontmatter', () => {
      expect(parseFrontmatter('No frontmatter here')).toBeNull();
      expect(parseFrontmatter('')).toBeNull();
    });

    it('returns null for content with only opening delimiter', () => {
      expect(parseFrontmatter('---\ntitle: foo')).toBeNull();
    });

    it('preserves raw frontmatter including delimiters', () => {
      const content = '---\nid: abc\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.raw).toBe('---\nid: abc\n---');
    });

    it('handles empty body', () => {
      const content = '---\nid: abc\n---\n';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.body).toBe('');
    });

    it('handles numeric values', () => {
      const content = '---\nmessage_count: 42\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.message_count).toBe('42');
    });

    it('parses full note with all standard fields', () => {
      const content = [
        '---',
        'id: claude_abc-def',
        'title: "Test Conversation"',
        'source: claude',
        'url: "https://claude.ai/chat/abc-def"',
        'created: "2026-01-01T00:00:00.000Z"',
        'modified: "2026-01-01T12:00:00.000Z"',
        'tags:',
        '  - ai-conversation',
        '  - claude',
        'message_count: 4',
        '---',
        '',
        '> [!QUESTION] User',
        '> Hello',
      ].join('\n');

      const result = parseFrontmatter(content);
      expect(result).not.toBeNull();
      expect(result!.fields.id).toBe('claude_abc-def');
      expect(result!.fields.source).toBe('claude');
      expect(result!.fields.tags).toEqual(['ai-conversation', 'claude']);
      expect(result!.fields.message_count).toBe('4');
      expect(result!.body).toContain('> [!QUESTION] User');
    });

    it('handles key with empty value followed by non-list content', () => {
      const content = '---\ntitle:\nsource: gemini\n---\nBody';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.fields.title).toEqual([]);
      expect(result!.fields.source).toBe('gemini');
    });

    it('handles body with multiple paragraphs', () => {
      const content = '---\nid: abc\n---\nParagraph 1\n\nParagraph 2\n\nParagraph 3';
      const result = parseFrontmatter(content);

      expect(result).not.toBeNull();
      expect(result!.body).toBe('Paragraph 1\n\nParagraph 2\n\nParagraph 3');
    });
  });

  // ========== updateFrontmatter ==========

  describe('updateFrontmatter', () => {
    it('updates existing field values', () => {
      const raw = '---\nid: abc\nmodified: "2026-01-01"\nmessage_count: 2\n---';
      const result = updateFrontmatter(raw, {
        modified: '2026-02-01T00:00:00.000Z',
        message_count: 4,
      });

      expect(result).toContain('modified: "2026-02-01T00:00:00.000Z"');
      expect(result).toContain('message_count: 4');
      expect(result).toContain('id: abc');
    });

    it('preserves fields not in updates', () => {
      const raw = '---\nid: abc\ntitle: My Chat\nsource: gemini\n---';
      const result = updateFrontmatter(raw, { title: 'New Title' });

      expect(result).toContain('id: abc');
      expect(result).toContain('source: gemini');
      expect(result).toContain('title: New Title');
    });

    it('ignores update keys not present in frontmatter', () => {
      const raw = '---\nid: abc\n---';
      const result = updateFrontmatter(raw, { nonexistent: 'value' });

      expect(result).toBe('---\nid: abc\n---');
    });

    it('preserves delimiter lines', () => {
      const raw = '---\nid: abc\n---';
      const result = updateFrontmatter(raw, { id: 'xyz' });

      expect(result.startsWith('---\n')).toBe(true);
      expect(result.endsWith('\n---')).toBe(true);
    });

    it('escapes special YAML characters in values', () => {
      const raw = '---\ntitle: old\n---';
      const result = updateFrontmatter(raw, { title: 'Has: special chars' });

      expect(result).toContain('title: "Has: special chars"');
    });
  });
});

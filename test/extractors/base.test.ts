import { describe, it, expect, beforeEach } from 'vitest';
import { BaseExtractor } from '../../src/content/extractors/base';
import type {
  ExtractionResult,
  ConversationMessage,
  ConversationData,
} from '../../src/lib/types';

// Concrete implementation for testing abstract BaseExtractor
class TestExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  canExtract(): boolean {
    return true;
  }

  getConversationId(): string | null {
    return 'test-id';
  }

  getTitle(): string {
    return 'Test Title';
  }

  extractMessages(): ConversationMessage[] {
    return [];
  }

  async extract(): Promise<ExtractionResult> {
    return { success: true, data: undefined as unknown as ConversationData };
  }

  // Expose protected methods for testing
  public testSanitizeText(text: string): string {
    return this.sanitizeText(text);
  }

  public testQueryWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): T | null {
    return this.queryWithFallback(selectors, parent);
  }

  public testQueryAllWithFallback<T extends Element>(
    selectors: string[],
    parent?: Element | Document
  ): NodeListOf<T> | T[] {
    return this.queryAllWithFallback(selectors, parent);
  }

  public testGenerateHashValue(content: string): string {
    return this.generateHashValue(content);
  }
}

describe('BaseExtractor', () => {
  let extractor: TestExtractor;

  beforeEach(() => {
    extractor = new TestExtractor();
    document.body.innerHTML = '';
  });

  describe('validate', () => {
    it('returns invalid for failed extraction', () => {
      const result: ExtractionResult = { success: false, error: 'Failed' };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Failed');
    });

    it('returns invalid for failed extraction with no error message', () => {
      const result: ExtractionResult = { success: false };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Extraction failed');
    });

    it('returns invalid for null data', () => {
      const result: ExtractionResult = {
        success: true,
        data: undefined as unknown as ConversationData,
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No data extracted');
    });

    it('returns invalid for empty messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [],
          extractedAt: new Date(),
          metadata: {
            messageCount: 0,
            userMessageCount: 0,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('No messages found in conversation');
    });

    it('warns on very few messages', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [{ id: '1', role: 'user', content: 'Hello', index: 0 }],
          extractedAt: new Date(),
          metadata: {
            messageCount: 1,
            userMessageCount: 1,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(true);
      expect(validation.warnings.some((w) => w.includes('Very few messages'))).toBe(
        true
      );
    });

    it('warns on unbalanced message count', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
            { id: '2', role: 'user', content: 'Hello again', index: 1 },
            { id: '3', role: 'user', content: 'Hello once more', index: 2 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 3,
            userMessageCount: 3,
            assistantMessageCount: 0,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings.some((w) => w.includes('Unbalanced'))).toBe(true);
    });

    it('warns on empty content', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: '', index: 0 },
            { id: '2', role: 'assistant', content: 'Response', index: 1 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 2,
            userMessageCount: 1,
            assistantMessageCount: 1,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.warnings.some((w) => w.includes('empty content'))).toBe(true);
    });

    it('returns valid for good extraction', () => {
      const result: ExtractionResult = {
        success: true,
        data: {
          id: 'test',
          title: 'Test',
          url: 'https://example.com',
          source: 'gemini',
          messages: [
            { id: '1', role: 'user', content: 'Hello', index: 0 },
            { id: '2', role: 'assistant', content: 'Hi there!', index: 1 },
          ],
          extractedAt: new Date(),
          metadata: {
            messageCount: 2,
            userMessageCount: 1,
            assistantMessageCount: 1,
            hasCodeBlocks: false,
          },
        },
      };
      const validation = extractor.validate(result);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('sanitizeText', () => {
    it('collapses multiple spaces', () => {
      expect(extractor.testSanitizeText('hello    world')).toBe('hello world');
    });

    it('trims whitespace', () => {
      expect(extractor.testSanitizeText('  hello  ')).toBe('hello');
    });

    it('handles newlines and tabs', () => {
      expect(extractor.testSanitizeText('hello\n\tworld')).toBe('hello world');
    });

    it('handles empty string', () => {
      expect(extractor.testSanitizeText('')).toBe('');
    });

    it('handles only whitespace', () => {
      expect(extractor.testSanitizeText('   \n\t   ')).toBe('');
    });
  });

  describe('queryWithFallback', () => {
    it('returns first matching element', () => {
      document.body.innerHTML = '<div class="target">Found</div>';
      const result = extractor.testQueryWithFallback<HTMLDivElement>([
        '.missing',
        '.target',
      ]);
      expect(result?.textContent).toBe('Found');
    });

    it('returns null if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const result = extractor.testQueryWithFallback(['.missing1', '.missing2']);
      expect(result).toBeNull();
    });

    it('searches within parent element', () => {
      document.body.innerHTML = `
        <div id="parent"><span class="target">Inside</span></div>
        <span class="target">Outside</span>
      `;
      const parent = document.getElementById('parent')!;
      const result = extractor.testQueryWithFallback<HTMLSpanElement>(
        ['.target'],
        parent
      );
      expect(result?.textContent).toBe('Inside');
    });

    it('uses first successful selector', () => {
      document.body.innerHTML = `
        <div class="first">First</div>
        <div class="second">Second</div>
      `;
      const result = extractor.testQueryWithFallback<HTMLDivElement>([
        '.first',
        '.second',
      ]);
      expect(result?.textContent).toBe('First');
    });
  });

  describe('queryAllWithFallback', () => {
    it('returns all matching elements for first successful selector', () => {
      document.body.innerHTML = `
        <div class="item">1</div>
        <div class="item">2</div>
      `;
      const results = extractor.testQueryAllWithFallback<HTMLDivElement>([
        '.missing',
        '.item',
      ]);
      expect(results.length).toBe(2);
    });

    it('returns empty array if no match', () => {
      document.body.innerHTML = '<div>No match</div>';
      const results = extractor.testQueryAllWithFallback(['.missing']);
      expect(results.length).toBe(0);
    });

    it('searches within parent element', () => {
      document.body.innerHTML = `
        <div id="parent">
          <span class="item">Inside 1</span>
          <span class="item">Inside 2</span>
        </div>
        <span class="item">Outside</span>
      `;
      const parent = document.getElementById('parent')!;
      const results = extractor.testQueryAllWithFallback<HTMLSpanElement>(
        ['.item'],
        parent
      );
      expect(results.length).toBe(2);
    });

    it('returns results from first successful selector only', () => {
      document.body.innerHTML = `
        <div class="first">First 1</div>
        <div class="first">First 2</div>
        <div class="second">Second</div>
      `;
      const results = extractor.testQueryAllWithFallback<HTMLDivElement>([
        '.first',
        '.second',
      ]);
      expect(results.length).toBe(2);
      expect(Array.from(results).every((el) => el.classList.contains('first'))).toBe(
        true
      );
    });
  });

  describe('generateHashValue', () => {
    it('delegates to hash function', () => {
      const hash = extractor.testGenerateHashValue('test content');
      expect(hash).toBe('5b9662eb');
    });

    it('returns consistent hash', () => {
      const hash1 = extractor.testGenerateHashValue('same content');
      const hash2 = extractor.testGenerateHashValue('same content');
      expect(hash1).toBe(hash2);
    });

    it('returns 8-character hex string', () => {
      const hash = extractor.testGenerateHashValue('any content');
      expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
  });
});

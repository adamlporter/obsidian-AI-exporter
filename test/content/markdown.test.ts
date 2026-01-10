import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  generateFileName,
  generateContentHash,
  conversationToNote,
} from '../../src/content/markdown';
import type { ConversationData, TemplateOptions } from '../../src/lib/types';

describe('htmlToMarkdown', () => {
  describe('basic formatting', () => {
    it('converts paragraphs', () => {
      expect(htmlToMarkdown('<p>Hello World</p>')).toBe('Hello World');
    });

    it('converts bold text', () => {
      expect(htmlToMarkdown('<strong>Bold</strong>')).toBe('**Bold**');
    });

    it('converts italic text', () => {
      expect(htmlToMarkdown('<em>Italic</em>')).toBe('*Italic*');
    });

    it('converts headings', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title');
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
      expect(htmlToMarkdown('<h3>Section</h3>')).toBe('### Section');
    });

    it('converts links', () => {
      expect(htmlToMarkdown('<a href="https://example.com">Link</a>')).toBe(
        '[Link](https://example.com)'
      );
    });

    it('converts lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = htmlToMarkdown(html);
      // Turndown adds extra spaces after bullet marker
      expect(result).toContain('-   Item 1');
      expect(result).toContain('-   Item 2');
    });
  });

  describe('code blocks', () => {
    it('converts fenced code blocks with language', () => {
      const html = '<pre><code class="language-javascript">const x = 1;</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('```javascript');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('```');
    });

    it('converts fenced code blocks without language', () => {
      const html = '<pre><code>plain code</code></pre>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('```');
      expect(result).toContain('plain code');
    });

    it('converts inline code', () => {
      expect(htmlToMarkdown('Use <code>npm install</code>')).toBe(
        'Use `npm install`'
      );
    });
  });

  describe('tables', () => {
    it('converts HTML tables to markdown', () => {
      const html = `
        <table>
          <thead><tr><th>A</th><th>B</th></tr></thead>
          <tbody><tr><td>1</td><td>2</td></tr></tbody>
        </table>
      `;
      const result = htmlToMarkdown(html);
      expect(result).toContain('| A | B |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| 1 | 2 |');
    });

    it('handles tables without thead', () => {
      const html = `
        <table>
          <tr><td>Header 1</td><td>Header 2</td></tr>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
        </table>
      `;
      const result = htmlToMarkdown(html);
      expect(result).toContain('|');
    });
  });

  describe('whitespace handling', () => {
    it('converts <br> to spaces (Turndown behavior)', () => {
      // Note: br tags are replaced with \n before turndown, but turndown
      // may collapse them to spaces in inline context
      const result = htmlToMarkdown('Line 1<br>Line 2');
      expect(result).toBe('Line 1 Line 2');
    });

    it('converts &nbsp; to spaces', () => {
      expect(htmlToMarkdown('Hello&nbsp;World')).toBe('Hello World');
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      expect(htmlToMarkdown('')).toBe('');
    });

    it('handles plain text', () => {
      expect(htmlToMarkdown('Just text')).toBe('Just text');
    });
  });
});

describe('generateFileName', () => {
  it('creates filename from title and ID', () => {
    expect(generateFileName('Hello World', 'abc123def456')).toBe(
      'hello-world-abc123de.md'
    );
  });

  it('preserves Japanese characters', () => {
    const result = generateFileName('日本語テスト', 'abc123def456');
    expect(result).toContain('日本語テスト');
    expect(result.endsWith('.md')).toBe(true);
  });

  it('preserves Korean characters', () => {
    const result = generateFileName('한글테스트', 'abc123def456');
    expect(result).toContain('한글테스트');
  });

  it('removes special characters', () => {
    expect(generateFileName('Test: Special!', 'abc123def456')).toBe(
      'test-special-abc123de.md'
    );
  });

  it('truncates long titles to 50 characters', () => {
    const longTitle = 'a'.repeat(100);
    const result = generateFileName(longTitle, 'abc123def456');
    // 50 chars title + '-' + 8 char ID suffix + '.md'
    expect(result.length).toBeLessThanOrEqual(50 + 1 + 8 + 3);
  });

  it('handles empty title with fallback', () => {
    expect(generateFileName('', 'abc123def456')).toBe('conversation-abc123de.md');
  });

  it('handles title with only special characters', () => {
    expect(generateFileName('!!!@@@###', 'abc123def456')).toBe(
      'conversation-abc123de.md'
    );
  });
});

describe('generateContentHash', () => {
  it('returns consistent hash', () => {
    const content = 'test content';
    expect(generateContentHash(content)).toBe(generateContentHash(content));
  });

  it('delegates to generateHash', () => {
    // Verify behavior matches generateHash
    expect(generateContentHash('test content')).toBe('5b9662eb');
  });

  it('handles empty content', () => {
    expect(generateContentHash('')).toBe('00000000');
  });
});

describe('conversationToNote', () => {
  const mockData: ConversationData = {
    id: 'conv123',
    title: 'Test Conversation',
    url: 'https://gemini.google.com/app/conv123',
    source: 'gemini',
    messages: [
      { id: 'msg1', role: 'user', content: 'Hello', index: 0 },
      { id: 'msg2', role: 'assistant', content: '<p>Hi there!</p>', index: 1 },
    ],
    extractedAt: new Date('2025-01-10T00:00:00Z'),
    metadata: {
      messageCount: 2,
      userMessageCount: 1,
      assistantMessageCount: 1,
      hasCodeBlocks: false,
    },
  };

  const defaultOptions: TemplateOptions = {
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

  it('generates frontmatter with required fields', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.frontmatter.id).toBe('gemini_conv123');
    expect(note.frontmatter.title).toBe('Test Conversation');
    expect(note.frontmatter.source).toBe('gemini');
    expect(note.frontmatter.url).toBe('https://gemini.google.com/app/conv123');
  });

  it('generates frontmatter with tags', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.frontmatter.tags).toContain('ai-conversation');
    expect(note.frontmatter.tags).toContain('gemini');
  });

  it('formats messages as callouts', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('[!QUESTION]');
    expect(note.body).toContain('[!NOTE]');
    expect(note.body).toContain('User');
    expect(note.body).toContain('Gemini');
  });

  it('converts HTML to markdown in assistant messages', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.body).toContain('Hi there!');
    expect(note.body).not.toContain('<p>');
  });

  it('generates content hash', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('generates fileName', () => {
    const note = conversationToNote(mockData, defaultOptions);
    expect(note.fileName).toBe('test-conversation-conv123.md');
  });

  it('formats as blockquote when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'blockquote' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).toContain('**Gemini:**');
    expect(note.body).toContain('> ');
  });

  it('formats as plain when specified', () => {
    const options = { ...defaultOptions, messageFormat: 'plain' as const };
    const note = conversationToNote(mockData, options);
    expect(note.body).toContain('**User:**');
    expect(note.body).toContain('**Gemini:**');
    expect(note.body).not.toContain('[!');
  });

  it('handles multiple messages', () => {
    const dataWithMore: ConversationData = {
      ...mockData,
      messages: [
        { id: 'msg1', role: 'user', content: 'First question', index: 0 },
        { id: 'msg2', role: 'assistant', content: 'First answer', index: 1 },
        { id: 'msg3', role: 'user', content: 'Second question', index: 2 },
        { id: 'msg4', role: 'assistant', content: 'Second answer', index: 3 },
      ],
    };
    const note = conversationToNote(dataWithMore, defaultOptions);
    expect(note.body).toContain('First question');
    expect(note.body).toContain('First answer');
    expect(note.body).toContain('Second question');
    expect(note.body).toContain('Second answer');
  });
});

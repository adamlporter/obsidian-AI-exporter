import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  generateFileName,
  generateContentHash,
  conversationToNote,
  sanitizeUrl,
  convertInlineCitationsToLinks,
  removeSourcesCarousel,
  convertDeepResearchContent,
} from '../../src/content/markdown';
import type { ConversationData, TemplateOptions, DeepResearchLinks } from '../../src/lib/types';

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

// ============================================================
// Deep Research Link Processing Tests
// ============================================================

describe('sanitizeUrl', () => {
  it('returns valid URLs unchanged', () => {
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrl('http://example.org/path')).toBe('http://example.org/path');
  });

  it('rejects javascript: URLs', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBe('');
  });

  it('rejects data: URLs', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
  });

  it('rejects vbscript: URLs', () => {
    expect(sanitizeUrl('vbscript:msgbox("XSS")')).toBe('');
  });

  it('handles whitespace', () => {
    expect(sanitizeUrl('  javascript:alert(1)  ')).toBe('');
    expect(sanitizeUrl('  https://example.com  ')).toBe('  https://example.com  ');
  });
});

describe('convertInlineCitationsToLinks', () => {
  // Helper to create source map (data-turn-source-index is 1-based)
  const createSourceMap = () => {
    const map = new Map<number, { index: number; url: string; title: string; domain: string }>();
    map.set(1, { index: 0, url: 'https://example.com/a', title: 'Article A', domain: 'example.com' });
    map.set(2, { index: 1, url: 'https://example.org/b', title: 'Article B', domain: 'example.org' });
    map.set(5, { index: 4, url: 'https://test.net/c', title: 'Article C', domain: 'test.net' });
    return map;
  };

  // Note: convertInlineCitationsToLinks now outputs <a> tags instead of Markdown links
  // This allows Turndown to handle the Markdown conversion, avoiding double-escaping issues

  it('converts source-footnote wrapped citations to anchor tags', () => {
    const html =
      'Text<source-footnote><sup class="superscript" data-turn-source-index="1"></sup></source-footnote>more';
    const result = convertInlineCitationsToLinks(html, createSourceMap());
    expect(result).toBe('Text<a href="https://example.com/a">Article A</a>more');
  });

  it('converts standalone sup citations to anchor tags', () => {
    const html = 'Text<sup data-turn-source-index="5"></sup>more';
    const result = convertInlineCitationsToLinks(html, createSourceMap());
    expect(result).toBe('Text<a href="https://test.net/c">Article C</a>more');
  });

  it('handles multiple citations', () => {
    const html =
      'First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="2"></sup>';
    const result = convertInlineCitationsToLinks(html, createSourceMap());
    expect(result).toBe('First<a href="https://example.com/a">Article A</a> second<a href="https://example.org/b">Article B</a>');
  });

  it('preserves non-citation content', () => {
    const html = '<p>No citations here</p>';
    const result = convertInlineCitationsToLinks(html, createSourceMap());
    expect(result).toBe('<p>No citations here</p>');
  });

  it('removes citation when source not found in map', () => {
    const html = 'Text<sup data-turn-source-index="99"></sup>more';
    const result = convertInlineCitationsToLinks(html, createSourceMap());
    expect(result).toBe('Textmore');
  });

  it('handles dangerous URLs by showing title only', () => {
    const map = new Map<number, { index: number; url: string; title: string; domain: string }>();
    map.set(1, { index: 0, url: 'javascript:alert(1)', title: 'Bad Source', domain: 'bad.com' });
    const html = 'Text<sup data-turn-source-index="1"></sup>more';
    const result = convertInlineCitationsToLinks(html, map);
    expect(result).toBe('TextBad Sourcemore');
    expect(result).not.toContain('javascript:');
  });

  it('escapes HTML special characters in title', () => {
    const map = new Map<number, { index: number; url: string; title: string; domain: string }>();
    map.set(1, { index: 0, url: 'https://example.com', title: 'Title <script> & "quotes"', domain: 'example.com' });
    const html = 'Text<sup data-turn-source-index="1"></sup>';
    const result = convertInlineCitationsToLinks(html, map);
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&quot;');
  });

  it('preserves parentheses in URL (Turndown handles encoding)', () => {
    const map = new Map<number, { index: number; url: string; title: string; domain: string }>();
    map.set(1, { index: 0, url: 'https://example.com/page(1)', title: 'Page', domain: 'example.com' });
    const html = 'Text<sup data-turn-source-index="1"></sup>';
    const result = convertInlineCitationsToLinks(html, map);
    // URL is preserved as-is in href, Turndown will handle Markdown encoding
    expect(result).toContain('href="https://example.com/page(1)"');
  });
});

describe('removeSourcesCarousel', () => {
  it('removes sources-carousel-inline elements', () => {
    const html = '<p>Content</p><sources-carousel-inline>carousel content</sources-carousel-inline>';
    expect(removeSourcesCarousel(html)).toBe('<p>Content</p>');
  });

  it('handles nested content in carousel', () => {
    const html = '<div><sources-carousel-inline><div>nested</div></sources-carousel-inline></div>';
    expect(removeSourcesCarousel(html)).toBe('<div></div>');
  });

  it('preserves content without carousel', () => {
    const html = '<p>Just content</p>';
    expect(removeSourcesCarousel(html)).toBe('<p>Just content</p>');
  });
});

// generateFootnoteDefinitions and generateReferencesSection removed in v2.0
// Inline link format is now used instead of footnotes

describe('convertDeepResearchContent', () => {
  it('converts citations to inline links', () => {
    // data-turn-source-index is 1-based, sources array is 0-based
    const html = '<p>Text<sup data-turn-source-index="1"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const result = convertDeepResearchContent(html, links);

    // With <a> tag approach, Turndown converts to clean Markdown (no escaping)
    expect(result).toContain('[Source](https://example.com)');
    // No footnotes or References section in v2.0 (inline links instead)
    expect(result).not.toContain('[^');
    expect(result).not.toContain('References');
  });

  it('removes sources carousel', () => {
    const html = '<p>Text</p><sources-carousel-inline>carousel</sources-carousel-inline>';
    const result = convertDeepResearchContent(html, undefined);

    expect(result).not.toContain('carousel');
    expect(result).toContain('Text');
  });

  it('works without links', () => {
    const html = '<p>Simple content</p>';
    const result = convertDeepResearchContent(html, undefined);

    expect(result).toContain('Simple content');
    expect(result).not.toContain('References');
  });

  it('handles multiple sources with 1-based index mapping', () => {
    const html = '<p>First<sup data-turn-source-index="1"></sup> second<sup data-turn-source-index="2"></sup></p>';
    const links: DeepResearchLinks = {
      sources: [
        { index: 0, url: 'https://example.com/a', title: 'Article A', domain: 'example.com' },
        { index: 1, url: 'https://example.org/b', title: 'Article B', domain: 'example.org' },
      ],
    };

    const result = convertDeepResearchContent(html, links);

    // With <a> tag approach, Turndown converts to clean Markdown (no escaping)
    expect(result).toContain('[Article A](https://example.com/a)');
    expect(result).toContain('[Article B](https://example.org/b)');
  });
});

describe('conversationToNote with Deep Research links', () => {
  const defaultOptions: TemplateOptions = {
    includeId: true,
    includeTitle: true,
    includeSource: true,
    includeTags: true,
    includeDates: true,
    includeMessageCount: true,
    messageFormat: 'callout',
    userCalloutType: 'QUESTION',
    assistantCalloutType: 'NOTE',
  };

  it('converts Deep Research with links to note with inline links', () => {
    const links: DeepResearchLinks = {
      sources: [{ index: 0, url: 'https://example.com', title: 'Source', domain: 'example.com' }],
    };

    const deepResearchData: ConversationData = {
      id: 'dr123',
      title: 'Research Report',
      url: 'https://gemini.google.com/app/dr123',
      source: 'gemini',
      type: 'deep-research',
      links,
      messages: [
        {
          id: 'report-0',
          role: 'assistant',
          // data-turn-source-index is 1-based
          content: '<p>Content<sup data-turn-source-index="1"></sup></p>',
          index: 0,
        },
      ],
      extractedAt: new Date('2024-01-01'),
      metadata: {
        messageCount: 1,
        userMessageCount: 0,
        assistantMessageCount: 1,
        hasCodeBlocks: false,
      },
    };

    const note = conversationToNote(deepResearchData, defaultOptions);

    expect(note.frontmatter.type).toBe('deep-research');
    expect(note.frontmatter.tags).toContain('deep-research');
    // v2.0: inline links via <a> tags (Turndown converts to clean Markdown)
    expect(note.body).toContain('[Source](https://example.com)');
    expect(note.body).not.toContain('[^');
    expect(note.body).not.toContain('## References');
  });
});

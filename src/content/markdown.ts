/**
 * HTML to Markdown conversion using Turndown
 */

import TurndownService from 'turndown';
import type {
  ConversationData,
  ObsidianNote,
  NoteFrontmatter,
  TemplateOptions,
  DeepResearchLinks,
  DeepResearchSource,
} from '../lib/types';
import { generateHash } from '../lib/hash';

// ============================================================
// Deep Research Link Processing Functions (Inline Link Mode)
// ============================================================

/**
 * Sanitize URL to remove dangerous schemes
 */
export function sanitizeUrl(url: string): string {
  const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];
  const lowerUrl = url.toLowerCase().trim();

  for (const scheme of dangerousSchemes) {
    if (lowerUrl.startsWith(scheme)) {
      return ''; // Return empty for dangerous URLs
    }
  }

  return url;
}

/**
 * Build a Map for accessing sources by data-turn-source-index (1-based)
 *
 * @param sources Array of DeepResearchSource (0-based index)
 * @returns Map<data-turn-source-index, DeepResearchSource>
 */
function buildSourceMap(sources: DeepResearchSource[]): Map<number, DeepResearchSource> {
  const map = new Map<number, DeepResearchSource>();

  sources.forEach((source, arrayIndex) => {
    // data-turn-source-index is 1-based
    // arrayIndex=0 → data-turn-source-index=1
    const turnSourceIndex = arrayIndex + 1;
    map.set(turnSourceIndex, source);
  });

  return map;
}

/**
 * Escape HTML special characters for safe insertion into HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert inline citations to anchor tags for Turndown processing
 *
 * Before: <source-footnote><sup data-turn-source-index="N">...</sup></source-footnote>
 * After: <a href="URL">Title</a>
 *
 * Design: Instead of generating Markdown directly, we convert to <a> tags
 * and let Turndown handle the Markdown conversion. This avoids double-escaping
 * issues where our Markdown escapes get re-escaped by Turndown.
 *
 * Important: data-turn-source-index is 1-based
 *
 * @param html HTML content to convert
 * @param sourceMap Map built from buildSourceMap()
 */
export function convertInlineCitationsToLinks(
  html: string,
  sourceMap: Map<number, DeepResearchSource>
): string {
  // Pattern 1: source-footnote wrapped
  let result = html.replace(
    /<source-footnote[^>]*>[\s\S]*?<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>[\s\S]*?<\/source-footnote>/gi,
    (match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        const safeUrl = sanitizeUrl(source.url);
        if (safeUrl) {
          // Return <a> tag for Turndown to process
          return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;
        }
        return escapeHtml(source.title); // URL invalid: title only
      }
      return ''; // Source not found: remove marker
    }
  );

  // Pattern 2: standalone sup element (fallback)
  result = result.replace(
    /<sup[^>]*?data-turn-source-index="(\d+)"[^>]*?>[\s\S]*?<\/sup>/gi,
    (match, indexStr) => {
      const index = parseInt(indexStr, 10);
      const source = sourceMap.get(index);
      if (source) {
        const safeUrl = sanitizeUrl(source.url);
        if (safeUrl) {
          return `<a href="${escapeHtml(safeUrl)}">${escapeHtml(source.title)}</a>`;
        }
        return escapeHtml(source.title);
      }
      return '';
    }
  );

  return result;
}

/**
 * Remove sources-carousel-inline elements
 */
export function removeSourcesCarousel(html: string): string {
  return html.replace(/<sources-carousel-inline[\s\S]*?<\/sources-carousel-inline>/gi, '');
}

/**
 * Convert Deep Research content with inline links
 *
 * Design: Converts inline citations directly to [Title](URL) format.
 * No footnote definitions or References section needed.
 */
export function convertDeepResearchContent(html: string, links?: DeepResearchLinks): string {
  let processed = html;

  // 1. Build source map (1-based index)
  let sourceMap = new Map<number, DeepResearchSource>();
  if (links && links.sources.length > 0) {
    sourceMap = buildSourceMap(links.sources);
  }

  // 2. Convert inline citations to inline links
  processed = convertInlineCitationsToLinks(processed, sourceMap);

  // 3. Remove sources carousel
  processed = removeSourcesCarousel(processed);

  // 4. Convert HTML to Markdown
  const markdown = htmlToMarkdown(processed);

  // No References section (inline links are self-contained)

  return markdown;
}

// ============================================================
// Turndown Configuration
// ============================================================

// Initialize Turndown with custom rules
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});

// Custom rule for code blocks with language detection
turndown.addRule('codeBlocks', {
  filter: node => {
    return node.nodeName === 'PRE' && node.querySelector('code') !== null;
  },
  replacement: (content, node) => {
    const codeElement = (node as HTMLElement).querySelector('code');
    if (!codeElement) return content;

    // Try to detect language from class
    const className = codeElement.className || '';
    const langMatch = className.match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : '';

    const code = codeElement.textContent || '';
    return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
  },
});

// Custom rule for inline code
turndown.addRule('inlineCode', {
  filter: node => {
    return node.nodeName === 'CODE' && node.parentNode?.nodeName !== 'PRE';
  },
  replacement: content => {
    return `\`${content}\``;
  },
});

// Custom rule for tables
turndown.addRule('tables', {
  filter: 'table',
  replacement: (content, node) => {
    const table = node as HTMLTableElement;
    const rows: string[][] = [];

    // Extract headers
    const headerRow = table.querySelector('thead tr, tr:first-child');
    if (headerRow) {
      const headers: string[] = [];
      headerRow.querySelectorAll('th, td').forEach(cell => {
        headers.push(cell.textContent?.trim() || '');
      });
      if (headers.length > 0) {
        rows.push(headers);
      }
    }

    // Extract body rows
    const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
    bodyRows.forEach(row => {
      const cells: string[] = [];
      row.querySelectorAll('td, th').forEach(cell => {
        cells.push(cell.textContent?.trim() || '');
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    if (rows.length === 0) return '';

    // Build markdown table
    const lines: string[] = [];
    rows.forEach((row, index) => {
      lines.push('| ' + row.join(' | ') + ' |');
      if (index === 0) {
        // Add separator after header
        lines.push('| ' + row.map(() => '---').join(' | ') + ' |');
      }
    });

    return '\n' + lines.join('\n') + '\n';
  },
});

/**
 * Convert HTML content to Markdown
 */
export function htmlToMarkdown(html: string): string {
  // Clean up HTML before conversion
  const cleaned = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/g, ' ');

  return turndown.turndown(cleaned);
}

/**
 * Generate sanitized filename from title
 */
export function generateFileName(title: string, conversationId: string): string {
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9\u3000-\u9fff\uac00-\ud7af]+/g, '-') // Keep Japanese/Korean chars
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

  const idSuffix = conversationId.substring(0, 8);
  return `${sanitized || 'conversation'}-${idSuffix}.md`;
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
  return generateHash(content);
}

/**
 * Format a single message according to template options
 */
function formatMessage(
  content: string,
  role: 'user' | 'assistant',
  options: TemplateOptions
): string {
  // Convert HTML to Markdown for assistant messages
  const markdown = role === 'assistant' ? htmlToMarkdown(content) : content;

  switch (options.messageFormat) {
    case 'callout': {
      const calloutType = role === 'user' ? options.userCalloutType : options.assistantCalloutType;
      const label = role === 'user' ? 'User' : 'Gemini';
      // Format as Obsidian callout with proper line handling
      const lines = markdown.split('\n');
      const formattedLines = lines.map((line, i) =>
        i === 0 ? `> [!${calloutType}] ${label}\n> ${line}` : `> ${line}`
      );
      return formattedLines.join('\n');
    }

    case 'blockquote': {
      const label = role === 'user' ? '**User:**' : '**Gemini:**';
      const lines = markdown.split('\n').map(line => `> ${line}`);
      return `${label}\n${lines.join('\n')}`;
    }

    case 'plain':
    default: {
      const label = role === 'user' ? '**User:**' : '**Gemini:**';
      return `${label}\n\n${markdown}`;
    }
  }
}

/**
 * Convert conversation data to Obsidian note
 */
export function conversationToNote(data: ConversationData, options: TemplateOptions): ObsidianNote {
  const now = new Date().toISOString();

  // Generate frontmatter
  const frontmatter: NoteFrontmatter = {
    id: `${data.source}_${data.id}`,
    title: data.title,
    source: data.source,
    ...(data.type && { type: data.type }),
    url: data.url,
    created: data.extractedAt.toISOString(),
    modified: now,
    tags:
      data.type === 'deep-research'
        ? ['ai-research', 'deep-research', data.source]
        : ['ai-conversation', data.source],
    message_count: data.messages.length,
  };

  // Generate body - different format for Deep Research vs normal conversation
  let body: string;

  if (data.type === 'deep-research') {
    // Deep Research: convert with links support (footnotes + References)
    body = convertDeepResearchContent(data.messages[0].content, data.links);
  } else {
    // 通常会話のフォーマット（Callout 形式）
    const bodyParts: string[] = [];

    for (const message of data.messages) {
      const formatted = formatMessage(message.content, message.role, options);
      bodyParts.push(formatted);
    }

    body = bodyParts.join('\n\n');
  }

  // Generate filename and content hash
  const fileName = generateFileName(data.title, data.id);
  const contentHash = generateContentHash(body);

  return {
    fileName,
    frontmatter,
    body,
    contentHash,
  };
}

/**
 * Gemini-specific conversation extractor
 * Based on DOM analysis from elements-sample.html
 */

import { BaseExtractor } from './base';
import { extractErrorMessage } from '../../lib/error-utils';
import { sanitizeHtml } from '../../lib/sanitize';
import { MAX_DEEP_RESEARCH_TITLE_LENGTH, MAX_CONVERSATION_TITLE_LENGTH } from '../../lib/constants';
import type {
  ExtractionResult,
  ConversationMessage,
  DeepResearchSource,
  DeepResearchLinks,
} from '../../lib/types';

/**
 * CSS selectors for Gemini UI elements
 * Updated based on actual DOM analysis from element-sample.html
 */
const SELECTORS = {
  // Conversation turn container (each Q&A pair)
  conversationTurn: ['.conversation-container', '[class*="conversation-container"]'],

  // User query element (Angular component)
  userQuery: ['user-query', '[class*="user-query"]'],

  // Query text lines (multiple lines per query)
  queryTextLine: ['.query-text-line', 'p[class*="query-text-line"]'],

  // Model response element (Angular component)
  modelResponse: ['model-response', '[class*="model-response"]'],

  // Model response markdown content
  modelResponseContent: [
    '.markdown.markdown-main-panel',
    '.markdown-main-panel',
    'message-content .markdown',
  ],

  // Conversation title (sidebar)
  conversationTitle: [
    '.conversation-title.gds-title-m',
    '.conversation-title',
    '[class*="conversation-title"]',
  ],
};

/**
 * Deep Research specific selectors
 * Used to detect and extract content from the Deep Research immersive panel
 */
const DEEP_RESEARCH_SELECTORS = {
  // Deep Research panel (existence check)
  panel: ['deep-research-immersive-panel'],

  // Report title
  title: [
    'deep-research-immersive-panel h2.title-text.gds-title-s',
    'deep-research-immersive-panel .title-text',
    'toolbar h2.title-text',
  ],

  // Report content
  content: [
    '#extended-response-markdown-content',
    'message-content#extended-response-message-content .markdown-main-panel',
    'structured-content-container[data-test-id="message-content"] .markdown-main-panel',
  ],
};

/**
 * Deep Research link extraction selectors
 */
const DEEP_RESEARCH_LINK_SELECTORS = {
  // Inline citations
  inlineCitation: [
    'source-footnote sup.superscript[data-turn-source-index]',
    'sup.superscript[data-turn-source-index]',
  ],
  // Source list container
  sourceListContainer: ['deep-research-source-lists', '#used-sources-list'],
  // Source list items
  sourceListItem: ['a[data-test-id="browse-web-item-link"]', 'a[data-test-id="browse-chip-link"]'],
  // Source title
  sourceTitle: ['[data-test-id="title"]', '.sub-title'],
  // Source domain
  sourceDomain: ['[data-test-id="domain-name"]', '.display-name'],
};

/**
 * Pre-computed selector strings for performance optimization
 * Avoids repeated .join(',') calls inside loops
 */
const COMPUTED_SELECTORS = {
  sourceListItem: DEEP_RESEARCH_LINK_SELECTORS.sourceListItem.join(','),
  sourceTitle: DEEP_RESEARCH_LINK_SELECTORS.sourceTitle.join(','),
  sourceDomain: DEEP_RESEARCH_LINK_SELECTORS.sourceDomain.join(','),
} as const;

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  /**
   * Check if this extractor can handle the current page
   */
  canExtract(): boolean {
    return window.location.hostname === 'gemini.google.com';
  }

  /**
   * Check if Deep Research panel is currently visible
   */
  isDeepResearchVisible(): boolean {
    const panel = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.panel);
    return panel !== null;
  }

  /**
   * Get title of the Deep Research report
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, MAX_DEEP_RESEARCH_TITLE_LENGTH);
    }
    return 'Untitled Deep Research Report';
  }

  /**
   * Extract Deep Research report body content
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

  /**
   * Extract source list from Deep Research panel
   * Sources are in the deep-research-source-lists element
   *
   * Important: data-turn-source-index is 1-based
   * Mapping: data-turn-source-index="N" → sources[N-1]
   */
  extractSourceList(): DeepResearchSource[] {
    const sources: DeepResearchSource[] = [];
    const sourceLinks = document.querySelectorAll(COMPUTED_SELECTORS.sourceListItem);

    sourceLinks.forEach((link, index) => {
      const anchor = link as HTMLAnchorElement;
      const url = anchor.href;

      // Extract title using pre-computed selector
      const titleEl = anchor.querySelector(COMPUTED_SELECTORS.sourceTitle);
      const title = titleEl?.textContent?.trim() || 'Unknown Title';

      // Extract domain (fallback to URL parsing) using pre-computed selector
      const domainEl = anchor.querySelector(COMPUTED_SELECTORS.sourceDomain);
      let domain = domainEl?.textContent?.trim() || '';
      if (!domain) {
        try {
          domain = new URL(url).hostname;
        } catch {
          domain = 'unknown';
        }
      }

      sources.push({
        index, // 0-based array index
        url,
        title: this.sanitizeText(title),
        domain,
      });
    });

    return sources;
  }

  /**
   * Extract all Deep Research link information
   * Only extracts source list; inline citations are processed during Markdown conversion
   */
  extractDeepResearchLinks(): DeepResearchLinks {
    const sources = this.extractSourceList();

    return {
      sources,
    };
  }

  /**
   * Get conversation ID from URL
   * URL format: https://gemini.google.com/app/{conversationId}
   *          or https://gemini.google.com/gem/{conversationId}
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/(app|gem)\/([a-f0-9]+)/i);
    return match ? match[2] : null;
  }

  /**
   * Get the human-readable title Gemini shows for this conversation.
   *
   * Strategy (in priority order):
   *   1. Match the sidebar link whose href contains the current conversation
   *      ID — the most reliable method since it finds exactly the right entry.
   *   2. document.title stripping the " | Gemini" suffix.
   *   3. First user query text.
   *   4. Conversation ID from the URL.
   */
  getGeminiTitle(): string {
    // ── 1. Sidebar link matching current conversation ID ───────────────────
    // Each sidebar item is an <a> whose href contains the conversation ID.
    // The title text lives in a child element with the autotextdirection
    // attribute (or .conversation-title class as fallback).
    const id = this.getConversationId();
    if (id) {
      const activeLink = document.querySelector<HTMLElement>(`a[href*="${id}"]`);
      const titleEl = activeLink?.querySelector<HTMLElement>(
        '[autotextdirection], .conversation-title'
      );
      const text = titleEl?.textContent?.trim().replace(/\s+/g, ' ');
      if (text) {
        console.info(`[G2O] Title from sidebar link: "${text}"`);
        return text.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
      }
    }

    // ── 2. document.title (strip " | Gemini" suffix) ───────────────────────
    const suffix = ' | Gemini';
    const raw = document.title?.trim() ?? '';
    if (raw && raw !== 'Gemini' && raw !== 'Google Gemini') {
      const fromDocTitle = raw.endsWith(suffix)
        ? raw.slice(0, -suffix.length).trim()
        : raw;
      if (fromDocTitle) {
        console.info(`[G2O] Title from document.title: "${fromDocTitle}"`);
        return fromDocTitle.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
      }
    }

    // ── 3. First user query ────────────────────────────────────────────────
    const firstQueryText = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine);
    if (firstQueryText?.textContent) {
      const title = this.sanitizeText(firstQueryText.textContent);
      console.info(`[G2O] Title from first query: "${title}"`);
      return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }

    // ── 4. URL fallback ────────────────────────────────────────────────────
    console.warn('[G2O] Could not determine human-readable title; using ID:', id);
    return id ? `Gemini ${id}` : 'Untitled Gemini Conversation';
  }

  /**
   * @deprecated Use getGeminiTitle() instead.
   * Kept for interface compatibility with BaseExtractor.
   */
  getTitle(): string {
    return this.getGeminiTitle();
  }

  /**
   * Extract all messages from the conversation
   * Iterates through each conversation-container to extract Q&A pairs
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Get all conversation turns (each contains one Q&A pair)
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found, trying fallback extraction');
      return this.extractMessagesFromRoot();
    }

    console.info(`[G2O] Found ${turns.length} conversation turns`);

    // Process each conversation turn
    turns.forEach((turn, index) => {
      // Extract user query from this turn
      const userQuery = turn.querySelector('user-query');
      if (userQuery) {
        const content = this.extractUserQueryContent(userQuery);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      }

      // Extract model response from this turn
      const modelResponse = turn.querySelector('model-response');
      if (modelResponse) {
        const content = this.extractModelResponseContent(modelResponse);
        if (content) {
          messages.push({
            id: `assistant-${index}`,
            role: 'assistant',
            content,
            htmlContent: content,
            index: messages.length,
          });
        }
      }
    });

    return messages;
  }

  /**
   * Extract messages from document root (fallback for non-standard layouts)
   */
  private extractMessagesFromRoot(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    const userQueries = this.queryAllWithFallback<HTMLElement>(SELECTORS.userQuery);
    const modelResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.modelResponse);

    console.info(
      `[G2O] Fallback: Found ${userQueries.length} user queries, ${modelResponses.length} model responses`
    );

    // Interleave based on DOM order
    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];
    userQueries.forEach(el => allElements.push({ element: el, type: 'user' }));
    modelResponses.forEach(el => allElements.push({ element: el, type: 'assistant' }));

    // Sort by DOM position
    allElements.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    // Extract content
    allElements.forEach((item, index) => {
      const content =
        item.type === 'user'
          ? this.extractUserQueryContent(item.element)
          : this.extractModelResponseContent(item.element);

      if (content) {
        messages.push({
          id: `${item.type}-${index}`,
          role: item.type,
          content,
          htmlContent: item.type === 'assistant' ? content : undefined,
          index: messages.length,
        });
      }
    });

    return messages;
  }

  /**
   * Extract user query content with multi-line support
   * Joins all .query-text-line elements with newlines
   */
  private extractUserQueryContent(element: Element): string {
    // Get all query text lines and join them
    const lines = element.querySelectorAll('.query-text-line');

    if (lines.length > 0) {
      const textParts: string[] = [];
      lines.forEach(line => {
        const text = line.textContent?.trim();
        if (text) {
          textParts.push(text);
        }
      });
      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }

    // Fallback: try queryTextLine selector
    const textEl = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine, element);
    if (textEl?.textContent) {
      return this.sanitizeText(textEl.textContent);
    }

    // Final fallback: element's full text content
    return this.sanitizeText(element.textContent || '');
  }

  /**
   * Extract model response content (HTML for markdown conversion)
   * All HTML is sanitized via DOMPurify to prevent XSS (NEW-01)
   */
  private extractModelResponseContent(element: Element): string {
    // Primary: .markdown.markdown-main-panel
    const markdownEl = element.querySelector('.markdown.markdown-main-panel');
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }

    // Fallback: .markdown-main-panel
    const mainPanel = element.querySelector('.markdown-main-panel');
    if (mainPanel) {
      return sanitizeHtml(mainPanel.innerHTML);
    }

    // Fallback: message-content .markdown
    const messageContent = element.querySelector('message-content .markdown');
    if (messageContent) {
      return sanitizeHtml(messageContent.innerHTML);
    }

    // Fallback: .model-response-text
    const responseText = element.querySelector('.model-response-text');
    if (responseText) {
      return sanitizeHtml(responseText.innerHTML);
    }

    // Final fallback: element's HTML
    return sanitizeHtml(element.innerHTML);
  }

  /**
   * Extract Deep Research report
   */
  extractDeepResearch(): ExtractionResult {
    const title = this.getDeepResearchTitle();
    const content = this.extractDeepResearchContent();

    if (!content) {
      return {
        success: false,
        error: 'Deep Research content not found',
        warnings: ['Panel is visible but content element is empty or missing'],
      };
    }

    // Generate ID from title for consistent overwrites
    const titleHash = this.generateHashValue(title);
    const conversationId = `deep-research-${titleHash}`;

    // Extract link information
    const links = this.extractDeepResearchLinks();

    const messages = [
      {
        id: 'report-0',
        role: 'assistant' as const,
        content,
        htmlContent: content,
        index: 0,
      },
    ];

    return {
      success: true,
      data: {
        id: conversationId,
        title,
        url: window.location.href,
        source: 'gemini',
        type: 'deep-research',
        links,
        messages,
        extractedAt: new Date(),
        metadata: this.buildMetadata(messages),
      },
    };
  }

  /**
   * Find the conversation scroll container by scanning the live DOM for an
   * element that is actually scrollable at runtime.
   *
   * Hard-coded tag/class names are fragile — Gemini reshuffles them across
   * builds, and some containers live inside Shadow DOM roots where
   * document.querySelector can't reach them.  Instead we walk every
   * descendant of <main> (deepest first) and return the first one whose
   * computed overflowY is auto|scroll AND whose scrollHeight genuinely
   * exceeds its clientHeight.
   */
  private getScrollContainer(): HTMLElement | null {
    const root = document.querySelector<HTMLElement>('main') ?? document.body;

    // querySelectorAll returns elements in document order; reversing gives us
    // the deepest / most-specific candidates first.
    const candidates = Array.from(root.querySelectorAll<HTMLElement>('*')).reverse();

    for (const el of candidates) {
      const { overflowY } = window.getComputedStyle(el);
      if (
        (overflowY === 'auto' || overflowY === 'scroll') &&
        el.scrollHeight > el.clientHeight + 4   // +4 px tolerance for rounding
      ) {
        console.info(
          `[G2O] Found scroll container: <${el.tagName.toLowerCase()}> ` +
          `class="${el.className.toString().slice(0, 80)}" ` +
          `scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight}`
        );
        return el;
      }
    }

    console.warn('[G2O] No scrollable child found; falling back to <main>/body');
    return root;
  }

  /**
   * Scroll to the top of the conversation, loading all earlier messages.
   *
   * Gemini uses BACKWARDS INFINITE SCROLL: earlier messages are not just
   * virtually unmounted — they are fetched from the server as you scroll up.
   * A single scroll-to-top is not enough because Gemini loads messages in
   * batches; we must repeatedly scroll up and wait for each batch to appear
   * until the turn count stops growing (i.e. we have reached the beginning).
   */
  private async scrollToTopAndWait(): Promise<void> {
    const container = this.getScrollContainer();
    const scrollEl = container ?? document.documentElement;

    const countTurns = () =>
      document.querySelectorAll(
        SELECTORS.conversationTurn.join(', ')
      ).length;

    const BATCH_WAIT_MS = 1200;  // time for one batch of messages to render
    const MAX_ROUNDS   = 20;     // safety cap

    let previousCount = -1;
    let rounds = 0;

    while (rounds < MAX_ROUNDS) {
      // Scroll to the very top
      scrollEl.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: 'instant' });
      // Also zero any scrolled ancestors between scrollEl and <body>, in case
      // Gemini wraps the container inside a scrolled layout parent.
      let parent = scrollEl.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollTop > 0) parent.scrollTop = 0;
        parent = parent.parentElement;
      }

      // Wait for Gemini to fetch and render the next batch
      await new Promise<void>(resolve => setTimeout(resolve, BATCH_WAIT_MS));

      const currentCount = countTurns();
      console.info(`[G2O] Round ${rounds + 1}: ${currentCount} turns (was ${previousCount})`);

      if (currentCount === previousCount) {
        // No new turns appeared — we have reached the beginning
        console.info('[G2O] No new turns loaded, reached start of conversation');
        break;
      }

      previousCount = currentCount;
      rounds++;
    }

    if (rounds >= MAX_ROUNDS) {
      console.warn(`[G2O] Reached round limit (${MAX_ROUNDS}); conversation may be partially loaded`);
    }
  }

  /**
   * Main extraction method
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: 'Not on a Gemini page',
        };
      }

      // Routing: if Deep Research panel is visible, extract the report
      if (this.isDeepResearchVisible()) {
        console.info('[G2O] Deep Research panel detected, extracting report');
        return this.extractDeepResearch();
      }

      // Normal conversation extraction.
      // Scroll to top first so that Gemini re-renders any virtually-unloaded
      // early turns that would otherwise be absent from the DOM.
      console.info('[G2O] Scrolling to top to ensure all turns are rendered');
      await this.scrollToTopAndWait();

      console.info('[G2O] Extracting normal conversation');
      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `gemini-${Date.now()}`;
      const title = this.getGeminiTitle();
      console.info(`[G2O] Using title: "${title}"`);

      return this.buildConversationResult(messages, conversationId, title, 'gemini');
    } catch (error) {
      console.error('[G2O] Extraction error:', error);
      return {
        success: false,
        error: extractErrorMessage(error),
      };
    }
  }
}

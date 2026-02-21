/**
 * Gemini-specific conversation extractor
 * Based on DOM analysis from elements-sample.html
 */

import { BaseExtractor } from './base';
import { extractErrorMessage } from '../../lib/error-utils';
import { sanitizeHtml } from '../../lib/sanitize';
import {
  MAX_DEEP_RESEARCH_TITLE_LENGTH,
  MAX_CONVERSATION_TITLE_LENGTH,
  SCROLL_POLL_INTERVAL,
  SCROLL_TIMEOUT,
  SCROLL_STABILITY_THRESHOLD,
  SCROLL_REARM_DELAY,
} from '../../lib/constants';
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

  // Conversation title (top bar + sidebar)
  conversationTitle: [
    '[data-test-id="conversation-title"]',
    '.conversation-title.gds-title-m',
    '.conversation-title',
    '[class*="conversation-title"]',
  ],

  // Scroll container for lazy-load detection
  // infinite-scroller (data-test-id="chat-history-container") is the actual
  // scrollable element (overflow-y: scroll). It fires onScrolledTopPastThreshold
  // when scrollTop crosses below a threshold (edge-triggered).
  // #chat-history is a non-scrolling wrapper — excluded to avoid false matches.
  scrollContainer: ['[data-test-id="chat-history-container"]', 'infinite-scroller'],
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

/**
 * Result of the auto-scroll process
 * Internal to gemini.ts — not exported
 */
interface ScrollResult {
  /** Whether all messages loaded before timeout */
  fullyLoaded: boolean;
  /** Number of .conversation-container elements found after scrolling */
  elementCount: number;
  /** Total scroll-poll iterations performed */
  scrollIterations: number;
  /** Whether scrolling was unnecessary (already at top or no container) */
  skipped: boolean;
}

export class GeminiExtractor extends BaseExtractor {
  readonly platform = 'gemini' as const;

  /** Whether auto-scroll is enabled (set from settings before extract()) */
  enableAutoScroll = false;

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
   * Get conversation title from top bar, first user query, or sidebar
   */
  getTitle(): string {
    // Priority 1: Top bar title ([data-test-id="conversation-title"] or sidebar)
    const topBarTitle = this.queryWithFallback<HTMLElement>(SELECTORS.conversationTitle);
    if (topBarTitle?.textContent) {
      const title = this.sanitizeText(topBarTitle.textContent);
      if (title) {
        return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
      }
    }

    // Priority 2: First user query text
    const firstQueryText = this.queryWithFallback<HTMLElement>(SELECTORS.queryTextLine);
    if (firstQueryText?.textContent) {
      const title = this.sanitizeText(firstQueryText.textContent);
      return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }

    return 'Untitled Gemini Conversation';
  }

  /**
   * Count .conversation-container elements currently in the DOM
   */
  private countConversationElements(): number {
    return document.querySelectorAll(SELECTORS.conversationTurn.join(',')).length;
  }

  /**
   * Wait for a specified duration
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scroll to top of chat history to trigger lazy loading of all messages.
   *
   * Gemini's infinite-scroller fires `onScrolledTopPastThreshold` (edge-triggered)
   * when scrollTop crosses **below** a threshold. To re-trigger on subsequent
   * iterations, we must first scroll **above** the threshold (re-arm) by jumping
   * to scrollHeight, then back to 0.
   *
   * Verified via getEventListeners() on live Gemini page (2026-02-21):
   *   - scroll, onInitialScroll, onScrolledTopPastThreshold
   */
  private async ensureAllMessagesLoaded(): Promise<ScrollResult> {
    const container = this.queryWithFallback<HTMLElement>(SELECTORS.scrollContainer);

    if (!container) {
      console.info('[G2O] No scroll container found, skipping auto-scroll');
      return { fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true };
    }

    const initialCount = this.countConversationElements();

    if (container.scrollTop === 0) {
      console.info(
        `[G2O] scrollTop=0, scrollHeight=${container.scrollHeight}, ` +
          `clientHeight=${container.clientHeight}, elements=${initialCount}`
      );
      return { fullyLoaded: true, elementCount: initialCount, scrollIterations: 0, skipped: true };
    }

    console.info(
      `[G2O] Partial load detected — scrollTop=${container.scrollTop}, ` +
        `elements=${initialCount}, auto-scrolling`
    );

    let previousCount = 0;
    let stableCount = 0;
    let iterations = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < SCROLL_TIMEOUT) {
      // Re-arm: if already at top, scroll to bottom first so the next
      // scroll-to-0 crosses the onScrolledTopPastThreshold edge trigger.
      if (container.scrollTop === 0) {
        container.scrollTop = container.scrollHeight;
        await this.delay(SCROLL_REARM_DELAY);
      }

      // Scroll to top — crosses the threshold, triggering content loading
      container.scrollTop = 0;
      await this.delay(SCROLL_POLL_INTERVAL);

      const currentCount = this.countConversationElements();
      iterations++;

      console.debug(
        `[G2O] Scroll iteration ${iterations}: elements=${currentCount}, ` +
          `scrollTop=${container.scrollTop}, scrollHeight=${container.scrollHeight}`
      );

      if (currentCount === previousCount) {
        stableCount++;
        if (stableCount >= SCROLL_STABILITY_THRESHOLD) {
          console.info(
            `[G2O] DOM stabilized after ${iterations} iterations with ${currentCount} elements`
          );
          return {
            fullyLoaded: true,
            elementCount: currentCount,
            scrollIterations: iterations,
            skipped: false,
          };
        }
      } else {
        console.debug(`[G2O] Element count changed: ${previousCount} -> ${currentCount}`);
        stableCount = 0;
        previousCount = currentCount;
      }
    }

    const finalCount = this.countConversationElements();
    console.warn(
      `[G2O] Auto-scroll timed out after ${SCROLL_TIMEOUT}ms with ${finalCount} elements`
    );
    return {
      fullyLoaded: false,
      elementCount: finalCount,
      scrollIterations: iterations,
      skipped: false,
    };
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

      // Normal conversation extraction
      console.info('[G2O] Extracting normal conversation');

      const scrollResult = this.enableAutoScroll
        ? await this.ensureAllMessagesLoaded()
        : { fullyLoaded: true, elementCount: 0, scrollIterations: 0, skipped: true };

      const messages = this.extractMessages();
      const conversationId = this.getConversationId() || `gemini-${Date.now()}`;
      const title = this.getTitle();
      const result = this.buildConversationResult(messages, conversationId, title, 'gemini');

      // Append timeout warning
      if (!scrollResult.fullyLoaded && !scrollResult.skipped) {
        const warning =
          `Auto-scroll timed out after ${SCROLL_TIMEOUT / 1000}s. ` +
          `Some earlier messages may be missing (${scrollResult.elementCount} turns loaded).`;
        if (result.warnings) {
          result.warnings.push(warning);
        } else {
          result.warnings = [warning];
        }
      }

      return result;
    } catch (error) {
      console.error('[G2O] Extraction error:', error);
      return {
        success: false,
        error: extractErrorMessage(error),
      };
    }
  }
}

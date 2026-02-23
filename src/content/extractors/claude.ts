/**
 * Claude Extractor
 *
 * Extracts conversations from Claude AI (claude.ai)
 * Supports both normal chat and Deep Research (Extended Thinking) modes
 *
 * @see docs/design/DES-002-claude-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type {
  ConversationMessage,
  DeepResearchSource,
  DeepResearchLinks,
  ExtractionResult,
} from '../../lib/types';
import { MAX_CONVERSATION_TITLE_LENGTH, MAX_DEEP_RESEARCH_TITLE_LENGTH } from '../../lib/constants';

/**
 * CSS Selectors for normal chat extraction
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-002-claude-extractor.md Section 5.2.2
 */
const SELECTORS = {
  // Conversation block selectors (each message block)
  // Stability: HIGH → LOW order for fallback
  conversationBlock: [
    '.group[style*="height: auto"]', // Structure-based (HIGH)
    '[data-test-render-count]', // Test attribute (LOW)
    '.group', // Generic (MEDIUM)
  ],

  // User message content selectors
  userMessage: [
    '.whitespace-pre-wrap.break-words', // Content style (HIGH)
    '[data-testid="user-message"]', // Test attribute (LOW)
    '[class*="user-message"]', // Partial match (MEDIUM)
    '.bg-bg-300 p', // Structure-based (MEDIUM)
  ],

  // User message wrapper (for date extraction)
  userWrapper: [
    '.rounded-xl.pl-2\\.5.py-2\\.5', // Style attribute (HIGH)
    '.bg-bg-300', // Tailwind (MEDIUM)
    '[class*="bg-bg-300"]', // Partial match (MEDIUM)
  ],

  // Assistant response selectors
  assistantResponse: [
    '.font-claude-response', // Semantic (HIGH)
    '[class*="font-claude-response"]', // Partial match (HIGH)
    '[data-is-streaming]', // Functional attribute (MEDIUM)
  ],

  // Markdown content selectors
  markdownContent: [
    '.standard-markdown', // Semantic (HIGH)
    '.progressive-markdown', // Semantic (HIGH)
    '[class*="markdown"]', // Partial match (MEDIUM)
  ],

  // Date selectors
  messageDate: [
    'span[data-state="closed"]', // Functional attribute (MEDIUM)
    '.text-text-500.text-xs', // Tailwind (MEDIUM)
    '[class*="text-text-500"]', // Partial match (LOW)
  ],
};

/**
 * CSS Selectors for Deep Research extraction
 *
 * @see DES-002-claude-extractor.md Section 5.2.3
 */
const DEEP_RESEARCH_SELECTORS = {
  // Artifact container (existence check)
  artifact: [
    '#markdown-artifact', // ID (HIGH)
    '[id*="markdown-artifact"]', // Partial match (HIGH)
  ],

  // Report title
  title: [
    '#markdown-artifact h1', // Structure (HIGH)
    '.standard-markdown h1', // Structure (HIGH)
    'h1.text-text-100', // Tailwind (MEDIUM)
    'h1', // Generic (LOW)
  ],

  // Report content
  content: [
    '#markdown-artifact .standard-markdown', // Structure (HIGH)
    '.standard-markdown', // Semantic (HIGH)
  ],

  // Inline citation links
  inlineCitation: [
    'span.inline-flex a[href^="http"]', // Structure (HIGH)
    '.group\\/tag a[href]', // Class (MEDIUM)
    'a[target="_blank"][href^="http"]', // Attribute (MEDIUM)
  ],
};

/**
 * Pre-computed selector strings for querySelectorAll
 * Avoids repeated .join(', ') calls at runtime
 */
const JOINED_SELECTORS = {
  inlineCitation: DEEP_RESEARCH_SELECTORS.inlineCitation.join(', '),
};

/**
 * Claude conversation and Deep Research extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ClaudeExtractor extends BaseExtractor {
  readonly platform = 'claude' as const;

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-claude.ai.attacker.com"
   * @see NFR-001-1 in design document
   */
  canExtract(): boolean {
    return window.location.hostname === 'claude.ai';
  }

  /**
   * Check if Deep Research mode is visible
   *
   * Detects presence of #markdown-artifact element
   * @see FR-003-3 in design document
   */
  isDeepResearchVisible(): boolean {
    const artifact = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.artifact);
    return artifact !== null;
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://claude.ai/chat/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    const match = window.location.pathname.match(/\/chat\/([a-f0-9-]{36})/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. First user message content (truncated)
   * 2. Deep Research h1 title
   * 3. Default title
   */
  getTitle(): string {
    // If Deep Research, use h1 title
    if (this.isDeepResearchVisible()) {
      return this.getDeepResearchTitle();
    }

    // Try first user message
    const firstUserContent = this.queryWithFallback<HTMLElement>(SELECTORS.userMessage);
    if (firstUserContent?.textContent) {
      const title = this.sanitizeText(firstUserContent.textContent);
      return title.substring(0, MAX_CONVERSATION_TITLE_LENGTH);
    }

    return 'Untitled Claude Conversation';
  }

  /**
   * Get Deep Research report title from h1 element
   */
  getDeepResearchTitle(): string {
    const titleEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.title);
    if (titleEl?.textContent) {
      return this.sanitizeText(titleEl.textContent).substring(0, MAX_DEEP_RESEARCH_TITLE_LENGTH);
    }
    return 'Untitled Deep Research Report';
  }

  // ========== Deep Research Hook ==========

  /**
   * Intercept for Deep Research mode before normal extraction
   */
  protected tryExtractDeepResearch(): ExtractionResult | null {
    if (!this.isDeepResearchVisible()) return null;
    console.info('[G2O] Claude Deep Research panel detected, extracting report');
    return this.buildDeepResearchResult();
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    // Collect all message elements
    const allElements: Array<{ element: Element; type: 'user' | 'assistant' }> = [];

    // Find user messages (skip nested content inside assistant responses)
    const userMessages = this.queryAllWithFallback<HTMLElement>(SELECTORS.userMessage);
    userMessages.forEach(el => {
      const assistantParent = el.closest('.font-claude-response, [class*="font-claude-response"]');
      if (!assistantParent) {
        allElements.push({ element: el, type: 'user' });
      }
    });

    // Find assistant responses
    const assistantResponses = this.queryAllWithFallback<HTMLElement>(SELECTORS.assistantResponse);
    assistantResponses.forEach(el => {
      allElements.push({ element: el, type: 'assistant' });
    });

    this.sortByDomPosition(allElements);

    return this.buildMessagesFromElements(
      allElements,
      el => this.extractUserContent(el),
      el => this.extractAssistantContent(el)
    );
  }

  /**
   * Extract user message content (plain text)
   */
  private extractUserContent(element: Element): string {
    // Try to get text content from the element
    const textContent = element.textContent?.trim();
    if (textContent) {
      return this.sanitizeText(textContent);
    }
    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * All HTML is sanitized via DOMPurify to prevent XSS
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(element: Element): string {
    // Extended Thinking: scope to .row-start-2 to skip thinking in .row-start-1
    const responseSection = element.querySelector('.row-start-2');
    if (responseSection) {
      const markdownEl = this.queryWithFallback<HTMLElement>(
        SELECTORS.markdownContent,
        responseSection
      );
      if (markdownEl) {
        return sanitizeHtml(markdownEl.innerHTML);
      }
    }

    // Non-Extended-Thinking fallback: existing behavior
    const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, element);
    if (markdownEl) {
      return sanitizeHtml(markdownEl.innerHTML);
    }

    // Fallback: use the element's innerHTML
    return sanitizeHtml(element.innerHTML);
  }

  // ========== Deep Research Extraction ==========

  /**
   * Extract Deep Research report content
   */
  extractDeepResearchContent(): string {
    const contentEl = this.queryWithFallback<HTMLElement>(DEEP_RESEARCH_SELECTORS.content);
    if (contentEl) {
      return sanitizeHtml(contentEl.innerHTML);
    }
    return '';
  }

  /**
   * Extract source list from Deep Research inline citations
   *
   * Deduplicates by URL and maintains DOM order
   * @see FR-003-4 in design document
   */
  extractSourceList(): DeepResearchSource[] {
    const sources: DeepResearchSource[] = [];
    const seenUrls = new Map<string, number>(); // URL -> index mapping for deduplication

    // Find all inline citation links
    const citationLinks = document.querySelectorAll<HTMLAnchorElement>(
      JOINED_SELECTORS.inlineCitation
    );

    citationLinks.forEach(link => {
      const url = link.href;
      if (!url || !url.startsWith('http')) return;

      // Skip duplicates
      if (seenUrls.has(url)) return;

      // Extract title from link text or parent
      let title = link.textContent?.trim() || '';
      if (!title || title.includes('+')) {
        // Try to get a better title from aria-label or title attribute
        title = link.getAttribute('aria-label') || link.getAttribute('title') || '';
      }
      if (!title) {
        title = 'Unknown Title';
      }

      // Extract domain
      let domain = '';
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = 'unknown';
      }

      const index = sources.length;
      seenUrls.set(url, index);

      sources.push({
        index,
        url,
        title: this.sanitizeText(title),
        domain,
      });
    });

    return sources;
  }

  /**
   * Extract all Deep Research link information
   *
   * API compatibility with GeminiExtractor
   */
  extractDeepResearchLinks(): DeepResearchLinks {
    const sources = this.extractSourceList();
    return { sources };
  }
}

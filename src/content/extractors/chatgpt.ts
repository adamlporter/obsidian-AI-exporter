/**
 * ChatGPT Extractor
 *
 * Extracts conversations from ChatGPT (chatgpt.com)
 * Supports normal chat mode (Deep Research treated as normal conversation)
 *
 * @see docs/design/DES-003-chatgpt-extractor.md
 */

import { BaseExtractor } from './base';
import { sanitizeHtml } from '../../lib/sanitize';
import type { ConversationMessage, ExtractionResult } from '../../lib/types';

/** Maximum title length for truncation */
const MAX_TITLE_LENGTH = 100;

/**
 * CSS Selectors for ChatGPT chat extraction
 *
 * Selectors are ordered by stability (HIGH → LOW)
 * @see DES-003-chatgpt-extractor.md Section 5.3.2
 */
const SELECTORS = {
  // Conversation turn (each Q&A pair)
  conversationTurn: [
    'article[data-turn-id]', // data attribute (HIGH)
    'article[data-testid^="conversation-turn"]', // test attribute (LOW)
  ],

  // User message
  userMessage: [
    '[data-message-author-role="user"] .whitespace-pre-wrap', // Structure (HIGH)
    'article[data-turn="user"] .whitespace-pre-wrap', // Structure (HIGH)
    '.user-message-bubble-color .whitespace-pre-wrap', // Style (MEDIUM)
  ],

  // Assistant message
  assistantResponse: [
    '[data-message-author-role="assistant"] .markdown.prose', // Structure (HIGH)
    'article[data-turn="assistant"] .markdown.prose', // Structure (HIGH)
    '.markdown.prose.dark\\:prose-invert', // Style (MEDIUM)
  ],

  // Markdown content
  markdownContent: [
    '.markdown.prose', // Semantic (HIGH)
    '.markdown-new-styling', // Style (MEDIUM)
  ],

  // Message ID attribute
  messageId: [
    '[data-message-id]', // data attribute (HIGH)
    '[data-turn-id]', // data attribute (HIGH)
  ],
};

/**
 * ChatGPT conversation extractor
 *
 * Implements IConversationExtractor interface
 * @see src/lib/types.ts
 */
export class ChatGPTExtractor extends BaseExtractor {
  readonly platform = 'chatgpt' as const;

  // ========== Platform Detection ==========

  /**
   * Check if this extractor can handle the current page
   *
   * IMPORTANT: Uses strict comparison (===) to prevent
   * subdomain attacks like "evil-chatgpt.com.attacker.com"
   * @see NFR-001-1 in design document
   */
  canExtract(): boolean {
    return window.location.hostname === 'chatgpt.com';
  }

  // ========== ID & Title Extraction ==========

  /**
   * Extract conversation ID from URL
   *
   * URL format: https://chatgpt.com/c/{uuid} or https://chatgpt.com/g/{uuid}
   * @returns UUID string or null if not found
   */
  getConversationId(): string | null {
    // Match /c/{uuid} or /g/{uuid} pattern
    const match = window.location.pathname.match(/\/[cg]\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  /**
   * Get conversation title
   *
   * Priority:
   * 1. First user message content (truncated to MAX_TITLE_LENGTH)
   * 2. Default title
   */
  getTitle(): string {
    // Try first user message
    const firstUserContent = this.queryWithFallback<HTMLElement>(SELECTORS.userMessage);
    if (firstUserContent?.textContent) {
      const title = this.sanitizeText(firstUserContent.textContent);
      return title.substring(0, MAX_TITLE_LENGTH);
    }

    return 'Untitled ChatGPT Conversation';
  }

  // ========== Message Extraction ==========

  /**
   * Extract all messages from conversation
   *
   * Uses article[data-turn-id] to find conversation turns,
   * then extracts User/Assistant messages in DOM order
   * @see FR-002 in design document
   */
  extractMessages(): ConversationMessage[] {
    const messages: ConversationMessage[] = [];

    // Find all conversation turns
    const turns = this.queryAllWithFallback<HTMLElement>(SELECTORS.conversationTurn);

    if (turns.length === 0) {
      console.warn('[G2O] No conversation turns found with primary selectors');
      return messages;
    }

    // Process each turn
    turns.forEach((turn, index) => {
      // Determine role from data-turn attribute or data-message-author-role
      const turnRole = turn.getAttribute('data-turn');
      const messageEl = turn.querySelector('[data-message-author-role]');
      const authorRole = messageEl?.getAttribute('data-message-author-role');

      const role = turnRole || authorRole;

      if (role === 'user') {
        const content = this.extractUserContent(turn);
        if (content) {
          messages.push({
            id: `user-${index}`,
            role: 'user',
            content,
            index: messages.length,
          });
        }
      } else if (role === 'assistant') {
        const content = this.extractAssistantContent(turn);
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
   * Extract user message content (plain text)
   */
  private extractUserContent(turnElement: Element): string {
    // Find user message content within the turn
    const contentEl = this.queryWithFallback<HTMLElement>(SELECTORS.userMessage, turnElement);
    if (contentEl?.textContent) {
      return this.sanitizeText(contentEl.textContent);
    }

    // Fallback: try to get any .whitespace-pre-wrap content
    const fallbackEl = turnElement.querySelector('.whitespace-pre-wrap');
    if (fallbackEl?.textContent) {
      return this.sanitizeText(fallbackEl.textContent);
    }

    return '';
  }

  /**
   * Extract assistant response content (HTML for markdown conversion)
   *
   * All HTML is sanitized via DOMPurify to prevent XSS
   * Also cleans utm_source parameters from citation URLs
   * @see NFR-001-2 in design document
   */
  private extractAssistantContent(turnElement: Element): string {
    // Find markdown content within the turn
    const markdownEl = this.queryWithFallback<HTMLElement>(SELECTORS.markdownContent, turnElement);
    if (markdownEl) {
      // Clean citation URLs before returning
      const cleanedHtml = this.cleanCitationUrls(markdownEl.innerHTML);
      return sanitizeHtml(cleanedHtml);
    }

    // Fallback: try assistantResponse selectors
    const assistantEl = this.queryWithFallback<HTMLElement>(
      SELECTORS.assistantResponse,
      turnElement
    );
    if (assistantEl) {
      const cleanedHtml = this.cleanCitationUrls(assistantEl.innerHTML);
      return sanitizeHtml(cleanedHtml);
    }

    return '';
  }

  /**
   * Clean utm_source parameter from citation URLs
   *
   * ChatGPT adds ?utm_source=chatgpt.com to citation URLs
   * @see DES-003-chatgpt-extractor.md Section 8.2
   */
  private cleanCitationUrls(html: string): string {
    // Replace utm_source parameter in href attributes
    return html
      .replace(/href="([^"]+)\?utm_source=chatgpt\.com"/g, (_, url) => `href="${url}"`)
      .replace(/href="([^"]+)&utm_source=chatgpt\.com"/g, (_, url) => `href="${url}"`);
  }

  // ========== Main Entry Point ==========

  /**
   * Main extraction method
   *
   * Extracts normal conversation
   * (Deep Research is treated as normal conversation)
   */
  async extract(): Promise<ExtractionResult> {
    try {
      if (!this.canExtract()) {
        return {
          success: false,
          error: 'Not on a ChatGPT page',
        };
      }

      console.info('[G2O] Extracting ChatGPT conversation');
      const messages = this.extractMessages();
      const warnings: string[] = [];

      if (messages.length === 0) {
        return {
          success: false,
          error: 'No messages found in conversation',
          warnings: ['Primary selectors may have changed. Check ChatGPT UI for updates.'],
        };
      }

      // Check for potential issues
      const userCount = messages.filter(m => m.role === 'user').length;
      const assistantCount = messages.filter(m => m.role === 'assistant').length;

      if (userCount === 0) {
        warnings.push('No user messages found');
      }
      if (assistantCount === 0) {
        warnings.push('No assistant messages found');
      }

      const conversationId = this.getConversationId() || `chatgpt-${Date.now()}`;
      const title = this.getTitle();

      return {
        success: true,
        data: {
          id: conversationId,
          title,
          url: window.location.href,
          source: 'chatgpt',
          messages,
          extractedAt: new Date(),
          metadata: {
            messageCount: messages.length,
            userMessageCount: userCount,
            assistantMessageCount: assistantCount,
            hasCodeBlocks: messages.some(
              m => m.content.includes('<code') || m.content.includes('```')
            ),
          },
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error('[G2O] ChatGPT extraction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
      };
    }
  }
}

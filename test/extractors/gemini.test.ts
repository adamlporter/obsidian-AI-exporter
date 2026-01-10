import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GeminiExtractor } from '../../src/content/extractors/gemini';
import {
  loadFixture,
  clearFixture,
  setGeminiLocation,
  setNonGeminiLocation,
  createGeminiConversationDOM,
  setGeminiTitle,
  resetLocation,
} from '../fixtures/dom-helpers';

describe('GeminiExtractor', () => {
  let extractor: GeminiExtractor;

  beforeEach(() => {
    extractor = new GeminiExtractor();
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('platform', () => {
    it('identifies as gemini platform', () => {
      expect(extractor.platform).toBe('gemini');
    });
  });

  describe('canExtract', () => {
    it('returns true for gemini.google.com', () => {
      setGeminiLocation('abc123');
      expect(extractor.canExtract()).toBe(true);
    });

    it('returns false for other hosts', () => {
      setNonGeminiLocation('chat.openai.com');
      expect(extractor.canExtract()).toBe(false);
    });

    it('returns false for localhost', () => {
      resetLocation();
      expect(extractor.canExtract()).toBe(false);
    });
  });

  describe('getConversationId', () => {
    it('extracts ID from /app/[id] URL', () => {
      setGeminiLocation('abc123def456');
      expect(extractor.getConversationId()).toBe('abc123def456');
    });

    it('returns null for invalid URL', () => {
      setNonGeminiLocation('gemini.google.com', '/');
      expect(extractor.getConversationId()).toBeNull();
    });

    it('returns null when no ID in path', () => {
      setNonGeminiLocation('gemini.google.com', '/settings');
      expect(extractor.getConversationId()).toBeNull();
    });
  });

  describe('getTitle', () => {
    it('extracts title from first query text line', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <p class="query-text-line">What is TypeScript?</p>
      `);
      expect(extractor.getTitle()).toBe('What is TypeScript?');
    });

    it('truncates long titles to 100 characters', () => {
      setGeminiLocation('test123');
      const longTitle = 'a'.repeat(150);
      loadFixture(`
        <p class="query-text-line">${longTitle}</p>
      `);
      expect(extractor.getTitle().length).toBe(100);
    });

    it('falls back to sidebar title', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <div class="conversation-title">Sidebar Title</div>
      `);
      expect(extractor.getTitle()).toBe('Sidebar Title');
    });

    it('returns default title when nothing found', () => {
      setGeminiLocation('test123');
      loadFixture('<div>Empty page</div>');
      expect(extractor.getTitle()).toBe('Untitled Gemini Conversation');
    });

    it('sanitizes whitespace in title', () => {
      setGeminiLocation('test123');
      loadFixture(`
        <p class="query-text-line">  Multiple   spaces   </p>
      `);
      expect(extractor.getTitle()).toBe('Multiple spaces');
    });
  });

  describe('extractMessages', () => {
    it('extracts user and assistant messages from conversation turns', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toContain('Hello');
      expect(messages[1].role).toBe('assistant');
    });

    it('handles multiple conversation turns', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second answer' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages.length).toBe(4);
    });

    it('assigns sequential indices to messages', () => {
      setGeminiLocation('test123');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Question 1' },
        { role: 'assistant', content: 'Answer 1' },
        { role: 'user', content: 'Question 2' },
        { role: 'assistant', content: 'Answer 2' },
      ]);
      loadFixture(html);

      const messages = extractor.extractMessages();
      expect(messages[0].index).toBe(0);
      expect(messages[1].index).toBe(1);
      expect(messages[2].index).toBe(2);
      expect(messages[3].index).toBe(3);
    });

    it('returns empty array when no conversation found', () => {
      setGeminiLocation('test123');
      loadFixture('<div>No conversation</div>');

      const messages = extractor.extractMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('extract', () => {
    it('returns successful result with full conversation data', async () => {
      setGeminiLocation('abc123def456');
      setGeminiTitle('Test Conversation');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: '<p>Hi there!</p>' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('abc123def456');
      expect(result.data?.source).toBe('gemini');
      expect(result.data?.messages.length).toBe(2);
    });

    it('generates fallback ID when no conversation ID in URL', async () => {
      setNonGeminiLocation('gemini.google.com', '/');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(html);

      const result = await extractor.extract();

      // Extractor generates fallback ID: gemini-{timestamp}
      expect(result.success).toBe(true);
      expect(result.data?.id).toMatch(/^gemini-\d+$/);
    });

    it('returns error when no messages found', async () => {
      setGeminiLocation('abc123def456');
      loadFixture('<div>No messages</div>');

      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No messages found');
    });

    it('includes metadata in result', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer with `code`' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.data?.metadata).toBeDefined();
      expect(result.data?.metadata.messageCount).toBe(2);
      expect(result.data?.metadata.userMessageCount).toBe(1);
      expect(result.data?.metadata.assistantMessageCount).toBe(1);
    });

    it('includes URL in result', async () => {
      setGeminiLocation('abc123def456');
      const html = createGeminiConversationDOM([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      loadFixture(`<div class="app-container">${html}</div>`);

      const result = await extractor.extract();

      expect(result.data?.url).toContain('gemini.google.com');
      expect(result.data?.url).toContain('abc123def456');
    });
  });
});

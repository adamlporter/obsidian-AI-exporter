import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runE2EPipeline,
  assertExtractionSuccess,
  assertSourcePlatform,
  assertMessageStructure,
  assertFrontmatterFields,
  assertCalloutFormat,
} from './helpers';
import { clearFixture, resetLocation } from '../../fixtures/dom-helpers';

describe('ChatGPT E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-chatgpt-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'chatgpt');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'chatgpt');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });

  describe('Chat with Code Blocks', () => {
    const FIXTURE = 'chat-code';
    const CONVERSATION_ID = 'e2e-chatgpt-code-001';

    it('should preserve code block formatting', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      // Code blocks in callouts are prefixed with '> '
      expect(result.finalMarkdown).toMatch(/```typescript/);
      expect(result.finalMarkdown).toMatch(/function isPrime/);
    });

    it('should generate markdown with code blocks', async () => {
      const result = await runE2EPipeline('chatgpt', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });
});

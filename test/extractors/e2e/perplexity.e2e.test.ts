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

describe('Perplexity E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-perplexity-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('perplexity', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'perplexity');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'perplexity');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('perplexity', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });

  describe('Deep Research', () => {
    const FIXTURE = 'deep-research';
    const CONVERSATION_ID = 'e2e-perplexity-dr-001';

    it('should extract deep research as normal conversation', async () => {
      const result = await runE2EPipeline('perplexity', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'perplexity');
      expect(result.conversationData.type).not.toBe('deep-research');
      assertMessageStructure(result.conversationData, { minCount: 1 });
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('perplexity', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runE2EPipeline,
  assertExtractionSuccess,
  assertSourcePlatform,
  assertMessageStructure,
  assertFrontmatterFields,
  assertCalloutFormat,
  assertDeepResearchFormat,
} from './helpers';
import { clearFixture, resetLocation } from '../../fixtures/dom-helpers';

describe('Claude E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-claude-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'claude');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'claude');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });

  describe('Artifacts / Deep Research', () => {
    const FIXTURE = 'artifacts';
    const CONVERSATION_ID = 'e2e-claude-artifacts-001';

    it('should extract Artifacts with valid structure', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertFrontmatterFields(result.obsidianNote, { isDeepResearch: true });
      assertDeepResearchFormat(result.conversationData, result.finalMarkdown);
    });

    it('should generate Artifacts markdown with citations', async () => {
      const result = await runE2EPipeline('claude', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });
  });
});

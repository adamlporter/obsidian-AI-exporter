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

describe('Gemini E2E Extraction', () => {
  beforeEach(() => {
    clearFixture();
  });

  afterEach(() => {
    clearFixture();
    resetLocation();
  });

  describe('Chat - Simple Conversation', () => {
    const FIXTURE = 'chat-simple';
    const CONVERSATION_ID = 'e2e-gemini-chat-001';

    it('should extract conversation with valid structure', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);

      // Type Guard: result narrows to E2EPipelineSuccessResult
      assertExtractionSuccess(result);

      // Can use without non-null assertion
      assertSourcePlatform(result.conversationData, 'gemini');
      assertMessageStructure(result.conversationData, { minCount: 2 });
      assertFrontmatterFields(result.obsidianNote);
      assertCalloutFormat(result.finalMarkdown, 'gemini');
    });

    it('should generate correct markdown output', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });

    it('should have correct message count in metadata', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.obsidianNote.frontmatter.message_count).toBe(
        result.conversationData.messages.length
      );
    });
  });

  describe('Deep Research Report', () => {
    const FIXTURE = 'deep-research';
    const CONVERSATION_ID = 'e2e-gemini-dr-001';

    it('should extract Deep Research with valid structure', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      assertSourcePlatform(result.conversationData, 'gemini');
      assertFrontmatterFields(result.obsidianNote, { isDeepResearch: true });
      assertDeepResearchFormat(result.conversationData, result.finalMarkdown);
    });

    it('should generate Deep Research markdown with footnotes', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toMatchSnapshot();
    });

    it('should include all sources in References section', async () => {
      const result = await runE2EPipeline('gemini', FIXTURE, CONVERSATION_ID);
      assertExtractionSuccess(result);

      expect(result.finalMarkdown).toContain('# References');

      const sourceCount = result.conversationData.links?.sources.length ?? 0;
      if (sourceCount > 0) {
        const footnoteMatches = result.finalMarkdown.match(/\[\^\d+\]:/g);
        expect(footnoteMatches?.length).toBe(sourceCount);
      }
    });
  });
});

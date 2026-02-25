import { describe, it, expect } from 'vitest';
import { countExistingMessages, extractTailMessages } from '../../src/lib/message-counter';

describe('message-counter', () => {
  // ========== countExistingMessages ==========

  describe('countExistingMessages', () => {
    it('counts callout format messages', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi there!',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts blockquote format messages', () => {
      const body = [
        '**User:**',
        '> Hello',
        '',
        '**Claude:**',
        '> Hi there!',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts plain format messages', () => {
      const body = [
        '**User:**',
        '',
        'Hello',
        '',
        '**Gemini:**',
        '',
        'Hi there!',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts all platform labels', () => {
      const body = [
        '> [!QUESTION] User',
        '> Q1',
        '',
        '> [!NOTE] Gemini',
        '> A1',
        '',
        '> [!QUESTION] User',
        '> Q2',
        '',
        '> [!NOTE] Gemini',
        '> A2',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('returns 0 for empty body', () => {
      expect(countExistingMessages('')).toBe(0);
    });

    it('returns 0 for body with no messages', () => {
      expect(countExistingMessages('Just some text\nwithout messages')).toBe(0);
    });

    it('excludes patterns inside code blocks', () => {
      const body = [
        '> [!QUESTION] User',
        '> How do I format messages?',
        '',
        '> [!NOTE] Claude',
        '> Here is an example:',
        '> ```markdown',
        '> > [!QUESTION] User',
        '> > This is inside code block',
        '> ```',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('handles ChatGPT and Perplexity labels', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] ChatGPT',
        '> Hi',
        '',
        '> [!QUESTION] User',
        '> Bye',
        '',
        '> [!NOTE] Perplexity',
        '> See ya',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(4);
    });

    it('handles Assistant label', () => {
      const body = [
        '**User:**',
        '> Hello',
        '',
        '**Assistant:**',
        '> Hi there!',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });

    it('counts messages with multi-line content', () => {
      const body = [
        '> [!QUESTION] User',
        '> Line 1',
        '> Line 2',
        '> Line 3',
        '',
        '> [!NOTE] Claude',
        '> Response line 1',
        '> Response line 2',
      ].join('\n');

      expect(countExistingMessages(body)).toBe(2);
    });
  });

  // ========== extractTailMessages ==========

  describe('extractTailMessages', () => {
    it('extracts tail messages after skip count', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi there!',
        '',
        '> [!QUESTION] User',
        '> How are you?',
        '',
        '> [!NOTE] Claude',
        '> I am good!',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('> [!QUESTION] User');
      expect(tail).toContain('How are you?');
      expect(tail).toContain('I am good!');
      expect(tail).not.toContain('Hello');
      expect(tail).not.toContain('Hi there!');
    });

    it('returns full body when skipCount is 0', () => {
      const body = '> [!QUESTION] User\n> Hello';
      expect(extractTailMessages(body, 0)).toBe(body);
    });

    it('returns empty string when skipCount exceeds message count', () => {
      const body = [
        '> [!QUESTION] User',
        '> Hello',
        '',
        '> [!NOTE] Claude',
        '> Hi',
      ].join('\n');

      expect(extractTailMessages(body, 5)).toBe('');
    });

    it('handles blockquote format', () => {
      const body = [
        '**User:**',
        '> Hello',
        '',
        '**Claude:**',
        '> Hi',
        '',
        '**User:**',
        '> New message',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('**User:**');
      expect(tail).toContain('New message');
      expect(tail).not.toContain('Hello');
    });

    it('handles plain format', () => {
      const body = [
        '**User:**',
        '',
        'Hello',
        '',
        '**Gemini:**',
        '',
        'Hi',
        '',
        '**User:**',
        '',
        'New question',
      ].join('\n');

      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('**User:**');
      expect(tail).toContain('New question');
      expect(tail).not.toContain('Hello');
    });

    it('skips message patterns inside code blocks', () => {
      const body = [
        '> [!QUESTION] User',
        '> How to format?',
        '',
        '> [!NOTE] Claude',
        '> Example:',
        '> ```',
        '> > [!QUESTION] User',
        '> > Fake message',
        '> ```',
        '',
        '> [!QUESTION] User',
        '> Real new message',
      ].join('\n');

      // Skip 2 real messages, get the 3rd
      const tail = extractTailMessages(body, 2);
      expect(tail).toContain('Real new message');
      expect(tail).not.toContain('How to format?');
    });
  });
});

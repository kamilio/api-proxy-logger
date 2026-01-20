import { describe, it } from 'node:test';
import assert from 'node:assert';
import { detectApiShape, extractMessage, API_SHAPES } from '../src/mock-utils.js';

describe('API_SHAPES', () => {
  it('should export all supported API shapes', () => {
    assert.ok(API_SHAPES.includes('openai_completions'));
    assert.ok(API_SHAPES.includes('anthropic_messages'));
    assert.ok(API_SHAPES.includes('gemini_generate_content'));
    assert.strictEqual(API_SHAPES.length, 3);
  });
});

describe('detectApiShape', () => {
  it('should detect OpenAI completions endpoint', () => {
    const result = detectApiShape('/api/openai/v1/chat/completions');
    assert.deepStrictEqual(result, { key: 'openai_completions' });
  });

  it('should detect Anthropic messages endpoint', () => {
    const result = detectApiShape('/api/anthropic/v1/messages');
    assert.deepStrictEqual(result, { key: 'anthropic_messages' });
  });

  it('should detect Gemini generateContent endpoint', () => {
    const result = detectApiShape('/api/gemini/v1beta/models/gemini-pro/generateContent');
    assert.deepStrictEqual(result, { key: 'gemini_generate_content' });
  });

  it('should detect Gemini streamGenerateContent endpoint', () => {
    const result = detectApiShape('/api/gemini/v1beta/models/gemini-1.5-pro/streamGenerateContent');
    assert.deepStrictEqual(result, { key: 'gemini_generate_content' });
  });

  it('should return null for unknown endpoints', () => {
    assert.strictEqual(detectApiShape('/api/unknown/endpoint'), null);
    assert.strictEqual(detectApiShape('/v1/chat/completions'), null);
    assert.strictEqual(detectApiShape('/random/path'), null);
  });
});

describe('extractMessage', () => {
  describe('OpenAI format', () => {
    it('should extract user message from messages array', () => {
      const body = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello world' },
        ],
      };
      const result = extractMessage(body, 'openai_completions');
      assert.strictEqual(result, 'Hello world');
    });

    it('should extract last user message when multiple exist', () => {
      const body = {
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second message' },
        ],
      };
      const result = extractMessage(body, 'openai_completions');
      assert.strictEqual(result, 'Second message');
    });

    it('should handle array content format', () => {
      const body = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
      };
      const result = extractMessage(body, 'openai_completions');
      assert.strictEqual(result, 'Hello world');
    });

    it('should fallback to prompt field', () => {
      const body = {
        prompt: 'Complete this sentence',
      };
      const result = extractMessage(body, 'openai_completions');
      assert.strictEqual(result, 'Complete this sentence');
    });

    it('should return empty string when no user message', () => {
      const body = {
        messages: [{ role: 'system', content: 'System only' }],
      };
      const result = extractMessage(body, 'openai_completions');
      assert.strictEqual(result, '');
    });
  });

  describe('Anthropic format', () => {
    it('should extract user message from messages array', () => {
      const body = {
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello Claude' }],
      };
      const result = extractMessage(body, 'anthropic_messages');
      assert.strictEqual(result, 'Hello Claude');
    });

    it('should handle array content with text blocks', () => {
      const body = {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Part 1 ' },
              { type: 'text', text: 'Part 2' },
            ],
          },
        ],
      };
      const result = extractMessage(body, 'anthropic_messages');
      assert.strictEqual(result, 'Part 1 Part 2');
    });
  });

  describe('Gemini format', () => {
    it('should extract user message from contents array', () => {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello Gemini' }],
          },
        ],
      };
      const result = extractMessage(body, 'gemini_generate_content');
      assert.strictEqual(result, 'Hello Gemini');
    });

    it('should handle multiple parts', () => {
      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'First ' }, { text: 'Second' }],
          },
        ],
      };
      const result = extractMessage(body, 'gemini_generate_content');
      assert.strictEqual(result, 'First Second');
    });

    it('should get last user message', () => {
      const body = {
        contents: [
          { role: 'user', parts: [{ text: 'First question' }] },
          { role: 'model', parts: [{ text: 'Answer' }] },
          { role: 'user', parts: [{ text: 'Follow up' }] },
        ],
      };
      const result = extractMessage(body, 'gemini_generate_content');
      assert.strictEqual(result, 'Follow up');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for null body', () => {
      assert.strictEqual(extractMessage(null, 'openai_completions'), '');
    });

    it('should return empty string for non-object body', () => {
      assert.strictEqual(extractMessage('string', 'openai_completions'), '');
      assert.strictEqual(extractMessage(123, 'openai_completions'), '');
    });

    it('should return empty string for unknown API shape', () => {
      const body = { messages: [{ role: 'user', content: 'test' }] };
      assert.strictEqual(extractMessage(body, 'unknown_shape'), '');
    });
  });
});

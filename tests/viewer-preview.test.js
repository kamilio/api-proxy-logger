import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildPreviewModel } from '../src/services/viewer-preview.js';

describe('viewer preview', () => {
  it('detects completions shape by URL', () => {
    const log = {
      request: {
        url: 'https://api.openai.com/v1/chat/completions',
        body: {
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      },
      response: {
        body: {
          choices: [{ message: { role: 'assistant', content: 'Hi there' } }],
        },
      },
    };

    const preview = buildPreviewModel(log);
    assert.strictEqual(preview.shapeId, 'completions');
    assert.strictEqual(preview.request.messages[0].parts[0].text, 'Hello');
    assert.strictEqual(preview.response.messages[0].parts[0].text, 'Hi there');
  });

  it('detects responses shape by URL', () => {
    const log = {
      request: {
        url: 'https://api.openai.com/v1/responses',
        body: {
          model: 'gpt-4.1-mini',
          input: 'Summarize this.',
        },
      },
      response: {
        body: {
          id: 'resp_123',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Summary here.' }],
            },
          ],
        },
      },
    };

    const preview = buildPreviewModel(log);
    assert.strictEqual(preview.shapeId, 'responses');
    assert.strictEqual(preview.request.messages[0].parts[0].text, 'Summarize this.');
    assert.strictEqual(preview.response.messages[0].parts[0].text, 'Summary here.');
  });

  it('detects anthropic shape by URL', () => {
    const log = {
      request: {
        url: 'https://api.anthropic.com/v1/messages',
        body: {
          model: 'claude-3-opus',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hey Claude' }] },
          ],
        },
      },
      response: {
        body: {
          content: [{ type: 'text', text: 'Hello human.' }],
        },
      },
    };

    const preview = buildPreviewModel(log);
    assert.strictEqual(preview.shapeId, 'anthropic');
    assert.strictEqual(preview.request.messages[0].parts[0].text, 'Hey Claude');
    assert.strictEqual(preview.response.messages[0].parts[0].text, 'Hello human.');
  });

  it('detects gemini shape by URL', () => {
    const log = {
      request: {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        body: {
          contents: [
            { role: 'user', parts: [{ text: 'Hi Gemini' }] },
          ],
        },
      },
      response: {
        body: {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Hello!' }] } },
          ],
        },
      },
    };

    const preview = buildPreviewModel(log);
    assert.strictEqual(preview.shapeId, 'gemini');
    assert.strictEqual(preview.request.messages[0].parts[0].text, 'Hi Gemini');
    assert.strictEqual(preview.response.messages[0].parts[0].text, 'Hello!');
  });

  it('falls back safely on invalid data', () => {
    const log = {
      request: { url: 'not a url', body: 'wat' },
      response: { body: 42 },
    };

    const preview = buildPreviewModel(log);
    assert.strictEqual(preview.shapeId, 'other');
    assert.deepStrictEqual(preview.request.messages, []);
    assert.deepStrictEqual(preview.response.messages, []);
  });
});

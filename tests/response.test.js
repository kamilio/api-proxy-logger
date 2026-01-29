import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sendJsonError } from '../src/response.js';

function createResponse({ headersSent = false, writableEnded = false } = {}) {
  return {
    headersSent,
    writableEnded,
    statusCode: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
  };
}

describe('sendJsonError', () => {
  it('sends json when response is writable', () => {
    const res = createResponse();
    const payload = { error: 'Proxy error', message: 'Boom' };

    const result = sendJsonError(res, 502, payload);

    assert.strictEqual(result, true);
    assert.strictEqual(res.statusCode, 502);
    assert.deepStrictEqual(res.jsonBody, payload);
  });

  it('no-ops when headers are already sent', () => {
    const res = createResponse({ headersSent: true });

    const result = sendJsonError(res, 502, { error: 'Proxy error', message: 'Boom' });

    assert.strictEqual(result, false);
    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(res.jsonBody, null);
  });

  it('no-ops when response has ended', () => {
    const res = createResponse({ writableEnded: true });

    const result = sendJsonError(res, 502, { error: 'Proxy error', message: 'Boom' });

    assert.strictEqual(result, false);
    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(res.jsonBody, null);
  });
});

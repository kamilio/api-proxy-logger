import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logToHar, logsToHar } from '../src/services/har-service.js';

describe('logToHar', () => {
  it('should convert a basic log to HAR format', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      provider: 'test',
      duration_ms: 123,
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: { 'content-type': 'application/json' },
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
      },
      response: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: { id: 'resp-123', choices: [] },
      },
    };

    const har = logToHar(log);

    assert.strictEqual(har.log.version, '1.2');
    assert.strictEqual(har.log.creator.name, 'llm-debugger');
    assert.strictEqual(har.log.entries.length, 1);

    const entry = har.log.entries[0];
    assert.strictEqual(entry.startedDateTime, '2026-01-24T19:35:45.748Z');
    assert.strictEqual(entry.time, 123);
    assert.strictEqual(entry.request.method, 'POST');
    assert.strictEqual(entry.request.url, 'https://api.example.com/v1/chat');
    assert.strictEqual(entry.response.status, 200);
    assert.strictEqual(entry.response.statusText, 'OK');
  });

  it('should obfuscate API keys in headers', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {
          'authorization': 'Bearer sk-secret-key-12345',
          'x-api-key': 'another-secret',
          'content-type': 'application/json',
        },
        body: {},
      },
      response: { status: 200, headers: {}, body: {} },
    };

    const har = logToHar(log);
    const requestHeaders = har.log.entries[0].request.headers;

    const authHeader = requestHeaders.find((h) => h.name === 'authorization');
    const apiKeyHeader = requestHeaders.find((h) => h.name === 'x-api-key');
    const contentTypeHeader = requestHeaders.find((h) => h.name === 'content-type');

    assert.strictEqual(authHeader.value, 'api_key_provided');
    assert.strictEqual(apiKeyHeader.value, 'api_key_provided');
    assert.strictEqual(contentTypeHeader.value, 'application/json');
  });

  it('should obfuscate API keys in request body', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {},
        body: {
          api_key: 'secret-key-in-body',
          model: 'gpt-4',
        },
      },
      response: { status: 200, headers: {}, body: {} },
    };

    const har = logToHar(log);
    const postData = JSON.parse(har.log.entries[0].request.postData.text);

    assert.strictEqual(postData.api_key, 'api_key_provided');
    assert.strictEqual(postData.model, 'gpt-4');
  });

  it('should obfuscate API keys in URL query params', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      request: {
        method: 'GET',
        url: 'https://api.example.com/v1/models?api_key=secret-in-url&other=safe',
        headers: {},
      },
      response: { status: 200, headers: {}, body: {} },
    };

    const har = logToHar(log);
    const entry = har.log.entries[0];

    assert.ok(entry.request.url.includes('api_key=api_key_provided'));
    assert.ok(entry.request.url.includes('other=safe'));

    const apiKeyParam = entry.request.queryString.find((q) => q.name === 'api_key');
    assert.strictEqual(apiKeyParam.value, 'api_key_provided');
  });

  it('should handle missing request/response', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
    };

    const har = logToHar(log);
    const entry = har.log.entries[0];

    assert.strictEqual(entry.request.method, 'GET');
    assert.strictEqual(entry.request.url, '');
    assert.strictEqual(entry.response.status, 0);
  });

  it('should include proper HAR timings', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      duration_ms: 500,
      request: { method: 'POST', url: 'https://api.example.com/v1/chat', headers: {} },
      response: { status: 200, headers: {} },
    };

    const har = logToHar(log);
    const entry = har.log.entries[0];

    assert.strictEqual(entry.time, 500);
    assert.strictEqual(entry.timings.wait, 500);
    assert.strictEqual(entry.timings.send, -1);
    assert.strictEqual(entry.timings.receive, -1);
  });

  it('should extract content type for postData', () => {
    const log = {
      timestamp: '2026-01-24T19:35:45.748Z',
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: { test: true },
      },
      response: { status: 200, headers: {}, body: {} },
    };

    const har = logToHar(log);
    const postData = har.log.entries[0].request.postData;

    assert.strictEqual(postData.mimeType, 'application/json');
  });
});

describe('logsToHar', () => {
  it('should convert multiple logs to a single HAR file', () => {
    const logs = [
      {
        timestamp: '2026-01-24T19:35:45.748Z',
        request: { method: 'GET', url: 'https://api.example.com/v1/models', headers: {} },
        response: { status: 200, headers: {}, body: {} },
      },
      {
        timestamp: '2026-01-24T19:36:00.000Z',
        request: { method: 'POST', url: 'https://api.example.com/v1/chat', headers: {} },
        response: { status: 201, headers: {}, body: {} },
      },
    ];

    const har = logsToHar(logs);

    assert.strictEqual(har.log.version, '1.2');
    assert.strictEqual(har.log.entries.length, 2);
    assert.strictEqual(har.log.entries[0].request.method, 'GET');
    assert.strictEqual(har.log.entries[1].request.method, 'POST');
    assert.strictEqual(har.log.entries[1].response.status, 201);
    assert.strictEqual(har.log.entries[1].response.statusText, 'Created');
  });

  it('should obfuscate API keys across all entries', () => {
    const logs = [
      {
        timestamp: '2026-01-24T19:35:45.748Z',
        request: {
          method: 'GET',
          url: 'https://api.example.com/v1/models',
          headers: { authorization: 'Bearer secret1' },
        },
        response: { status: 200, headers: {}, body: {} },
      },
      {
        timestamp: '2026-01-24T19:36:00.000Z',
        request: {
          method: 'POST',
          url: 'https://api.example.com/v1/chat',
          headers: { 'x-api-key': 'secret2' },
        },
        response: { status: 200, headers: {}, body: {} },
      },
    ];

    const har = logsToHar(logs);

    const auth1 = har.log.entries[0].request.headers.find((h) => h.name === 'authorization');
    const auth2 = har.log.entries[1].request.headers.find((h) => h.name === 'x-api-key');

    assert.strictEqual(auth1.value, 'api_key_provided');
    assert.strictEqual(auth2.value, 'api_key_provided');
  });
});

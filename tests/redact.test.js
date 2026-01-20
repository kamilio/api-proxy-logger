import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeHeaders, sanitizeBody, sanitizeUrl } from '../src/redact.js';

describe('sanitizeHeaders', () => {
  it('should redact authorization header', () => {
    const headers = {
      'Authorization': 'Bearer sk-secret-key',
      'Content-Type': 'application/json',
    };
    const result = sanitizeHeaders(headers);
    assert.strictEqual(result['Authorization'], 'api_key_provided');
    assert.strictEqual(result['Content-Type'], 'application/json');
  });

  it('should redact x-api-key header (case-insensitive)', () => {
    const headers = {
      'X-API-Key': 'sk-ant-secret',
      'Accept': 'application/json',
    };
    const result = sanitizeHeaders(headers);
    assert.strictEqual(result['X-API-Key'], 'api_key_provided');
    assert.strictEqual(result['Accept'], 'application/json');
  });

  it('should redact api-key header', () => {
    const headers = {
      'api-key': 'secret-key',
    };
    const result = sanitizeHeaders(headers);
    assert.strictEqual(result['api-key'], 'api_key_provided');
  });

  it('should handle empty headers', () => {
    const result = sanitizeHeaders({});
    assert.deepStrictEqual(result, {});
  });

  it('should handle null/undefined headers', () => {
    assert.deepStrictEqual(sanitizeHeaders(null), {});
    assert.deepStrictEqual(sanitizeHeaders(undefined), {});
  });
});

describe('sanitizeBody', () => {
  it('should redact api_key in body', () => {
    const body = {
      api_key: 'secret-key',
      model: 'gpt-4',
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.api_key, 'api_key_provided');
    assert.strictEqual(result.model, 'gpt-4');
  });

  it('should redact nested sensitive keys', () => {
    const body = {
      config: {
        authorization: 'Bearer token',
        setting: 'value',
      },
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.config.authorization, 'api_key_provided');
    assert.strictEqual(result.config.setting, 'value');
  });

  it('should handle arrays', () => {
    const body = {
      items: [
        { api_key: 'secret1', name: 'item1' },
        { api_key: 'secret2', name: 'item2' },
      ],
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.items[0].api_key, 'api_key_provided');
    assert.strictEqual(result.items[0].name, 'item1');
    assert.strictEqual(result.items[1].api_key, 'api_key_provided');
  });

  it('should preserve primitive values', () => {
    assert.strictEqual(sanitizeBody('string'), 'string');
    assert.strictEqual(sanitizeBody(123), 123);
    assert.strictEqual(sanitizeBody(null), null);
    assert.strictEqual(sanitizeBody(undefined), undefined);
  });

  it('should handle deeply nested objects', () => {
    const body = {
      level1: {
        level2: {
          level3: {
            apikey: 'deep-secret',
            data: 'safe',
          },
        },
      },
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.level1.level2.level3.apikey, 'api_key_provided');
    assert.strictEqual(result.level1.level2.level3.data, 'safe');
  });
});

describe('sanitizeUrl', () => {
  it('should redact api_key in query params', () => {
    const url = 'https://api.example.com/endpoint?api_key=secret&other=value';
    const result = sanitizeUrl(url);
    assert.ok(result.includes('api_key=api_key_provided'));
    assert.ok(result.includes('other=value'));
  });

  it('should handle relative URLs', () => {
    const url = '/v1/models?apikey=secret';
    const result = sanitizeUrl(url);
    assert.ok(result.includes('apikey=api_key_provided'));
  });

  it('should preserve URLs without sensitive params', () => {
    const url = 'https://api.example.com/endpoint?model=gpt-4';
    const result = sanitizeUrl(url);
    assert.ok(result.includes('model=gpt-4'));
  });

  it('should handle empty/null URLs', () => {
    assert.strictEqual(sanitizeUrl(''), '');
    assert.strictEqual(sanitizeUrl(null), null);
    assert.strictEqual(sanitizeUrl(undefined), undefined);
  });

  it('should handle strings that get parsed as relative paths', () => {
    // The URL parser treats most strings as relative paths
    // It adds a leading slash and encodes special chars
    const input = 'some path';
    const result = sanitizeUrl(input);
    // Just verify it doesn't throw and returns a string
    assert.strictEqual(typeof result, 'string');
  });
});

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

  it('should redact provider API key and cookie headers', () => {
    const headers = {
      'x-goog-api-key': 'cfut_secret',
      'OpenAI-Api-Key': 'sk-secret',
      'cf-aig-authorization': 'Bearer cf-token',
      'Set-Cookie': '__cf_bm=secret; HttpOnly',
      Cookie: 'session=secret',
      'x-goog-api-client': 'google-genai-sdk/2.6.0',
    };
    const result = sanitizeHeaders(headers);
    assert.strictEqual(result['x-goog-api-key'], 'api_key_provided');
    assert.strictEqual(result['OpenAI-Api-Key'], 'api_key_provided');
    assert.strictEqual(result['cf-aig-authorization'], 'api_key_provided');
    assert.strictEqual(result['Set-Cookie'], 'api_key_provided');
    assert.strictEqual(result.Cookie, 'api_key_provided');
    assert.strictEqual(result['x-goog-api-client'], 'google-genai-sdk/2.6.0');
  });

  it('should handle empty headers', () => {
    const result = sanitizeHeaders({});
    assert.deepStrictEqual(result, {});
  });

  it('should redact secret-looking header values even under nonstandard names', () => {
    const headers = {
      'x-custom-auth': 'Bearer cfut_1234567890abcdefghijklmnopqrstuvwxyz',
      'x-custom-openai': 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
      'x-custom-google': 'AIza1234567890abcdefghijklmnopqrstuvwxyz',
      'x-safe': 'plain-value',
    };
    const result = sanitizeHeaders(headers);
    assert.strictEqual(result['x-custom-auth'], 'Bearer api_key_provided');
    assert.strictEqual(result['x-custom-openai'], 'api_key_provided');
    assert.strictEqual(result['x-custom-google'], 'api_key_provided');
    assert.strictEqual(result['x-safe'], 'plain-value');
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

  it('should redact common token and secret body keys', () => {
    const body = {
      accessToken: 'access-secret',
      refresh_token: 'refresh-secret',
      clientSecret: 'client-secret',
      password: 'password-secret',
      credential: 'credential-secret',
      regular: 'safe',
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.accessToken, 'api_key_provided');
    assert.strictEqual(result.refresh_token, 'api_key_provided');
    assert.strictEqual(result.clientSecret, 'api_key_provided');
    assert.strictEqual(result.password, 'api_key_provided');
    assert.strictEqual(result.credential, 'api_key_provided');
    assert.strictEqual(result.regular, 'safe');
  });

  it('should redact secret-looking body string values under nonstandard keys', () => {
    const body = {
      note: 'use Bearer cfut_1234567890abcdefghijklmnopqrstuvwxyz',
      safe: 'regular text',
    };
    const result = sanitizeBody(body);
    assert.strictEqual(result.note, 'use Bearer api_key_provided');
    assert.strictEqual(result.safe, 'regular text');
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

  it('should redact token and provider API key query params', () => {
    const url = 'https://api.example.com/endpoint?x-goog-api-key=secret&access_token=secret&model=gpt-4';
    const result = sanitizeUrl(url);
    assert.ok(result.includes('x-goog-api-key=api_key_provided'));
    assert.ok(result.includes('access_token=api_key_provided'));
    assert.ok(result.includes('model=gpt-4'));
  });

  it('should redact secret-looking query values under nonstandard params', () => {
    const url = 'https://api.example.com/endpoint?custom=Bearer%20cfut_1234567890abcdefghijklmnopqrstuvwxyz&other=value';
    const result = sanitizeUrl(url);
    assert.ok(result.includes('custom=Bearer+api_key_provided') || result.includes('custom=Bearer%20api_key_provided'));
    assert.ok(result.includes('other=value'));
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

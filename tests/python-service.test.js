import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logToPython } from '../src/services/python-service.js';

describe('logToPython', () => {
  it('should generate basic Python requests code', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: { 'content-type': 'application/json' },
        body: { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] },
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes('import requests'));
    assert.ok(code.includes('import json'));
    assert.ok(code.includes('response = requests.post('));
    assert.ok(code.includes("'https://api.example.com/v1/chat'"));
    assert.ok(code.includes("'model': 'gpt-4'"));
    assert.ok(code.includes('print(f\'Status: {response.status_code} {response.reason}\')'));
  });

  it('should obfuscate API keys in headers and use env var', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {
          'authorization': 'Bearer sk-secret-key-12345',
          'content-type': 'application/json',
        },
        body: {},
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes('import os'));
    assert.ok(code.includes("api_key = os.environ.get('API_KEY')"));
    assert.ok(code.includes("raise SystemExit('Set API_KEY environment variable"));
    assert.ok(code.includes("f'Bearer {api_key}'"));
    assert.ok(!code.includes('sk-secret-key-12345'));
  });

  it('should obfuscate API keys in body', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {},
        body: {
          api_key: 'secret-key-in-body',
          model: 'gpt-4',
        },
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes("'api_key': 'api_key_provided'"));
    assert.ok(code.includes("'model': 'gpt-4'"));
    assert.ok(!code.includes('secret-key-in-body'));
  });

  it('should obfuscate API keys in URL query params', () => {
    const log = {
      request: {
        method: 'GET',
        url: 'https://api.example.com/v1/models?api_key=secret-in-url&other=safe',
        headers: {},
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes('api_key=api_key_provided'));
    assert.ok(code.includes('other=safe'));
    assert.ok(!code.includes('secret-in-url'));
  });

  it('should handle missing request', () => {
    const log = {};

    const code = logToPython(log);

    assert.ok(code.includes('response = requests.get('));
    assert.ok(code.includes("'',")); // empty URL
  });

  it('should use correct HTTP method', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      const log = {
        request: {
          method,
          url: 'https://api.example.com/test',
          headers: {},
        },
      };

      const code = logToPython(log);
      assert.ok(code.includes(`response = requests.${method.toLowerCase()}(`), `Should use ${method.toLowerCase()}`);
    }
  });

  it('should format nested objects properly', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {},
        body: {
          messages: [
            { role: 'system', content: 'You are helpful.' },
            { role: 'user', content: 'Hello' },
          ],
        },
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes("'role': 'system'"));
    assert.ok(code.includes("'role': 'user'"));
  });

  it('should handle boolean and null values', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {},
        body: {
          stream: true,
          stop: null,
          temperature: 0.7,
        },
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes("'stream': True"));
    assert.ok(code.includes("'stop': None"));
    assert.ok(code.includes("'temperature': 0.7"));
  });

  it('should escape special characters in strings', () => {
    const log = {
      request: {
        method: 'POST',
        url: 'https://api.example.com/v1/chat',
        headers: {},
        body: {
          content: "Hello\nWorld\t'quoted'",
        },
      },
    };

    const code = logToPython(log);

    assert.ok(code.includes("'content': 'Hello\\nWorld\\t\\'quoted\\''"));
  });
});

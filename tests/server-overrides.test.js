import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveOverrides } from '../src/server.js';

function createRequest(headers = {}) {
  return { headers };
}

describe('resolveOverrides', () => {
  it('strips debugger control headers from cleanedHeaders', () => {
    const headers = {
      authorization: 'Bearer token',
      'llm-debugger-url': 'https://api.example.com/v1/chat',
      'llm-debugger-cache': 'true',
      'llm-debugger-prefix': 'compat-chat',
    };
    const result = resolveOverrides(createRequest(headers));

    assert.deepStrictEqual(result.cleanedHeaders, {
      authorization: 'Bearer token',
    });
    assert.deepStrictEqual(headers, {
      authorization: 'Bearer token',
      'llm-debugger-url': 'https://api.example.com/v1/chat',
      'llm-debugger-cache': 'true',
      'llm-debugger-prefix': 'compat-chat',
    });
    assert.strictEqual(result.recordingPrefix, 'compat-chat');
  });

  it('strips override headers case-insensitively from cleanedHeaders', () => {
    const result = resolveOverrides(
      createRequest({
        authorization: 'Bearer token',
        'LLM-Debugger-URL': 'https://api.example.com/v1/chat',
        'Llm-Debugger-Cache': 'false',
        'LLM-Debugger-Prefix': 'Native Tool',
      })
    );

    assert.deepStrictEqual(result.cleanedHeaders, {
      authorization: 'Bearer token',
    });
    assert.strictEqual(result.urlOverride, 'https://api.example.com/v1/chat');
    assert.strictEqual(result.cacheOverride, false);
    assert.strictEqual(result.recordingPrefix, 'Native Tool');
  });

  it('returns null overrides when neither header is present', () => {
    const result = resolveOverrides(
      createRequest({
        authorization: 'Bearer token',
      })
    );

    assert.strictEqual(result.urlOverride, null);
    assert.strictEqual(result.cacheOverride, null);
    assert.strictEqual(result.recordingPrefix, null);
    assert.deepStrictEqual(result.cleanedHeaders, {
      authorization: 'Bearer token',
    });
  });

  it('returns null overrides and empty cleanedHeaders when headers are missing', () => {
    assert.deepStrictEqual(resolveOverrides({}), {
      urlOverride: null,
      cacheOverride: null,
      recordingPrefix: null,
      cleanedHeaders: {},
    });
  });

  it('parses recording prefix values', () => {
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-prefix': ' compat chat ' })).recordingPrefix,
      'compat chat'
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-prefix': '' })).recordingPrefix,
      null
    );
  });

  it('parses cache override values', () => {
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': 'true' })).cacheOverride,
      true
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': 'false' })).cacheOverride,
      false
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': 'TRUE' })).cacheOverride,
      true
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': 'False' })).cacheOverride,
      false
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': ' true ' })).cacheOverride,
      true
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': 'enabled' })).cacheOverride,
      null
    );
    assert.strictEqual(
      resolveOverrides(createRequest({ 'llm-debugger-cache': '' })).cacheOverride,
      null
    );
  });

  it('returns a valid URL override as-is', () => {
    const url = 'https://api.example.com/v1/chat?model=test#fragment';

    const result = resolveOverrides(createRequest({ 'llm-debugger-url': url }));

    assert.strictEqual(result.urlOverride, url);
  });

  it('throws a 400 error for an invalid URL override', () => {
    assert.throws(
      () => resolveOverrides(createRequest({ 'llm-debugger-url': 'not a url' })),
      {
        status: 400,
        body: {
          error: 'Invalid override URL',
          message: 'llm-debugger-url must be a valid http or https URL',
        },
      }
    );
  });

  it('throws a 400 error for an empty URL override', () => {
    assert.throws(
      () => resolveOverrides(createRequest({ 'llm-debugger-url': '' })),
      {
        status: 400,
        body: {
          error: 'Invalid override URL',
          message: 'llm-debugger-url must be a valid http or https URL',
        },
      }
    );
  });

  it('throws a 400 error for a URL override array', () => {
    assert.throws(
      () => resolveOverrides(createRequest({ 'llm-debugger-url': ['https://api.example.com'] })),
      {
        status: 400,
        body: {
          error: 'Invalid override URL',
          message: 'llm-debugger-url must be a valid http or https URL',
        },
      }
    );
  });

  it('throws a 400 error for a non-http URL override', () => {
    assert.throws(
      () => resolveOverrides(createRequest({ 'llm-debugger-url': 'file:///tmp/request.json' })),
      {
        status: 400,
        body: {
          error: 'Invalid override URL',
          message: 'llm-debugger-url must be a valid http or https URL',
        },
      }
    );
  });
});

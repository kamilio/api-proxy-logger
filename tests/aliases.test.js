import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseAliasPath, resolveAliasConfig } from '../src/aliases.js';

describe('parseAliasPath', () => {
  it('parses alias paths with a trailing segment', () => {
    const result = parseAliasPath('/__proxy__/poe/v1/chat');
    assert.deepStrictEqual(result, { alias: 'poe', path: '/v1/chat' });
  });

  it('returns null for non-alias paths', () => {
    assert.strictEqual(parseAliasPath('/v1/chat'), null);
  });

  it('handles alias root paths', () => {
    const result = parseAliasPath('/__proxy__/openrouter');
    assert.deepStrictEqual(result, { alias: 'openrouter', path: '/' });
  });
});

describe('resolveAliasConfig', () => {
  it('resolves url and interpolates headers', () => {
    const aliases = {
      openrouter: {
        url: 'https://openrouter.ai',
        headers: {
          Authorization: 'Bearer ${OPENROUTER_KEY}',
        },
      },
    };
    const result = resolveAliasConfig(aliases, 'openrouter', {
      OPENROUTER_KEY: 'secret',
    });
    assert.deepStrictEqual(result, {
      url: 'https://openrouter.ai',
      headers: { authorization: 'Bearer secret' },
    });
  });

  it('returns null when alias is missing or invalid', () => {
    const aliases = { bad: { url: 'not-a-url' } };
    assert.strictEqual(resolveAliasConfig(aliases, 'missing'), null);
    assert.strictEqual(resolveAliasConfig(aliases, 'bad'), null);
  });
});

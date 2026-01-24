import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to test the pattern matching logic without loading the full config
// Extract the matchPattern logic for testing

function matchPattern(pattern, path) {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}

describe('matchPattern (glob matching)', () => {
  describe('exact matches', () => {
    it('should match exact paths', () => {
      assert.ok(matchPattern('/favicon.ico', '/favicon.ico'));
      assert.ok(matchPattern('/v1/models', '/v1/models'));
      assert.ok(matchPattern('/api/test', '/api/test'));
    });

    it('should not match different paths', () => {
      assert.ok(!matchPattern('/favicon.ico', '/favicon.png'));
      assert.ok(!matchPattern('/v1/models', '/v1/models/list'));
    });
  });

  describe('single wildcard (*)', () => {
    it('should match any segment except slashes', () => {
      assert.ok(matchPattern('/v1/*/models', '/v1/foo/models'));
      assert.ok(matchPattern('/v1/*/models', '/v1/bar/models'));
    });

    it('should not match paths with extra slashes', () => {
      assert.ok(!matchPattern('/v1/*/models', '/v1/foo/bar/models'));
    });

    it('should match file extensions', () => {
      assert.ok(matchPattern('/*.ico', '/favicon.ico'));
      assert.ok(matchPattern('/*.ico', '/test.ico'));
      assert.ok(!matchPattern('/*.ico', '/path/favicon.ico'));
    });
  });

  describe('double wildcard (**)', () => {
    it('should match any path including slashes', () => {
      assert.ok(matchPattern('/cdn-cgi/**', '/cdn-cgi/trace'));
      assert.ok(matchPattern('/cdn-cgi/**', '/cdn-cgi/foo/bar/baz'));
    });

    it('should match at the end of pattern', () => {
      assert.ok(matchPattern('/.well-known/**', '/.well-known/acme-challenge/token'));
      assert.ok(matchPattern('/.well-known/**', '/.well-known/security.txt'));
    });

    it('should match empty remainder', () => {
      assert.ok(matchPattern('/api/**', '/api/'));
    });
  });

  describe('combined patterns', () => {
    it('should handle mixed wildcards', () => {
      assert.ok(matchPattern('/api/*/v1/**', '/api/openai/v1/chat/completions'));
      assert.ok(matchPattern('/api/*/v1/**', '/api/anthropic/v1/messages'));
    });
  });

  describe('dots in patterns', () => {
    it('should escape dots properly', () => {
      assert.ok(matchPattern('/.well-known/*', '/.well-known/test'));
      assert.ok(!matchPattern('/.well-known/*', '/Xwell-known/test'));
    });
  });
});

describe('config loading', () => {
  let testDir;
  let originalEnv;

  beforeEach(() => {
    testDir = join(tmpdir(), `llm-debugger-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    originalEnv = { ...process.env };
    process.env.LLM_DEBUGGER_HOME = testDir;
    // Clear config cache by resetting module
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should create default config if missing', async () => {
    // Import fresh to avoid cache
    const configPath = join(testDir, 'config.yaml');
    const { loadConfig } = await import(`../src/config.js?t=${Date.now()}`);

    // Config should load without error even if file doesn't exist
    const config = loadConfig();
    assert.ok(config);
    assert.ok(Array.isArray(config.ignore_routes));
    assert.ok(Array.isArray(config.hide_from_viewer));
    assert.ok(config.aliases && typeof config.aliases === 'object');
  });
});

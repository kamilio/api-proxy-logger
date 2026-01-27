import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';
import { addAliasToConfig, removeAliasFromConfig, setDefaultAliasInConfig } from '../src/config-aliases.js';

describe('addAliasToConfig', () => {
  let testDir;

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('adds an alias to a new config file', () => {
    testDir = join(tmpdir(), `llm-debugger-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    const result = addAliasToConfig('poe', 'https://api.poe.com', configPath);
    const content = readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content);

    assert.strictEqual(result.alias, 'poe');
    assert.strictEqual(result.url, 'https://api.poe.com/');
    assert.strictEqual(parsed.aliases.poe.url, 'https://api.poe.com/');
  });

  it('rejects invalid alias names', () => {
    testDir = join(tmpdir(), `llm-debugger-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    assert.throws(
      () => addAliasToConfig('bad/alias', 'https://api.poe.com', configPath),
      /safe path segment/
    );
  });

  it('rejects invalid alias URLs', () => {
    testDir = join(tmpdir(), `llm-debugger-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    assert.throws(
      () => addAliasToConfig('poe', 'not-a-url', configPath),
      /valid URL/
    );
  });

  it('removes an existing alias', () => {
    testDir = join(tmpdir(), `llm-debugger-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    addAliasToConfig('poe', 'https://api.poe.com', configPath);
    removeAliasFromConfig('poe', configPath);
    const content = readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content);

    assert.ok(parsed.aliases);
    assert.strictEqual(parsed.aliases.poe, undefined);
  });

  it('rejects removing a missing alias', () => {
    testDir = join(tmpdir(), `llm-debugger-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    assert.throws(
      () => removeAliasFromConfig('missing', configPath),
      /not found/
    );
  });
});

describe('setDefaultAliasInConfig', () => {
  let testDir;

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('sets the default alias when it exists', () => {
    testDir = join(tmpdir(), `llm-debugger-default-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    addAliasToConfig('poe', 'https://api.poe.com', configPath);
    const result = setDefaultAliasInConfig('poe', configPath);
    const content = readFileSync(configPath, 'utf-8');
    const parsed = yaml.load(content);

    assert.strictEqual(result.alias, 'poe');
    assert.strictEqual(parsed.default_alias, 'poe');
  });

  it('rejects setting a missing alias as default', () => {
    testDir = join(tmpdir(), `llm-debugger-default-alias-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');

    assert.throws(
      () => setDefaultAliasInConfig('missing', configPath),
      /not found/
    );
  });
});

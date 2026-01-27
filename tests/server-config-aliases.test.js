import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

describe('buildServerConfig alias defaults', () => {
  let testDir;
  let originalEnv;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `llm-debugger-server-config-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    originalEnv = { ...process.env };
    process.env.LLM_DEBUGGER_HOME = testDir;
    process.env.PROXY_PORT = '49000-49010';
    delete process.env.TARGET_URL;
    delete process.env.TARGET_PORT;
  });

  afterEach(() => {
    process.env = originalEnv;
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeConfig(config) {
    const configPath = join(testDir, 'config.yaml');
    const content = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });
    writeFileSync(configPath, content, 'utf-8');
  }

  it('uses alias config when --target matches an alias', async () => {
    writeConfig({
      aliases: {
        openai: {
          url: 'https://api.openai.com',
          headers: {
            Authorization: 'Bearer token',
          },
        },
      },
    });
    process.env.TARGET_URL = 'openai';

    const { buildServerConfig } = await import(`../src/server-config.js?t=${Date.now()}`);
    const result = await buildServerConfig();

    assert.strictEqual(result.resolvedTargetUrl, 'https://api.openai.com/');
    assert.strictEqual(result.providerLabel, 'openai');
    assert.deepStrictEqual(result.config.proxyHeaders, { authorization: 'Bearer token' });
  });

  it('uses default_alias when no target is provided', async () => {
    writeConfig({
      default_alias: 'poe',
      aliases: {
        poe: {
          url: 'https://api.poe.com',
        },
      },
    });

    const { buildServerConfig } = await import(`../src/server-config.js?t=${Date.now()}`);
    const result = await buildServerConfig();

    assert.strictEqual(result.resolvedTargetUrl, 'https://api.poe.com/');
    assert.strictEqual(result.providerLabel, 'poe');
  });

  it('errors when --target references a missing alias', async () => {
    writeConfig({
      aliases: {
        openai: { url: 'https://api.openai.com' },
      },
    });
    process.env.TARGET_URL = 'missing';

    const { buildServerConfig } = await import(`../src/server-config.js?t=${Date.now()}`);
    await assert.rejects(buildServerConfig(), /Unknown alias "missing"/);
  });
});

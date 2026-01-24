import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { getConfigDisplayContent, getConfigEditPath } from '../src/config-file.js';

describe('getConfigDisplayContent', () => {
  let testDir;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns file contents when config exists', () => {
    testDir = join(tmpdir(), `llm-debugger-config-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const configPath = join(testDir, 'config.yaml');
    writeFileSync(configPath, 'env: {}\n', 'utf-8');

    const content = getConfigDisplayContent(configPath);
    assert.strictEqual(content, 'env: {}\n');
  });

  it('returns template content when config is missing without creating it', () => {
    testDir = join(tmpdir(), `llm-debugger-config-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const missingPath = join(testDir, 'missing.yaml');

    const content = getConfigDisplayContent(missingPath);
    assert.ok(content.includes('env:'));
    assert.strictEqual(existsSync(missingPath), false);
  });

  it('uses home config path when CONFIG_PATH points at the template', () => {
    testDir = join(tmpdir(), `llm-debugger-config-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    process.env.LLM_DEBUGGER_HOME = testDir;
    const templatePath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'config.yaml'
    );
    process.env.CONFIG_PATH = templatePath;

    const editPath = getConfigEditPath();
    assert.strictEqual(editPath, join(testDir, 'config.yaml'));
  });
});

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { homedir } from 'node:os';
import { join } from 'node:path';

describe('paths module', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('expandHomePath', () => {
    it('should expand ~ to home directory', async () => {
      const { expandHomePath } = await import('../src/paths.js');
      const result = expandHomePath('~');
      assert.strictEqual(result, homedir());
    });

    it('should expand ~/ prefix', async () => {
      const { expandHomePath } = await import('../src/paths.js');
      const result = expandHomePath('~/test/path');
      assert.strictEqual(result, join(homedir(), 'test/path'));
    });

    it('should not modify absolute paths', async () => {
      const { expandHomePath } = await import('../src/paths.js');
      const result = expandHomePath('/absolute/path');
      assert.strictEqual(result, '/absolute/path');
    });

    it('should not modify relative paths without ~', async () => {
      const { expandHomePath } = await import('../src/paths.js');
      const result = expandHomePath('relative/path');
      assert.strictEqual(result, 'relative/path');
    });

    it('should handle null/undefined', async () => {
      const { expandHomePath } = await import('../src/paths.js');
      assert.strictEqual(expandHomePath(null), null);
      assert.strictEqual(expandHomePath(undefined), undefined);
    });
  });

  describe('getBaseDir', () => {
    it('should return default base dir when env not set', async () => {
      delete process.env.LLM_DEBUGGER_HOME;
      const { getBaseDir, DEFAULT_BASE_DIR } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getBaseDir();
      assert.strictEqual(result, DEFAULT_BASE_DIR);
    });

    it('should use LLM_DEBUGGER_HOME when set', async () => {
      process.env.LLM_DEBUGGER_HOME = '/custom/path';
      const { getBaseDir } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getBaseDir();
      assert.strictEqual(result, '/custom/path');
    });

    it('should expand ~ in LLM_DEBUGGER_HOME', async () => {
      process.env.LLM_DEBUGGER_HOME = '~/custom-debugger';
      const { getBaseDir } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getBaseDir();
      assert.strictEqual(result, join(homedir(), 'custom-debugger'));
    });
  });

  describe('getLogsDir', () => {
    it('should return logs subdir of base dir by default', async () => {
      delete process.env.LLM_DEBUGGER_HOME;
      delete process.env.LOG_OUTPUT_DIR;
      const { getLogsDir, DEFAULT_BASE_DIR } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getLogsDir();
      assert.strictEqual(result, join(DEFAULT_BASE_DIR, 'logs'));
    });

    it('should use LOG_OUTPUT_DIR when set', async () => {
      process.env.LOG_OUTPUT_DIR = '/custom/logs';
      const { getLogsDir } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getLogsDir();
      assert.strictEqual(result, '/custom/logs');
    });
  });

  describe('getConfigPath', () => {
    it('should return config.yaml in base dir by default', async () => {
      delete process.env.LLM_DEBUGGER_HOME;
      delete process.env.CONFIG_PATH;
      const { getConfigPath, DEFAULT_BASE_DIR } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getConfigPath();
      assert.strictEqual(result, join(DEFAULT_BASE_DIR, 'config.yaml'));
    });

    it('should use CONFIG_PATH when set', async () => {
      process.env.CONFIG_PATH = '/custom/config.yaml';
      const { getConfigPath } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getConfigPath();
      assert.strictEqual(result, '/custom/config.yaml');
    });
  });

  describe('getPidFilePath', () => {
    it('should return .pid in base dir by default', async () => {
      delete process.env.LLM_DEBUGGER_HOME;
      const { getPidFilePath, DEFAULT_BASE_DIR } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getPidFilePath();
      assert.strictEqual(result, join(DEFAULT_BASE_DIR, '.pid'));
    });

    it('should use LLM_DEBUGGER_HOME when set', async () => {
      process.env.LLM_DEBUGGER_HOME = '/custom/base';
      const { getPidFilePath } = await import(`../src/paths.js?t=${Date.now()}`);
      const result = getPidFilePath();
      assert.strictEqual(result, join('/custom/base', '.pid'));
    });
  });

});

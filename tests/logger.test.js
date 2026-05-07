import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import yaml from 'js-yaml';

describe('log rotation', () => {
  let testDir;
  let logsDir;
  let originalEnv;

  beforeEach(() => {
    testDir = join(tmpdir(), `llm-debugger-rotation-test-${Date.now()}`);
    logsDir = join(testDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    originalEnv = { ...process.env };
    process.env.LLM_DEBUGGER_HOME = testDir;
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should delete oldest logs when max_logs is exceeded', async () => {
    // Create config with max_logs = 3
    const configPath = join(testDir, 'config.yaml');
    writeFileSync(configPath, 'max_logs: 3\n', 'utf-8');

    // Create 5 log files with different timestamps (simulated by filenames)
    const logFiles = [
      '20260101_100000_001abc.yaml',
      '20260101_100001_002abc.yaml',
      '20260101_100002_003abc.yaml',
      '20260101_100003_004abc.yaml',
      '20260101_100004_005abc.yaml',
    ];

    for (const file of logFiles) {
      writeFileSync(join(logsDir, file), 'timestamp: test\n', 'utf-8');
    }

    // Import logger with fresh cache
    const { logRequest } = await import(`../src/logger.js?t=${Date.now()}`);

    // Make a request to trigger rotation
    await logRequest(logsDir, {
      method: 'POST',
      url: 'https://api.test.com/v1/test',
      status: 200,
      duration: 100,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{}',
      responseBody: '{}',
    });

    // Check that we now have max_logs files (3)
    const remainingFiles = readdirSync(logsDir).filter((f) => f.endsWith('.yaml'));
    assert.strictEqual(remainingFiles.length, 3, `Expected 3 files, got ${remainingFiles.length}`);

    // Verify the oldest files were deleted
    assert.ok(!remainingFiles.includes('20260101_100000_001abc.yaml'), 'Oldest file should be deleted');
    assert.ok(!remainingFiles.includes('20260101_100001_002abc.yaml'), 'Second oldest should be deleted');
    assert.ok(!remainingFiles.includes('20260101_100002_003abc.yaml'), 'Third oldest should be deleted');
  });

  it('should not delete logs when under max_logs limit', async () => {
    const configPath = join(testDir, 'config.yaml');
    writeFileSync(configPath, 'max_logs: 10\n', 'utf-8');

    // Create 2 log files
    const logFiles = ['20260101_100000_001abc.yaml', '20260101_100001_002abc.yaml'];

    for (const file of logFiles) {
      writeFileSync(join(logsDir, file), 'timestamp: test\n', 'utf-8');
    }

    const { logRequest } = await import(`../src/logger.js?t=${Date.now()}`);

    await logRequest(logsDir, {
      method: 'POST',
      url: 'https://api.test.com/v1/test',
      status: 200,
      duration: 100,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{}',
      responseBody: '{}',
    });

    const remainingFiles = readdirSync(logsDir).filter((f) => f.endsWith('.yaml'));
    assert.strictEqual(remainingFiles.length, 3, 'All files should remain');
  });

  it('should not rotate when max_logs is 0 (unlimited)', async () => {
    const configPath = join(testDir, 'config.yaml');
    writeFileSync(configPath, 'max_logs: 0\n', 'utf-8');

    // Create 5 log files
    const logFiles = [
      '20260101_100000_001abc.yaml',
      '20260101_100001_002abc.yaml',
      '20260101_100002_003abc.yaml',
      '20260101_100003_004abc.yaml',
      '20260101_100004_005abc.yaml',
    ];

    for (const file of logFiles) {
      writeFileSync(join(logsDir, file), 'timestamp: test\n', 'utf-8');
    }

    const { logRequest } = await import(`../src/logger.js?t=${Date.now()}`);

    await logRequest(logsDir, {
      method: 'POST',
      url: 'https://api.test.com/v1/test',
      status: 200,
      duration: 100,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{}',
      responseBody: '{}',
    });

    const remainingFiles = readdirSync(logsDir).filter((f) => f.endsWith('.yaml'));
    assert.strictEqual(remainingFiles.length, 6, 'All files should remain when max_logs is 0');
  });

  it('should handle logs in provider subdirectories', async () => {
    const configPath = join(testDir, 'config.yaml');
    writeFileSync(configPath, 'max_logs: 2\n', 'utf-8');

    // Create provider subdirectory
    const openaiDir = join(logsDir, 'openai');
    mkdirSync(openaiDir, { recursive: true });

    // Create 2 log files in root and 2 in subdirectory
    writeFileSync(join(logsDir, '20260101_100000_001abc.yaml'), 'timestamp: test\n', 'utf-8');
    writeFileSync(join(openaiDir, '20260101_100001_002abc.yaml'), 'timestamp: test\n', 'utf-8');
    writeFileSync(join(openaiDir, '20260101_100002_003abc.yaml'), 'timestamp: test\n', 'utf-8');

    const { logRequest } = await import(`../src/logger.js?t=${Date.now()}`);

    await logRequest(logsDir, {
      method: 'POST',
      url: 'https://api.test.com/v1/test',
      status: 200,
      duration: 100,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{}',
      responseBody: '{}',
    });

    // Count all remaining yaml files
    const rootFiles = readdirSync(logsDir).filter((f) => f.endsWith('.yaml'));
    const subFiles = readdirSync(openaiDir).filter((f) => f.endsWith('.yaml'));
    const totalFiles = rootFiles.length + subFiles.length;

    assert.strictEqual(totalFiles, 2, `Expected 2 total files, got ${totalFiles}`);
  });
});

describe('logRequest cache fields', () => {
  let testDir;
  let logsDir;
  let originalEnv;

  beforeEach(() => {
    testDir = join(tmpdir(), `llm-debugger-cache-fields-test-${Date.now()}`);
    logsDir = join(testDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    originalEnv = { ...process.env };
    process.env.LLM_DEBUGGER_HOME = testDir;
    writeFileSync(join(testDir, 'config.yaml'), 'max_logs: 0\n', 'utf-8');
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should persist cache fields only when provided', async () => {
    const { logRequest } = await import(`../src/logger.js?t=${Date.now()}`);

    const cacheHitFile = await logRequest(logsDir, {
      method: 'GET',
      url: 'https://api.test.com/v1/cache-hit',
      status: 200,
      duration: 25,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: null,
      responseBody: '{}',
      cacheKey: 'a1b2c3d4e5f6',
      cacheHit: true,
    });

    const cacheMissFile = await logRequest(logsDir, {
      method: 'GET',
      url: 'https://api.test.com/v1/cache-miss',
      status: 200,
      duration: 27,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: null,
      responseBody: '{}',
      cacheKey: '0a1b2c3d4e5f',
      cacheHit: false,
    });

    const uncachedFile = await logRequest(logsDir, {
      method: 'GET',
      url: 'https://api.test.com/v1/uncached',
      status: 200,
      duration: 30,
      requestHeaders: {},
      responseHeaders: {},
      requestBody: null,
      responseBody: '{}',
    });

    const cacheHitLog = yaml.load(readFileSync(cacheHitFile, 'utf-8'));
    assert.strictEqual(cacheHitLog.cache_key, 'a1b2c3d4e5f6');
    assert.strictEqual(cacheHitLog.cache_hit, true);

    const cacheMissLog = yaml.load(readFileSync(cacheMissFile, 'utf-8'));
    assert.strictEqual(cacheMissLog.cache_key, '0a1b2c3d4e5f');
    assert.strictEqual(cacheMissLog.cache_hit, false);

    const uncachedLog = yaml.load(readFileSync(uncachedFile, 'utf-8'));
    assert.ok(!Object.hasOwn(uncachedLog, 'cache_key'));
    assert.ok(!Object.hasOwn(uncachedLog, 'cache_hit'));
  });
});

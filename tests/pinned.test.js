import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('pinned service', () => {
  let testDir;
  let originalEnv;

  beforeEach(() => {
    testDir = join(tmpdir(), `llm-debugger-pinned-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
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

  it('should return empty array when pinned.yaml does not exist', async () => {
    const { loadPinned } = await import(`../src/pinned.js?t=${Date.now()}`);
    const pinned = loadPinned();
    assert.deepStrictEqual(pinned, []);
  });

  it('should pin a log and persist to file', async () => {
    const { pinLog, loadPinned } = await import(`../src/pinned.js?t=${Date.now()}`);

    const result = pinLog('openai/test.yaml');
    assert.strictEqual(result.pinned, true);
    assert.strictEqual(result.logId, 'openai/test.yaml');

    const pinned = loadPinned();
    assert.ok(pinned.includes('openai/test.yaml'));

    const pinnedPath = join(testDir, 'pinned.yaml');
    assert.ok(existsSync(pinnedPath), 'pinned.yaml should be created');
  });

  it('should unpin a log', async () => {
    const { pinLog, unpinLog, loadPinned } = await import(`../src/pinned.js?t=${Date.now()}`);

    pinLog('openai/test.yaml');
    let pinned = loadPinned();
    assert.ok(pinned.includes('openai/test.yaml'));

    const result = unpinLog('openai/test.yaml');
    assert.strictEqual(result.pinned, false);

    pinned = loadPinned();
    assert.ok(!pinned.includes('openai/test.yaml'));
  });

  it('should check if a log is pinned', async () => {
    const { pinLog, isPinned } = await import(`../src/pinned.js?t=${Date.now()}`);

    assert.strictEqual(isPinned('openai/test.yaml'), false);

    pinLog('openai/test.yaml');
    assert.strictEqual(isPinned('openai/test.yaml'), true);
  });

  it('should not duplicate pins', async () => {
    const { pinLog, loadPinned } = await import(`../src/pinned.js?t=${Date.now()}`);

    pinLog('openai/test.yaml');
    pinLog('openai/test.yaml');
    pinLog('openai/test.yaml');

    const pinned = loadPinned();
    const count = pinned.filter((id) => id === 'openai/test.yaml').length;
    assert.strictEqual(count, 1, 'Should only have one entry');
  });

  it('should return a Set from getPinnedSet', async () => {
    const { pinLog, getPinnedSet } = await import(`../src/pinned.js?t=${Date.now()}`);

    pinLog('openai/test1.yaml');
    pinLog('anthropic/test2.yaml');

    const pinnedSet = getPinnedSet();
    assert.ok(pinnedSet instanceof Set);
    assert.ok(pinnedSet.has('openai/test1.yaml'));
    assert.ok(pinnedSet.has('anthropic/test2.yaml'));
    assert.ok(!pinnedSet.has('unknown/test3.yaml'));
  });
});

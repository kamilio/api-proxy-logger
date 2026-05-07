import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildSnapshotPath,
  deleteSnapshot,
  extractModelFromBody,
  generateSnapshotKey,
  listSnapshots,
  loadSnapshot,
  resolveSnapshotDir,
  sanitizeForFs,
  saveSnapshot,
} from '../src/snapshot.js';

describe('snapshot module', () => {
  let testDir;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'api-proxy-logger-snapshot-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('generates stable keys from JSON request bodies regardless of key order', () => {
    const keyA = generateSnapshotKey({
      method: 'POST',
      url: 'https://api.example.test/v1/chat',
      body: '{"model":"GPT-4.1","messages":[{"role":"user","content":"hello"}],"temperature":0}',
    });
    const keyB = generateSnapshotKey({
      method: 'POST',
      url: 'https://api.example.test/v1/chat',
      body: '{"temperature":0,"messages":[{"content":"hello","role":"user"}],"model":"GPT-4.1"}',
    });
    const keyC = generateSnapshotKey({
      method: 'POST',
      url: 'https://api.example.test/v1/chat',
      body: 'plain utf-8 text',
    });

    assert.strictEqual(keyA, keyB);
    assert.notStrictEqual(keyA, keyC);
    assert.match(keyA, /^[a-f0-9]{12}$/);
    assert.strictEqual(
      generateSnapshotKey({
        method: 'POST',
        url: 'https://example.test/v1',
        body: '{"z":2,"a":1}',
      }),
      '0bb2378400c1'
    );
    assert.strictEqual(
      generateSnapshotKey({
        method: 'POST',
        url: 'https://example.test/v1',
        body: '{z}',
      }),
      '69ace8aa2025'
    );
  });

  it('generates stable keys from UTF-8 byte request bodies', () => {
    const bodyA = Buffer.from('{"z":1,"a":{"b":2},"model":"GPT-4.1"}', 'utf8');
    const bodyB = new TextEncoder().encode('{"model":"GPT-4.1","a":{"b":2},"z":1}');
    const bytes = Buffer.from('{"a":1}', 'utf8');
    const bodyC = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    assert.strictEqual(
      generateSnapshotKey({ method: 'POST', url: 'https://api.example.test/v1/chat', body: bodyA }),
      generateSnapshotKey({ method: 'POST', url: 'https://api.example.test/v1/chat', body: bodyB })
    );
    assert.strictEqual(
      generateSnapshotKey({ method: 'POST', url: 'https://api.example.test/v1/chat', body: bodyC }),
      generateSnapshotKey({ method: 'POST', url: 'https://api.example.test/v1/chat', body: '{"a":1}' })
    );
  });

  it('sanitizes filesystem path segments', () => {
    assert.strictEqual(sanitizeForFs('API.Example.com/v1 Chat_Completions!!'), 'api-example-com-v1-chat-completions-');
    assert.strictEqual(sanitizeForFs('Already--safe'), 'already-safe');
    assert.strictEqual(sanitizeForFs('---'), '-');
    assert.strictEqual(sanitizeForFs(''), '');
  });

  it('extracts sanitized model names from JSON object bodies', () => {
    assert.strictEqual(extractModelFromBody('{"model":"GPT-4.1 Mini"}'), 'gpt-4-1-mini');
    assert.strictEqual(extractModelFromBody({ model: 'Claude 3.5 Sonnet' }), 'claude-3-5-sonnet');
    assert.strictEqual(extractModelFromBody(Buffer.from('{"model":"Bytes Model"}')), 'bytes-model');
    assert.strictEqual(extractModelFromBody('{"model":123}'), 'default');
    assert.strictEqual(extractModelFromBody('["not","an","object"]'), 'default');
    assert.strictEqual(extractModelFromBody('not json'), 'default');
    assert.strictEqual(extractModelFromBody('{"prompt":"hello"}'), 'default');
  });

  it('builds snapshot paths from URL host, path, model, and key', () => {
    const snapshotPath = buildSnapshotPath(testDir, {
      url: 'https://api.example.test/v1/chat/completions?ignored=true',
      model: 'GPT-4.1 Mini',
      key: 'abc123def456',
    });

    assert.strictEqual(
      snapshotPath,
      join(testDir, 'api-example-test-v1-chat-completions', 'gpt-4-1-mini', 'abc123def456.json')
    );
  });

  it('resolves configured or default snapshot directories', () => {
    assert.strictEqual(resolveSnapshotDir({ snapshot_dir: '/tmp/custom-snapshots' }), '/tmp/custom-snapshots');
    assert.strictEqual(resolveSnapshotDir({ snapshot_dir: '' }), join(process.cwd(), '.snapshots'));
    assert.strictEqual(resolveSnapshotDir({ snapshot_dir: null }), join(process.cwd(), '.snapshots'));
    assert.strictEqual(resolveSnapshotDir({}), join(process.cwd(), '.snapshots'));
    assert.strictEqual(resolveSnapshotDir(undefined), join(process.cwd(), '.snapshots'));
  });

  it('saves and loads snapshots as formatted JSON', async () => {
    const snapshotPath = join(testDir, 'host', 'model', 'key.json');
    const entry = {
      key: 'key',
      request: { body: { model: 'Model', prompt: 'Hello' } },
      response: { status: 200, body: { ok: true } },
      metadata: { recordedAt: '2026-05-07T00:00:00.000Z' },
    };

    await saveSnapshot(snapshotPath, entry);

    assert.deepStrictEqual(await loadSnapshot(snapshotPath), entry);
    assert.strictEqual(await readFile(snapshotPath, 'utf8'), `${JSON.stringify(entry, null, 2)}`);
  });

  it('returns null when loading a missing snapshot', async () => {
    assert.strictEqual(await loadSnapshot(join(testDir, 'missing.json')), null);
  });

  it('lists snapshots from host and model directories', async () => {
    const key = 'abc123def456';
    const snapshotPath = join(testDir, 'api-example-test-v1-chat', 'gpt-4-1', `${key}.json`);
    await saveSnapshot(snapshotPath, {
      key,
      request: {
        body: {
          model: 'GPT-4.1',
          messages: [{ role: 'user', content: 'Hello from a snapshot prompt that should preview' }],
        },
      },
      response: { status: 201, body: { ok: true } },
      metadata: { recordedAt: '2026-05-07T12:00:00.000Z' },
    });
    await writeFile(join(testDir, 'ignored.json'), '{}');

    const summaries = await listSnapshots(testDir);

    assert.deepStrictEqual(summaries, [
      {
        key,
        host: 'api-example-test-v1-chat',
        path: snapshotPath,
        model: 'gpt-4-1',
        status: 201,
        recordedAt: '2026-05-07T12:00:00.000Z',
        promptPreview: 'Hello from a snapshot prompt that should preview',
      },
    ]);
  });

  it('lists only two-level JSON snapshots in deterministic order with fallback fields', async () => {
    const firstPath = join(testDir, 'host-b', 'model-b', 'bbb.json');
    const secondPath = join(testDir, 'host-a', 'model-a', 'aaa.json');
    await saveSnapshot(firstPath, {
      response: { status: 202 },
      recordedAt: '2026-05-07T14:00:00.000Z',
      body: { prompt: 'First prompt' },
    });
    await saveSnapshot(secondPath, {
      key: 'custom-key',
      status: 204,
      requestBody: JSON.stringify({ input: 'Second prompt', model: 'Entry Model' }),
      metadata: { recordedAt: '2026-05-07T13:00:00.000Z' },
    });
    await writeFile(join(testDir, 'root.json'), '{}');
    await mkdir(join(testDir, 'host-a', 'model-a', 'nested'), { recursive: true });
    await writeFile(join(testDir, 'host-a', 'model-a', 'nested', 'ignored.json'), '{}');
    await writeFile(join(testDir, 'host-a', 'model-a', 'ignored.txt'), '{}');

    assert.deepStrictEqual(await listSnapshots(testDir), [
      {
        key: 'custom-key',
        host: 'host-a',
        path: secondPath,
        model: 'entry-model',
        status: 204,
        recordedAt: '2026-05-07T13:00:00.000Z',
        promptPreview: 'Second prompt',
      },
      {
        key: 'bbb',
        host: 'host-b',
        path: firstPath,
        model: 'model-b',
        status: 202,
        recordedAt: '2026-05-07T14:00:00.000Z',
        promptPreview: 'First prompt',
      },
    ]);
  });

  it('returns an empty list for a missing snapshot directory', async () => {
    assert.deepStrictEqual(await listSnapshots(join(testDir, 'missing')), []);
  });

  it('rethrows non-missing load, list, and delete errors', async () => {
    const dirPath = join(testDir, 'directory.json');
    const filePath = join(testDir, 'file');
    await mkdir(dirPath);
    await writeFile(filePath, '{}');

    await assert.rejects(() => loadSnapshot(dirPath), { code: 'EISDIR' });
    await assert.rejects(() => listSnapshots(filePath), { code: 'ENOTDIR' });
    await assert.rejects(() => deleteSnapshot(dirPath), (error) => ['EPERM', 'EISDIR'].includes(error.code));
  });

  it('rethrows malformed JSON errors while listing snapshots', async () => {
    await mkdir(join(testDir, 'host', 'model'), { recursive: true });
    await writeFile(join(testDir, 'host', 'model', 'bad.json'), '{bad');

    await assert.rejects(() => listSnapshots(testDir), SyntaxError);
  });

  it('deletes snapshots and returns false for missing files', async () => {
    const snapshotPath = join(testDir, 'host', 'model', 'key.json');
    await saveSnapshot(snapshotPath, { key: 'key' });

    assert.strictEqual(await deleteSnapshot(snapshotPath), true);
    assert.strictEqual(await loadSnapshot(snapshotPath), null);
    assert.strictEqual(await deleteSnapshot(snapshotPath), false);
  });
});

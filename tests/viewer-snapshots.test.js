import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.js';
import { loadSnapshot, saveSnapshot } from '../src/snapshot.js';

describe('viewer snapshot routes', () => {
  let testDir;
  let snapshotDir;
  let server;
  let baseUrl;
  let originalConfigPath;
  let originalHome;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'api-proxy-logger-viewer-snapshots-'));
    snapshotDir = join(testDir, 'snapshots');
    originalConfigPath = process.env.CONFIG_PATH;
    originalHome = process.env.LLM_DEBUGGER_HOME;
    process.env.CONFIG_PATH = join(testDir, 'config.yaml');
    process.env.LLM_DEBUGGER_HOME = join(testDir, 'home');
    await writeFile(process.env.CONFIG_PATH, `snapshot_dir: ${JSON.stringify(snapshotDir)}\n`);

    await startServer({
      port: 0,
      targetUrl: 'https://api.example.test',
      provider: 'test',
      outputDir: join(testDir, 'logs'),
      snapshot_dir: snapshotDir,
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      server = null;
    }
    restoreEnv('CONFIG_PATH', originalConfigPath);
    restoreEnv('LLM_DEBUGGER_HOME', originalHome);
    await rm(testDir, { recursive: true, force: true });
  });

  it('shows an empty state when no snapshots exist', async () => {
    const response = await fetch(`${baseUrl}/__viewer__/snapshots`);
    const html = await response.text();

    assert.strictEqual(response.status, 200);
    assert.match(html, /No snapshots yet/);
  });

  it('lists, renders, and deletes a snapshot', async () => {
    const hostPath = 'api-example-test-v1-chat-completions';
    const model = 'gpt-4-1';
    const key = 'abc123def456';
    const snapshotPath = join(snapshotDir, hostPath, model, `${key}.json`);
    await saveSnapshot(snapshotPath, {
      key,
      request: {
        method: 'POST',
        url: 'https://api.example.test/v1/chat/completions',
        headers: { 'content-type': 'application/json' },
        body: {
          model: 'gpt-4.1',
          messages: [{ role: 'user', content: 'Hello from snapshot prompt' }],
        },
      },
      response: {
        status: 201,
        headers: { 'content-type': 'application/json' },
        body: { id: 'chatcmpl-test', choices: [{ message: { content: 'Hi from cache' } }] },
        is_streaming: false,
      },
      metadata: {
        recordedAt: '2026-05-07T12:00:00.000Z',
        model,
        host: 'api.example.test',
        path: '/v1/chat/completions',
        status: 201,
      },
    });

    const indexResponse = await fetch(`${baseUrl}/__viewer__/snapshots`);
    const indexHtml = await indexResponse.text();

    assert.strictEqual(indexResponse.status, 200);
    assert.match(indexHtml, new RegExp(hostPath));
    assert.match(indexHtml, new RegExp(model));
    assert.match(indexHtml, new RegExp(key));
    assert.match(indexHtml, /POST/);
    assert.match(indexHtml, /201/);
    assert.match(indexHtml, /2026-05-07T12:00:00.000Z/);
    assert.match(indexHtml, /Hello from snapshot prompt/);
    assert.match(indexHtml, /Open/);

    const detailResponse = await fetch(`${baseUrl}/__viewer__/snapshots/${hostPath}/${model}/${key}`);
    const detailHtml = await detailResponse.text();

    assert.strictEqual(detailResponse.status, 200);
    assert.match(detailHtml, /Request/);
    assert.match(detailHtml, /Response/);
    assert.match(detailHtml, /Hello from snapshot prompt/);
    assert.match(detailHtml, /Hi from cache/);
    assert.match(detailHtml, /\/v1\/chat\/completions/);

    const deleteResponse = await fetch(`${baseUrl}/__viewer__/snapshots/${hostPath}/${model}/${key}`, {
      method: 'DELETE',
    });

    assert.strictEqual(deleteResponse.status, 204);
    assert.strictEqual(await loadSnapshot(snapshotPath), null);

    const indexAfterDeleteResponse = await fetch(`${baseUrl}/__viewer__/snapshots`);
    const indexAfterDeleteHtml = await indexAfterDeleteResponse.text();

    assert.strictEqual(indexAfterDeleteResponse.status, 200);
    assert.match(indexAfterDeleteHtml, /No snapshots yet/);
    assert.doesNotMatch(indexAfterDeleteHtml, new RegExp(key));
  });

  it('returns 404 for missing or unsafe snapshot paths', async () => {
    const missingDetailResponse = await fetch(`${baseUrl}/__viewer__/snapshots/missing-host/missing-model/missing-key`);
    assert.strictEqual(missingDetailResponse.status, 404);

    const missingDeleteResponse = await fetch(`${baseUrl}/__viewer__/snapshots/missing-host/missing-model/missing-key`, {
      method: 'DELETE',
    });
    assert.strictEqual(missingDeleteResponse.status, 404);

    const unsafeDetailResponse = await fetch(`${baseUrl}/__viewer__/snapshots/..%2Fsecret/model/key`);
    assert.strictEqual(unsafeDetailResponse.status, 404);
  });

  it('renders binary response snapshots without dumping the encoded body', async () => {
    const hostPath = 'api-example-test-v1-binary';
    const model = 'default';
    const key = 'binary123456';
    const snapshotPath = join(snapshotDir, hostPath, model, `${key}.json`);
    const bodyBase64 = Buffer.from([0, 1, 2, 255]).toString('base64');

    await saveSnapshot(snapshotPath, {
      key,
      request: {
        method: 'GET',
        url: 'https://api.example.test/v1/binary',
        headers: {},
      },
      response: {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        body_base64: bodyBase64,
        is_binary: true,
      },
      metadata: {
        recordedAt: '2026-05-07T12:30:00.000Z',
        model,
        host: 'api.example.test',
        path: '/v1/binary',
        status: 200,
      },
    });

    const detailResponse = await fetch(`${baseUrl}/__viewer__/snapshots/${hostPath}/${model}/${key}`);
    const detailHtml = await detailResponse.text();

    assert.strictEqual(detailResponse.status, 200);
    assert.match(detailHtml, /binary, 4 bytes/);
    assert.doesNotMatch(detailHtml, new RegExp(bodyBase64));
  });

  async function startServer(config) {
    const listening = new Promise((resolve) => {
      server = createServer(config, { onListen: resolve });
    });
    await listening;
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

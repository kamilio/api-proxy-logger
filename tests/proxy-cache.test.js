import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import yaml from 'js-yaml';
import { createServer } from '../src/server.js';
import { buildSnapshotPath, extractModelFromBody, generateSnapshotKey } from '../src/snapshot.js';

async function createUpstream(handler = defaultUpstreamHandler) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      handler(req, res, { body, requests });
    });
  });

  await listen(server);
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

function defaultUpstreamHandler(req, res, { requests }) {
  res.writeHead(200, {
    'content-type': 'application/json',
    'x-upstream-count': String(requests.length),
  });
  res.end(JSON.stringify({ ok: true, count: requests.length, path: req.url }));
}

function streamingUpstreamHandler(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
  });
  res.write('data: {"chunk":1}\n\n');
  res.write('data: {"chunk":2}\n\n');
  res.end('data: [DONE]\n\n');
}

function brokenStreamingUpstreamHandler(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
  });
  res.write('data: {"chunk":1}\n\n');
  res.destroy(new Error('stream interrupted'));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function createProxy(config) {
  return new Promise((resolve) => {
    createServer({ port: 0, ...config }, { onListen: resolve });
  });
}

async function writeConfig(testDir, values = {}) {
  const lines = ['enabled: true'];
  if (Object.prototype.hasOwnProperty.call(values, 'cache')) {
    lines.push(`cache: ${values.cache}`);
  }
  if (values.snapshotDir) {
    lines.push(`snapshot_dir: ${JSON.stringify(values.snapshotDir)}`);
  }
  await writeFile(join(testDir, 'config.yaml'), `${lines.join('\n')}\n`, 'utf8');
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readProviderLogs(outputDir, provider = 'test') {
  const providerDir = join(outputDir, provider);
  const filenames = (await readdir(providerDir)).filter((file) => file.endsWith('.yaml')).sort();
  return Promise.all(
    filenames.map(async (filename) => yaml.load(await readFile(join(providerDir, filename), 'utf8')))
  );
}

async function waitForProviderLogs(outputDir, count, provider = 'test') {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const logs = await readProviderLogs(outputDir, provider);
    if (logs.length >= count) return logs;
    await delay(10);
  }
  return readProviderLogs(outputDir, provider);
}

function snapshotPathFor({ snapshotDir, method = 'POST', url, body }) {
  const key = generateSnapshotKey({ method, url, body });
  const model = extractModelFromBody(body);
  return {
    key,
    path: buildSnapshotPath(snapshotDir, { url, model, key }),
  };
}

describe('proxy snapshot cache', () => {
  let testDir;
  let snapshotDir;
  let originalEnv;
  const servers = [];

  beforeEach(async () => {
    originalEnv = { ...process.env };
    testDir = await mkdtemp(join(tmpdir(), 'api-proxy-logger-proxy-cache-'));
    snapshotDir = join(testDir, '.snapshots');
    process.env.LLM_DEBUGGER_HOME = testDir;
  });

  afterEach(async () => {
    while (servers.length > 0) {
      await close(servers.pop());
    }
    process.env = originalEnv;
    await rm(testDir, { recursive: true, force: true });
  });

  it('leaves cache off when config and header are off', async () => {
    await writeConfig(testDir, { cache: false, snapshotDir });
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const outputDir = join(testDir, 'logs');
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir,
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'cache-test', messages: [{ role: 'user', content: 'off' }] });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(await exists(snapshotDir), false);

    const [log] = await readProviderLogs(outputDir);
    assert.strictEqual(Object.hasOwn(log, 'cache_key'), false);
    assert.strictEqual(Object.hasOwn(log, 'cache_hit'), false);
  });

  it('records a config-enabled cache miss and serves the second identical request from snapshot', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const outputDir = join(testDir, 'logs');
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir,
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Cache Model', messages: [{ role: 'user', content: 'hit me' }] });
    const targetUrl = `${upstream.url}/v1/chat`;
    const expected = snapshotPathFor({ snapshotDir, url: targetUrl, body });
    const request = () =>
      fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret' },
        body,
      });

    assert.deepStrictEqual(await readJson(await request()), { ok: true, count: 1, path: '/v1/chat' });
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(await exists(expected.path), true);

    const snapshot = JSON.parse(await readFile(expected.path, 'utf8'));
    assert.strictEqual(snapshot.key, expected.key);
    assert.strictEqual(snapshot.request.headers.authorization, 'api_key_provided');
    assert.deepStrictEqual(snapshot.response.body, { ok: true, count: 1, path: '/v1/chat' });

    assert.deepStrictEqual(await readJson(await request()), { ok: true, count: 1, path: '/v1/chat' });
    assert.strictEqual(upstream.requests.length, 1);

    const logs = await waitForProviderLogs(outputDir, 2);
    assert.deepStrictEqual(
      logs.map((log) => ({ cache_key: log.cache_key, cache_hit: log.cache_hit })),
      [
        { cache_key: expected.key, cache_hit: false },
        { cache_key: expected.key, cache_hit: true },
      ]
    );
  });

  it('honors llm-debugger-cache false over enabled config', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'cache-test', prompt: 'header false' });
    for (let index = 0; index < 2; index += 1) {
      const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'llm-debugger-cache': 'false',
        },
        body,
      });
      assert.strictEqual(response.status, 200);
    }

    assert.strictEqual(upstream.requests.length, 2);
    assert.strictEqual(await exists(snapshotDir), false);
  });

  it('honors llm-debugger-cache true over disabled config', async () => {
    await writeConfig(testDir, { cache: false, snapshotDir });
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Header Cache', prompt: 'header true' });
    const targetUrl = `${upstream.url}/v1/chat`;
    const expected = snapshotPathFor({ snapshotDir, url: targetUrl, body });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'llm-debugger-cache': 'true',
      },
      body,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(await exists(expected.path), true);
  });

  it('caches JSON streaming requests and replays the stream body as one response body', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const upstream = await createUpstream(streamingUpstreamHandler);
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Stream Model', stream: true, messages: [{ role: 'user', content: 'go' }] });
    const targetUrl = `${upstream.url}/v1/chat`;
    const expected = snapshotPathFor({ snapshotDir, url: targetUrl, body });
    const request = () =>
      fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });

    const firstBody = await (await request()).text();
    assert.strictEqual(firstBody, 'data: {"chunk":1}\n\ndata: {"chunk":2}\n\ndata: [DONE]\n\n');
    assert.strictEqual(upstream.requests.length, 1);

    const snapshot = JSON.parse(await readFile(expected.path, 'utf8'));
    assert.strictEqual(snapshot.response.is_streaming, true);
    assert.strictEqual(snapshot.response.body, firstBody);

    const secondBody = await (await request()).text();
    assert.strictEqual(secondBody, firstBody);
    assert.strictEqual(upstream.requests.length, 1);
  });

  it('uses llm-debugger-url override in the snapshot key and target path', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const configuredUpstream = await createUpstream();
    const overrideUpstream = await createUpstream();
    servers.push(configuredUpstream.server, overrideUpstream.server);
    const proxy = await createProxy({
      targetUrl: configuredUpstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Override Model', prompt: 'different target' });
    const overrideTargetUrl = `${overrideUpstream.url}/v1/chat`;
    const expected = snapshotPathFor({ snapshotDir, url: overrideTargetUrl, body });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'llm-debugger-url': overrideUpstream.url,
      },
      body,
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(configuredUpstream.requests.length, 0);
    assert.strictEqual(overrideUpstream.requests.length, 1);
    assert.strictEqual(overrideUpstream.requests[0].url, '/v1/chat');
    assert.strictEqual(await exists(expected.path), true);
  });

  it('stores filtered headers and binary responses without leaking credentials', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const upstream = await createUpstream((req, res) => {
      const body = Buffer.from([0, 1, 2, 255]);
      res.writeHead(201, {
        'content-type': 'application/octet-stream',
        'content-length': String(body.length),
        connection: 'close',
        'x-kept-response-header': 'yes',
      });
      res.end(body);
    });
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Binary Model', prompt: 'bytes' });
    const targetUrl = `${upstream.url}/v1/binary`;
    const expected = snapshotPathFor({ snapshotDir, url: targetUrl, body });
    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/binary`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer secret',
        'x-api-key': 'secret',
        connection: 'keep-alive',
        te: 'trailers',
        'llm-debugger-cache': 'true',
      },
      body,
    });

    assert.strictEqual(response.status, 201);
    assert.deepStrictEqual([...new Uint8Array(await response.arrayBuffer())], [0, 1, 2, 255]);

    const snapshot = JSON.parse(await readFile(expected.path, 'utf8'));
    assert.strictEqual(snapshot.request.headers.authorization, 'api_key_provided');
    assert.strictEqual(snapshot.request.headers['x-api-key'], 'api_key_provided');
    assert.strictEqual(Object.hasOwn(snapshot.request.headers, 'connection'), false);
    assert.strictEqual(Object.hasOwn(snapshot.request.headers, 'te'), false);
    assert.strictEqual(Object.hasOwn(snapshot.request.headers, 'llm-debugger-cache'), false);
    assert.strictEqual(snapshot.response.status, 201);
    assert.strictEqual(snapshot.response.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(snapshot.response.headers['x-kept-response-header'], 'yes');
    assert.strictEqual(Object.hasOwn(snapshot.response.headers, 'content-length'), false);
    assert.strictEqual(Object.hasOwn(snapshot.response.headers, 'content-encoding'), false);
    assert.strictEqual(Object.hasOwn(snapshot.response.headers, 'connection'), false);
    assert.strictEqual(snapshot.response.body_base64, Buffer.from([0, 1, 2, 255]).toString('base64'));
    assert.strictEqual(snapshot.response.is_binary, true);
    assert.strictEqual(snapshot.response.is_streaming, false);

    const cachedResponse = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/binary`, {
      method: 'POST',
      headers: { 'llm-debugger-cache': 'true' },
      body,
    });
    assert.strictEqual(cachedResponse.status, 201);
    assert.deepStrictEqual([...new Uint8Array(await cachedResponse.arrayBuffer())], [0, 1, 2, 255]);
    assert.strictEqual(upstream.requests.length, 1);
  });

  it('does not record a streaming snapshot when the upstream stream fails partway', async () => {
    await writeConfig(testDir, { cache: true, snapshotDir });
    const upstream = await createUpstream(brokenStreamingUpstreamHandler);
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'test',
      outputDir: join(testDir, 'logs'),
    });
    servers.push(proxy);

    const body = JSON.stringify({ model: 'Broken Stream Model', stream: true, prompt: 'fail' });
    const targetUrl = `${upstream.url}/v1/chat`;
    const expected = snapshotPathFor({ snapshotDir, url: targetUrl, body });

    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.strictEqual(response.status, 502);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(await exists(expected.path), false);
  });
});

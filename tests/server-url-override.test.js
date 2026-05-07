import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from '../src/server.js';

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

async function createUpstream() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await listen(server);
  return { server, requests, url: `http://127.0.0.1:${server.address().port}` };
}

async function createProxy(config) {
  return new Promise((resolve) => {
    createServer({ port: 0, ...config }, { onListen: resolve });
  });
}

async function readJson(response) {
  return JSON.parse(await response.text());
}

describe('server URL header override', () => {
  let testDir;
  let originalEnv;
  const servers = [];

  beforeEach(() => {
    originalEnv = { ...process.env };
    testDir = join(tmpdir(), `llm-debugger-url-override-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'config.yaml'), 'enabled: false\n', 'utf-8');
    process.env.LLM_DEBUGGER_HOME = testDir;
  });

  afterEach(async () => {
    while (servers.length > 0) {
      await close(servers.pop());
    }
    process.env = originalEnv;
    rmSync(testDir, { recursive: true, force: true });
  });

  it('routes to llm-debugger-url instead of configured target and strips debugger headers', async () => {
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: 'http://127.0.0.1:1',
      hasExplicitTarget: true,
      provider: 'configured-target',
      outputDir: testDir,
      proxyHeaders: { 'x-proxy-header': 'should-not-forward' },
    });
    servers.push(proxy);

    const response = await fetch(
      `http://127.0.0.1:${proxy.address().port}/v1/chat/completions?foo=bar`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'llm-debugger-url': upstream.url,
          'llm-debugger-cache': 'false',
        },
        body: JSON.stringify({ model: 'test' }),
      }
    );

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(await readJson(response), { ok: true });
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(upstream.requests[0].url, '/v1/chat/completions?foo=bar');
    assert.strictEqual(upstream.requests[0].headers.authorization, 'Bearer token');
    assert.strictEqual(upstream.requests[0].headers['llm-debugger-url'], undefined);
    assert.strictEqual(upstream.requests[0].headers['llm-debugger-cache'], undefined);
    assert.strictEqual(upstream.requests[0].headers['x-proxy-header'], undefined);
  });

  it('treats __proxy__ paths as relative to the override URL', async () => {
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: null,
      hasExplicitTarget: false,
      provider: 'aliases-only',
      outputDir: testDir,
    });
    servers.push(proxy);

    const response = await fetch(
      `http://127.0.0.1:${proxy.address().port}/__proxy__/missing/v1/messages?x=1`,
      {
        headers: {
          'llm-debugger-url': upstream.url,
        },
      }
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(upstream.requests[0].url, '/__proxy__/missing/v1/messages?x=1');
  });

  it('appends the proxy path to an override URL with a base path', async () => {
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: 'http://127.0.0.1:1',
      hasExplicitTarget: true,
      provider: 'configured-target',
      outputDir: testDir,
    });
    servers.push(proxy);

    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/chat/completions`, {
      headers: {
        'llm-debugger-url': `${upstream.url}/v1`,
      },
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(upstream.requests[0].url, '/v1/chat/completions');
  });

  it('strips debugger headers case-insensitively before forwarding', async () => {
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: 'http://127.0.0.1:1',
      hasExplicitTarget: true,
      provider: 'configured-target',
      outputDir: testDir,
    });
    servers.push(proxy);

    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/messages`, {
      headers: {
        'LLM-Debugger-URL': upstream.url,
        'LLM-Debugger-Cache': 'false',
        'x-request-id': 'case-test',
      },
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(upstream.requests.length, 1);
    assert.strictEqual(upstream.requests[0].headers['llm-debugger-url'], undefined);
    assert.strictEqual(upstream.requests[0].headers['llm-debugger-cache'], undefined);
    assert.strictEqual(upstream.requests[0].headers['x-request-id'], 'case-test');
  });

  it('returns HTTP 400 JSON for invalid override URLs before proxying', async () => {
    const upstream = await createUpstream();
    servers.push(upstream.server);
    const proxy = await createProxy({
      targetUrl: upstream.url,
      hasExplicitTarget: true,
      provider: 'configured-target',
      outputDir: testDir,
    });
    servers.push(proxy);

    const response = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat/completions`, {
      headers: {
        'llm-debugger-url': 'not a url',
      },
    });

    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(await readJson(response), {
      error: 'Invalid override URL',
      message: 'llm-debugger-url must be a valid http or https URL',
    });
    assert.strictEqual(upstream.requests.length, 0);
  });
});

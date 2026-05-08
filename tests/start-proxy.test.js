import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('startProxy SDK', () => {
  let tmpDir;
  let target;
  let targetPort;
  let lastRequest;

  before(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'llm-debugger-sdk-'));

    target = http.createServer((req, res) => {
      lastRequest = { url: req.url, headers: req.headers };
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
    await new Promise((resolve) => target.listen(0, '127.0.0.1', resolve));
    targetPort = target.address().port;
  });

  after(() => {
    target?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('proxies requests to the target URL', async () => {
    const { startProxy } = await import(`../src/index.js?t=${Date.now()}`);
    const proxy = await startProxy({
      target: `http://127.0.0.1:${targetPort}`,
      host: '127.0.0.1',
    });

    try {
      assert.match(proxy.url, /^http:\/\/127\.0\.0\.1:\d+$/);
      assert.strictEqual(typeof proxy.port, 'number');
      assert.ok(proxy.server);

      const res = await fetch(`${proxy.url}/v1/test`);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(await res.json(), { ok: true, path: '/v1/test' });
    } finally {
      await proxy.stop();
    }
  });

  it('routes requests through aliases without any config file', async () => {
    const cwd = mkdtempSync(join(tmpDir, 'proj-'));
    const { startProxy } = await import(`../src/index.js?t=${Date.now()}`);

    const proxy = await startProxy({
      cwd,
      host: '127.0.0.1',
      aliases: {
        upstream: {
          url: `http://127.0.0.1:${targetPort}`,
          headers: { 'x-alias-header': 'hello' },
        },
      },
      defaultAlias: 'upstream',
    });

    try {
      const res = await fetch(`${proxy.url}/__proxy__/upstream/v1/foo`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(lastRequest.headers['x-alias-header'], 'hello');

      assert.ok(!existsSync(join(cwd, 'llm-debugger.config.yaml')));
      assert.ok(!existsSync(join(cwd, '.llm-debugger', 'config.yaml')));
    } finally {
      await proxy.stop();
    }
  });

  it('throws when no target and no aliases are provided', async () => {
    const { startProxy } = await import(`../src/index.js?t=${Date.now()}`);
    await assert.rejects(startProxy({ host: '127.0.0.1' }), /target or options\.aliases/);
  });

  it('stop() closes the server', async () => {
    const { startProxy } = await import(`../src/index.js?t=${Date.now()}`);
    const proxy = await startProxy({
      target: `http://127.0.0.1:${targetPort}`,
      host: '127.0.0.1',
    });

    await proxy.stop();
    await assert.rejects(fetch(`${proxy.url}/v1/test`));
  });

  it('does not write a config file in cwd', async () => {
    const cwd = mkdtempSync(join(tmpDir, 'proj-'));
    const { startProxy } = await import(`../src/index.js?t=${Date.now()}`);
    const proxy = await startProxy({
      cwd,
      target: `http://127.0.0.1:${targetPort}`,
      host: '127.0.0.1',
    });

    try {
      assert.ok(!existsSync(join(cwd, 'llm-debugger.config.yaml')));
      assert.ok(!existsSync(join(cwd, '.llm-debugger', 'config.yaml')));
    } finally {
      await proxy.stop();
    }
  });
});

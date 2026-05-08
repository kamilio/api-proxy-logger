import { join, resolve } from 'node:path';
import { createServer } from './server.js';
import { setRuntimeConfig } from './config.js';
import { findAvailablePort, parsePortSpec } from './ports.js';
import { resolveAliasConfig } from './aliases.js';

export { createServer } from './server.js';

export async function startProxy(options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();

  const runtimeConfig = {
    enabled: options.enabled ?? true,
    env: options.env ?? {},
    ignore_routes: options.ignoreRoutes ?? [],
    hide_from_viewer: options.hideFromViewer ?? [],
    default_alias: options.defaultAlias ?? null,
    aliases: options.aliases ?? {},
    max_logs: options.maxLogs ?? 100,
    cache: options.cache ?? true,
    snapshot_dir: options.snapshotDir ? resolve(options.snapshotDir) : null,
    editor: null,
  };

  const targetInfo = resolveTarget(options.target, runtimeConfig);
  if (!targetInfo.targetUrl && !runtimeConfig.default_alias && Object.keys(runtimeConfig.aliases).length === 0) {
    throw new Error('startProxy requires options.target or options.aliases');
  }

  const host = options.host ?? 'localhost';
  const portSpec = parsePortSpec(String(options.port ?? '8000-8100'));
  const port = await findAvailablePort(host, portSpec);
  const logsDir = options.logsDir
    ? resolve(options.logsDir)
    : join(cwd, '.llm-debugger', 'logs');

  setRuntimeConfig(runtimeConfig);

  const config = {
    host,
    port,
    outputDir: logsDir,
    targetUrl: targetInfo.targetUrl,
    provider: targetInfo.provider,
    aliases: runtimeConfig.aliases,
    proxyHeaders: targetInfo.proxyHeaders,
    targetAlias: targetInfo.targetAlias,
    hasExplicitTarget: targetInfo.hasExplicitTarget,
  };

  return new Promise((resolveStart, reject) => {
    let server;
    const onError = (err) => {
      setRuntimeConfig(null);
      reject(err);
    };
    try {
      server = createServer(config, {
        onListen: () => {
          server.off('error', onError);
          resolveStart({
            url: `http://${host}:${port}`,
            port,
            host,
            server,
            stop: () =>
              new Promise((res, rej) => {
                server.close((err) => {
                  setRuntimeConfig(null);
                  if (err) rej(err);
                  else res();
                });
              }),
          });
        },
      });
      server.on('error', onError);
    } catch (err) {
      setRuntimeConfig(null);
      reject(err);
    }
  });
}

function resolveTarget(target, runtimeConfig) {
  if (!target) {
    if (runtimeConfig.default_alias) {
      const aliasConfig = resolveAliasConfig(runtimeConfig.aliases, runtimeConfig.default_alias);
      if (!aliasConfig) {
        throw new Error(`default_alias "${runtimeConfig.default_alias}" not found in aliases`);
      }
      return {
        targetUrl: aliasConfig.url,
        provider: runtimeConfig.default_alias,
        proxyHeaders: aliasConfig.headers,
        targetAlias: null,
        hasExplicitTarget: false,
      };
    }
    return {
      targetUrl: null,
      provider: 'aliases-only',
      proxyHeaders: null,
      targetAlias: null,
      hasExplicitTarget: false,
    };
  }

  const aliasConfig = resolveAliasConfig(runtimeConfig.aliases, target);
  if (aliasConfig) {
    return {
      targetUrl: aliasConfig.url,
      provider: target,
      proxyHeaders: aliasConfig.headers,
      targetAlias: target,
      hasExplicitTarget: true,
    };
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    throw new Error(`target must be a URL or known alias name (got "${target}")`);
  }
  return {
    targetUrl: parsed.toString(),
    provider: parsed.hostname || 'unknown',
    proxyHeaders: null,
    targetAlias: null,
    hasExplicitTarget: true,
  };
}

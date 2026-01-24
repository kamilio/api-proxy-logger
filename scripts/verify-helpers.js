import { once } from 'node:events';
import { createServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { getLogsDir } from '../src/paths.js';

function resolveTargetUrl() {
  const targetUrl = process.env.TARGET_URL;
  if (!targetUrl) {
    throw new Error('TARGET_URL is required. Use --target <url>.');
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error('TARGET_URL must be a valid URL (e.g. https://api.openai.com)');
  }

  let resolvedTargetUrl = targetUrl;
  if (process.env.TARGET_PORT) {
    const targetPort = Number.parseInt(process.env.TARGET_PORT, 10);
    if (!Number.isFinite(targetPort) || targetPort <= 0 || targetPort > 65535) {
      throw new Error('TARGET_PORT must be a valid TCP port (1-65535)');
    }
    parsedTarget.port = String(targetPort);
    resolvedTargetUrl = parsedTarget.toString();
  }

  return {
    resolvedTargetUrl,
    providerLabel: parsedTarget.hostname || parsedTarget.host || 'unknown',
  };
}

function resolveProxyHost() {
  const rawHost = process.env.PROXY_HOST || '127.0.0.1';
  if (rawHost === '0.0.0.0' || rawHost === '::') {
    return { host: rawHost, urlHost: '127.0.0.1' };
  }
  return { host: rawHost, urlHost: rawHost };
}

function buildVerifyConfig() {
  const fileConfig = loadConfig();
  const { resolvedTargetUrl, providerLabel } = resolveTargetUrl();
  const { host } = resolveProxyHost();

  return {
    host,
    port: 0,
    outputDir: getLogsDir(),
    targetUrl: resolvedTargetUrl,
    provider: providerLabel,
    aliases: fileConfig.aliases,
  };
}

export async function startVerifyServer() {
  const { urlHost } = resolveProxyHost();
  const config = buildVerifyConfig();
  const server = createServer(config);
  await once(server, 'listening');

  const address = server.address();
  const port = typeof address === 'string' ? null : address?.port;
  if (!port) {
    throw new Error('Unable to determine the random proxy port.');
  }

  return {
    server,
    proxyUrl: `http://${urlHost}:${port}`,
  };
}

export async function stopVerifyServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

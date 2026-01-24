import { loadConfig } from './config.js';
import { getLogsDir } from './paths.js';
import { findAvailablePort, parsePortSpec } from './ports.js';

export async function buildServerConfig() {
  const fileConfig = loadConfig();

  const proxyHost = process.env.PROXY_HOST || 'localhost';

  const proxyPortSpec = process.env.PROXY_PORT || '8000-8010';
  const portSpec = parsePortSpec(proxyPortSpec);
  const portNumber = await findAvailablePort(proxyHost, portSpec);

  const targetUrl = process.env.TARGET_URL;
  if (!targetUrl) {
    throw new Error('TARGET_URL is required. Use --target <url>.');
  }

  let resolvedTargetUrl = targetUrl;
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    throw new Error('TARGET_URL must be a valid URL (e.g. https://api.openai.com)');
  }

  if (process.env.TARGET_PORT) {
    const targetPort = parseInt(process.env.TARGET_PORT, 10);
    if (!Number.isFinite(targetPort) || targetPort <= 0 || targetPort > 65535) {
      throw new Error('TARGET_PORT must be a valid TCP port (1-65535)');
    }
    parsedTarget.port = String(targetPort);
    resolvedTargetUrl = parsedTarget.toString();
  }

  const providerLabel = parsedTarget.hostname || parsedTarget.host || 'unknown';

  const config = {
    host: proxyHost,
    port: portNumber,
    outputDir: getLogsDir(),
    targetUrl: resolvedTargetUrl,
    provider: providerLabel,
    aliases: fileConfig.aliases,
  };

  return {
    config,
    fileConfig,
    proxyHost,
    portNumber,
    resolvedTargetUrl,
    providerLabel,
  };
}

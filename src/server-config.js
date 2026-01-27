import { loadConfig } from './config.js';
import { getLogsDir } from './paths.js';
import { findAvailablePort, parsePortSpec } from './ports.js';
import { resolveAliasConfig } from './aliases.js';

export async function buildServerConfig() {
  const fileConfig = loadConfig();

  const proxyHost = process.env.PROXY_HOST || 'localhost';

  const proxyPortSpec = process.env.PROXY_PORT || '8000-8010';
  const portSpec = parsePortSpec(proxyPortSpec);
  const portNumber = await findAvailablePort(proxyHost, portSpec);

  const targetUrl = process.env.TARGET_URL;
  const defaultAlias = fileConfig.default_alias;
  const hasAliases = fileConfig.aliases && Object.keys(fileConfig.aliases).length > 0;

  // Target is optional if aliases are configured
  if (!targetUrl && !hasAliases && !defaultAlias) {
    throw new Error(
      'Provide --target or configure aliases via:\n' +
      '  llm-debugger config add-alias <alias> <url>'
    );
  }

  let resolvedTargetUrl = null;
  let providerLabel = 'aliases-only';
  let proxyHeaders = null;

  const applyTargetPortOverride = (parsedTarget) => {
    if (!process.env.TARGET_PORT) return;
    const targetPort = parseInt(process.env.TARGET_PORT, 10);
    if (!Number.isFinite(targetPort) || targetPort <= 0 || targetPort > 65535) {
      throw new Error('TARGET_PORT must be a valid TCP port (1-65535)');
    }
    parsedTarget.port = String(targetPort);
  };

  if (targetUrl) {
    const aliasConfig = resolveAliasConfig(fileConfig.aliases, targetUrl);
    if (aliasConfig) {
      const parsedTarget = new URL(aliasConfig.url);
      applyTargetPortOverride(parsedTarget);
      resolvedTargetUrl = parsedTarget.toString();
      providerLabel = targetUrl;
      proxyHeaders = aliasConfig.headers;
    } else {
      let parsedTarget;
      try {
        parsedTarget = new URL(targetUrl);
      } catch {
        if (targetUrl.includes('://')) {
          throw new Error('TARGET_URL must be a valid URL (e.g. https://api.openai.com)');
        }
        throw new Error(
          `Unknown alias "${targetUrl}". Provide a URL (e.g. https://api.openai.com) or add the alias first.`
        );
      }
      applyTargetPortOverride(parsedTarget);
      resolvedTargetUrl = parsedTarget.toString();
      providerLabel = parsedTarget.hostname || parsedTarget.host || 'unknown';
    }
  } else if (defaultAlias) {
    const aliasConfig = resolveAliasConfig(fileConfig.aliases, defaultAlias);
    if (!aliasConfig) {
      throw new Error(`Default alias "${defaultAlias}" not found.`);
    }
    const parsedTarget = new URL(aliasConfig.url);
    applyTargetPortOverride(parsedTarget);
    resolvedTargetUrl = parsedTarget.toString();
    providerLabel = defaultAlias;
    proxyHeaders = aliasConfig.headers;
  }

  const config = {
    host: proxyHost,
    port: portNumber,
    outputDir: getLogsDir(),
    targetUrl: resolvedTargetUrl,
    provider: providerLabel,
    aliases: fileConfig.aliases,
    proxyHeaders,
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

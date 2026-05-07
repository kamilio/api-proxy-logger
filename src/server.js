import express from 'express';
import { createProxyHandler, createStreamingProxyHandler } from './proxy.js';
import { parseAliasPath, resolveAliasConfig } from './aliases.js';
import { loadConfig, shouldIgnoreRoute } from './config.js';
import { createViewerRouter } from './routes/viewer.js';
import { sendJsonError } from './response.js';

const URL_OVERRIDE_HEADER = 'llm-debugger-url';
const CACHE_OVERRIDE_HEADER = 'llm-debugger-cache';

export function resolveOverrides(req) {
  const headers = req?.headers || {};
  const urlValue = getHeaderValue(headers, URL_OVERRIDE_HEADER);
  const cacheValue = getHeaderValue(headers, CACHE_OVERRIDE_HEADER);
  const cleanedHeaders = Object.fromEntries(
    Object.entries(headers).filter(([key]) => {
      const normalizedKey = key.toLowerCase();
      return normalizedKey !== URL_OVERRIDE_HEADER && normalizedKey !== CACHE_OVERRIDE_HEADER;
    })
  );

  return {
    urlOverride: resolveUrlOverride(urlValue),
    cacheOverride: resolveCacheOverride(cacheValue),
    cleanedHeaders,
  };
}

function getHeaderValue(headers, headerName) {
  if (Object.prototype.hasOwnProperty.call(headers, headerName)) {
    return headers[headerName];
  }

  const matchingEntry = Object.entries(headers).find(([key]) => key.toLowerCase() === headerName);
  return matchingEntry?.[1];
}

export function createServer(config, { onListen } = {}) {
  const app = express();

  // Parse raw body for all requests (needed for proxying)
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Viewer route - must come before the catch-all proxy
  app.use('/__viewer__', createViewerRouter(config));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', target: config.targetUrl });
  });

  // Proxy requests to configured base target
  const handleProxy = async (req, res) => {
    let overrides;
    try {
      overrides = resolveOverrides(req);
    } catch (error) {
      if (error?.status === 400 && error.body) {
        res.status(400).json(error.body);
        return;
      }
      throw error;
    }

    req.headers = overrides.cleanedHeaders;
    const proxyPath = getProxyPath(req);
    const proxyUrl = new URL(proxyPath, 'http://proxy.local');

    const runtimeConfig = loadConfig();
    const runtimeAliases = runtimeConfig.aliases || {};
    const runtimeDefaultAlias = runtimeConfig.default_alias;

    let proxyPathname = proxyUrl.pathname;
    let targetBaseUrl = config.targetUrl;
    let targetPath = proxyPath;
    let proxyHeaders = config.proxyHeaders || null;
    let providerLabel = config.provider;

    if (overrides.urlOverride) {
      new URL(overrides.urlOverride);
      targetBaseUrl = overrides.urlOverride;
      proxyHeaders = null;
      providerLabel = 'header-override';
    } else {
      const aliasInfo = parseAliasPath(proxyUrl.pathname);
      if (proxyUrl.pathname.startsWith('/__proxy__/') && !aliasInfo) {
        res.status(404).json({ error: 'Unknown alias' });
        return;
      }

      if (aliasInfo) {
        const aliasConfig = resolveAliasConfig(runtimeAliases, aliasInfo.alias);
        if (!aliasConfig) {
          res.status(404).json({ error: 'Unknown alias' });
          return;
        }
        proxyPathname = aliasInfo.path;
        targetBaseUrl = aliasConfig.url;
        targetPath = `${aliasInfo.path}${proxyUrl.search}${proxyUrl.hash}`;
        proxyHeaders = aliasConfig.headers;
        providerLabel = aliasInfo.alias;
      } else {
        const resolved = resolveRootTarget(config, runtimeAliases, runtimeDefaultAlias);
        targetBaseUrl = resolved.targetBaseUrl;
        providerLabel = resolved.providerLabel;
        proxyHeaders = resolved.proxyHeaders;
        if (!targetBaseUrl) {
          res.status(404).json({
            error: 'No target configured',
            message: 'Use /__proxy__/<alias> or configure --target',
          });
          return;
        }
      }
    }

    if (shouldIgnoreRoute(proxyPathname)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const targetUrl = buildTargetUrl(targetBaseUrl, targetPath);
    const proxyConfig = {
      ...config,
      targetUrl,
      provider: providerLabel,
      proxyHeaders,
      loggingEnabled: runtimeConfig.enabled !== false,
    };

    try {
      const isStreaming = isStreamingRequest(req);
      if (isStreaming) {
        await createStreamingProxyHandler(req, res, proxyConfig);
      } else {
        await createProxyHandler(req, res, proxyConfig);
      }
    } catch (error) {
      console.error('Proxy error:', error.message);
      const sent = sendJsonError(res, 502, { error: 'Proxy error', message: error.message });
      if (!sent && !res.writableEnded) {
        res.end();
      }
    }
  };

  // Catch-all: proxy everything else
  app.all('*', handleProxy);

  const server = app.listen(config.port, () => {
    if (typeof onListen === 'function') {
      onListen(server);
    }
  });

  return server;
}

function resolveUrlOverride(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    throwInvalidUrlOverride();
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throwInvalidUrlOverride();
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throwInvalidUrlOverride();
  }
  return value;
}

function resolveCacheOverride(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
}

function throwInvalidUrlOverride() {
  throw {
    status: 400,
    body: {
      error: 'Invalid override URL',
      message: 'llm-debugger-url must be a valid http or https URL',
    },
  };
}

function resolveRootTarget(config, aliases, defaultAlias) {
  if (config.targetAlias) {
    const aliasConfig = resolveAliasConfig(aliases, config.targetAlias);
    if (!aliasConfig) {
      return { targetBaseUrl: null, providerLabel: 'aliases-only', proxyHeaders: null };
    }
    return {
      targetBaseUrl: aliasConfig.url,
      providerLabel: config.targetAlias,
      proxyHeaders: aliasConfig.headers,
    };
  }

  if (!config.hasExplicitTarget) {
    if (!defaultAlias) {
      return { targetBaseUrl: null, providerLabel: 'aliases-only', proxyHeaders: null };
    }
    const aliasConfig = resolveAliasConfig(aliases, defaultAlias);
    if (!aliasConfig) {
      return { targetBaseUrl: null, providerLabel: 'aliases-only', proxyHeaders: null };
    }
    return {
      targetBaseUrl: aliasConfig.url,
      providerLabel: defaultAlias,
      proxyHeaders: aliasConfig.headers,
    };
  }

  return {
    targetBaseUrl: config.targetUrl,
    providerLabel: config.provider,
    proxyHeaders: config.proxyHeaders || null,
  };
}

function isStreamingRequest(req) {
  if (!req.body || req.body.length === 0) return false;

  try {
    const body = JSON.parse(req.body.toString());
    return body.stream === true;
  } catch {
    return false;
  }
}

function getProxyPath(req) {
  const originalUrl = req.originalUrl || req.url || '';
  if (!originalUrl) return '/';
  if (originalUrl.startsWith('?')) return `/${originalUrl}`;
  return originalUrl.startsWith('/') ? originalUrl : `/${originalUrl}`;
}

function buildTargetUrl(baseUrl, path) {
  try {
    const base = new URL(baseUrl);
    if (path.startsWith('/') && base.pathname && base.pathname !== '/') {
      const basePath = base.pathname.endsWith('/') ? base.pathname.slice(0, -1) : base.pathname;
      const pathUrl = new URL(path, 'http://proxy.local');
      base.pathname = `${basePath}${pathUrl.pathname}`;
      base.search = pathUrl.search;
      base.hash = pathUrl.hash;
      return base.toString();
    }
    return new URL(path, baseUrl).toString();
  } catch {
    return `${baseUrl}${path}`;
  }
}

import express from 'express';
import { createProxyHandler, createStreamingProxyHandler } from './proxy.js';
import { parseAliasPath, resolveAliasConfig } from './aliases.js';
import { shouldIgnoreRoute } from './config.js';
import { createViewerRouter } from './routes/viewer.js';

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
    const proxyPath = getProxyPath(req);
    const proxyUrl = new URL(proxyPath, 'http://proxy.local');
    const aliasInfo = parseAliasPath(proxyUrl.pathname);
    if (proxyUrl.pathname.startsWith('/__proxy__/') && !aliasInfo) {
      res.status(404).json({ error: 'Unknown alias' });
      return;
    }

    // If no target configured and not an alias request, return 404
    if (!config.targetUrl && !aliasInfo) {
      res.status(404).json({
        error: 'No target configured',
        message: 'Use /__proxy__/<alias> or configure --target',
      });
      return;
    }

    let proxyPathname = proxyUrl.pathname;
    let targetBaseUrl = config.targetUrl;
    let targetPath = proxyPath;
    let proxyHeaders = null;
    let providerLabel = config.provider;

    if (aliasInfo) {
      const aliasConfig = resolveAliasConfig(config.aliases, aliasInfo.alias);
      if (!aliasConfig) {
        res.status(404).json({ error: 'Unknown alias' });
        return;
      }
      proxyPathname = aliasInfo.path;
      targetBaseUrl = aliasConfig.url;
      targetPath = `${aliasInfo.path}${proxyUrl.search}${proxyUrl.hash}`;
      proxyHeaders = aliasConfig.headers;
      providerLabel = aliasInfo.alias;
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
      res.status(502).json({ error: 'Proxy error', message: error.message });
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

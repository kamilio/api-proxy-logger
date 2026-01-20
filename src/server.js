import express from 'express';
import { createProxyHandler, createStreamingProxyHandler } from './proxy.js';
import { shouldIgnoreRoute } from './config.js';
import { createMockHandler } from './mock-server.js';
import { createViewerRouter } from './routes/viewer.js';

export function createServer(config, { onListen } = {}) {
  const app = express();

  // Parse raw body for all requests (needed for proxying)
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Viewer route - must come before the catch-all proxy
  app.use('/viewer', createViewerRouter(config));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', target: config.targetUrl });
  });

  // Mock API routes
  app.all('/api/*', async (req, res) => {
    try {
      await createMockHandler(req, res);
    } catch (error) {
      console.error('Mock API error:', error.message);
      res.status(500).json({ error: 'Mock API error', message: error.message });
    }
  });

  // Proxy requests to configured base target
  const handleProxy = async (req, res) => {
    const proxyPath = getProxyPath(req);
    const proxyPathname = new URL(proxyPath, 'http://proxy.local').pathname;
    if (shouldIgnoreRoute(proxyPathname)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const targetUrl = buildTargetUrl(config.targetUrl, proxyPath);
    const proxyConfig = { ...config, targetUrl, provider: config.provider };

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

  app.all('/proxy', async (req, res) => {
    res.redirect(307, '/proxy/');
  });
  app.all('/proxy/', handleProxy);
  app.all('/proxy/*', handleProxy);

  // Catch-all for other routes
  app.all('*', async (req, res) => {
    if (shouldIgnoreRoute(req.path)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(404).json({ error: 'Not found' });
  });

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
  const prefix = '/proxy';
  const originalUrl = req.originalUrl || req.url || '';
  let stripped = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) : originalUrl;
  if (!stripped) stripped = '/';
  if (stripped.startsWith('?')) return `/${stripped}`;
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
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

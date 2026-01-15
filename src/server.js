import express from 'express';
import { createProxyHandler, createStreamingProxyHandler } from './proxy.js';
import { getRecentLogs } from './logger.js';
import { renderViewer } from './viewer.js';
import { shouldIgnoreRoute, shouldHideFromViewer } from './config.js';

export function createServer(config) {
  const app = express();

  // Parse raw body for all requests (needed for proxying)
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Viewer route - must come before the catch-all proxy
  app.get('/viewer', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const logs = await getRecentLogs(config.outputDir, limit);
    const processedLogs = logs.map(log => {
      try {
        const url = new URL(log.request.url);
        const hidden = shouldHideFromViewer(url.pathname);
        return { ...log, _hidden: hidden, _path: url.pathname };
      } catch {
        return { ...log, _hidden: false };
      }
    });
    const html = await renderViewer(processedLogs, limit);
    res.type('html').send(html);
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', target: config.targetUrl });
  });

  // Proxy all other requests
  app.all('*', async (req, res) => {
    // Check if route should be ignored
    if (shouldIgnoreRoute(req.path)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    try {
      const isStreaming = isStreamingRequest(req);

      if (isStreaming) {
        await createStreamingProxyHandler(req, res, config);
      } else {
        await createProxyHandler(req, res, config);
      }
    } catch (error) {
      console.error('Proxy error:', error.message);
      res.status(502).json({ error: 'Proxy error', message: error.message });
    }
  });

  app.listen(config.port, () => {
    console.log(`  Server listening on port ${config.port}\n`);
  });

  return app;
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

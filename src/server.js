import express from 'express';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import yaml from 'js-yaml';
import { createProxyHandler, createStreamingProxyHandler } from './proxy.js';
import { getRecentLogs } from './logger.js';
import { renderViewer } from './viewer.js';
import { shouldIgnoreRoute, shouldHideFromViewer } from './config.js';
import { getResponsesPath } from './paths.js';
import { API_SHAPES, extractMessage } from './mock-utils.js';
import { updateResponseMapping } from './responses-config.js';
import { createMockHandler } from './mock-server.js';

export function createServer(config, { onListen } = {}) {
  const app = express();

  // Parse raw body for all requests (needed for proxying)
  app.use(express.raw({ type: '*/*', limit: '50mb' }));

  // Viewer route - must come before the catch-all proxy
  app.get('/viewer', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const providerFilter = req.query.provider ? String(req.query.provider) : null;
    const logs = await getRecentLogs(config.outputDir, limit, providerFilter);
    const providerMeta = collectProviders(logs);
    const processedLogs = logs.map(log => {
      try {
        const url = new URL(log.request.url);
        const hidden = shouldHideFromViewer(url.pathname);
        return { ...log, _hidden: hidden, _path: url.pathname };
      } catch {
        return { ...log, _hidden: false };
      }
    });
    const providerShapes = buildProviderShapes(providerMeta);
    const html = await renderViewer(
      processedLogs,
      limit,
      providerFilter,
      providerMeta.map((provider) => provider.name),
      providerShapes,
      API_SHAPES
    );
    res.type('html').send(html);
  });

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

  app.post('/viewer/save-response', async (req, res) => {
    try {
      const payload = parseJsonBody(req.body);
      const { source_path: sourcePath, name, api_shape: apiShape } = payload || {};

      if (!sourcePath || !name || !apiShape) {
        res.status(400).json({ error: 'source_path, name, and api_shape are required' });
        return;
      }

      if (!API_SHAPES.includes(apiShape)) {
        res.status(400).json({ error: 'Invalid api_shape', api_shape: apiShape });
        return;
      }

      const saved = await saveResponseFromLog(config.outputDir, sourcePath, name, apiShape);
      res.json({ ok: true, ...saved });
    } catch (error) {
      console.error('Save response error:', error.message);
      res.status(500).json({ error: 'Save response error', message: error.message });
    }
  });

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

function parseJsonBody(body) {
  if (!body || body.length === 0) return {};
  try {
    return JSON.parse(body.toString());
  } catch {
    return {};
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

function collectProviders(logs) {
  const providerMap = new Map();
  for (const log of logs) {
    if (log?.provider && !providerMap.has(log.provider)) {
      providerMap.set(log.provider, { name: log.provider, api_shape: null });
    }
  }
  return Array.from(providerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildProviderShapes(providerMeta) {
  const shapes = {};
  for (const provider of providerMeta) {
    if (provider.api_shape) {
      shapes[provider.name] = provider.api_shape;
    }
  }
  return shapes;
}

async function saveResponseFromLog(outputDir, sourcePath, rawName, apiShape) {
  const safeName = sanitizeResponseName(rawName);
  if (!safeName) {
    throw new Error('Invalid response name');
  }

  const logsDir = resolve(outputDir);
  const resolvedSource = resolve(sourcePath.startsWith('/') ? sourcePath : join(process.cwd(), sourcePath));
  if (!resolvedSource.startsWith(logsDir)) {
    throw new Error('Source path must be within logs directory');
  }

  const responsesBase = dirname(getResponsesPath());
  const responsesDir = resolve(join(responsesBase, 'responses'));
  await mkdir(responsesDir, { recursive: true });

  const filename = safeName.endsWith('.yaml') ? safeName : `${safeName}.yaml`;
  const targetPath = join(responsesDir, filename);

  await copyFile(resolvedSource, targetPath);

  const logContent = await readFile(resolvedSource, 'utf-8');
  const logEntry = yaml.load(logContent);
  const message = extractMessage(logEntry?.request?.body, apiShape).trim();
  if (!message) {
    throw new Error('Unable to extract message from log for this api_shape');
  }

  const responsePath = `responses/${basename(targetPath)}`;
  updateResponseMapping(apiShape, message, responsePath);

  return { api_shape: apiShape, message, response_path: responsePath };
}

function sanitizeResponseName(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

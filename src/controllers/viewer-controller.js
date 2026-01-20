import { API_SHAPES } from '../mock-utils.js';
import { shouldHideFromViewer } from '../config.js';
import { renderViewer, renderViewerDetail } from '../viewer.js';
import {
  buildBackLink,
  buildProviderShapes,
  collectProviders,
  getViewerIndexData,
  loadViewerLog,
  saveResponseFromLog,
} from '../services/viewer-service.js';

export function createViewerController(config) {
  return {
    index: async (req, res) => {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const providerFilter = req.query.provider ? String(req.query.provider) : null;
      const { logs, providerMeta, providerShapes } = await getViewerIndexData(
        config.outputDir,
        limit,
        providerFilter
      );

      const processedLogs = logs.map((log) => {
        try {
          const url = new URL(log.request.url);
          const hidden = shouldHideFromViewer(url.pathname);
          return { ...log, _hidden: hidden, _path: url.pathname };
        } catch {
          return { ...log, _hidden: false };
        }
      });

      const html = await renderViewer(
        processedLogs,
        limit,
        providerFilter,
        providerMeta.map((provider) => provider.name),
        providerShapes,
        API_SHAPES
      );

      res.type('html').send(html);
    },

    detail: async (req, res) => {
      try {
        const { provider, filename } = req.params;
        const log = await loadViewerLog(config.outputDir, provider, filename);
        if (!log) {
          res.status(404).type('text').send('Not found');
          return;
        }

        if (log?.request?.url) {
          try {
            const url = new URL(log.request.url);
            if (shouldHideFromViewer(url.pathname)) {
              res.status(404).type('text').send('Not found');
              return;
            }
          } catch {
            // Ignore malformed URLs for hide checks.
          }
        }

        const providerShapes = buildProviderShapes(collectProviders([log]));
        const backLink = buildBackLink(req.query);
        const html = await renderViewerDetail(log, API_SHAPES, providerShapes, backLink);
        res.type('html').send(html);
      } catch (error) {
        console.error('Viewer detail error:', error.message);
        res.status(500).json({ error: 'Viewer detail error', message: error.message });
      }
    },

    saveResponse: async (req, res) => {
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
    },
  };
}

function parseJsonBody(body) {
  if (!body || body.length === 0) return {};
  try {
    return JSON.parse(body.toString());
  } catch {
    return {};
  }
}

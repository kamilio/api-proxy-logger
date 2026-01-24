import { shouldHideFromViewer } from '../config.js';
import { renderViewer, renderViewerDetail } from '../viewer.js';
import {
  buildBackLink,
  deleteViewerLog,
  getViewerIndexData,
  loadViewerLog,
} from '../services/viewer-service.js';
import { buildPreviewModel } from '../services/viewer-preview.js';
import {
  normalizeBaseUrlFilters,
  normalizeBaseUrlValue,
  normalizeMethodFilters,
  parseCsvParam,
} from '../viewer-filters.js';

export function createViewerController(config) {
  return {
    index: async (req, res) => {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
      const baseUrlFilters = normalizeBaseUrlFilters(parseCsvParam(req.query.baseUrl));
      const methodFilters = normalizeMethodFilters(parseCsvParam(req.query.method));
      const { logs } = await getViewerIndexData(
        config.outputDir,
        {
          limit,
          baseUrls: baseUrlFilters,
          methods: methodFilters,
        }
      );

      const processedLogs = logs.map((log) => {
        try {
          const url = new URL(log.request.url);
          const hidden = shouldHideFromViewer(url.pathname);
          return {
            ...log,
            _hidden: hidden,
            _path: url.pathname,
            _base_url: normalizeBaseUrlValue(log.request.url),
          };
        } catch {
          return {
            ...log,
            _hidden: false,
            _base_url: normalizeBaseUrlValue(log?.request?.url),
          };
        }
      });

      const html = await renderViewer(
        {
          logs: processedLogs,
          limit,
          baseUrlFilters,
          methodFilters,
        }
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

        const backLink = buildBackLink(req.query);
        const preview = buildPreviewModel(log);
        const html = await renderViewerDetail(log, backLink, preview);
        res.type('html').send(html);
      } catch (error) {
        console.error('Viewer detail error:', error.message);
        res.status(500).json({ error: 'Viewer detail error', message: error.message });
      }
    },

    delete: async (req, res) => {
      try {
        const { provider, filename } = req.params;

        // First verify the log exists and is not hidden
        const log = await loadViewerLog(config.outputDir, provider, filename);
        if (!log) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        if (log?.request?.url) {
          try {
            const url = new URL(log.request.url);
            if (shouldHideFromViewer(url.pathname)) {
              res.status(404).json({ error: 'Not found' });
              return;
            }
          } catch {
            // Ignore malformed URLs for hide checks.
          }
        }

        const result = await deleteViewerLog(config.outputDir, provider, filename);
        if (!result.success) {
          if (result.error === 'invalid_path') {
            res.status(400).json({ error: 'Invalid path' });
          } else if (result.error === 'not_found') {
            res.status(404).json({ error: 'Not found' });
          } else {
            res.status(500).json({ error: 'Delete failed' });
          }
          return;
        }

        res.status(200).json({ success: true });
      } catch (error) {
        console.error('Viewer delete error:', error.message);
        res.status(500).json({ error: 'Viewer delete error', message: error.message });
      }
    },
  };
}

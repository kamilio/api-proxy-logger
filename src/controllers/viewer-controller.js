import { shouldHideFromViewer } from '../config.js';
import { renderViewer, renderViewerDetail, renderViewerCompare } from '../viewer.js';
import {
  buildBackLink,
  buildCompareData,
  COMPARE_SECTIONS,
  deleteViewerLog,
  getViewerIndexData,
  loadViewerLog,
  parseCompareLogSelection,
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
      const { aliasByHost, aliasHostMap } = buildAliasMaps(config.aliases);
      const { logs } = await getViewerIndexData(
        config.outputDir,
        {
          limit,
          baseUrls: baseUrlFilters,
          methods: methodFilters,
          aliasHostMap,
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
          aliasByHost,
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

        const allowHidden = req.query.reveal === '1';
        if (log?.request?.url) {
          try {
            const url = new URL(log.request.url);
            if (!allowHidden && shouldHideFromViewer(url.pathname)) {
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

    compare: async (req, res) => {
      try {
        const { selections, invalid } = parseCompareLogSelection(req.query.logs);
        const backLink = buildBackLink(req.query);

        if (invalid.length || selections.length < 2) {
          const message = invalid.length
            ? 'Invalid compare selection. Choose two or three valid log entries.'
            : 'Select at least two logs to compare.';
          const html = await renderViewerCompare({
            logs: [],
            backLink,
            error: message,
            compareData: { sections: [] },
            compareSections: COMPARE_SECTIONS,
            baselineIndex: 0,
          });
          res.status(400).type('html').send(html);
          return;
        }

        const logs = await Promise.all(
          selections.map(({ provider, filename }) => loadViewerLog(config.outputDir, provider, filename))
        );

        if (logs.some((log) => !log)) {
          res.status(404).type('text').send('Not found');
          return;
        }

        for (const log of logs) {
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
        }

        const rawBaseline = parseInt(req.query.baseline, 10);
        let baselineIndex = Number.isFinite(rawBaseline) ? rawBaseline - 1 : 0;
        baselineIndex = Math.min(Math.max(0, baselineIndex), logs.length - 1);
        const compareData = buildCompareData(logs, { baselineIndex });
        const html = await renderViewerCompare({
          logs,
          backLink,
          error: null,
          compareData,
          compareSections: COMPARE_SECTIONS,
          baselineIndex,
        });
        res.type('html').send(html);
      } catch (error) {
        console.error('Viewer compare error:', error.message);
        res.status(500).json({ error: 'Viewer compare error', message: error.message });
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

        const allowHidden = req.query.reveal === '1';
        if (log?.request?.url) {
          try {
            const url = new URL(log.request.url);
            if (!allowHidden && shouldHideFromViewer(url.pathname)) {
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

function buildAliasMaps(aliases) {
  const aliasByHost = {};
  const aliasHostMap = {};
  if (!aliases || typeof aliases !== 'object') {
    return { aliasByHost, aliasHostMap };
  }

  for (const [aliasName, entry] of Object.entries(aliases)) {
    if (!entry || typeof entry !== 'object') continue;
    const hostname = normalizeBaseUrlValue(entry.url);
    if (!hostname) continue;
    const normalizedAlias = String(aliasName).toLowerCase();
    aliasHostMap[normalizedAlias] = hostname;
    if (!aliasByHost[hostname]) {
      aliasByHost[hostname] = aliasName;
    }
  }

  return { aliasByHost, aliasHostMap };
}

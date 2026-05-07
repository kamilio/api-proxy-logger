import { basename, dirname, join } from 'node:path';
import { loadConfig } from '../config.js';
import { deleteSnapshot, listSnapshots, loadSnapshot, resolveSnapshotDir } from '../snapshot.js';
import { renderViewerSnapshotDetail, renderViewerSnapshots } from '../viewer.js';

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export function createSnapshotController(config = {}) {
  return {
    index: async (req, res) => {
      try {
        const snapshotDir = getSnapshotDir(config);
        const groups = await buildSnapshotGroups(snapshotDir);
        const html = await renderViewerSnapshots({ groups });
        res.type('html').send(html);
      } catch (error) {
        console.error('Viewer snapshots error:', error.message);
        res.status(500).json({ error: 'Viewer snapshots error', message: error.message });
      }
    },

    detail: async (req, res) => {
      try {
        const snapshotPath = resolveParamSnapshotPath(getSnapshotDir(config), req.params);
        if (!snapshotPath) {
          res.status(404).type('text').send('Not found');
          return;
        }

        const snapshot = await loadSnapshot(snapshotPath);
        if (!snapshot) {
          res.status(404).type('text').send('Not found');
          return;
        }

        const html = await renderViewerSnapshotDetail({
          snapshot,
          host: req.params.host,
          model: req.params.model,
          key: req.params.key,
        });
        res.type('html').send(html);
      } catch (error) {
        console.error('Viewer snapshot detail error:', error.message);
        res.status(500).json({ error: 'Viewer snapshot detail error', message: error.message });
      }
    },

    delete: async (req, res) => {
      try {
        const snapshotPath = resolveParamSnapshotPath(getSnapshotDir(config), req.params);
        if (!snapshotPath) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        const deleted = await deleteSnapshot(snapshotPath);
        if (!deleted) {
          res.status(404).json({ error: 'Not found' });
          return;
        }

        res.status(204).end();
      } catch (error) {
        console.error('Viewer snapshot delete error:', error.message);
        res.status(500).json({ error: 'Viewer snapshot delete error', message: error.message });
      }
    },
  };
}

function getSnapshotDir(config) {
  const runtimeConfig = loadConfig();
  return resolveSnapshotDir({
    ...config,
    ...runtimeConfig,
    snapshot_dir: runtimeConfig.snapshot_dir || config.snapshot_dir,
  });
}

async function buildSnapshotGroups(snapshotDir) {
  const summaries = await listSnapshots(snapshotDir);
  const groupMap = new Map();

  for (const summary of summaries) {
    const route = getRouteParts(summary.path);
    const displaySummary = {
      ...summary,
      routeHost: route.host,
      routeModel: route.model,
      routeKey: route.key,
    };
    const hostPath = summary.host;
    const modelName = summary.model;

    if (!groupMap.has(hostPath)) {
      groupMap.set(hostPath, { hostPath, models: [], modelMap: new Map() });
    }

    const group = groupMap.get(hostPath);
    if (!group.modelMap.has(modelName)) {
      const model = { name: modelName, snapshots: [] };
      group.modelMap.set(modelName, model);
      group.models.push(model);
    }

    group.modelMap.get(modelName).snapshots.push(displaySummary);
  }

  return Array.from(groupMap.values()).map(({ hostPath, models }) => ({
    hostPath,
    models,
  }));
}

function getRouteParts(snapshotPath) {
  const modelDir = dirname(snapshotPath);
  const hostDir = dirname(modelDir);
  return {
    host: basename(hostDir),
    model: basename(modelDir),
    key: basename(snapshotPath, '.json'),
  };
}

function resolveParamSnapshotPath(snapshotDir, params) {
  const { host, model, key } = params;
  if (!isSafeSegment(host) || !isSafeSegment(model) || !isSafeSegment(key)) {
    return null;
  }
  return join(snapshotDir, host, model, `${key}.json`);
}

function isSafeSegment(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    SAFE_SEGMENT_PATTERN.test(value)
  );
}

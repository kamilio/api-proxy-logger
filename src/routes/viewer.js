import express from 'express';
import { createViewerController } from '../controllers/viewer-controller.js';
import { createSettingsController } from '../controllers/settings-controller.js';
import { createSnapshotController } from '../controllers/snapshot-controller.js';

export function createViewerRouter(config) {
  const router = express.Router();
  const controller = createViewerController(config);
  const settingsController = createSettingsController(config);
  const snapshotController = createSnapshotController(config);

  router.get('/', controller.index);
  router.get('/compare', controller.compare);
  router.get('/settings', settingsController.index);
  router.get('/snapshots', snapshotController.index);
  router.get('/snapshots/:host/:model/:key', snapshotController.detail);
  router.delete('/snapshots/:host/:model/:key', snapshotController.delete);
  router.post('/api/settings', express.json(), settingsController.updateSetting);
  router.post('/api/aliases', express.json(), settingsController.addAlias);
  router.delete('/api/aliases/:name', settingsController.deleteAlias);
  router.get('/:provider/:filename', controller.detail);
  router.get('/:provider/:filename/har', controller.downloadHar);
  router.get('/:provider/:filename/python', controller.downloadPython);
  router.delete('/:provider/:filename', controller.delete);
  router.post('/:provider/:filename/pin', controller.pin);
  router.delete('/:provider/:filename/pin', controller.unpin);
  router.get('/:provider/:filename/pin', controller.getPinStatus);
  router.all('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
}

import express from 'express';
import { createViewerController } from '../controllers/viewer-controller.js';

export function createViewerRouter(config) {
  const router = express.Router();
  const controller = createViewerController(config);

  router.get('/', controller.index);
  router.get('/compare', controller.compare);
  router.get('/:provider/:filename', controller.detail);
  router.get('/:provider/:filename/har', controller.downloadHar);
  router.get('/:provider/:filename/python', controller.downloadPython);
  router.delete('/:provider/:filename', controller.delete);
  router.all('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return router;
}

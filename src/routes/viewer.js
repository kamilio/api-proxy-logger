import express from 'express';
import { createViewerController } from '../controllers/viewer-controller.js';

export function createViewerRouter(config) {
  const router = express.Router();
  const controller = createViewerController(config);

  router.get('/', controller.index);
  router.get('/:provider/:filename', controller.detail);
  router.post('/save-response', controller.saveResponse);

  return router;
}

import { Router } from 'express';
import * as contentController from '../controllers/contentController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam, publishActionBody } from '../validators/common.js';
import { createContentSchema, listContentQuery, updateContentSchema } from '../validators/contentValidators.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.CONTENT_VIEW), validateRequest(listContentQuery, 'query'), contentController.list);
router.get('/categories', authorize(PERMISSIONS.CONTENT_VIEW), contentController.categories);
router.post('/', authorize(PERMISSIONS.CONTENT_CREATE), validateRequest(createContentSchema), contentController.create);
router.get('/:id', authorize(PERMISSIONS.CONTENT_VIEW), validateRequest(idParam, 'params'), contentController.detail);
router.get(
  '/:id/revisions',
  authorize(PERMISSIONS.CONTENT_VIEW),
  validateRequest(idParam, 'params'),
  contentController.revisions,
);
router.put(
  '/:id',
  authorize(PERMISSIONS.CONTENT_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateContentSchema),
  contentController.update,
);
router.patch(
  '/:id/publish',
  authorize(PERMISSIONS.CONTENT_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(publishActionBody),
  contentController.setPublication,
);
router.delete('/:id', authorize(PERMISSIONS.CONTENT_DELETE), validateRequest(idParam, 'params'), contentController.remove);

export default router;

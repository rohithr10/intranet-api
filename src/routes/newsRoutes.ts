import { Router } from 'express';
import * as newsController from '../controllers/newsController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam, publishActionBody } from '../validators/common.js';
import { createNewsSchema, listNewsQuery, updateNewsSchema } from '../validators/newsValidators.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.NEWS_VIEW), validateRequest(listNewsQuery, 'query'), newsController.list);
router.post('/', authorize(PERMISSIONS.NEWS_CREATE), validateRequest(createNewsSchema), newsController.create);
router.get('/:id', authorize(PERMISSIONS.NEWS_VIEW), validateRequest(idParam, 'params'), newsController.detail);
router.get(
  '/:id/revisions',
  authorize(PERMISSIONS.NEWS_VIEW),
  validateRequest(idParam, 'params'),
  newsController.revisions,
);
router.put(
  '/:id',
  authorize(PERMISSIONS.NEWS_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateNewsSchema),
  newsController.update,
);
// The publish permission itself is enforced inside the service, which also
// covers the status field arriving through a plain update.
router.patch(
  '/:id/publish',
  authorize(PERMISSIONS.NEWS_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(publishActionBody),
  newsController.setPublication,
);
router.delete('/:id', authorize(PERMISSIONS.NEWS_DELETE), validateRequest(idParam, 'params'), newsController.remove);

export default router;

import { Router } from 'express';
import * as tagController from '../controllers/tagController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize, authorizeAny } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import { createTagSchema, listTagsQuery, updateTagSchema } from '../validators/tagValidators.js';

const router = Router();
router.use(authenticate);

// Anyone who can write news or content needs to read the tag list to fill the
// selector, so reading is gated more loosely than writing.
router.get(
  '/',
  authorizeAny(
    PERMISSIONS.NEWS_TAGS_MANAGE,
    PERMISSIONS.NEWS_VIEW,
    PERMISSIONS.NEWS_CREATE,
    PERMISSIONS.NEWS_EDIT,
    PERMISSIONS.CONTENT_VIEW,
  ),
  validateRequest(listTagsQuery, 'query'),
  tagController.list,
);
// Creating from inside the news editor is part of authoring, so news.create
// and news.edit are accepted alongside the dedicated tag permission.
router.post(
  '/',
  authorizeAny(PERMISSIONS.NEWS_TAGS_MANAGE, PERMISSIONS.NEWS_CREATE, PERMISSIONS.NEWS_EDIT),
  validateRequest(createTagSchema),
  tagController.create,
);
router.get('/:id', authorize(PERMISSIONS.NEWS_VIEW), validateRequest(idParam, 'params'), tagController.detail);
router.put(
  '/:id',
  authorize(PERMISSIONS.NEWS_TAGS_MANAGE),
  validateRequest(idParam, 'params'),
  validateRequest(updateTagSchema),
  tagController.update,
);
router.delete(
  '/:id',
  authorize(PERMISSIONS.NEWS_TAGS_MANAGE),
  validateRequest(idParam, 'params'),
  tagController.remove,
);

export default router;

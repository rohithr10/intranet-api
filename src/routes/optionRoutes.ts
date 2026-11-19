import { Router } from 'express';
import * as optionController from '../controllers/optionController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import {
  createOptionSchema,
  listOptionsQuery,
  setOptionValueSchema,
  updateOptionSchema,
} from '../validators/optionValidators.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.OPTIONS_VIEW), validateRequest(listOptionsQuery, 'query'), optionController.list);
router.post('/', authorize(PERMISSIONS.OPTIONS_CREATE), validateRequest(createOptionSchema), optionController.create);
router.get('/:id', authorize(PERMISSIONS.OPTIONS_VIEW), validateRequest(idParam, 'params'), optionController.detail);
router.put(
  '/:id',
  authorize(PERMISSIONS.OPTIONS_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateOptionSchema),
  optionController.update,
);
router.patch(
  '/:id/value',
  authorize(PERMISSIONS.OPTIONS_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(setOptionValueSchema),
  optionController.setValue,
);
router.delete('/:id', authorize(PERMISSIONS.OPTIONS_DELETE), validateRequest(idParam, 'params'), optionController.remove);

export default router;

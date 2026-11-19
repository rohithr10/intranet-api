import { Router } from 'express';
import * as roleController from '../controllers/roleController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import { createRoleSchema, setPermissionsSchema, updateRoleSchema } from '../validators/roleValidators.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.ROLES_VIEW), roleController.list);
router.post('/', authorize(PERMISSIONS.ROLES_CREATE), validateRequest(createRoleSchema), roleController.create);
router.get('/:id', authorize(PERMISSIONS.ROLES_VIEW), validateRequest(idParam, 'params'), roleController.detail);
router.put(
  '/:id',
  authorize(PERMISSIONS.ROLES_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateRoleSchema),
  roleController.update,
);
router.put(
  '/:id/permissions',
  authorize(PERMISSIONS.ROLES_ASSIGN),
  validateRequest(idParam, 'params'),
  validateRequest(setPermissionsSchema),
  roleController.setPermissions,
);
router.delete('/:id', authorize(PERMISSIONS.ROLES_DELETE), validateRequest(idParam, 'params'), roleController.remove);

export default router;

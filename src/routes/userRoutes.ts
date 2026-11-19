import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import {
  assignRoleSchema,
  createUserSchema,
  listUsersQuery,
  updateUserSchema,
} from '../validators/userValidators.js';

const router = Router();

// Every route below requires a session; each one then requires its permission.
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.USERS_VIEW), validateRequest(listUsersQuery, 'query'), userController.list);
router.post('/', authorize(PERMISSIONS.USERS_CREATE), validateRequest(createUserSchema), userController.create);
router.get('/:id', authorize(PERMISSIONS.USERS_VIEW), validateRequest(idParam, 'params'), userController.detail);
router.put(
  '/:id',
  authorize(PERMISSIONS.USERS_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateUserSchema),
  userController.update,
);
router.patch(
  '/:id/role',
  authorize(PERMISSIONS.USERS_EDIT, PERMISSIONS.ROLES_ASSIGN),
  validateRequest(idParam, 'params'),
  validateRequest(assignRoleSchema),
  userController.assignRole,
);
router.delete('/:id', authorize(PERMISSIONS.USERS_DELETE), validateRequest(idParam, 'params'), userController.remove);

export default router;

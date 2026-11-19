import { Router } from 'express';
import * as serviceController from '../controllers/serviceController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { idParam } from '../validators/common.js';
import {
  createServiceSchema,
  listServicesQuery,
  serviceStatusSchema,
  updateServiceSchema,
} from '../validators/serviceValidators.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize(PERMISSIONS.SERVICES_VIEW), validateRequest(listServicesQuery, 'query'), serviceController.list);
router.post('/', authorize(PERMISSIONS.SERVICES_CREATE), validateRequest(createServiceSchema), serviceController.create);
router.get('/:id', authorize(PERMISSIONS.SERVICES_VIEW), validateRequest(idParam, 'params'), serviceController.detail);
router.put(
  '/:id',
  authorize(PERMISSIONS.SERVICES_EDIT),
  validateRequest(idParam, 'params'),
  validateRequest(updateServiceSchema),
  serviceController.update,
);
router.patch(
  '/:id/status',
  authorize(PERMISSIONS.SERVICES_TOGGLE),
  validateRequest(idParam, 'params'),
  validateRequest(serviceStatusSchema),
  serviceController.setStatus,
);
router.delete('/:id', authorize(PERMISSIONS.SERVICES_DELETE), validateRequest(idParam, 'params'), serviceController.remove);

export default router;

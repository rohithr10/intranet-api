import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { PERMISSIONS } from '../utils/permissions.js';
import { listActivityQuery } from '../validators/activityValidators.js';

const router = Router();
router.use(authenticate);

router.get('/stats', authorize(PERMISSIONS.DASHBOARD_VIEW), dashboardController.stats);
router.get(
  '/activity',
  authorize(PERMISSIONS.AUDIT_VIEW),
  validateRequest(listActivityQuery, 'query'),
  dashboardController.activity,
);

export default router;
